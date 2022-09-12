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

    event PositionCreated(bytes32 positionHash, Action precursorAction, Action[] nextActions);
    event PositionsClosed(Action closingAction, bytes32[] positionHashesClosed);

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
    ) internal returns (bytes32 positionHash) {
        if (nextActions.length == 0) {
            return positionHash;
        }
        bytes32[] memory actionHashes = new bytes32[](nextActions.length);
        for (uint32 i = 0; i < nextActions.length; i++) {
            actionHashes[i] = keccak256(abi.encode(nextActions[i]));
        }

        positionHash = _getPositionHash(actionHashes);
        _pendingPositions.add(positionHash);

        for (uint32 i = 0; i < actionHashes.length; i++) {
            _actionPositionsMap[actionHashes[i]].push(positionHash);
        }

        emit PositionCreated(positionHash, precursorAction, nextActions);
    }

    function _closePosition(
        Action memory action,
        EnumerableSet.Bytes32Set storage _pendingPositions,
        mapping(bytes32 => bytes32[]) storage _actionPositionsMap
    ) internal returns (bool) {
        bytes32 actionHash = keccak256(abi.encode(action));
        bytes32[] storage positionHashes = _actionPositionsMap[actionHash];
        if (positionHashes.length > 0) {
            // this action is part of a position, so before using it, we need to discard the position
            for (uint32 i = 0; i < positionHashes.length; i++) {
                _pendingPositions.remove(positionHashes[i]);
            }
            emit PositionsClosed(action, positionHashes);
            delete _actionPositionsMap[actionHash];
            return true;
        } else {
            return false;
        }
    }
}
