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
        https://docs.uniswap.org/protocol/guides/providing-liquidity/the-full-contract

    Tokens: 
        Will only have 1 input tokens (NFT) and 3 outputs (NFT, fees in token0 and token1)
*/
contract UniCollectFees is IAction, DelegatePerform {
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
        require(action.outputTokens.length == 3);
        require(action.inputTokens[0].equals(action.outputTokens[0]));
        require(action.outputTokens[1].isERC20() || action.outputTokens[1].isETH());
        require(action.outputTokens[2].isERC20() || action.outputTokens[2].isETH());

        (, , address token0, address token1, , , , , , , , ) = nonfungiblePositionManager.positions(
            action.inputTokens[0].id
        );

        require(token0 == action.outputTokens[1].addr);
        require(token1 == action.outputTokens[2].addr);

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](3);

        (uint128 _amount0Max, uint128 _amount1Max) = abi.decode(action.data, (uint128, uint128));

        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: action.inputTokens[0].id,
            recipient: address(0),
            amount0Max: _amount0Max,
            amount1Max: _amount1Max
        });

        (uint256 amount0, uint256 amount1) = nonfungiblePositionManager.collect(params);

        if (action.outputTokens[1].isETH()) {
            nonfungiblePositionManager.unwrapWETH9(amount0, address(this)); 
        } else if (action.outputTokens[1].isERC20()) {
            nonfungiblePositionManager.sweepToken(action.outputTokens[1].addr, amount0, address(this)); 
        } 

        if (action.outputTokens[2].isETH()) {
            nonfungiblePositionManager.unwrapWETH9(amount1, address(this)); 
        } else if (action.outputTokens[2].isERC20()) {
            nonfungiblePositionManager.sweepToken(action.outputTokens[2].addr, amount1, address(this)); 
        } 
            

        outputs[0] = action.inputTokens[0].id;
        outputs[1] = amount0;
        outputs[2] = amount1;

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
