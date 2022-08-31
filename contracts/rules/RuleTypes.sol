// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../actions/ActionTypes.sol";
import "../triggers/TriggerTypes.sol";

enum RuleStatus {
    ACTIVE, // Action can be executed when trigger is met, can add/withdraw collateral, can add/reduce reward
    INACTIVE, // Action can not be executed even if trigger is met, can add/withdraw collateral, can add/reduce reward
    EXECUTED, // Action has been executed, can withdraw output, can't add/reduce reward
    REDEEMED // Action has been executed, ouput has been withdrawn, can't add/reduce reward
}

struct Rule {
    address owner;
    Trigger[] triggers;
    Action[] actions;
    uint256[] collaterals; // idx if ERC721, amount if erc20 or native
    RuleStatus status;
    uint256[] outputs; //idx if ERC721, amount if erc20 or native
    uint256 reward;
}
