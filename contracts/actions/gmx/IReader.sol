// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IReader {
    function getAmountOut(
        address _vault, // was of type IVault in GMX Reader.sol for GMX.
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external view returns (uint256, uint256);

    function getPositions(
        address _vault,
        address _account,
        address[] memory _collateralTokens,
        address[] memory _indexTokens,
        bool[] memory _isLong
    ) external view returns (uint256[] memory);
}
