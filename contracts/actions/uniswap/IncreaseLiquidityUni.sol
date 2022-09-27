// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

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
        https://docs.uniswap.org/protocol/guides/providing-liquidity/increase-liquidity

    Tokens: 
        Will only have 3 input tokens (NFT, token0, token1) and 2 outputs (slippage refund for token0 and token1)
*/
contract IncreaseLiquidityUni is IAction, DelegatePerform {
    using SafeERC20 for IERC20;

    INonfungiblePositionManager immutable nonfungiblePositionManager;
    address immutable WETH9Addr;

    constructor(address _nonfungiblePositionManager, address wethAddress) {
        nonfungiblePositionManager = INonfungiblePositionManager(_nonfungiblePositionManager);
        WETH9Addr = wethAddress;
    }

    function validate(Action calldata action) external view returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.inputTokens[0].t == TokenType.ERC721);
        require(action.outputTokens.length == 2);
        require(action.outputTokens[0].t == TokenType.ERC20 || action.outputTokens[0].t == TokenType.NATIVE);
        require(action.outputTokens[1].t == TokenType.ERC20 || action.outputTokens[1].t == TokenType.NATIVE);

        (, , address token0, address token1, , , , , , , , ) = nonfungiblePositionManager.positions(
            action.inputTokens[0].id
        );

        require(token0 == action.outputTokens[1].addr);
        require(token1 == action.outputTokens[2].addr);

        (uint256 _amount0Desired, uint256 _amount1Desired, uint256 _amount0Min, uint256 _amount1Min) = abi.decode(
            action.data,
            (uint256, uint256, uint256, uint256)
        );

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](2);

        (uint256 _amount0Desired, uint256 _amount1Desired, uint256 _amount0Min, uint256 _amount1Min) = abi.decode(
            action.data,
            (uint256, uint256, uint256, uint256)
        );

        INonfungiblePositionManager.IncreaseLiquidityParams memory params = INonfungiblePositionManager
            .IncreaseLiquidityParams({
                tokenId: action.inputTokens[0].id,
                amount0Desired: _amount0Desired,
                amount1Desired: _amount1Desired,
                amount0Min: _amount0Min,
                amount1Min: _amount1Min,
                deadline: block.timestamp
            });

        (, uint256 amount0, uint256 amount1) = nonfungiblePositionManager.increaseLiquidity(params);

        outputs[0] = amount0;
        outputs[1] = amount1;

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
