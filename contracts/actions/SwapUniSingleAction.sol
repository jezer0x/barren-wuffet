// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../utils/Constants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
    https://docs.uniswap.org/protocol/guides/swaps/single-swaps

    runtimeParams.triggerReturn must be in decimals = 8
    Notes with examples: 
    ETH/USD -> USD per ETH -> ETH Price in USD -> triggerReturn = ["eth", "usd"] -> Must use when tokenIn = ETH and tokenOut = USD (i.e. buying USD with ETH)
    USD/ETH -> ETH per USD -> USD Price in ETH -> triggerReturn = ["usd", "eth"] -> Must use when tokenIn = USD* and tokenOut = ETH (i.e. buying ETH with USD)

    Will only have 1 input token and 1 output token
 */
contract SwapUniSingleAction is IAction, Ownable {
    using SafeERC20 for IERC20;

    ISwapRouter swapRouter;
    address WETH9;

    constructor(address swapRouterAddress, address wethAddress) {
        swapRouter = ISwapRouter(swapRouterAddress);
        WETH9 = wethAddress;
    }

    function changeContractAddresses(address swapRouterAddress, address wethAddress) public onlyOwner {
        swapRouter = ISwapRouter(swapRouterAddress);
        WETH9 = wethAddress;
    }

    function validate(Action calldata action) external pure returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.outputTokens.length == 1);
        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        payable
        returns (uint256[] memory)
    {
        ISwapRouter.ExactInputSingleParams memory params;
        uint256[] memory outputs = new uint256[](1);

        if (msg.value > 0) {
            require(action.inputTokens[0] == Constants.ETH, "ETH != inputToken");
            params = ISwapRouter.ExactInputSingleParams({
                tokenIn: WETH9,
                tokenOut: action.outputTokens[0],
                fee: 3000, // TODO: pass from action.data?
                recipient: msg.sender,
                deadline: block.timestamp, // need to do an immediate swap
                amountIn: msg.value,
                amountOutMinimum: (runtimeParams.triggerReturn * msg.value) / 10**8, // assumption: triggerReturn in the form of ETH/tokenOut.
                sqrtPriceLimitX96: 0
            });
            outputs[0] = swapRouter.exactInputSingle{value: msg.value}(params);
        } else {
            address outputToken;
            if (action.outputTokens[0] == Constants.ETH) {
                outputToken = WETH9;
            } else {
                outputToken = action.outputTokens[0];
            }
            IERC20(action.inputTokens[0]).safeTransferFrom(
                msg.sender,
                address(this),
                runtimeParams.collateralAmounts[0]
            );
            IERC20(action.inputTokens[0]).safeApprove(address(swapRouter), runtimeParams.collateralAmounts[0]);
            params = ISwapRouter.ExactInputSingleParams({
                tokenIn: action.inputTokens[0],
                tokenOut: outputToken,
                fee: 3000, // TODO: pass from action.data?
                recipient: msg.sender,
                deadline: block.timestamp, // need to do an immediate swap
                amountIn: runtimeParams.collateralAmounts[0],
                amountOutMinimum: (runtimeParams.triggerReturn * runtimeParams.collateralAmounts[0]) / 10**8, // assumption: triggerReturn in the form of tokenIn/tokenOut.
                sqrtPriceLimitX96: 0
            });
            outputs[0] = swapRouter.exactInputSingle(params);
            IERC20(action.inputTokens[0]).safeApprove(address(swapRouter), 0);
        }

        return outputs;
    }
}
