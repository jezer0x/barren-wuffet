// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/SubscriptionTypes.sol";

/*
Valid Transitions (to -> from): 

ACTIVE -> {REDEEMABLE, CANCELLED}
REDEEMABLE -> {EXECUTED}
EXECUTED -> {}
CANCELLED -> {}
*/
enum TradeStatus {
    ACTIVE, // Deposits possible, withdraws possible (inputToken), Rule has not been executed
    REDEEMABLE, // Deposits not possible, withdraws not possible, Rule has been executed but someone needs to call redeemRuleOuput
    EXECUTED, // Deposits not possible, withdraws possible (outputToken), Rule has been executed and ruleOutput redeemed.
    CANCELLED // Deposits not possible, withdraws possible (inputToken), Rule has been cancelled
}

struct Trade {
    address manager;
    bytes32 ruleHash;
    SubscriptionConstraints constraints;
    Subscription[] subscriptions;
    bool cancelled;
}
