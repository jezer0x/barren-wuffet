// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../actions/ActionTypes.sol";
import "../triggers/TriggerTypes.sol";

enum RuleStatus {
    ACTIVE, // Action can be executed when trigger is met, can add/withdraw collateral, can add/reduce incentive
    INACTIVE, // Action can not be executed even if trigger is met, can add/withdraw collateral, can add/reduce incentive
    EXECUTED, // Action has been executed, can withdraw output, can't add/reduce incentive
    REDEEMED // Action has been executed, ouput has been withdrawn, can't add/reduce incentive
}

struct Rule {
    address owner;
    Trigger[] triggers;
    Action[] actions;
    uint256[] collaterals; // idx if ERC721, amount if erc20 or native
    RuleStatus status;
    // Final output received after all the actions are done.
    uint256[] outputs; // idx if ERC721, amount if erc20 or native
    uint256 incentive;
}
