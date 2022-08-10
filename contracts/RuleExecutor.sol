// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Import this file to use console.log
import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Utils.sol";
import "./RETypes.sol";
import "./REConstants.sol";
import "./actions/IAction.sol";
import "./triggers/ITrigger.sol";

contract RuleExecutor is Ownable {
    event Created(bytes32 indexed ruleHash);
    event Activated(bytes32 indexed ruleHash);
    event Paused(bytes32 indexed ruleHash);
    event Cancelled(bytes32 indexed ruleHash);
    event Executed(bytes32 indexed ruleHash, address executor);
    event Redeemed(bytes32 indexed ruleHash);
    event CollateralAdded(bytes32 indexed ruleHash, uint256 amt);
    event CollateralReduced(bytes32 indexed ruleHash, uint256 amt);

    modifier onlyRuleOwner(bytes32 ruleHash) {
        require(rules[ruleHash].owner == msg.sender, "You're not the owner of this rule");
        _;
    }

    modifier ruleExists(bytes32 ruleHash) {
        require(rules[ruleHash].owner != address(0), "Rule not found!");
        _;
    }

    // hash -> Rule
    mapping(bytes32 => Rule) rules;

    mapping(address => bool) whitelistedActions;
    mapping(address => bool) whitelistedTriggers;
    bool _disableActionWhitelist = false;
    bool _disableTriggerWhitelist = false;

    modifier onlyWhitelist(Trigger[] calldata triggers, Action[] calldata actions) {
        if (!_disableTriggerWhitelist) {
            for (uint256 i = 0; i < triggers.length; i++) {
                require(whitelistedTriggers[triggers[i].callee], "Unauthorized trigger");
            }
        }

        if (!_disableActionWhitelist) {
            for (uint256 i = 0; i < actions.length; i++) {
                require(whitelistedActions[actions[i].callee], "Unauthorized action");
            }
        }
        _;
    }

    function addTriggerToWhitelist(address triggerAddr) external onlyOwner {
        whitelistedTriggers[triggerAddr] = true;
    }

    function addActionToWhitelist(address actionAddr) external onlyOwner {
        whitelistedActions[actionAddr] = true;
    }

    function removeTriggerFromWhitelist(address triggerAddr) external onlyOwner {
        whitelistedTriggers[triggerAddr] = false;
    }

    function removeActionFromWhitelist(address actionAddr) external onlyOwner {
        whitelistedActions[actionAddr] = false;
    }

    function disableTriggerWhitelist() external onlyOwner {
        _disableTriggerWhitelist = true;
    }

    function disableActionWhitelist() external onlyOwner {
        _disableActionWhitelist = true;
    }

    function enableTriggerWhitelist() external onlyOwner {
        _disableTriggerWhitelist = false;
    }

    function enableActionWhitelist() external onlyOwner {
        _disableActionWhitelist = false;
    }

    constructor() {}

    function getRule(bytes32 ruleHash) public view ruleExists(ruleHash) returns (Rule memory) {
        return rules[ruleHash];
    }

    function redeemBalance(bytes32 ruleHash) external onlyRuleOwner(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.EXECUTED, "Rule not executed yet!");
        Utils._send(rule.owner, rule.outputAmount, rule.actions[rule.actions.length - 1].toToken);
        emit Redeemed(ruleHash);
    }

    function addCollateral(bytes32 ruleHash, uint256 amount) external payable onlyRuleOwner(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(
            rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.PAUSED,
            "Can't add collateral to this rule"
        );
        if (rule.actions[0].fromToken != REConstants.ETH) {
            // must have been approved first
            IERC20(rule.actions[0].fromToken).transferFrom(msg.sender, address(this), amount);
            rule.totalCollateralAmount = rule.totalCollateralAmount + amount;
        } else {
            rule.totalCollateralAmount = rule.totalCollateralAmount + msg.value;
        }
        emit CollateralAdded(ruleHash, amount);
    }

    function reduceCollateral(bytes32 ruleHash, uint256 amount) external onlyRuleOwner(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(
            rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.PAUSED,
            "Can't add collateral to this rule"
        );

        if (rule.actions[0].fromToken != REConstants.ETH) {
            IERC20(rule.actions[0].fromToken).transfer(msg.sender, amount);
        } else {
            payable(msg.sender).transfer(amount);
        }
        rule.totalCollateralAmount = rule.totalCollateralAmount - amount;
        emit CollateralReduced(ruleHash, amount);
    }

    function increaseReward(bytes32 ruleHash) external payable ruleExists(ruleHash) {
        Rule storage rule = rules[ruleHash];
        rule.reward += msg.value;
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions)
        public
        payable
        onlyWhitelist(triggers, actions)
        returns (bytes32)
    {
        bytes32 ruleHash = _getRuleHash(triggers, actions);
        Rule storage rule = rules[ruleHash];
        for (uint256 i = 0; i < triggers.length; i++) {
            require(ITrigger(triggers[i].callee).validate(triggers[i]), "Invalid trigger provided");
            rule.triggers.push(triggers[i]);
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(IAction(actions[i].callee).validate(actions[i]), "Invalid action provided");
            if (i != actions.length - 1) {
                require(actions[i].toToken == actions[i + 1].fromToken, "check fromToken -> toToken chain is valid");
            }
            rule.actions.push(actions[i]);
        }
        require(rule.owner == address(0), "Rule already exists!");
        rule.owner = msg.sender;
        rule.status = RuleStatus.PAUSED;
        rule.outputAmount = 0;
        rule.reward = msg.value;

        emit Created(ruleHash);
        return ruleHash;
    }

    function activateRule(bytes32 ruleHash) external onlyRuleOwner(ruleHash) {
        rules[ruleHash].status = RuleStatus.ACTIVE;
        emit Activated(ruleHash);
    }

    function pauseRule(bytes32 ruleHash) external onlyRuleOwner(ruleHash) {
        rules[ruleHash].status = RuleStatus.PAUSED;
        emit Paused(ruleHash);
    }

    function cancelRule(bytes32 ruleHash) external onlyRuleOwner(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status != RuleStatus.CANCELLED, "Rule is already cancelled!");
        rule.status = RuleStatus.CANCELLED;
        Utils._send(rule.owner, rule.totalCollateralAmount, rule.actions[0].fromToken);
        emit Cancelled(ruleHash);
    }

    function _getRuleHash(Trigger[] calldata triggers, Action[] calldata actions) private view returns (bytes32) {
        return keccak256(abi.encode(triggers, actions, msg.sender, block.timestamp));
    }

    // WARNING: only the last trigger's data gets sent back as triggerData
    function _checkTriggers(Trigger[] storage triggers) internal view returns (bool valid, uint256 triggerData) {
        for (uint256 i = 0; i < triggers.length; i++) {
            (valid, triggerData) = ITrigger(triggers[i].callee).check(triggers[i]);
            if (!valid) return (false, 0);
        }
        return (true, triggerData);
    }

    function checkRule(bytes32 ruleHash) external view returns (bool valid) {
        (valid, ) = _checkTriggers(rules[ruleHash].triggers);
    }

    function executeRule(bytes32 ruleHash) external ruleExists(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE, "Rule is not active!");
        (bool valid, uint256 triggerData) = _checkTriggers(rule.triggers);
        require(valid, "One (or more) trigger(s) not satisfied");

        ActionRuntimeParams memory runtimeParams = ActionRuntimeParams({
            triggerData: triggerData,
            totalCollateralAmount: rule.totalCollateralAmount
        });

        uint256 output;
        for (uint256 i = 0; i < rule.actions.length; i++) {
            Action storage action = rule.actions[i];
            if (action.fromToken != REConstants.ETH) {
                IERC20(action.fromToken).approve(action.callee, runtimeParams.totalCollateralAmount);
                output = IAction(action.callee).perform(action, runtimeParams);
            } else {
                output = IAction(action.callee).perform{value: runtimeParams.totalCollateralAmount}(
                    action,
                    runtimeParams
                );
            }
            runtimeParams.totalCollateralAmount = output;
        }

        rule.outputAmount = output;
        rule.status = RuleStatus.EXECUTED;
        payable(msg.sender).transfer(rule.reward);
        emit Executed(ruleHash, msg.sender);
    }
}
