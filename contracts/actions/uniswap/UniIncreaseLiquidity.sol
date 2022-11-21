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
        https://docs.uniswap.org/protocol/guides/providing-liquidity/increase-liquidity

    Tokens: 
        Will only have 3 input tokens (NFT, token0, token1) and 3 outputs (NFT, slippage refund for token0 and token1)
*/
contract UniIncreaseLiquidity is IAction, DelegatePerform {
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
        require(action.outputTokens[1].isERC20() || action.outputTokens[0].isETH());
        require(action.outputTokens[2].isERC20() || action.outputTokens[1].isETH());

        (uint256 minYPerX, uint256 minXPerY) = abi.decode(action.data, (uint256, uint256));

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

        uint256 ethCollateral;
        if (action.inputTokens[1].isETH()) {
            ethCollateral = runtimeParams.collaterals[1];
            action.inputTokens[2].approve(address(nonfungiblePositionManager), runtimeParams.collaterals[2]);
        } else if (action.inputTokens[2].isETH()) {
            ethCollateral = runtimeParams.collaterals[1];
            action.inputTokens[1].approve(address(nonfungiblePositionManager), runtimeParams.collaterals[1]);
        } else {
            action.inputTokens[1].approve(address(nonfungiblePositionManager), runtimeParams.collaterals[1]);
            action.inputTokens[2].approve(address(nonfungiblePositionManager), runtimeParams.collaterals[2]);
        }
 

        (uint256 minYPerX, uint256 minXPerY) = abi.decode(action.data, (uint256, uint256));

        INonfungiblePositionManager.IncreaseLiquidityParams memory params = INonfungiblePositionManager
            .IncreaseLiquidityParams({
                tokenId: action.inputTokens[0].id,
                amount0Desired: runtimeParams.collaterals[0],
                amount1Desired: runtimeParams.collaterals[0],
                amount0Min: (minXPerY * runtimeParams.collaterals[1]) / 10**18, 
                amount1Min: (minYPerX * runtimeParams.collaterals[0]) / 10**18,
                deadline: block.timestamp
            });

        (, uint256 amount0, uint256 amount1) = nonfungiblePositionManager.increaseLiquidity{value: ethCollateral}(
            params
        );

        outputs[0] = action.inputTokens[0].id;
        outputs[1] = runtimeParams.collaterals[0] - amount0;
        outputs[2] = runtimeParams.collaterals[1] - amount1;

        if (ethCollateral > 0) {
            nonfungiblePositionManager.refundETH();
        }
        
        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
