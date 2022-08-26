// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAssetIO {
    function getInputTokens() external view returns (address[] memory);

    function getOutputTokens() external view returns (address[] memory);
}
