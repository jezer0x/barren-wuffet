// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../utils/subscriptions/ISubscription.sol";
import "../utils/IAssetIO.sol";
import "../utils/Constants.sol";
import "../rules/RoboCop.sol";
import "../utils/Utils.sol";
import "./TradeTypes.sol";

contract TradeManager is ISubscription, IAssetIO, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event Created(bytes32 indexed tradeHash);
    event Cancelled(bytes32 indexed tradeHash);

    mapping(bytes32 => Trade) trades;
    RoboCop public roboCop;

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
        require(trades[tradeHash].manager == msg.sender, "onlyManager");
        _;
    }

    modifier tradeExists(bytes32 tradeHash) {
        require(trades[tradeHash].manager != address(0), "Trade not found!");
        _;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    constructor(address payable ReAddr) {
        roboCop = RoboCop(ReAddr);
    }

    function setRoboCopAddress(address payable ReAddr) external onlyOwner {
        roboCop = RoboCop(ReAddr);
    }

    function getInputToken(bytes32 tradeHash) public view tradeExists(tradeHash) returns (address) {
        return roboCop.getInputToken(trades[tradeHash].ruleHash);
    }

    function getOutputToken(bytes32 tradeHash) public view tradeExists(tradeHash) returns (address) {
        return roboCop.getOutputToken(trades[tradeHash].ruleHash);
    }

    function deposit(
        bytes32 tradeHash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable whenNotPaused nonReentrant tradeExists(tradeHash) returns (uint256) {
        Trade storage trade = trades[tradeHash];
        _validateCollateral(tradeHash, collateralToken, collateralAmount);
        _collectCollateral(trade, collateralToken, collateralAmount);
        Subscription storage newSub = trade.subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        Rule memory rule = roboCop.getRule(trade.ruleHash);
        if (
            rule.totalCollateralAmount >= trade.constraints.minCollateralTotal &&
            rule.totalCollateralAmount - collateralAmount < trade.constraints.minCollateralTotal
        ) {
            roboCop.activateRule(trade.ruleHash);
        }
        emit Deposit(tradeHash, trade.subscriptions.length - 1, collateralToken, collateralAmount);
        return trade.subscriptions.length - 1;
    }

    function _collectCollateral(
        Trade memory trade,
        address collateralToken,
        uint256 collateralAmount
    ) private {
        if (collateralToken != REConstants.ETH) {
            IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);
            IERC20(collateralToken).safeApprove(address(roboCop), collateralAmount);
            roboCop.addCollateral(trade.ruleHash, collateralAmount);
        } else {
            // else it should be in our balance already
            roboCop.addCollateral{value: msg.value}(trade.ruleHash, collateralAmount);
        }
    }

    function _validateCollateral(
        bytes32 tradeHash,
        address collateralToken,
        uint256 collateralAmount
    ) private view {
        // TODO: constraints.lockin and constraints.deadline unused in TradeManager
        Trade storage trade = trades[tradeHash];
        Rule memory rule = roboCop.getRule(trade.ruleHash);
        SubscriptionConstraints memory constraints = trade.constraints;
        require(getInputToken(tradeHash) == collateralToken, "Wrong Collateral Type");
        require(constraints.minCollateralPerSub <= collateralAmount, "Insufficient Collateral for Subscription");
        require(constraints.maxCollateralPerSub >= collateralAmount, "Max Collateral for Subscription exceeded");
        require(
            constraints.maxCollateralTotal >= (rule.totalCollateralAmount + collateralAmount),
            "Max Collateral for Trade exceeded"
        );

        if (collateralToken == REConstants.ETH) {
            require(collateralAmount == msg.value);
        }
    }

    function getStatus(bytes32 tradeHash) public view tradeExists(tradeHash) returns (TradeStatus) {
        Trade storage trade = trades[tradeHash];
        bytes32 ruleHash = trade.ruleHash;
        Rule memory rule = roboCop.getRule(ruleHash);
        if (trade.cancelled) {
            return TradeStatus.CANCELLED;
        } else if (rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE) {
            return TradeStatus.ACTIVE;
        } else if (rule.status == RuleStatus.EXECUTED) {
            return TradeStatus.REDEEMABLE;
        } else if (rule.status == RuleStatus.REDEEMED) {
            return TradeStatus.EXECUTED;
        } else {
            revert("State not covered!");
        }
    }

    function withdraw(bytes32 tradeHash, uint256 subscriptionIdx)
        external
        whenNotPaused
        nonReentrant
        tradeExists(tradeHash)
        onlyActiveSubscriber(tradeHash, subscriptionIdx)
        returns (address[] memory, uint256[] memory)
    {
        Trade storage trade = trades[tradeHash];
        bytes32 ruleHash = trade.ruleHash;
        Rule memory rule = roboCop.getRule(ruleHash);
        Subscription storage subscription = trade.subscriptions[subscriptionIdx];
        TradeStatus status = getStatus(tradeHash);

        address token;
        uint256 balance;

        subscription.status = SubscriptionStatus.WITHDRAWN;

        if (status == TradeStatus.ACTIVE) {
            roboCop.reduceCollateral(ruleHash, subscription.collateralAmount);
            if (
                rule.status == RuleStatus.ACTIVE &&
                rule.totalCollateralAmount - subscription.collateralAmount < trade.constraints.minCollateralTotal
            ) {
                roboCop.deactivateRule(ruleHash);
            }
            token = getInputToken(tradeHash);
            balance = subscription.collateralAmount;
        } else if (status == TradeStatus.EXECUTED) {
            token = getOutputToken(tradeHash);
            balance = (subscription.collateralAmount * rule.outputAmount) / rule.totalCollateralAmount;
            // TODO: make sure the math is fine, especially at the boundaries
        } else if (status == TradeStatus.CANCELLED) {
            token = getInputToken(tradeHash);
            balance = subscription.collateralAmount;
        } else if (status == TradeStatus.REDEEMABLE) {
            revert("Call redeemOutputFromRule first");
        } else {
            revert("State not covered!");
        }

        Utils._send(subscription.subscriber, balance, token);
        emit Withdraw(tradeHash, subscriptionIdx, token, balance);
        address[] memory tokens = new address[](1);
        uint256[] memory balances = new uint256[](1);
        tokens[0] = token;
        balances[0] = balance;
        return (tokens, balances);
    }

    function getTrade(bytes32 tradeHash) public view tradeExists(tradeHash) returns (Trade memory) {
        return trades[tradeHash];
    }

    function cancelTrade(bytes32 tradeHash) external whenNotPaused nonReentrant onlyTradeManager(tradeHash) {
        Trade storage trade = trades[tradeHash];
        TradeStatus status = getStatus(tradeHash);
        require(status == TradeStatus.ACTIVE, "Can't Cancel Trade");
        trade.cancelled = true;
        Rule memory rule = roboCop.getRule(trade.ruleHash);
        if (rule.status != RuleStatus.INACTIVE) {
            roboCop.deactivateRule(trade.ruleHash);
        }
        roboCop.reduceCollateral(trade.ruleHash, rule.totalCollateralAmount);
        emit Cancelled(tradeHash);
    }

    function redeemOutputFromRule(bytes32 tradeHash) external tradeExists(tradeHash) {
        Trade storage trade = trades[tradeHash];
        roboCop.redeemBalance(trade.ruleHash);
    }

    function getTradeHash(address manager, bytes32 ruleHash) public pure returns (bytes32) {
        return keccak256(abi.encode(manager, ruleHash));
    }

    function createTrade(
        Trigger[] calldata triggers,
        Action[] calldata actions,
        SubscriptionConstraints calldata constraints
    ) external payable nonReentrant whenNotPaused returns (bytes32) {
        // Note: Rule is created through TradeManager so that TradeManager is rule.owner
        bytes32 ruleHash = roboCop.createRule{value: msg.value}(triggers, actions);
        bytes32 tradeHash = getTradeHash(msg.sender, ruleHash);
        require(trades[tradeHash].manager == address(0)); // trade does not exist
        Utils._validateSubscriptionConstraintsBasic(constraints);
        Trade storage trade = trades[tradeHash];
        trade.manager = msg.sender;
        trade.ruleHash = ruleHash;
        trade.constraints = constraints;

        emit Created(tradeHash);
        return tradeHash;
    }

    receive() external payable {}
}
