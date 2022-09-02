// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./Constants.sol";
import "../actions/ActionTypes.sol";
import "./subscriptions/SubscriptionTypes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./Token.sol";

library Utils {
    using SafeERC20 for IERC20;

    function _send(
        address receiver,
        uint256 balance,
        Token memory token
    ) internal {
        if (token.t == TokenType.ERC20) {
            IERC20(token.addr).safeTransfer(receiver, balance);
        } else if (token.t == TokenType.NATIVE) {
            payable(receiver).transfer(balance);
        } else if (token.t == TokenType.ERC721) {
            IERC721(token.addr).safeTransferFrom(address(this), receiver, balance);
        } else {
            revert("t not found!");
        }
    }

    function _validateSubscriptionConstraintsBasic(SubscriptionConstraints memory constraints) internal view {
        require(
            constraints.minCollateralPerSub <= constraints.maxCollateralPerSub,
            "minCollateralPerSub > maxCollateralPerSub"
        );
        require(
            constraints.minCollateralTotal <= constraints.maxCollateralTotal,
            "minTotalCollaterl > maxTotalCollateral"
        );
        require(constraints.minCollateralTotal >= constraints.minCollateralPerSub, "mininmums don't make sense");
        require(constraints.maxCollateralTotal >= constraints.maxCollateralPerSub, "maximums don't make sense");
        require(constraints.deadline >= block.timestamp, "deadline is in the past");
        require(constraints.lockin >= block.timestamp, "lockin is in the past");
        require(constraints.lockin > constraints.deadline, "lockin <= deadline");
        require(constraints.rewardPercentage <= 100 * 100, "reward > 100%");
    }

    function _delegatePerformAction(Action memory action, ActionRuntimeParams memory runtimeParams)
        internal
        returns (ActionResponse memory)
    {
        (bool success, bytes memory returndata) = action.callee.delegatecall(
            abi.encodeWithSignature(
                "perform((address,bytes,address[],address[]),((uint8,bytes)[],uint256[]))",
                action,
                runtimeParams
            )
        );

        // Taken from: https://eip2535diamonds.substack.com/p/understanding-delegatecall-and-how
        if (success == false) {
            // if there is a return reason string
            if (returndata.length > 0) {
                // bubble up any reason for revert
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert("Function call reverted");
            }
        } else {
            return abi.decode(returndata, (ActionResponse));
        }
    }

    function _savePositions(ActionResponse memory response, mapping(bytes32 => Position) storage positionMap) internal {
        Position storage p = positionMap[response.position.id];
        p.expiry = response.position.expiry;
        p.activation = response.position.activation;

        for (uint256 i = 0; i < response.position.nextActions.length; i++) {
            Action memory a_m = response.position.nextActions[i];
            Action storage a_s = p.nextActions.push();
            a_s.callee = a_m.callee;
            a_s.data = a_m.data;
            for (uint256 j = 0; j < a_m.inputTokens.length; j++) {
                a_s.inputTokens.push(a_m.inputTokens[j]);
            }
            for (uint256 j = 0; j < a_m.outputTokens.length; j++) {
                a_s.outputTokens.push(a_m.outputTokens[j]);
            }
        }
    }
}
