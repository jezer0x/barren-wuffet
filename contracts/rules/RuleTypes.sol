// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../actions/ActionTypes.sol";
import "../triggers/TriggerTypes.sol";

enum RuleStatus {
    ACTIVE, // Action can be executed when trigger is met, can add/withdraw collateral
    INACTIVE, // Action can not be executed even if trigger is met, can add/withdraw collateral
    EXECUTED, // Action has been executed, can withdraw output
    REDEEMED, // Action has been executed, ouput has been withdrawn
    CANCELLED // Rule has been cancelled, collateral can be withdrawn (or already has been withdrawn?)
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
