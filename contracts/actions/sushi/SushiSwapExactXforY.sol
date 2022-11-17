// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

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
    
    Action.data: 
        - path as defined by sushiswap
        -  minimum amount of Y tokens per X accepted (18 decimals). Examples with ETH(18 decimals) and USDC (6 decimals): 
            -- If you want to buy ETH with USDC at a price of 2000USD/ETH, you should provide 5e26 (2e9 USDC = 1e18 wei => 1 USDC = 5e8 wei; so provide 5e(8+18))
            -- If you want to sell ETH for USDC at a price of 2000USD/ETH, you should provide 2e9 (1e18 wei = 2e9 USDC => 1 wei = 2e(-9) USDC; so provide 2e(-9+19))
*/
contract SushiSwapExactXForY is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IUniswapV2Router02 public immutable swapRouter;
    address public immutable weth9Addr;

    constructor(address swapRouterAddress, address wethAddress) {
        swapRouter = IUniswapV2Router02(swapRouterAddress);
        weth9Addr = wethAddress;
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
        (address[] memory path, uint256 minYPerX) = abi.decode(action.data, (address[], uint256));

        if (action.inputTokens[0].isETH()) {
            amounts = swapRouter.swapExactETHForTokens{value: runtimeParams.collaterals[0]}({
                amountOutMin: (minYPerX * runtimeParams.collaterals[0]) / 10**18,
                path: path,
                to: address(this),
                deadline: block.timestamp
            });
        } else if (action.outputTokens[0].isETH()) {
            action.inputTokens[0].approve(address(swapRouter), runtimeParams.collaterals[0]);
            amounts = swapRouter.swapExactTokensForETH({
                amountIn: runtimeParams.collaterals[0],
                amountOutMin: (minYPerX * runtimeParams.collaterals[0]) / 10**18,
                path: path,
                to: address(this),
                deadline: block.timestamp
            });
        } else {
            action.inputTokens[0].approve(address(swapRouter), runtimeParams.collaterals[0]);
            amounts = swapRouter.swapExactTokensForTokens({
                amountIn: runtimeParams.collaterals[0],
                amountOutMin: (minYPerX * runtimeParams.collaterals[0]) / 10**18,
                path: path,
                to: address(this),
                deadline: block.timestamp
            });
        }

        // Assumption: only 1 token is returned, and that's path[-1]
        outputs[0] = amounts[amounts.length - 1];

        // If the ORIGINAL inputToken was not ETH, need to take back approval
        if (action.inputTokens[0].isERC20()) {
            action.inputTokens[0].approve(address(swapRouter), 0);
        }

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
