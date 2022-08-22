// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/SubscriptionTypes.sol";

enum TradeStatus {
    ACTIVE,
    REDEEMABLE,
    EXECUTED,
    CANCELLED
}

struct Trade {
    address manager;
    bytes32 ruleHash;
    SubscriptionConstraints constraints;
    Subscription[] subscriptions;
    bool redeemedOutput;
}
