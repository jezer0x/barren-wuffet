// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./RETypes.sol";
import "./REConstants.sol";

contract FundManager {
    event Subscribed(bytes32 indexed ruleHash, uint256 SubIdx);
    event Redeemed(bytes32 indexed ruleHash, uint256 SubIdx);
    event Cancelled(bytes32 indexed ruleHash, uint256 SubIdx);

    enum SubscriptionStatus {
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

    // ruleHash -> [Subscription]
    mapping(bytes32 => Subscription[]) public subscriptions;

    function subscribeToRule(
        bytes32 ruleHash,
        address collateralToken,
        uint256 collateralAmount
    ) public payable {
        _validateCollateral(rules[ruleHash], rules[ruleHash].action, collateralToken, collateralAmount);
        _collectCollateral(collateralToken, collateralAmount);
        Subscription storage newSub = subscriptions[ruleHash].push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        rules[ruleHash].totalCollateralAmount = rules[ruleHash].totalCollateralAmount + collateralAmount;

        emit Subscribed(ruleHash, subscriptions[ruleHash].length - 1);
    }

    function _collectCollateral(address collateralToken, uint256 collateralAmount) private {
        if (collateralToken != REConstants.ETH) {
            IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount);
        } // else it should be in our balance already
    }

    function _redeemBalance(
        address receiver,
        uint256 balance,
        address token
    ) internal {
        if (token != REConstants.ETH) {
            IERC20(token).transfer(receiver, balance);
        } else {
            payable(receiver).transfer(balance);
        }
    }

    function _validateCollateral(
        RETypes.Rule memory rule,
        RETypes.Action memory action,
        address collateralToken,
        uint256 collateralAmount
    ) private view {
        require(action.fromToken == collateralToken, "Wrong Collateral Type");
        require(rule.constraints.minCollateralPerSub <= collateralAmount, "Insufficient Collateral for Subscription");
        require(rule.constraints.maxCollateralPerSub >= collateralAmount, "Max Collateral for Subscription exceeded");
        require(
            rule.constraints.maxCollateralTotal >= (rule.totalCollateralAmount + collateralAmount),
            "Max Collateral for RETypes.Rule exceeded"
        );

        if (collateralToken == REConstants.ETH) {
            require(collateralAmount == msg.value);
        }
    }

    function redeemBalance(bytes32 ruleHash, uint256 subscriptionIdx) public {
        RETypes.Rule storage rule = rules[ruleHash];
        Subscription storage subscription = subscriptions[ruleHash][subscriptionIdx];

        require(subscription.status == SubscriptionStatus.ACTIVE, "subscription is not active!");

        if (rule.status == RETypes.RuleStatus.EXECUTED) {
            // withdrawing after successfully triggered rule
            uint256 balance = (subscription.collateralAmount * rule.outputAmount) / rule.totalCollateralAmount;
            _redeemBalance(subscription.subscriber, balance, rule.action.toToken);
            subscription.status = SubscriptionStatus.REDEEMED;
            emit Redeemed(ruleHash, subscriptionIdx);
        } else {
            // withdrawing before anyone triggered this
            rule.totalCollateralAmount = rule.totalCollateralAmount - subscription.collateralAmount;
            _redeemBalance(subscription.subscriber, subscription.collateralAmount, rule.action.fromToken);
            subscription.status = SubscriptionStatus.CANCELLED;
            emit Cancelled(ruleHash, subscriptionIdx);
        }
    }
}
