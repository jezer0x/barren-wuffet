// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "./RETypes.sol";
import "./REConstants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SwapUniSingleAction is IAction {
    ISwapRouter swapRouter = ISwapRouter(0xc0ffee254729296a45a3885639AC7E10F9d54979); // TODO: put in the right addr
    address WETH9 = 0xc0ffee254729296a45a3885639AC7E10F9d54979; // TODO: put in the right addr

    function validateAction(RETypes.Action memory action) external view {
        // we'll be ignoring action.data in swapUni (?)
    }

    function performAction(RETypes.Action memory action, RETypes.ActionRuntimeParams memory runtimeParams)
        external
        returns (bool, uint256)
    {
        ISwapRouter.ExactInputSingleParams memory params;
        uint256 amountOut;

        if (action.fromToken == REConstants.ETH) {
            params = ISwapRouter.ExactInputSingleParams({
                tokenIn: WETH9,
                tokenOut: action.toToken,
                fee: 3000, // TODO: pass from action.data?
                recipient: address(this),
                deadline: block.timestamp, // need to do an immediate swap
                amountIn: runtimeParams.totalCollateralAmount,
                amountOutMinimum: runtimeParams.triggerData,
                sqrtPriceLimitX96: 0
            });
            amountOut = swapRouter.exactInputSingle{value: runtimeParams.totalCollateralAmount}(params);
        } else {
            address toToken;
            if (action.toToken == REConstants.ETH) {
                toToken = WETH9;
            } else {
                toToken = action.toToken;
            }

            IERC20(action.fromToken).approve(address(swapRouter), runtimeParams.totalCollateralAmount);
            params = ISwapRouter.ExactInputSingleParams({
                tokenIn: action.fromToken,
                tokenOut: toToken,
                fee: 3000, // TODO: pass from action.data?
                recipient: address(this),
                deadline: block.timestamp, // need to do an immediate swap
                amountIn: runtimeParams.totalCollateralAmount,
                amountOutMinimum: runtimeParams.triggerData,
                sqrtPriceLimitX96: 0
            });
            amountOut = swapRouter.exactInputSingle(params);
            IERC20(action.fromToken).approve(address(swapRouter), 0);
        }

        return (true, amountOut);
    }
}
