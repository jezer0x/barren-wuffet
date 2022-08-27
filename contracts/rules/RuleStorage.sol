// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./RuleTypes.sol";
import "../utils/whitelists/WhitelistService.sol";

struct RuleStorage {
    // hash -> Rule
    mapping(bytes32 => Rule) rules;
    mapping(bytes32 => mapping(address => uint256)) ruleRewardProviders;
    bytes32 triggerWhitelistHash;
    bytes32 actionWhitelistHash;
    WhitelistService wlService;
}
