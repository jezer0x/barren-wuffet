// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../RETypes.sol";

interface ITrigger {
    // Returns true if Action needs to be called
    // Returns a uint to be fed to Actions call
    function checkTrigger(RETypes.Trigger calldata trigger) external view returns (bool, uint256);

    // Used during addition of a trigger.
    // Reverts if trigger.fields don't make sense.
    function validateTrigger(RETypes.Trigger calldata trigger) external view returns (bool);
}
