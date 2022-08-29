// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ActionTypes.sol";

interface IAction {
    // unpacks action and triggerdata and creates calldata of the callee
    // calls the function
    // returns (uint) if successful, else should revert
    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        returns (uint256[] memory);

    // reverts if action fails to validate, otherwise returns true
    function validate(Action calldata action) external view returns (bool);
}
