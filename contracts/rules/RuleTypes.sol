// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../actions/ActionTypes.sol";
import "../triggers/TriggerTypes.sol";

enum RuleStatus {
    ACTIVE, // Action can be executed when trigger is met, can add/withdraw collateral
    INACTIVE, // Action can not be executed even if trigger is met, can add/withdraw collateral
    EXECUTED, // Action has been executed, can withdraw output
    REDEEMED // Action has been executed, ouput has been withdrawn
}

struct Rule {
    Trigger[] triggers;
    Action[] actions;
    uint256[] collaterals; // idx if ERC721, amount if erc20 or native
    RuleStatus status;
    // Final output received after all the actions are done.
    uint256[] outputs; // idx if ERC721, amount if erc20 or native
}
