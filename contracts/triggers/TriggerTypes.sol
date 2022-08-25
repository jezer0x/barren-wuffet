// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum Ops {
    GT,
    LT
}

enum TriggerDataType {
    PriceFeed,
    Timestamp
}

struct TriggerReturn {
    TriggerDataType dataType;
    bytes data;
}

struct Trigger {
    address callee;
    bytes createTimeParams; // any custom param to send to the callee, encoded at compileTime
    TriggerReturn executeTimeData;
    Ops op; //eg. GT
}
