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

struct ResponseValue {
    // should this be bytes? i\f so, how do we parse it? 
    uint256 val;
    // can be any string or address. we use bytes32 because it's cheap to compare.    
    // how do we ensure we dont conflict? global enum would need to be updated on every new action
    // where will this be used? you can use this to plug into another trigger?    
    bytes32 datatype;
}

struct ActionResponse {
    //array of amounts with datatype.
    ResponseValue[] outputs;
    // position is any param than can be sent back to the same callee as "data" to take 
    // the next step in this action (which will typically be to close an open position).
    // It should uniquely represent this position for this account
    Action position;
}