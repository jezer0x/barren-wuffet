// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../RETypes.sol";
import "./IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../REConstants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SwapUniSingleAction is IAction {
    ISwapRouter swapRouter;
    address WETH9;

    constructor(address swapRouterAddress, address wethAddress) {
        swapRouter = ISwapRouter(swapRouterAddress);
        WETH9 = wethAddress;
    }

    function validate(Action calldata) external view returns (bool) {
        // we'll be ignoring action.data in swapUni (?)
        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        payable
        returns (uint256)
    {
        ISwapRouter.ExactInputSingleParams memory params;
        uint256 amountOut;

        if (msg.value > 0) {
            require(action.fromToken == REConstants.ETH, "ETH != fromToken");
            params = ISwapRouter.ExactInputSingleParams({
                tokenIn: WETH9,
                tokenOut: action.toToken,
                fee: 3000, // TODO: pass from action.data?
                recipient: msg.sender,
                deadline: block.timestamp, // need to do an immediate swap
                amountIn: msg.value,
                amountOutMinimum: runtimeParams.triggerData,
                sqrtPriceLimitX96: 0
            });
            amountOut = swapRouter.exactInputSingle{value: msg.value}(params);
        } else {
            address toToken;
            if (action.toToken == REConstants.ETH) {
                toToken = WETH9;
            } else {
                toToken = action.toToken;
            }
            IERC20(action.fromToken).transferFrom(msg.sender, address(this), runtimeParams.totalCollateralAmount);
            IERC20(action.fromToken).approve(address(swapRouter), runtimeParams.totalCollateralAmount);
            params = ISwapRouter.ExactInputSingleParams({
                tokenIn: action.fromToken,
                tokenOut: toToken,
                fee: 3000, // TODO: pass from action.data?
                recipient: msg.sender,
                deadline: block.timestamp, // need to do an immediate swap
                amountIn: runtimeParams.totalCollateralAmount,
                amountOutMinimum: runtimeParams.triggerData,
                sqrtPriceLimitX96: 0
            });
            amountOut = swapRouter.exactInputSingle(params);
            IERC20(action.fromToken).approve(address(swapRouter), 0);
        }

        return (amountOut);
    }
}
