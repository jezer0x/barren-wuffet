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
        https://docs.uniswap.org/protocol/guides/providing-liquidity/decrease-liquidity

    Tokens: 
        Will only have 1 input tokens (NFT) and 3 outputs (NFT, amount taken out in token0 and token1)
*/
contract DecreaseLiquidityUni is IAction, DelegatePerform {
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
        require(action.outputTokens.length == 3);
        require(action.inputTokens[0].equals(action.outputTokens[0]));
        require(action.outputTokens[1].t == TokenType.ERC20 || action.outputTokens[0].t == TokenType.NATIVE);
        require(action.outputTokens[2].t == TokenType.ERC20 || action.outputTokens[1].t == TokenType.NATIVE);

        (
            ,
            ,
            address token0,
            address token1,
            ,
            ,
            ,
            uint128 liquidity,
            ,
            ,
            uint256 tokens0Owed,
            uint256 tokens1Owed
        ) = nonfungiblePositionManager.positions(action.inputTokens[0].id);

        require(token0 == action.outputTokens[1].addr);
        require(token1 == action.outputTokens[2].addr);
        (uint128 _liquidity, uint256 _amount0Min, uint256 _amount1Min) = abi.decode(
            action.data,
            (uint128, uint256, uint256)
        );
        require(_liquidity >= liquidity);
        require(tokens0Owed >= _amount0Min);
        require(tokens1Owed >= _amount1Min);

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](3);

        (uint128 _liquidity, uint256 _amount0Min, uint256 _amount1Min) = abi.decode(
            action.data,
            (uint128, uint256, uint256)
        );
        INonfungiblePositionManager.DecreaseLiquidityParams memory params = INonfungiblePositionManager
            .DecreaseLiquidityParams({
                tokenId: action.inputTokens[0].id,
                liquidity: _liquidity,
                amount0Min: _amount0Min, // TODO: should these be taken from triggers or be in action.data?
                amount1Min: _amount1Min,
                deadline: block.timestamp
            });

        (uint256 amount0, uint256 amount1) = nonfungiblePositionManager.decreaseLiquidity(params);

        outputs[0] = action.inputTokens[0].id;
        outputs[1] = amount0;
        outputs[2] = amount1;

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
