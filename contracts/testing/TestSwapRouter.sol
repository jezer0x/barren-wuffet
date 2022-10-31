// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../utils/Utils.sol";

contract TestSwapRouter is ISwapRouter {
    using SafeERC20 for IERC20;

    address WETH9;

    constructor(address wethAddress) {
        WETH9 = wethAddress;
    }

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
    {
        // The output token needs to be tranferred to this contract that is > amountOutMinimum
        if (params.tokenIn != WETH9) {
            IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        }
        if (params.tokenOut != WETH9) {
            IERC20(params.tokenOut).safeTransfer(params.recipient, params.amountOutMinimum);
        } else {
            payable(params.recipient).transfer(params.amountOutMinimum);
        }

        return params.amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable override returns (uint256 amountOut) {}

    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountIn)
    {}

    function exactOutput(ExactOutputParams calldata params) external payable override returns (uint256 amountIn) {}

    receive() external payable {}
}
