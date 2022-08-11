// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract TestSwapRouter is ISwapRouter {
    constructor() {}

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {}

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {}

    function exactInput(ExactInputParams calldata params) external payable override returns (uint256 amountOut) {}

    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {}

    function exactOutput(ExactOutputParams calldata params) external payable override returns (uint256 amountIn) {}
}
