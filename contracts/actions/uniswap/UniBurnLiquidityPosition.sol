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
        Will only have 1 input tokens (NFT) and 0 outputs

    Conditions: 
        Must insure all the fees have been collected and liquidity decreased to 0 before burning a position
*/
contract UniBurnLiquidityPosition is IAction, DelegatePerform {
    using SafeERC20 for IERC20;

    INonfungiblePositionManager public immutable nonfungiblePositionManager;
    address public immutable WETH9Addr;

    constructor(address _nonfungiblePositionManager, address wethAddress) {
        nonfungiblePositionManager = INonfungiblePositionManager(_nonfungiblePositionManager);
        WETH9Addr = wethAddress;
    }

    function validate(Action calldata action) external view returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.inputTokens[0].t == TokenType.ERC721);
        require(action.outputTokens.length == 0);

        (, , , , , , , , , , uint256 amount0Owed, uint256 amount1Owed) = nonfungiblePositionManager.positions(
            action.inputTokens[0].id
        );

        require(amount0Owed == 0);
        require(amount1Owed == 0);

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs;
        nonfungiblePositionManager.burn(action.inputTokens[0].id);
        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
