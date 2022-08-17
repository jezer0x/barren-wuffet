// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../actions/ActionTypes.sol";
import "../triggers/TriggerTypes.sol";

enum RuleStatus {
    ACTIVE,
    INACTIVE,
    EXECUTED,
    REDEEMED,
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
