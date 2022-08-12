// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAssetIO {
    function getInputToken(bytes32 hash) external view returns (address);

    function getOutputToken(bytes32 hash) external view returns (address);
}
