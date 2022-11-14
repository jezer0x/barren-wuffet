// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./IAction.sol";
import "../utils/Constants.sol"; 
import "../utils/assets/TokenLib.sol";

library SimpleSwapUtils {
    using TokenLib for Token;

    function _validate(Action calldata action) internal view returns (bool) {
        require(action.inputTokens.length == 1, Constants.WRONG_NUMBER_OF_INPUT_TOKENS);
        require(action.inputTokens[0].isERC20() || action.inputTokens[0].isETH(), Constants.WRONG_TYPE_OF_INPUT_TOKEN);

        require(action.outputTokens.length == 1, Constants.WRONG_NUMBER_OF_INPUT_TOKENS);
        require(action.outputTokens[0].isERC20() || action.outputTokens[0].isETH(), Constants.WRONG_TYPE_OF_OUTPUT_TOKEN);

        require(!action.inputTokens[0].equals(action.outputTokens[0]), "Action: Input and Output tokens are the same!");

        return true;
    }

    /**
     * Usage: 
     * (SimpleSwapUtils._getRelevantPriceTriggerData(
            action.inputTokens[0],
            action.outputTokens[0],
            runtimeParams.triggerReturnArr
        ) * runtimeParams.collaterals[0]) / 10**8, // assumption: triggerReturn in the form of tokenIn/tokenOut.
    */
    function _getRelevantPriceTriggerData(
        Token calldata tokenA,
        Token calldata tokenB,
        TriggerReturn[] calldata triggerReturnArr
    ) internal pure returns (uint256) {
        for (uint256 i = 0; i < triggerReturnArr.length; i++) {
            TriggerReturn memory triggerReturn = triggerReturnArr[i];
            if (triggerReturn.triggerType == TriggerType.Price) {
                (address asset1, address asset2, uint256 res) = decodePriceTriggerReturn(triggerReturn.runtimeData);
                if (asset1 == tokenA.addr && asset2 == tokenB.addr) {
                    return res;
                } // fallthrough
            } // fallthrough
        }

        return 0;
    }
}
