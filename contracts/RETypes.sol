// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum RuleStatus {
    ACTIVE,
    PAUSED,
    EXECUTED,
    CANCELLED
}

struct Rule {
    address owner;
    Trigger[] triggers;
    Action[] actions;
    uint256 totalCollateralAmount;
    RuleStatus status;
    uint256 outputAmount;
    uint256 reward;
}

struct ActionRuntimeParams {
    uint256 triggerData;
    uint256 totalCollateralAmount;
}

struct Action {
    address callee; // eg. swapUni
    bytes data; // any custom param to send to the callee, encoded at compileTime
    address fromToken; // token to be used to initiate the action
    address toToken; // token to be gotten as output
}

enum Ops {
    GT,
    LT
}

struct Trigger {
    address callee;
    bytes param; // any custom param to send to the callee, encoded at compileTime
    uint256 value; //eg. 1000
    Ops op; //eg. GT
}

enum TradeStatus {
    ACTIVE,
    EXECUTED,
    CANCELLED
}

struct Trade {
    address manager;
    bytes32 ruleHash;
    TradeStatus status;
    SubscriptionConstraints constraints;
    Subscription[] subscriptions;
}

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
    uint256 deadline; // a block.timestamp, after which no one can subscribe to this
    uint256 lockin; // a block.timestamp, until which no one can redeem (given trade/fund has been activated)
}
