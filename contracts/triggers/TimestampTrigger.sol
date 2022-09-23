// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ITrigger.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../utils/Utils.sol";

contract TimestampTrigger is ITrigger {
    constructor() {}

    function validate(Trigger calldata trigger) external pure returns (bool) {
        require(trigger.triggerType == TriggerType.Timestamp);
        return true;
    }

    function check(Trigger calldata trigger) external view returns (bool, TriggerReturn memory) {
        // get the val of var, so we can check if it matches trigger
        (Ops op, uint256 val) = decodeTimestampTriggerCreateTimeParams(trigger.createTimeParams);
        uint256 res = block.timestamp;

        TriggerReturn memory runtimeData = TriggerReturn({
            triggerType: trigger.triggerType,
            runtimeData: abi.encode(res)
        });

        if (op == Ops.GT) {
            return (res > val, runtimeData);
        } else if (op == Ops.LT) {
            return (res < val, runtimeData);
        } else {
            revert("Ops not handled!");
        }
    }
}
