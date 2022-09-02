// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../../utils/Constants.sol";
import "../DelegatePerform.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
    Reference: 
        https://docs.uniswap.org/protocol/guides/swaps/single-swaps

    Tokens: 
        Will only have 1 input token and 1 output token

    TriggerReturn: 
        Applicable TriggerReturn must be in (asset1, asset2, val) where val.decimals = 8, asset1 = inputToken and asset2 = outputToken
            Example: 
            ETH/USD -> USD per ETH -> ETH Price in USD -> triggerReturn = [ETH, USD, val] -> Must use when tokenIn = ETH and tokenOut = USD (i.e. buying USD with ETH)
            USD/ETH -> ETH per USD -> USD Price in ETH -> triggerReturn = [USD, ETH, val] -> Must use when tokenIn = USD* and tokenOut = ETH (i.e. buying ETH with USD)
*/
contract SwapUniSingleAction is IAction, DelegatePerform {
    using SafeERC20 for IERC20;

    ISwapRouter immutable swapRouter;
    address immutable WETH9Addr;

    constructor(address swapRouterAddress, address wethAddress) {
        swapRouter = ISwapRouter(swapRouterAddress);
        WETH9Addr = wethAddress;
    }

    function validate(Action calldata action) external pure returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.outputTokens.length == 1);
        return true;
    }

    function _parseRuntimeParams(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        internal
        pure
        returns (uint256)
    {
        for (uint256 i = 0; i < runtimeParams.triggerReturnArr.length; i++) {
            TriggerReturn memory triggerReturn = runtimeParams.triggerReturnArr[i];
            if (triggerReturn.triggerType == TriggerType.Price) {
                (address asset1, address asset2, uint256 res) = decodePriceTriggerReturn(triggerReturn.runtimeData);
                if (asset1 == action.inputTokens[0].addr && asset2 == action.outputTokens[0].addr) {
                    return res;
                }
            }
        }

        return 0;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        ISwapRouter.ExactInputSingleParams memory params;
        uint256[] memory outputs = new uint256[](1);

        Token memory outputToken = action.outputTokens[0];
        Token memory inputToken = action.inputTokens[0];
        uint256 ethCollateral = 0;

        if (equals(action.inputTokens[0], Token({t: TokenType.NATIVE, addr: Constants.ETH}))) {
            inputToken = Token({t: TokenType.ERC20, addr: WETH9Addr});
            ethCollateral = runtimeParams.collaterals[0];
        } else if (equals(action.outputTokens[0], Token({t: TokenType.NATIVE, addr: Constants.ETH}))) {
            // won't have both input and output as ETH ever
            IERC20(inputToken.addr).safeApprove(address(swapRouter), runtimeParams.collaterals[0]);
            outputToken = Token({t: TokenType.ERC20, addr: WETH9Addr});
        }

        params = ISwapRouter.ExactInputSingleParams({
            tokenIn: inputToken.addr,
            tokenOut: outputToken.addr,
            fee: 3000, // TODO: pass from action.data?
            recipient: address(this),
            deadline: block.timestamp, // need to do an immediate swap
            amountIn: runtimeParams.collaterals[0],
            amountOutMinimum: (_parseRuntimeParams(action, runtimeParams) * runtimeParams.collaterals[0]) / 10**8, // assumption: triggerReturn in the form of tokenIn/tokenOut.
            sqrtPriceLimitX96: 0
        });
        outputs[0] = swapRouter.exactInputSingle{value: ethCollateral}(params);

        if (equals(action.inputTokens[0], Token({t: TokenType.NATIVE, addr: Constants.ETH}))) {
            IERC20(inputToken.addr).safeApprove(address(swapRouter), 0);
        }

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
