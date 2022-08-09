// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ISubscription {
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

    event Subscribed(bytes32 indexed hash, uint256 subIdx);
    event Unsubscribed(bytes32 indexed hash, uint256 subIdx);
    event RedeemedCollateral(bytes32 indexed hash, uint256 subIdx);
    event RedeemedOutput(bytes32 indexed hash, uint256 subIdx);

    function subscribe(
        bytes32 hash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable;

    // Used by subscriber before service was cancelled/completed
    function unsubscribe(bytes32 hash, uint256 subscriptionIdx) external;

    // Used by the subscriber after the service was cancelled
    function redeemSubscriptionCollateral(bytes32 hash, uint256 subscriptionIdx) external;

    // Used by the subscriber after the service was completed
    function redeemSubscriptionOutput(bytes32 hash, uint256 subscriptionIdx) external;
}
