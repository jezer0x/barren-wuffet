// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./Constants.sol";
import "../actions/ActionTypes.sol";
import "./subscriptions/Subscriptions.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./assets/TokenLib.sol";

library Utils {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    function _delegatePerformAction(Action memory action, ActionRuntimeParams memory runtimeParams)
        internal
        returns (ActionResponse memory)
    {
        (bool success, bytes memory returndata) = action.callee.delegatecall(
            abi.encodeWithSignature(
                "perform((address,bytes,(uint8,address)[],(uint8,address)[]),((uint8,bytes)[],uint256[]))",
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

    function _getPositionHash(bytes32[] memory actionHashes) internal pure returns (bytes32) {
        return keccak256(abi.encode(actionHashes));
    }

    function _getPositionHash(Action[] calldata actions) internal pure returns (bytes32) {
        bytes32[] memory actionHashes = new bytes32[](actions.length);
        for (uint32 i = 0; i < actions.length; i++) {
            actionHashes[i] = keccak256(abi.encode(actions[i]));
        }

        return _getPositionHash(actionHashes);
    }

    function _createPosition(
        Action memory precursorAction,
        Action[] memory nextActions,
        EnumerableSet.Bytes32Set storage _pendingPositions,
        mapping(bytes32 => bytes32[]) storage _actionPositionsMap
    ) internal returns (bool, bytes32 positionHash) {
        if (nextActions.length == 0) {
            return (false, positionHash);
        } else {
            bytes32[] memory actionHashes = new bytes32[](nextActions.length);
            for (uint32 i = 0; i < nextActions.length; i++) {
                actionHashes[i] = keccak256(abi.encode(nextActions[i]));
            }

            positionHash = _getPositionHash(actionHashes);
            _pendingPositions.add(positionHash);

            for (uint32 i = 0; i < actionHashes.length; i++) {
                _actionPositionsMap[actionHashes[i]].push(positionHash);
            }

            return (true, positionHash);
        }
    }

    function _closePosition(
        Action memory action,
        EnumerableSet.Bytes32Set storage _pendingPositions,
        mapping(bytes32 => bytes32[]) storage _actionPositionsMap
    ) internal returns (bool, bytes32[] memory deletedPositionHashes) {
        bytes32 actionHash = keccak256(abi.encode(action));
        bytes32[] memory deletedPositionHashes = _actionPositionsMap[actionHash];
        if (deletedPositionHashes.length > 0) {
            // this action is part of a position, so before using it, we need to discard the position
            for (uint32 i = 0; i < deletedPositionHashes.length; i++) {
                _pendingPositions.remove(deletedPositionHashes[i]);
            }
            delete _actionPositionsMap[actionHash];
            return (true, deletedPositionHashes);
        } else {
            return (false, deletedPositionHashes);
        }
    }
}
