// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IBotFrontend {
    function startTask(bytes32 ruleHash) external;

    function stopTask(bytes32 ruleHash) external;

    function registerRobocop(address robocopAddr) external;
}
