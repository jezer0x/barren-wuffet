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

    function setRuleExecutorAddress(address ReAddr) public onlyOwner {
        ruleExecutor = RuleExecutor(ReAddr);
    }

    function getCollateralToken(bytes32 tradeHash) public view tradeExists(tradeHash) returns (address) {
        bytes32 ruleHash = trades[tradeHash].ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        return rule.actions[0].fromToken;
    }

    function getOutputToken(bytes32 tradeHash) public view tradeExists(tradeHash) returns (address) {
        bytes32 ruleHash = trades[tradeHash].ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        return rule.actions[rule.actions.length - 1].toToken;
    }

    function getStatus(bytes32 tradeHash) public view tradeExists(tradeHash) returns (TradeStatus) {
        return trades[tradeHash].status;
    }

    function subscribe(
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
        emit Subscribed(tradeHash, trade.subscriptions.length - 1);
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

    function unsubscribe(bytes32 tradeHash, uint256 subscriptionIdx)
        external
        tradeExists(tradeHash)
        onlyActiveSubscriber(tradeHash, subscriptionIdx)
        returns (uint256)
    {
        Trade storage trade = trades[tradeHash];
        bytes32 ruleHash = trade.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        Subscription storage subscription = trade.subscriptions[subscriptionIdx];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.PAUSED, "unsubscribe failed");
        ruleExecutor.reduceCollateral(ruleHash, subscription.collateralAmount);
        subscription.status = SubscriptionStatus.CANCELLED;

        if (rule.status == RuleStatus.ACTIVE && rule.totalCollateralAmount < trade.constraints.minCollateralTotal) {
            ruleExecutor.pauseRule(ruleHash);
        }

        Utils._send(subscription.subscriber, subscription.collateralAmount, rule.actions[0].fromToken);
        emit Unsubscribed(tradeHash, subscriptionIdx);
        return subscription.collateralAmount;
    }

    function cancelTrade(bytes32 tradeHash) public onlyTradeManager(tradeHash) {
        Trade storage trade = trades[tradeHash];
        trade.status = TradeStatus.CANCELLED;
        ruleExecutor.cancelRule(trade.ruleHash);
        emit Cancelled(tradeHash);
    }

    function redeemSubscriptionCollateral(bytes32 tradeHash, uint256 subscriptionIdx)
        external
        tradeExists(tradeHash)
        onlyActiveSubscriber(tradeHash, subscriptionIdx)
        returns (uint256)
    {
        Trade storage trade = trades[tradeHash];
        bytes32 ruleHash = trade.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        Subscription storage subscription = trade.subscriptions[subscriptionIdx];
        require(trade.status == TradeStatus.CANCELLED, "Trade is not cancelled!");
        // This contract should have the collateral back already since it was cancelled by trade.manager
        subscription.status = SubscriptionStatus.REDEEMED;

        Utils._send(subscription.subscriber, subscription.collateralAmount, rule.actions[0].fromToken);
        emit RedeemedCollateral(tradeHash, subscriptionIdx);
        return subscription.collateralAmount;
    }

    function redeemSubscriptionOutput(bytes32 tradeHash, uint256 subscriptionIdx)
        external
        tradeExists(tradeHash)
        onlyActiveSubscriber(tradeHash, subscriptionIdx)
        returns (uint256)
    {
        Trade storage trade = trades[tradeHash];
        bytes32 ruleHash = trade.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        Subscription storage subscription = trade.subscriptions[subscriptionIdx];

        if (rule.status == RuleStatus.EXECUTED && trade.status != TradeStatus.EXECUTED) {
            // When rule was executed but trade doesn't know
            // first time subscriber wants to get back the output, we change this
            // TODO: maybe doing it in the ruleExecution->trade callback would be a better idea?
            ruleExecutor.redeemBalance(ruleHash);
            trade.status = TradeStatus.EXECUTED;
        }

        require(trade.status == TradeStatus.EXECUTED, "Rule hasn't been executed yet!");

        uint256 balance = (subscription.collateralAmount * rule.outputAmount) / rule.totalCollateralAmount; // TODO: make sure the math is fine, especially at the boundaries
        subscription.status = SubscriptionStatus.REDEEMED;

        Utils._send(subscription.subscriber, balance, rule.actions[rule.actions.length - 1].toToken);
        emit RedeemedOutput(ruleHash, subscriptionIdx);
        return balance;
    }

    function hashTrade(address manager, bytes32 ruleHash) public pure returns (bytes32) {
        return keccak256(abi.encode(manager, ruleHash));
    }

    function createTrade(
        Trigger[] calldata triggers,
        Action[] calldata actions,
        SubscriptionConstraints calldata constraints
    ) public payable returns (bytes32) {
        // Note: Rule is created through TradeManager so that TradeManager is rule.owner
        bytes32 ruleHash = ruleExecutor.createRule{value: msg.value}(triggers, actions);
        bytes32 tradeHash = hashTrade(msg.sender, ruleHash);
        require(trades[tradeHash].manager == address(0)); // trade does not exist
        Trade storage trade = trades[tradeHash];
        trade.manager = msg.sender;
        trade.ruleHash = ruleHash;
        trade.status = TradeStatus.ACTIVE;
        trade.constraints = constraints;

        emit TradeCreated(tradeHash);
        return tradeHash;
    }
}
