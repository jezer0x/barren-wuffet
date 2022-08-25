// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum Ops {
    GT,
    LT
}

enum TriggerType {
    PriceFeed,
    Timestamp
}

struct Trigger {
    address callee;
    TriggerType triggerType;
    bytes createTimeParams; // any custom param to send to the callee, encoded at compileTime
    bytes runtimeData;
    Ops op; //eg. GT
}

function decodePriceFeedTriggerReturn(bytes memory runtimeData)
    pure
    returns (
        address,
        address,
        uint256
    )
{
    return abi.decode(runtimeData, (address, address, uint256));
}

function decodeTimestampTriggerReturn(bytes memory runtimeData) pure returns (uint256) {
    return abi.decode(runtimeData, (uint256));
}
