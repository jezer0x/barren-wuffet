// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../RETypes.sol";
import "./ITrigger.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../Utils.sol";

contract TimestampTrigger is ITrigger, Ownable {
    constructor() {}

    function validate(Trigger calldata) external pure returns (bool) {
        return true;
    }

    function check(Trigger calldata trigger) external view returns (bool, uint256) {
        // get the val of var, so we can check if it matches trigger
        (uint256 val, Ops op) = (trigger.value, trigger.op);
        uint256 res = block.timestamp;

        if (op == Ops.GT) {
            return (res > val, res);
        } else if (op == Ops.LT) {
            return (res < val, res);
        }

        return (false, 0);
    }
}
