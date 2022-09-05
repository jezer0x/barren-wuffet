// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../triggers/TriggerTypes.sol";
import "../utils/Token.sol";

struct ActionRuntimeParams {
    TriggerReturn[] triggerReturnArr;
    uint256[] collaterals;
}

struct Action {
    address callee; // eg. swapUni
    bytes data; // any custom param to send to the callee, encoded at compileTime
    Token[] inputTokens; // token to be used to initiate the action
    Token[] outputTokens; // token to be gotten as output
}

struct ActionConstraints {
    uint256 expiry; // this action will revert if used after this time
    uint256 activation; // this action will revert if used before this time
}

struct Position {
    // this uniquely defines a position.
    // If any other action returns the same positionId, it will override this action
    // A positionId can be used only once (like an UTXO), unless it is returned again by another action.
    // DEPRECATED. There is likely no use of this.
    bytes32 id;
    // metadata that can optionally be used to indicate constraints that bound the actions
    // This can be be used by the smart contract to decide whether this position is acceptable
    // The constraints should match the index order of the nextActions
    ActionConstraints[] actionConstraints;
    // A list of actions that can be taken as next-steps to this action.
    // the next step in this action (which will typically be to close an open position).
    // Taking ANY of these actions will result in this position being closed.
    Action[] nextActions;
}

struct ActionResponse {
    //array of amounts with datatype.
    uint256[] tokenOutputs; // idx if ERC721, amount if erc20 or native
    // In future, we may have non-token outputs to be interpreted by the receiver
    // bytes otherOutputs;

    // The position should provide an exhaustive list of actions that can be used to close
    // the position for a given action. Otherwise, a position might end up being closed, but the
    // contract wouldnt know and will keep it marked pending.
    Position position;
}
