// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../../utils/Constants.sol";
import "../DelegatePerform.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

/*
    Reference: 
        https://docs.uniswap.org/protocol/guides/providing-liquidity/decrease-liquidity

    Tokens: 
        Will only have 1 input tokens (NFT) and 2 outputs (token pair involved in the pool)
        If all the fees have not been collected and liquidity decreased to 0 before burning a position, the action will return the remaining assets
*/
contract UniSweepAndBurnLiquidityPosition is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    INonfungiblePositionManager public immutable nonfungiblePositionManager;
    address public immutable weth9Addr;

    constructor(address _nonfungiblePositionManager, address wethAddress) {
        nonfungiblePositionManager = INonfungiblePositionManager(_nonfungiblePositionManager);
        weth9Addr = wethAddress;
    }

    function validate(Action calldata action) external view returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.inputTokens[0].isERC721());
        require(action.outputTokens.length == 2);

        (, , address token0, address token1, , , , , , , , ) = nonfungiblePositionManager.positions(
            action.inputTokens[0].id
        );

        require(action.outputTokens[0].addr == token0 || (action.outputTokens[0].isETH() && token0 == weth9Addr));
        require(action.outputTokens[1].addr == token1 || (action.outputTokens[1].isETH() && token1 == weth9Addr));

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        (, , , , , , , uint128 liquidity, , , uint256 tokens0Owed, uint256 tokens1Owed) = nonfungiblePositionManager
            .positions(action.inputTokens[0].id);

        INonfungiblePositionManager.DecreaseLiquidityParams memory params = INonfungiblePositionManager
            .DecreaseLiquidityParams({
                tokenId: action.inputTokens[0].id,
                liquidity: liquidity,
                amount0Min: tokens0Owed, // TODO: have some slippage give?
                amount1Min: tokens1Owed,    // TODO: have some slippage give?
                deadline: block.timestamp 
            });

        (uint256 amount0, uint256 amount1) = nonfungiblePositionManager.decreaseLiquidity(params);

        INonfungiblePositionManager.CollectParams memory collectParams = INonfungiblePositionManager.CollectParams({
            tokenId: action.inputTokens[0].id,
            recipient: address(0),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (amount0, amount1) = nonfungiblePositionManager.collect(collectParams);

        if (action.outputTokens[0].isETH()) {
            nonfungiblePositionManager.unwrapWETH9(amount0, address(this)); 
        } else if (action.outputTokens[0].isERC20()) {
            nonfungiblePositionManager.sweepToken(action.outputTokens[0].addr, amount0, address(this)); 
        } 

        if (action.outputTokens[1].isETH()) {
            nonfungiblePositionManager.unwrapWETH9(amount1, address(this)); 
        } else if (action.outputTokens[1].isERC20()) {
            nonfungiblePositionManager.sweepToken(action.outputTokens[1].addr, amount1, address(this)); 
        } 
            
        uint256[] memory outputs = new uint256[](2);
        outputs[0] = amount0;
        outputs[1] = amount1;

        nonfungiblePositionManager.burn(action.inputTokens[0].id);
        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
