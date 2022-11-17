// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./RuleTypes.sol";

interface IRoboCop {
    event Created(bytes32 indexed ruleHash);
    event Activated(bytes32 indexed ruleHash);
    event Deactivated(bytes32 indexed ruleHash);
    event Executed(bytes32 indexed ruleHash, address executor);
    event Redeemed(bytes32 indexed ruleHash);
    event CollateralAdded(bytes32 indexed ruleHash, uint256[] amounts);
    event CollateralReduced(bytes32 indexed ruleHash, uint256[] amounts);
    event PositionCreated(bytes32 positionHash, bytes precursorAction, bytes[] nextActions);
    event PositionsClosed(bytes closingAction, bytes32[] positionHashesClosed);

    function initialize(address owner, address botFrontendAddr) external;

    function getRule(bytes32 ruleHash) external view returns (Rule memory);

    function getInputTokens(bytes32 ruleHash) external view returns (Token[] memory);

    function getOutputTokens(bytes32 ruleHash) external view returns (Token[] memory);

    function redeemOutputs() external returns (Token[] memory, uint256[] memory);

    function getRuleHash(Trigger[] calldata triggers, Action[] calldata actions, address fundAddr) external pure returns (bytes32); 

    function getRuleHashesByStatus(RuleStatus status) external returns (bytes32[] memory);

    function addCollateral(bytes32 ruleHash, uint256[] memory amounts) external payable;

    function reduceCollateral(bytes32 ruleHash, uint256[] memory amounts) external;

    function createRule(Trigger[] calldata triggers, Action[] calldata actions) external returns (bytes32);

    function activateRule(bytes32 ruleHash) external;

    function deactivateRule(bytes32 ruleHash) external;

    function checkRule(bytes32 ruleHash) external view returns (bool valid);

    function hasPendingPosition() external view returns (bool);

    function actionClosesPendingPosition(Action calldata action) external view returns (bool);

    function executeRule(bytes32 ruleHash) external;
}
