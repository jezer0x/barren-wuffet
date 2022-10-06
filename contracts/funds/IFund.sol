// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
import "../utils/FeeParams.sol";
import "../actions/IAction.sol";
import "../rules/IRoboCop.sol";

/*
    Valid transitions (to -> from): 

    RAISING -> {DEPLOYED, CLOSED (premature)}
    DEPLOYED -> {CLOSED (premature), CLOSABLE}
    CLOSABLE -> {CLOSED}
    CLOSED -> {}
    */
enum FundStatus {
    RAISING, // deposits possible, withdraws possible (inputToken), manager can't move funds
    DEPLOYED, // deposits not possible, withdraws not possible, manager can move funds
    CLOSABLE, // deposits not possible, withdraws not possible, manager can't move funds
    CLOSED // deposits not possible, withdraws possible (outputTokens), manager can take out managementFee but not move funds
}

interface IFund is ISubscription {
    event Closed(address indexed fundAddr);
    event Executed(bytes action);
    event PositionCreated(bytes32 positionHash, bytes precursorAction, bytes[] nextActions);
    event PositionsClosed(bytes closingAction, bytes32[] positionHashesClosed);

    function initialize(
        string memory _name,
        address _manager,
        Subscriptions.Constraints memory _constraints,
        FeeParams calldata _feeParams,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address roboCopImplementationAddr,
        address[] calldata _declaredTokens
    ) external;

    function getInputTokens() external pure returns (Token[] memory);

    function getOutputTokens() external pure returns (Token[] memory);

    function closeFund() external;

    function takeAction(
        Trigger calldata trigger,
        Action calldata action,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) external;

    function takeActionToClosePosition(
        Trigger calldata trigger,
        Action calldata action,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) public;

    function createRule(Trigger[] calldata triggers, Action[] calldata actions) external returns (bytes32 ruleHash);

    function increaseRuleIncentive(uint256 openRuleIdx, uint256 amount) external;

    function withdrawRuleIncentive(uint256 openRuleIdx) external;

    function activateRule(uint256 openRuleIdx) external;

    function deactivateRule(uint256 openRuleIdx) external;

    function addRuleCollateral(
        uint256 openRuleIdx,
        Token[] calldata collateralTokens,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) external;

    function reduceRuleCollateral(uint256 openRuleIdx, uint256[] calldata collaterals) external;

    function cancelRule(uint256 openRuleIdx) external;

    function redeemRuleOutput(uint256 openRuleIdx) external;

    function getStatus() external view returns (FundStatus);

    function withdrawManagementFee() external returns (Token[] memory, uint256[] memory);
}
