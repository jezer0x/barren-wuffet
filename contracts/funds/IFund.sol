// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
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
    CLOSED // deposits not possible, withdraws possible (outputTokens), manager can take out rewards but not move funds
}

interface IFund is ISubscription {
    event Closed(address indexed fundAddr);

    function initialize(
        string memory _name,
        address _manager,
        SubscriptionConstraints memory _constraints,
        address _platformFeeWallet,
        uint256 _platformFeePercentage,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address roboCopImplementationAddr
    ) external;

    function getInputTokens() external pure returns (Token[] memory);

    function getOutputTokens() external pure returns (Token[] memory);

    function closeFund() external;

    function takeAction(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        returns (ActionResponse memory outputs);

    function createRule(Trigger[] calldata triggers, Action[] calldata actions) external returns (bytes32 ruleHash);

    function increaseRuleReward(uint256 openRuleIdx, uint256 amount) external;

    function withdrawRuleReward(uint256 openRuleIdx) external;

    function activateRule(uint256 openRuleIdx) external;

    function deactivateRule(uint256 openRuleIdx) external;

    function addRuleCollateral(
        uint256 openRuleIdx,
        Token[] memory collateralTokens,
        uint256[] memory collaterals
    ) external;

    function reduceRuleCollateral(uint256 openRuleIdx, uint256[] memory collaterals) external;

    function cancelRule(uint256 openRuleIdx) external;

    function redeemRuleOutput(uint256 openRuleIdx) external;

    function getStatus() external view returns (FundStatus);

    function withdrawReward() external;
}
