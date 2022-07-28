// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

library RETypes {

    struct Action {        
        address callee;         // eg. swapUni
        bytes data;             // any custom param to send to the callee
        address fromToken;      // token to be used to initiate the action   
        address toToken;        // token to be gotten as output
        uint minTokenAmount;    // minimum amount needed as collateral to subscribe 
        uint totalCollateralAmount; 
    }

    enum Ops { GT, LT }

    // If Trigger and RETypes.Action are update, the HashRule needs to be updated
    struct Trigger {
        address callee; 
        bytes param;   //eg. abi.encode(["string", "string"], ["eth", "uni"]) 
        uint value;     //eg. 1000
        Ops op;         //eg. GT
    }
}
