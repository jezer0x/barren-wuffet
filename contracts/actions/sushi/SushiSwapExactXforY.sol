// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "../../utils/Constants.sol";
import "../../utils/assets/TokenLib.sol";
import "../DelegatePerform.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../SimpleSwapUtils.sol";

/*
    Reference: 
        https://github.com/sushiswap/sushiswap/blob/master/protocols/sushiswap/contracts/UniswapV2Router02.sol

    Tokens: 
        Will only have 1 input token and 1 output token

    TriggerReturn: 
        Applicable TriggerReturn must be in (asset1, asset2, val) where val.decimals = 8, asset1 = inputToken and asset2 = outputToken
        If not present, trade is in danger of getting frontrun.
        
        Example:
            ETH/USD -> USD per ETH -> ETH Price in USD -> triggerReturn = [ETH, USD, val] -> Must use when tokenIn = ETH and tokenOut = USD (i.e. buying USD with ETH)
            USD/ETH -> ETH per USD -> USD Price in ETH -> triggerReturn = [USD, ETH, val] -> Must use when tokenIn = USD and tokenOut = ETH (i.e. buying ETH with USD)
*/
contract SushiSwapExactXForY is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IUniswapV2Router02 public immutable swapRouter;
    address public immutable WETH9Addr;

    constructor(address swapRouterAddress, address wethAddress) {
        swapRouter = IUniswapV2Router02(swapRouterAddress);
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
        uint256[] memory outputs = new uint256[](1);
        uint256[] memory amounts;

        if (action.inputTokens[0].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0}))) {
            amounts = swapRouter.swapExactETHForTokens{value: runtimeParams.collaterals[0]}({
                amountOutMin: (SimpleSwapUtils._getRelevantPriceTriggerData(
                    action.inputTokens[0],
                    action.outputTokens[0],
                    runtimeParams.triggerReturnArr
                ) * runtimeParams.collaterals[0]) / 10**8, // assumption: triggerReturn in the form of tokenIn/tokenOut.,
                path: abi.decode(action.data, (address[])),
                to: address(this),
                deadline: block.timestamp
            });
        } else if (action.outputTokens[0].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0}))) {
            IERC20(action.inputTokens[0].addr).safeApprove(address(swapRouter), runtimeParams.collaterals[0]);
            amounts = swapRouter.swapExactTokensForETH({
                amountIn: runtimeParams.collaterals[0],
                amountOutMin: (SimpleSwapUtils._getRelevantPriceTriggerData(
                    action.inputTokens[0],
                    action.outputTokens[0],
                    runtimeParams.triggerReturnArr
                ) * runtimeParams.collaterals[0]) / 10**8, // assumption: triggerReturn in the form of tokenIn/tokenOut.,
                path: abi.decode(action.data, (address[])),
                to: address(this),
                deadline: block.timestamp
            });
        } else {
            IERC20(action.inputTokens[0].addr).safeApprove(address(swapRouter), runtimeParams.collaterals[0]);
            amounts = swapRouter.swapExactTokensForTokens({
                amountIn: runtimeParams.collaterals[0],
                amountOutMin: (SimpleSwapUtils._getRelevantPriceTriggerData(
                    action.inputTokens[0],
                    action.outputTokens[0],
                    runtimeParams.triggerReturnArr
                ) * runtimeParams.collaterals[0]) / 10**8, // assumption: triggerReturn in the form of tokenIn/tokenOut.,
                path: abi.decode(action.data, (address[])),
                to: address(this),
                deadline: block.timestamp
            });
        }

        // Assumption: only 1 token is returned, and that's path[-1]
        outputs[0] = amounts[amounts.length - 1];

        // If the ORIGINAL inputToken was not ETH, need to take back approval
        if (action.inputTokens[0].t == TokenType.ERC20) {
            IERC20(action.inputTokens[0].addr).safeApprove(address(swapRouter), 0);
        }

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
