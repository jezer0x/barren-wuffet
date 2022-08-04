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
    event Subscribed(bytes32 indexed fundHash, uint256 SubIdx);
    event Unsubscribed(bytes32 indexed fundHash, uint256 SubIdx);
    event Redeemed(bytes32 indexed fundHash, uint256 SubIdx);
    event Cancelled(bytes32 indexed fundHash, uint256 SubIdx);

    enum SubscriptionStatus {
        ACTIVE,
        CANCELLED,
        REDEEMED
    }

    enum FundStatus {
        RAISING,
        ACTIVE,
        CANCELLED,
        REDEEMED
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

    modifier onlySubscriber(bytes32 fundHash, uint256 subscriptionIdx) {
        require(funds[fundHash].subscriptions[subscriptionIdx].subscriber == msg.sender);
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

    function unsubscribe(bytes32 fundHash, uint256 subscriptionIdx) public onlySubscriber(fundHash, subscriptionIdx) {
        Fund storage fund = funds[fundHash];
        bytes32 ruleHash = fund.ruleHash;
        Rule memory rule = ruleExecutor.getRule(ruleHash);
        Subscription storage subscription = fund.subscriptions[subscriptionIdx];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.PAUSED, "unsubscribe failed");
        require(subscription.status == SubscriptionStatus.ACTIVE, "Subscription is not Active!");
        ruleExecutor.reduceCollateral(ruleHash, subscription.collateralAmount);
        Utils._send(subscription.subscriber, subscription.collateralAmount, rule.actions[0].fromToken);
        subscription.status = SubscriptionStatus.CANCELLED;

        if (rule.totalCollateralAmount < fund.constraints.minCollateralTotal) {
            ruleExecutor.pauseRule(ruleHash);
        }

        emit Unsubscribed(fundHash, subscriptionIdx);
    }

    // function redeemBalance(bytes32 ruleHash, uint256 subscriptionIdx) public {
    //     Rule memory rule = ruleExecutor.getRule(ruleHash);
    //     Subscription storage subscription = subscriptionsMap[ruleHash][subscriptionIdx];
    //     require(subscription.status == SubscriptionStatus.ACTIVE, "Subscription is not active!");
    //     require(subscription.subscriber == msg.sender, "You cannot redeem someone else's balance!");

    //     if (rule.status == RuleStatus.EXECUTED) {
    //         // withdrawing after successfully triggered rule
    //         uint256 balance = (subscription.collateralAmount * rule.outputAmount) / rule.totalCollateralAmount;
    //         _redeemBalance(subscription.subscriber, balance, rule.actions[rule.actions.length - 1].toToken);
    //         subscription.status = SubscriptionStatus.REDEEMED;
    //         emit Redeemed(ruleHash, subscriptionIdx);
    //     }
    // }

    function hashFund(address manager, bytes32 ruleHash) public pure returns (bytes32) {
        return keccak256(abi.encode(manager, ruleHash));
    }

    function createFund(
        Trigger[] calldata triggers,
        Action[] calldata actions,
        SubscriptionConstraints calldata constraints
    ) public returns (bytes32) {
        bytes32 ruleHash = ruleExecutor.createRule(triggers, actions);
        bytes32 fundHash = hashFund(msg.sender, ruleHash);
        Fund storage fund = funds[fundHash];
        fund.manager = msg.sender;
        fund.ruleHash = ruleHash;
        fund.status = FundStatus.RAISING;
        fund.constraints = constraints;

        emit FundCreated(fundHash);
        return fundHash;
    }
}
