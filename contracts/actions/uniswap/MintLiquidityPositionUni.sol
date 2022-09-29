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
import "hardhat/console.sol";

/*
    Reference: 
        https://docs.uniswap.org/protocol/guides/providing-liquidity/the-full-contract

    Tokens: 
        Will only have 2 input tokens and 3 output (refund of first 2, and an NFT)

    TriggerReturn: 
        Applicable TriggerReturn must be in (asset1, asset2, val) where val.decimals = 8, asset1 = inputToken and asset2 = outputToken
            Example: 
            ETH/USD -> USD per ETH -> ETH Price in USD -> triggerReturn = [ETH, USD, val] -> Must use when tokenIn = ETH and tokenOut = USD (i.e. buying USD with ETH)
            USD/ETH -> ETH per USD -> USD Price in ETH -> triggerReturn = [USD, ETH, val] -> Must use when tokenIn = USD* and tokenOut = ETH (i.e. buying ETH with USD)
*/
contract MintLiquidityPositionUni is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    INonfungiblePositionManager public immutable nonfungiblePositionManager;
    address public immutable WETH9Addr;
    address public immutable burnPositionAddr;

    constructor(
        address _nonfungiblePositionManager,
        address wethAddress,
        address _burnPositionAddr
    ) {
        nonfungiblePositionManager = INonfungiblePositionManager(_nonfungiblePositionManager);
        WETH9Addr = wethAddress;
        burnPositionAddr = _burnPositionAddr;
    }

    function validate(Action calldata action) external pure returns (bool) {
        //TODO: need more validation here
        require(action.inputTokens.length == 2);
        require(action.outputTokens.length == 3);

        // TODO: tl and tu might need to be taken at the point of perform instead.
        (uint24 fee, int24 tl, int24 tu) = abi.decode(action.data, (uint24, int24, int24));
        return true;
    }

    // TODO: make this handle ETH pools too
    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](3);

        // For this example, we will provide equal amounts of liquidity in both assets.
        // Providing liquidity in both assets means liquidity will be earning fees and is considered in-range.
        uint256 ethCollateral;
        address token0Addr;
        address token1Addr;

        // Approve the position manager
        if (action.inputTokens[0].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0}))) {
            token0Addr = WETH9Addr;
            token1Addr = action.inputTokens[1].addr;
            ethCollateral = runtimeParams.collaterals[0];
            IERC20(token1Addr).safeApprove(address(nonfungiblePositionManager), runtimeParams.collaterals[1]);
        } else if (action.inputTokens[1].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0}))) {
            token0Addr = action.inputTokens[0].addr;
            token1Addr = WETH9Addr;
            ethCollateral = runtimeParams.collaterals[1];
            IERC20(token0Addr).safeApprove(address(nonfungiblePositionManager), runtimeParams.collaterals[0]);
        } else {
            token0Addr = action.inputTokens[0].addr;
            token1Addr = action.inputTokens[1].addr;
            ethCollateral = 0;
            IERC20(token0Addr).safeApprove(address(nonfungiblePositionManager), runtimeParams.collaterals[0]);
            IERC20(token1Addr).safeApprove(address(nonfungiblePositionManager), runtimeParams.collaterals[1]);
        }

        INonfungiblePositionManager.MintParams memory params;

        // block scodping because stack too deep
        {
            (uint24 fee, int24 tl, int24 tu) = abi.decode(action.data, (uint24, int24, int24));

            params = INonfungiblePositionManager.MintParams({
                token0: token0Addr,
                token1: token1Addr,
                fee: fee,
                tickLower: tl,
                tickUpper: tu,
                amount0Desired: runtimeParams.collaterals[0],
                amount1Desired: runtimeParams.collaterals[1],
                amount0Min: 0, // TODO: take these from triggerParams
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp
            });
        }

        console.log("calling mint");
        (uint256 tokenId, uint256 liquidity, uint256 amount0, uint256 amount1) = nonfungiblePositionManager.mint{
            value: ethCollateral
        }(params);
        console.log("minted");

        // Remove allowance and refund in both assets.
        IERC20(action.inputTokens[0].addr).safeApprove(address(nonfungiblePositionManager), 0);
        IERC20(action.inputTokens[1].addr).safeApprove(address(nonfungiblePositionManager), 0);

        outputs[0] = amount0 < runtimeParams.collaterals[0] ? runtimeParams.collaterals[0] - amount0 : 0;
        outputs[1] = amount1 < runtimeParams.collaterals[1] ? runtimeParams.collaterals[1] - amount1 : 0;
        outputs[2] = tokenId;

        // setting up position
        Token[] memory inputTokens = new Token[](1);
        inputTokens[0] = Token({t: TokenType.ERC721, addr: address(nonfungiblePositionManager), id: tokenId});
        Action[] memory nextActions = new Action[](1);
        nextActions[0] = Action({
            callee: burnPositionAddr,
            data: "",
            inputTokens: inputTokens,
            outputTokens: new Token[](0)
        });
        Position memory pos = Position({actionConstraints: new ActionConstraints[](0), nextActions: nextActions});
        return ActionResponse({tokenOutputs: outputs, position: pos});
    }
}
