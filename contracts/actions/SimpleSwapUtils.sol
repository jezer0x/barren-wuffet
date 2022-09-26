// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IAction.sol";
import "../utils/assets/TokenLib.sol";

library SimpleSwapUtils {
    using TokenLib for Token;

    function _validate(Action calldata action) internal view returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.inputTokens[0].t == TokenType.ERC20 || action.inputTokens[0].t == TokenType.NATIVE);

        require(action.outputTokens.length == 1);
        require(action.outputTokens[0].t == TokenType.ERC20 || action.outputTokens[0].t == TokenType.NATIVE);

        require(!action.inputTokens[0].equals(action.outputTokens[0]));

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
                } // fallthrough
            } // fallthrough
        }

        return 0;
    }
}
