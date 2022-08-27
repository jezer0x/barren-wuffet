// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Import this file to use console.log
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../utils/Utils.sol";
import "../utils/Constants.sol";
import "../actions/IAction.sol";
import "../triggers/ITrigger.sol";
import "./RuleTypes.sol";
import "../utils/whitelists/WhitelistService.sol";

interface IRoboCop {
    event Created(bytes32 indexed ruleHash);
    event Activated(bytes32 indexed ruleHash);
    event Deactivated(bytes32 indexed ruleHash);
    event Executed(bytes32 indexed ruleHash, address executor);
    event Redeemed(bytes32 indexed ruleHash);
    event CollateralAdded(bytes32 indexed ruleHash, uint256[] amounts);
    event CollateralReduced(bytes32 indexed ruleHash, uint256[] amounts);

    function init(
        address wlServiceAddr,
        bytes32 trigWlHash,
        bytes32 actionWlHash
    ) external;

    function getRule(bytes32 ruleHash) external view returns (Rule memory);

    function getInputTokens(bytes32 ruleHash) external view returns (address[] memory);

    function getOutputTokens(bytes32 ruleHash) external view returns (address[] memory);

    function redeemBalance(bytes32 ruleHash) external;

    function addCollateral(bytes32 ruleHash, uint256[] memory amounts) external payable;

    function reduceCollateral(bytes32 ruleHash, uint256[] memory amounts) external;

    function increaseReward(bytes32 ruleHash) external payable;

    function withdrawReward(bytes32 ruleHash) external returns (uint256 balance);

    function createRule(Trigger[] calldata triggers, Action[] calldata actions) external payable returns (bytes32);

    function activateRule(bytes32 ruleHash) external;

    function deactivateRule(bytes32 ruleHash) external;

    function checkRule(bytes32 ruleHash) external view returns (bool valid);
}
