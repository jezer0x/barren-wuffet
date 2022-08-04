// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum RuleStatus {
    CREATED,
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
