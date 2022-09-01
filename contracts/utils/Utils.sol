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
                "perform_v2((address,bytes,address[],address[]),((uint8,bytes)[],uint256[]))",
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
}
