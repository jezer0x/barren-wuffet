// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum Ops {
    GT,
    LT
}

enum TriggerType {
    NULL,
    Price,
    Timestamp
}

struct Trigger {
    address callee;
    TriggerType triggerType;
    bytes createTimeParams; // any custom param to send to the callee, encoded at compileTime
}

struct TriggerReturn {
    TriggerType triggerType;
    bytes runtimeData;
}

function decodePriceTriggerCreateTimeParams(bytes memory createTimeParams)
    pure
    returns (
        address,
        address,
        Ops,
        uint256
    )
{
    return abi.decode(createTimeParams, (address, address, Ops, uint256));
}

function decodeTimestampTriggerCreateTimeParams(bytes memory createTimeParams) pure returns (Ops, uint256) {
    return abi.decode(createTimeParams, (Ops, uint256));
}

function decodePriceTriggerReturn(bytes memory runtimeData)
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
