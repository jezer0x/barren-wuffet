// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ITrigger.sol";

contract TimestampTrigger is ITrigger {
    constructor() {}

    function validate(Trigger calldata) external pure returns (bool) {
        return true;
    }

    function check(Trigger calldata) external pure returns (bool, uint256) {
        return (true, 1);
    }
}
