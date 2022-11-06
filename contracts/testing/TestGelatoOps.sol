// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../bot/libraries/LibDataTypes.sol";

contract TestGelatoOps {
    function createTask(
        address execAddress,
        bytes calldata execData,
        LibDataTypes.ModuleData calldata moduleData,
        address feeToken
    ) external returns (bytes32 task) {
        return "";
    }

    function cancelTask(bytes32 _taskId) external {
        return;
    }

    function gelato() external view returns (address payable) {
        return payable(address(this));
    }
}
