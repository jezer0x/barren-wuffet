// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract TestGelatoOps {
    function createTask(
        address _execAddress,
        bytes4 _execSelector,
        address _resolverAddress,
        bytes calldata _resolverData
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
