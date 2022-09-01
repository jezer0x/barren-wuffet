// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../utils/Constants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
    PERFORM() CAN ONLY TO BE USED VIA DELEGATECALL

    Reference: 
        https://docs.uniswap.org/protocol/guides/swaps/single-swaps

    Tokens: 
        Can have any number of input tokens (?)
        Depending on the situation, it might return a position
        A position can be fed into perform as a runtime param

    TriggerReturn: 
        Applicable TriggerReturn must be in (asset1, asset2, val) where val.decimals = 8, asset1 = inputToken and asset2 = outputToken
            Example: 
            ETH/USD -> USD per ETH -> ETH Price in USD -> triggerReturn = [ETH, USD, val] -> Must use when tokenIn = ETH and tokenOut = USD (i.e. buying USD with ETH)
            USD/ETH -> ETH per USD -> USD Price in ETH -> triggerReturn = [USD, ETH, val] -> Must use when tokenIn = USD* and tokenOut = ETH (i.e. buying ETH with USD)
*/
contract CapFinanceAction is IAction {
    using SafeERC20 for IERC20;
    
    address immutable WETH9;

    constructor(address wethAddress) {
        WETH9 = wethAddress;
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
                if (asset1 == action.inputTokens[0] && asset2 == action.outputTokens[0]) {
                    return res;
                }
            }
        }

        return 0;
    }

    function perform_v2(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        returns (ActionResponse memory) {
        ResponseValue[] memory outputs = new ResponseValue[](1);
        outputs[0] = ResponseValue(1, 'cap_addr');

        bytes memory none;
        return ActionResponse({
            outputs:outputs,
            position: none
        });

    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        returns (uint256[] memory)
    {
        // ISwapRouter.ExactInputSingleParams memory params;
        // uint256[] memory outputs = new uint256[](1);

        // address outputToken = action.outputTokens[0];
        // address inputToken = action.inputTokens[0];
        // uint256 ethCollateral = 0;

        // if (action.inputTokens[0] == Constants.ETH) {
        //     inputToken = WETH9;
        //     ethCollateral = runtimeParams.collateralAmounts[0];
        // } else if (action.outputTokens[0] == Constants.ETH) {
        //     // won't have both input and output as ETH ever            
        //     outputToken = WETH9;
        // }

        // params = ISwapRouter.ExactInputSingleParams({
        //     tokenIn: inputToken,
        //     tokenOut: outputToken,
        //     fee: 3000, // TODO: pass from action.data?
        //     recipient: address(this),
        //     deadline: block.timestamp, // need to do an immediate swap
        //     amountIn: runtimeParams.collateralAmounts[0],
        //     amountOutMinimum: (_parseRuntimeParams(action, runtimeParams) * runtimeParams.collateralAmounts[0]) / 10**8, // assumption: triggerReturn in the form of tokenIn/tokenOut.
        //     sqrtPriceLimitX96: 0
        // });        

        // if (action.inputTokens[0] == Constants.ETH) {
        //     // IERC20(inputToken).safeApprove(address(swapRouter), 0);
        // }

        // return outputs;
    }
}
