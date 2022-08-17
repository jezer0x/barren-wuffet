// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum Ops {
    GT,
    LT
}

struct Trigger {
    address callee;
    bytes param; // any custom param to send to the callee, encoded at compileTime
    uint256 value; // Must be in decimals = 8 (i.e. 1 = 1e8)
    Ops op; //eg. GT
}
