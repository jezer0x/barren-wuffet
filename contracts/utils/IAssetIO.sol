// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAssetIO {
    function getInputTokens(bytes32 hash) external view returns (address[] memory);

    function getOutputTokens(bytes32 hash) external view returns (address[] memory);
}
