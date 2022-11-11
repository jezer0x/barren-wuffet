// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../bot/libraries/LibDataTypes.sol";

contract TestGelatoOps {
    function createTask(
        address,
        bytes calldata,
        LibDataTypes.ModuleData calldata,
        address
    ) external pure returns (bytes32 task) {
        return "";
    }

    function cancelTask(bytes32) external pure {
        return;
    }

    function gelato() external view returns (address payable) {
        return payable(address(this));
    }
}
