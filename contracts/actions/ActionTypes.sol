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

struct Position {
    // this uniquely defines a position.
    // If any other action returns the same positionId, it will override this action
    // A positionId can be used only once (like an UTXO), unless it is returned again by another action.
    bytes32 id;
    uint256 expiry; // this position cant be used after this time
    uint256 activation; // this position cant be used before this time
    // A list of actions that can be taken as next-steps to this action.
    // the next step in this action (which will typically be to close an open position).
    Action[] nextActions;
}

struct ActionResponse {
    //array of amounts with datatype.
    uint256[] tokenOutputs;
    // In future, we may have non-token outputs to be interpreted by the receiver
    // bytes otherOutputs;

    Position position;
}
