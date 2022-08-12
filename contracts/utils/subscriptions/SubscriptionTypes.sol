// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum SubscriptionStatus {
    ACTIVE,
    WITHDRAWN
}

struct Subscription {
    address subscriber;
    uint256 collateralAmount;
    SubscriptionStatus status;
}

struct SubscriptionConstraints {
    uint256 minCollateralPerSub; // minimum amount needed as collateral to deposit
    uint256 maxCollateralPerSub; // max ...
    uint256 minCollateralTotal;
    uint256 maxCollateralTotal; // limit on subscription to protect from slippage DOS attacks
    uint256 deadline; // a block.timestamp, after which no one can deposit to this
    uint256 lockin; // a block.timestamp, until which no one can redeem (given trade/fund has been activated)
}
