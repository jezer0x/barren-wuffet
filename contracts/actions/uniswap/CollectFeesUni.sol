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
        https://docs.uniswap.org/protocol/guides/providing-liquidity/the-full-contract

    Tokens: 
        Will only have 1 input tokens (NFT) and 2 outputs (fees in token0 and token1)
*/
contract CollectFeesUni is IAction, DelegatePerform {
    using SafeERC20 for IERC20;

    INonfungiblePositionManager immutable nonfungiblePositionManager;
    address immutable WETH9Addr;

    constructor(address _nonfungiblePositionManager, address wethAddress) {
        nonfungiblePositionManager = INonfungiblePositionManager(_nonfungiblePositionManager);
        WETH9Addr = wethAddress;
    }

    function validate(Action calldata action) external pure returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.inputTokens[0].t == TokenType.ERC721);
        require(action.outputTokens.length == 2);
        require(action.inputTokens[0].t == TokenType.ERC20 || action.inputTokens[0].t == TokenType.NATIVE);
        require(action.inputTokens[1].t == TokenType.ERC20 || action.inputTokens[1].t == TokenType.NATIVE);
        //TODO: tokenId is part of runtimeParams.collateral instead of action.data. Will that be a problem for NFTs?
        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](2);

        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: runtimeParams.collaterals[0],
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (uint256 amount0, uint256 amount1) = nonfungiblePositionManager.collect(params);

        outputs[0] = amount0;
        outputs[1] = amount1;

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}