// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IBotFrontend {
    event TaskStart(address indexed roboCopAddr, bytes32 ruleHash, bytes32 taskId);
    event TaskStop(address indexed roboCopAddr, bytes32 ruleHash, bytes32 taskId);

    function startTask(bytes32 ruleHash) external;

    function stopTask(bytes32 ruleHash) external;

    function registerRobocop(address robocopAddr) external;
}
