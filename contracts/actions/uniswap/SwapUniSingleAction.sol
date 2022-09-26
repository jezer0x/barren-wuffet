// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../../utils/Constants.sol";
import "../../utils/assets/TokenLib.sol";
import "../DelegatePerform.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../SimpleSwapUtils.sol";

/*
    Reference: 
        https://docs.uniswap.org/protocol/guides/swaps/single-swaps

    Tokens: 
        Will only have 1 input token and 1 output token

    TriggerReturn: 
        Applicable TriggerReturn must be in (asset1, asset2, val) where val.decimals = 8, asset1 = inputToken and asset2 = outputToken
            Example: 
            ETH/USD -> USD per ETH -> ETH Price in USD -> triggerReturn = [ETH, USD, val] -> Must use when tokenIn = ETH and tokenOut = USD (i.e. buying USD with ETH)
            USD/ETH -> ETH per USD -> USD Price in ETH -> triggerReturn = [USD, ETH, val] -> Must use when tokenIn = USD* and tokenOut = ETH (i.e. buying ETH with USD)
*/
contract SwapUniSingleAction is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    ISwapRouter immutable swapRouter;
    address immutable WETH9Addr;

    constructor(address swapRouterAddress, address wethAddress) {
        swapRouter = ISwapRouter(swapRouterAddress);
        WETH9Addr = wethAddress;
    }

    function validate(Action calldata action) external view returns (bool) {
        return SimpleSwapUtils._validate(action);
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        Token memory inputToken;
        Token memory outputToken;
        uint256 ethCollateral;

        if (action.inputTokens[0].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0}))) {
            // if input is ETH, we need to set it to WETH and pass take not of what to send as msg.value
            inputToken = Token({t: TokenType.ERC20, addr: WETH9Addr, id: 0});
            outputToken = action.outputTokens[0];
            ethCollateral = runtimeParams.collaterals[0];
        } else if (action.outputTokens[0].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0}))) {
            // if output is ETH, we need to set it to WETH, and approve the input token amount for swapRouter
            inputToken = action.inputTokens[0];
            outputToken = Token({t: TokenType.ERC20, addr: WETH9Addr, id: 0});
            IERC20(inputToken.addr).safeApprove(address(swapRouter), runtimeParams.collaterals[0]);
            ethCollateral = 0;
        } else {
            // if neither are ETH, we only approve the input token amount for swapRouter
            inputToken = action.inputTokens[0];
            outputToken = action.outputTokens[0];
            IERC20(inputToken.addr).safeApprove(address(swapRouter), runtimeParams.collaterals[0]);
            ethCollateral = 0;
        }

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: inputToken.addr,
            tokenOut: outputToken.addr,
            fee: 3000, // TODO: pass from action.data?
            recipient: address(this),
            deadline: block.timestamp, // need to do an immediate swap
            amountIn: runtimeParams.collaterals[0],
            amountOutMinimum: (SimpleSwapUtils._parseRuntimeParams(action, runtimeParams) *
                runtimeParams.collaterals[0]) / 10**8, // assumption: triggerReturn in the form of tokenIn/tokenOut.
            sqrtPriceLimitX96: 0
        });

        uint256[] memory outputs = new uint256[](1);
        outputs[0] = swapRouter.exactInputSingle{value: ethCollateral}(params);

        // If the ORIGINAL inputToken was not ETH, need to take back approval
        if (action.inputTokens[0].t == TokenType.ERC20) {
            IERC20(action.inputTokens[0].addr).safeApprove(address(swapRouter), 0);
        }

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
