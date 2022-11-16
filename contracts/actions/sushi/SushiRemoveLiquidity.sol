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
        Will only have 1 input token and 2 output tokens

    Action.data: 
        - (uint256 minXPerSLP, uint256 minYPerSLP) : minimum amount of X and Y tokens you'll take for SLP tokens given 
*/
contract SushiRemoveLiquidity is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IUniswapV2Router02 public immutable router;

    constructor(address routerAddr) {
        router = IUniswapV2Router02(routerAddr);
    }

    function validate(Action calldata action) external view returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.inputTokens[0].isERC20());

        require(action.outputTokens.length == 2);
        require(action.outputTokens[0].isERC20() || action.outputTokens[0].isETH());
        require(action.outputTokens[1].isERC20() || action.outputTokens[1].isETH());

        address token0Addr = action.outputTokens[0].isETH() ? router.WETH() : action.outputTokens[0].addr;
        address token1Addr = action.outputTokens[1].isETH() ? router.WETH() : action.outputTokens[1].addr;

        require(
            action.inputTokens[0].addr == IUniswapV2Factory(router.factory()).getPair(token0Addr, token1Addr),
            "Wrong SLP Token"
        );

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](2);

        // take note whether ETH is present in the LP
        int256 ethIdx = -1;
        if (action.outputTokens[0].isETH()) {
            ethIdx = 0;
        } else if (action.outputTokens[1].isETH()) {
            ethIdx = 1;
        }

        action.inputTokens[0].approve(address(router), runtimeParams.collaterals[0]);

        if (ethIdx >= 0) {
            uint256 tokenIdx = 1 - uint256(ethIdx);

            (outputs[tokenIdx], outputs[uint256(ethIdx)]) = router.removeLiquidityETH(
                action.outputTokens[tokenIdx].addr,
                runtimeParams.collaterals[0],
                0, // TODO: frontRun protection
                0,
                address(this),
                block.timestamp
            );
        } else {
            (outputs[0], outputs[1]) = router.removeLiquidity(
                action.outputTokens[0].addr,
                action.outputTokens[1].addr,
                runtimeParams.collaterals[0],
                0, // TODO: frontRun protection
                0,
                address(this),
                block.timestamp
            );
        }

        action.inputTokens[0].approve(address(router), 0);

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
