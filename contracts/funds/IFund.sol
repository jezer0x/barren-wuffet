// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
import "../actions/IAction.sol";
import "../rules/IRoboCop.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

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

    function init(
        string memory _name,
        address _manager,
        SubscriptionConstraints memory _constraints,
        address _platformWallet,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address roboCopImplementationAddr
    ) external;

    function getInputTokens() external pure returns (address[] memory);

    function getOutputTokens() external pure returns (address[] memory);

    function closeFund() external;

    function takeAction(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        returns (uint256[] memory outputs);

    function createRule(Trigger[] calldata triggers, Action[] calldata actions) external returns (bytes32 ruleHash);

    function increaseRuleReward(uint256 openRuleIdx, uint256 amount) external;

    function withdrawRuleReward(uint256 openRuleIdx) external;

    function activateRule(uint256 openRuleIdx) external;

    function deactivateRule(uint256 openRuleIdx) external;

    function addRuleCollateral(
        uint256 openRuleIdx,
        address[] memory collateralTokens,
        uint256[] memory collateralAmounts
    ) external;

    function reduceRuleCollateral(uint256 openRuleIdx, uint256[] memory collateralAmounts) external;

    function cancelRule(uint256 openRuleIdx) external;

    function redeemRuleOutput(uint256 openRuleIdx) external;

    function deposit(address collateralToken, uint256 collateralAmount) external payable returns (uint256);

    function getStatus() external view returns (FundStatus);

    function withdraw(uint256 subscriptionIdx) external returns (address[] memory, uint256[] memory);

    function withdrawReward() external;
}