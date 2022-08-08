// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./RETypes.sol";
import "./REConstants.sol";
import "./RuleExecutor.sol";
import "./Utils.sol";

contract FundManager is Ownable {
    event FundCreated(bytes32 indexed fundHash);
    event Subscribed(bytes32 indexed fundHash, uint256 subIdx);
    event Unsubscribed(bytes32 indexed fundHash, uint256 subIdx);
    event RedeemedCancelled(bytes32 indexed fundHash, uint256 subIdx);
    event RedeemedExecuted(bytes32 indexed fundHash, uint256 subIdx);
    event Cancelled(bytes32 indexed fundHash);

    enum SubscriptionStatus {
        ACTIVE,
        CANCELLED,
        REDEEMED
    }

    enum FundStatus {
        ACTIVE,
        EXECUTED,
        CANCELLED
    }

    struct Subscription {
        address subscriber;
        uint256 collateralAmount;
        SubscriptionStatus status;
    }

    struct SubscriptionConstraints {
        uint256 minCollateralPerSub; // minimum amount needed as collateral to subscribe
        uint256 maxCollateralPerSub; // max ...
        uint256 minCollateralTotal;
        uint256 maxCollateralTotal; // limit on subscription to protect from slippage DOS attacks
    }

    struct Fund {
        address manager;
        bytes32 ruleHash;
        FundStatus status;
        SubscriptionConstraints constraints;
        Subscription[] subscriptions;
    }

    mapping(bytes32 => Fund) funds;
    RuleExecutor public ruleExecutor;

    modifier onlyActiveSubscriber(bytes32 fundHash, uint256 subscriptionIdx) {
        require(funds[fundHash].subscriptions[subscriptionIdx].subscriber == msg.sender, "You're not the subscriber!");
        require(
            funds[fundHash].subscriptions[subscriptionIdx].status == SubscriptionStatus.ACTIVE,
            "This subscription is not active!"
        );
        _;
    }

    modifier onlyFundManager(bytes32 fundHash) {
        require(funds[fundHash].manager == msg.sender);
        _;
    }

    constructor(address ReAddr) {
        ruleExecutor = RuleExecutor(ReAddr);
    }

    function setRuleExecutorAddress(address ReAddr) public onlyOwner {
        ruleExecutor = RuleExecutor(ReAddr);
    }

    function subscribe(
        bytes32 fundHash,
        address collateralToken,
        uint256 collateralAmount
    ) public payable {
        Fund storage fund = funds[fundHash];
        _collectCollateral(fund, collateralToken, collateralAmount);
        Subscription storage newSub = fund.subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        Rule memory rule = ruleExecutor.getRule(fund.ruleHash);
        if (rule.totalCollateralAmount >= fund.constraints.minCollateralTotal) {
            ruleExecutor.activateRule(fund.ruleHash);
        }
        emit Subscribed(fundHash, fund.subscriptions.length - 1);
    }

    function _collectCollateral(
        Fund memory fund,
        address collateralToken,
        uint256 collateralAmount
    ) private {
        _validateCollateral(fund, collateralToken, collateralAmount);
        if (collateralToken != REConstants.ETH) {
            IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount);
            IERC20(collateralToken).approve(address(ruleExecutor), collateralAmount);
            ruleExecutor.addCollateral(fund.ruleHash, collateralAmount);
        } else {
            // else it should be in our balance already
            ruleExecutor.addCollateral{value: msg.value}(fund.ruleHash, collateralAmount);
        }
    }

    function _validateCollateral(
        Fund memory fund,
        address collateralToken,
        uint256 collateralAmount
    ) private view {
        Rule memory rule = ruleExecutor.getRule(fund.ruleHash);
        SubscriptionConstraints memory constraints = fund.constraints;
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

    function unsubscribe(bytes32 fundHash, uint256 subscriptionIdx)
        public
        onlyActiveSubscriber(fundHash, subscriptionIdx)
    {
        Fund storage fund = funds[fundHash];
        bytes32 ruleHash = fund.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        Subscription storage subscription = fund.subscriptions[subscriptionIdx];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.PAUSED, "unsubscribe failed");
        ruleExecutor.reduceCollateral(ruleHash, subscription.collateralAmount);
        Utils._send(subscription.subscriber, subscription.collateralAmount, rule.actions[0].fromToken);
        subscription.status = SubscriptionStatus.CANCELLED;

        if (rule.status == RuleStatus.ACTIVE && rule.totalCollateralAmount < fund.constraints.minCollateralTotal) {
            ruleExecutor.pauseRule(ruleHash);
        }

        emit Unsubscribed(fundHash, subscriptionIdx);
    }

    function cancelFund(bytes32 fundHash) public onlyFundManager(fundHash) {
        Fund storage fund = funds[fundHash];
        fund.status = FundStatus.CANCELLED;
        ruleExecutor.cancelRule(fund.ruleHash);
        emit Cancelled(fundHash);
    }

    function redeemCollateralFromCancelledFund(bytes32 fundHash, uint256 subscriptionIdx)
        public
        onlyActiveSubscriber(fundHash, subscriptionIdx)
    {
        Fund storage fund = funds[fundHash];
        bytes32 ruleHash = fund.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        Subscription storage subscription = fund.subscriptions[subscriptionIdx];
        require(fund.status == FundStatus.CANCELLED, "Fund is not cancelled!");
        // This contract should have the collateral back already since it was cancelled by fund.manager
        Utils._send(subscription.subscriber, subscription.collateralAmount, rule.actions[0].fromToken);
        subscription.status = SubscriptionStatus.REDEEMED;
        emit RedeemedCancelled(fundHash, subscriptionIdx);
    }

    function redeemOutputFromExecutedFund(bytes32 fundHash, uint256 subscriptionIdx)
        public
        onlyActiveSubscriber(fundHash, subscriptionIdx)
    {
        Fund storage fund = funds[fundHash];
        bytes32 ruleHash = fund.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        Subscription storage subscription = fund.subscriptions[subscriptionIdx];

        if (rule.status == RuleStatus.EXECUTED && fund.status != FundStatus.EXECUTED) {
            // When rule was executed but fund doesn't know
            // first time subscriber wants to get back the output, we change this
            // TODO: maybe doing it in the ruleExecution->fund callback would be a better idea?
            ruleExecutor.redeemBalance(ruleHash);
            fund.status = FundStatus.EXECUTED;
        }

        require(fund.status == FundStatus.EXECUTED, "Rule hasn't been executed yet!");

        uint256 balance = (subscription.collateralAmount * rule.outputAmount) / rule.totalCollateralAmount; // TODO: make sure the math is fine, especially at the boundaries
        Utils._send(subscription.subscriber, balance, rule.actions[rule.actions.length - 1].toToken);
        subscription.status = SubscriptionStatus.REDEEMED;
        emit RedeemedExecuted(ruleHash, subscriptionIdx);
    }

    function hashFund(address manager, bytes32 ruleHash) public pure returns (bytes32) {
        return keccak256(abi.encode(manager, ruleHash));
    }

    function createFund(
        Trigger[] calldata triggers,
        Action[] calldata actions,
        SubscriptionConstraints calldata constraints
    ) public payable returns (bytes32) {
        bytes32 ruleHash = ruleExecutor.createRule{value: msg.value}(triggers, actions);
        bytes32 fundHash = hashFund(msg.sender, ruleHash);
        Fund storage fund = funds[fundHash];
        fund.manager = msg.sender;
        fund.ruleHash = ruleHash;
        fund.status = FundStatus.ACTIVE;
        fund.constraints = constraints;

        emit FundCreated(fundHash);
        return fundHash;
    }
}
