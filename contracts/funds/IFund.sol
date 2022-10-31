// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

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

    function initialize(
        address _manager,
        Subscriptions.Constraints memory _constraints,
        FeeParams calldata _feeParams,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address roboCopImplementationAddr,
        address[] calldata _declaredTokens,
        address botFrontendAddr
    ) external;

    function roboCop() external view returns (IRoboCop);

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
    ) external;

    function createRule(Trigger[] calldata triggers, Action[] calldata actions) external returns (bytes32 ruleHash);

    function increaseRuleIncentive(bytes32 ruleHash, uint256 amount) external;

    function withdrawRuleIncentive(bytes32 ruleHash) external;

    function activateRule(bytes32 ruleHash) external;

    function deactivateRule(bytes32 ruleHash) external;

    function addRuleCollateral(
        bytes32 ruleHash,
        Token[] calldata collateralTokens,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) external;

    function reduceRuleCollateral(bytes32 ruleHash, uint256[] calldata collaterals) external;

    function cancelRule(bytes32 ruleHash) external;

    function redeemRuleOutputs() external;

    function getStatus() external view returns (FundStatus);

    function withdrawManagementFee() external returns (Token[] memory, uint256[] memory);
}
