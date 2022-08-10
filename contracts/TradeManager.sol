// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ISubscription.sol";
import "./RETypes.sol";
import "./REConstants.sol";
import "./RuleExecutor.sol";
import "./Utils.sol";

contract TradeManager is Ownable, ISubscription {
    event TradeCreated(bytes32 indexed tradeHash);
    event Cancelled(bytes32 indexed tradeHash);

    mapping(bytes32 => Trade) trades;
    RuleExecutor public ruleExecutor;

    modifier onlyActiveSubscriber(bytes32 tradeHash, uint256 subscriptionIdx) {
        require(
            trades[tradeHash].subscriptions[subscriptionIdx].subscriber == msg.sender,
            "You're not the subscriber!"
        );
        require(
            trades[tradeHash].subscriptions[subscriptionIdx].status == SubscriptionStatus.ACTIVE,
            "This subscription is not active!"
        );
        _;
    }

    modifier onlyTradeManager(bytes32 tradeHash) {
        require(trades[tradeHash].manager == msg.sender);
        _;
    }

    modifier tradeExists(bytes32 tradeHash) {
        require(trades[tradeHash].manager != address(0), "Trade not found!");
        _;
    }

    constructor(address ReAddr) {
        ruleExecutor = RuleExecutor(ReAddr);
    }

    function setRuleExecutorAddress(address ReAddr) external onlyOwner {
        ruleExecutor = RuleExecutor(ReAddr);
    }

    function getCollateralToken(bytes32 tradeHash) external view tradeExists(tradeHash) returns (address) {
        bytes32 ruleHash = trades[tradeHash].ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        return rule.actions[0].fromToken;
    }

    function getOutputToken(bytes32 tradeHash) external view tradeExists(tradeHash) returns (address) {
        bytes32 ruleHash = trades[tradeHash].ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        return rule.actions[rule.actions.length - 1].toToken;
    }

    function deposit(
        bytes32 tradeHash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable tradeExists(tradeHash) returns (uint256) {
        Trade storage trade = trades[tradeHash];
        _collectCollateral(trade, collateralToken, collateralAmount);
        Subscription storage newSub = trade.subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        Rule memory rule = ruleExecutor.getRule(trade.ruleHash);
        if (rule.totalCollateralAmount >= trade.constraints.minCollateralTotal) {
            ruleExecutor.activateRule(trade.ruleHash);
        }
        emit Deposit(tradeHash, trade.subscriptions.length - 1, collateralToken, collateralAmount);
        return trade.subscriptions.length - 1;
    }

    function _collectCollateral(
        Trade memory trade,
        address collateralToken,
        uint256 collateralAmount
    ) private {
        _validateCollateral(trade, collateralToken, collateralAmount);
        if (collateralToken != REConstants.ETH) {
            IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount);
            IERC20(collateralToken).approve(address(ruleExecutor), collateralAmount);
            ruleExecutor.addCollateral(trade.ruleHash, collateralAmount);
        } else {
            // else it should be in our balance already
            ruleExecutor.addCollateral{value: msg.value}(trade.ruleHash, collateralAmount);
        }
    }

    function _validateCollateral(
        Trade memory trade,
        address collateralToken,
        uint256 collateralAmount
    ) private view {
        Rule memory rule = ruleExecutor.getRule(trade.ruleHash);
        SubscriptionConstraints memory constraints = trade.constraints;
        require(rule.actions[0].fromToken == collateralToken, "Wrong Collateral Type");
        require(constraints.minCollateralPerSub <= collateralAmount, "Insufficient Collateral for Subscription");
        require(constraints.maxCollateralPerSub >= collateralAmount, "Max Collateral for Subscription exceeded");
        require(
            constraints.maxCollateralTotal >= (rule.totalCollateralAmount + collateralAmount),
            "Max Collateral for Rule exceeded"
        );

        if (collateralToken == REConstants.ETH) {
            require(collateralAmount == msg.value);
        }
    }

    function getStatus(bytes32 tradeHash) public tradeExists(tradeHash) returns (TradeStatus) {
        Trade storage trade = trades[tradeHash];
        bytes32 ruleHash = trade.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        if (rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.PAUSED) {
            return TradeStatus.ACTIVE;
        } else if (rule.status == RuleStatus.CANCELLED) {
            return TradeStatus.CANCELLED;
        } else if (rule.status == RuleStatus.EXECUTED) {
            // TODO: this is icky!
            if (!trade.redeemedOutput) {
                ruleExecutor.redeemBalance(ruleHash);
                trade.redeemedOutput = true;
            }
            return TradeStatus.EXECUTED;
        } else {
            revert("State not covered!");
        }
    }

    function withdraw(bytes32 tradeHash, uint256 subscriptionIdx)
        external
        tradeExists(tradeHash)
        onlyActiveSubscriber(tradeHash, subscriptionIdx)
        returns (address[] memory, uint256[] memory)
    {
        Trade storage trade = trades[tradeHash];
        bytes32 ruleHash = trade.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        Subscription storage subscription = trade.subscriptions[subscriptionIdx];

        address token;
        uint256 balance;

        subscription.status = SubscriptionStatus.WITHDRAWN;

        if (getStatus(tradeHash) == TradeStatus.ACTIVE) {
            ruleExecutor.reduceCollateral(ruleHash, subscription.collateralAmount);
            if (rule.status == RuleStatus.ACTIVE && rule.totalCollateralAmount < trade.constraints.minCollateralTotal) {
                ruleExecutor.pauseRule(ruleHash);
            }
            token = rule.actions[0].fromToken;
            balance = subscription.collateralAmount;
        } else if (getStatus(tradeHash) == TradeStatus.EXECUTED) {
            token = rule.actions[rule.actions.length - 1].toToken;
            balance = (subscription.collateralAmount * rule.outputAmount) / rule.totalCollateralAmount;
            // TODO: make sure the math is fine, especially at the boundaries
        } else if (getStatus(tradeHash) == TradeStatus.CANCELLED) {
            token = rule.actions[0].fromToken;
            balance = subscription.collateralAmount;
        } else {
            revert("State not covered!");
        }

        Utils._send(subscription.subscriber, balance, token);
        emit Withdraw(tradeHash, subscriptionIdx, token, balance);
        address[] memory tokens;
        uint256[] memory balances;
        tokens[0] = token;
        balances[0] = balance;
        return (tokens, balances);
    }

    function cancelTrade(bytes32 tradeHash) external onlyTradeManager(tradeHash) {
        Trade storage trade = trades[tradeHash];
        ruleExecutor.cancelRule(trade.ruleHash);
        emit Cancelled(tradeHash);
    }

    function getTradeHash(address manager, bytes32 ruleHash) public pure returns (bytes32) {
        return keccak256(abi.encode(manager, ruleHash));
    }

    function createTrade(
        Trigger[] calldata triggers,
        Action[] calldata actions,
        SubscriptionConstraints calldata constraints
    ) external payable returns (bytes32) {
        // Note: Rule is created through TradeManager so that TradeManager is rule.owner
        bytes32 ruleHash = ruleExecutor.createRule{value: msg.value}(triggers, actions);
        bytes32 tradeHash = getTradeHash(msg.sender, ruleHash);
        require(trades[tradeHash].manager == address(0)); // trade does not exist
        Trade storage trade = trades[tradeHash];
        trade.manager = msg.sender;
        trade.ruleHash = ruleHash;
        trade.constraints = constraints;

        emit TradeCreated(tradeHash);
        return tradeHash;
    }
}
