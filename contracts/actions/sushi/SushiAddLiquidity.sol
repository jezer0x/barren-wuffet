// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IAction.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
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
        Will only have 2 input tokens and 3 output tokens (2 token residues, LP token )

    TriggerReturn: 
        Applicable TriggerReturn must be in (asset1, asset2, val) where val.decimals = 8, asset1 = inputToken[0] and asset2 = inputToken[1]
        If not present, trade is in danger of getting frontrun.
*/
contract SushiAddLiquidity is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IUniswapV2Router02 public immutable router;

    constructor(address routerAddr) {
        router = IUniswapV2Router02(routerAddr);
    }

    function validate(Action calldata action) external view returns (bool) {
        require(action.inputTokens.length == 2);
        require(action.inputTokens[0].isERC20() || action.inputTokens[0].isETH());
        require(action.inputTokens[1].isERC20() || action.inputTokens[1].isETH());

        require(action.outputTokens.length == 3);
        require(action.outputTokens[0].equals(action.inputTokens[0]));
        require(action.outputTokens[1].equals(action.inputTokens[1]));

        address token0Addr = action.inputTokens[0].isETH() ? router.WETH() : action.inputTokens[0].addr;
        address token1Addr = action.inputTokens[1].isETH() ? router.WETH() : action.inputTokens[1].addr;

        require(
            action.outputTokens[2].addr == IUniswapV2Factory(router.factory()).getPair(token0Addr, token1Addr),
            "Wrong SLP Token"
        );

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](3);

        // take note whether ETH is present in the LP
        int256 ethIdx = -1;
        if (action.inputTokens[0].isETH()) {
            ethIdx = 0;
        } else if (action.inputTokens[1].isETH()) {
            ethIdx = 1;
        }

        if (ethIdx >= 0) {
            uint256 tokenIdx = 1 - uint256(ethIdx);

            action.inputTokens[tokenIdx].approve(address(router), runtimeParams.collaterals[tokenIdx]);

            (outputs[tokenIdx], outputs[uint256(ethIdx)], outputs[2]) = router.addLiquidityETH{
                value: runtimeParams.collaterals[uint256(ethIdx)]
            }(
                action.inputTokens[tokenIdx].addr,
                runtimeParams.collaterals[tokenIdx],
                (SimpleSwapUtils._getRelevantPriceTriggerData(
                    action.inputTokens[0],
                    action.outputTokens[0],
                    runtimeParams.triggerReturnArr
                ) * runtimeParams.collaterals[0]) / 10**8,
                SimpleSwapUtils._getRelevantPriceTriggerData(
                    action.inputTokens[0],
                    action.outputTokens[0],
                    runtimeParams.triggerReturnArr
                ) * runtimeParams.collaterals[1],
                address(this),
                block.timestamp
            );
            outputs[tokenIdx] = runtimeParams.collaterals[tokenIdx] - outputs[tokenIdx];
            outputs[uint256(ethIdx)] = runtimeParams.collaterals[uint256(ethIdx)] - outputs[uint256(ethIdx)];

            action.inputTokens[tokenIdx].approve(address(router), 0);
        } else {
            action.inputTokens[0].approve(address(router), runtimeParams.collaterals[0]);
            action.inputTokens[1].approve(address(router), runtimeParams.collaterals[1]);

            (outputs[0], outputs[1], outputs[2]) = router.addLiquidity(
                action.inputTokens[0].addr,
                action.inputTokens[1].addr,
                runtimeParams.collaterals[0],
                runtimeParams.collaterals[1],
                (SimpleSwapUtils._getRelevantPriceTriggerData(
                    action.inputTokens[0],
                    action.inputTokens[1],
                    runtimeParams.triggerReturnArr
                ) * runtimeParams.collaterals[0]) / 10**8,
                SimpleSwapUtils._getRelevantPriceTriggerData(
                    action.inputTokens[0],
                    action.inputTokens[1],
                    runtimeParams.triggerReturnArr
                ) * runtimeParams.collaterals[1],
                address(this),
                block.timestamp
            );

            outputs[0] = runtimeParams.collaterals[0] - outputs[0];
            outputs[1] = runtimeParams.collaterals[1] - outputs[1];

            action.inputTokens[0].approve(address(router), 0);
            action.inputTokens[1].approve(address(router), 0);
        }

        // None because the Sushi Liquidty Provider token is ERC20, so investors can get back collateral for themselves if needed
        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
