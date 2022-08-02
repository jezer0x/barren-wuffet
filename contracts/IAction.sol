// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./RETypes.sol";

interface IAction {
    // unpacks action and triggerdata and creates calldata of the callee
    // calls the function
    // returns (uint) if successful, else should revert
    function performAction(RETypes.Action calldata action, RETypes.ActionRuntimeParams calldata runtimeParams)
        external
        payable
        returns (uint256);

    // reverts if action fails to validate, otherwise returns true
    function validateAction(RETypes.Action calldata action) external view returns (bool);
}
