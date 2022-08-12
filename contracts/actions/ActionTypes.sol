// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct ActionRuntimeParams {
    uint256 triggerData;
    uint256 totalCollateralAmount;
}

struct Action {
    address callee; // eg. swapUni
    bytes data; // any custom param to send to the callee, encoded at compileTime
    address inputToken; // token to be used to initiate the action
    address outputToken; // token to be gotten as output
}
