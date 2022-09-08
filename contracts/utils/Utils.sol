// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./Constants.sol";
import "../actions/ActionTypes.sol";
import "./subscriptions/Subscriptions.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Token.sol";

library Utils {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    function _send(
        Token memory token,
        address receiver,
        uint256 balance
    ) internal {
        if (token.t == TokenType.ERC20) {
            IERC20(token.addr).safeTransfer(receiver, balance);
        } else if (token.t == TokenType.NATIVE) {
            payable(receiver).transfer(balance);
        } else if (token.t == TokenType.ERC721) {
            IERC721(token.addr).safeTransferFrom(address(this), receiver, balance);
        } else {
            revert("Wrong token type!");
        }
    }

    function _receive(
        Token memory token,
        address sender,
        uint256 amount
    ) internal {
        if (token.t == TokenType.ERC20) {
            IERC20(token.addr).safeTransferFrom(sender, address(this), amount);
        } else if (token.t == TokenType.ERC721) {
            IERC721(token.addr).safeTransferFrom(sender, address(this), amount);
        } else if (token.t != TokenType.NATIVE) {
            revert("Wrong token type!");
        }
    }

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
        // a position in created when a response is generated, so the type is memory.
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

        for (uint32 i = 0; i < actionHashes.length; i++) {
            _actionPositionsMap[actionHashes[i]].push(positionHash);
            _pendingPositions.add(positionHash);
        }
    }

    function _closePosition(
        // a position in closed by an external call, so the type is calldata
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
            delete _actionPositionsMap[actionHash];
            return true;
        } else {
            return false;
        }
    }
}
