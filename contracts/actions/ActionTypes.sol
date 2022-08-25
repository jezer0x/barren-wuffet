// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../triggers/TriggerTypes.sol";

struct ActionRuntimeParams {
    TriggerReturn[] triggerReturnArr;
    uint256[] collateralAmounts;
}

struct Action {
    address callee; // eg. swapUni
    bytes data; // any custom param to send to the callee, encoded at compileTime
    address[] inputTokens; // token to be used to initiate the action
    address[] outputTokens; // token to be gotten as output
}
