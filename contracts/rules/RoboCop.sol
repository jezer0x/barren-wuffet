// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../utils/Utils.sol";
import "../utils/Constants.sol";
import "../actions/IAction.sol";
import "../triggers/ITrigger.sol";
import "./RuleTypes.sol";
import "./IRoboCop.sol";
import "../utils/whitelists/WhitelistService.sol";

contract RoboCop is IRoboCop {
    using SafeERC20 for IERC20;

    // Storage Start
    mapping(bytes32 => Rule) rules;
    mapping(bytes32 => mapping(address => uint256)) public ruleRewardProviders;
    bytes32 triggerWhitelistHash;
    bytes32 actionWhitelistHash;
    WhitelistService wlService;
    // Storage End

    modifier onlyRuleOwner(bytes32 ruleHash) {
        require(rules[ruleHash].owner == msg.sender, "onlyRuleOwner");
        _;
    }

    modifier ruleExists(bytes32 ruleHash) {
        require(rules[ruleHash].owner != address(0), "Rule not found");
        _;
    }

    modifier onlyWhitelist(Trigger[] calldata triggers, Action[] calldata actions) {
        for (uint256 i = 0; i < triggers.length; i++) {
            require(wlService.isWhitelisted(triggerWhitelistHash, triggers[i].callee), "Unauthorized Trigger");
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(wlService.isWhitelisted(actionWhitelistHash, actions[i].callee), "Unauthorized Action");
        }
        _;
    }

    function init(
        address wlServiceAddr,
        bytes32 trigWlHash,
        bytes32 actionWlHash
    ) external {
        wlService = WhitelistService(wlServiceAddr);
        triggerWhitelistHash = trigWlHash;
        actionWhitelistHash = actionWlHash;
    }

    function getRule(bytes32 ruleHash) public view ruleExists(ruleHash) returns (Rule memory) {
        return rules[ruleHash];
    }

    function getInputTokens(bytes32 ruleHash) public view ruleExists(ruleHash) returns (address[] memory) {
        return rules[ruleHash].actions[0].inputTokens;
    }

    function getOutputTokens(bytes32 ruleHash) public view ruleExists(ruleHash) returns (address[] memory) {
        Rule storage rule = rules[ruleHash];
        return rule.actions[rule.actions.length - 1].outputTokens;
    }

    function redeemBalance(bytes32 ruleHash) external onlyRuleOwner(ruleHash) {
        Rule storage rule = rules[ruleHash];
        _setRuleStatus(ruleHash, RuleStatus.REDEEMED);
        address[] memory tokens = getOutputTokens(ruleHash);

        for (uint256 i = 0; i < tokens.length; i++) {
            Utils._send(rule.owner, rule.outputAmounts[i], tokens[i]);
        }
    }

    function addCollateral(bytes32 ruleHash, uint256[] memory amounts) external payable onlyRuleOwner(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "Can't add collateral");

        address[] memory tokens = getInputTokens(ruleHash);
        uint256 amount;

        for (uint256 i = 0; i < tokens.length; i++) {
            amount = amounts[i];
            require(amount > 0, "amount <= 0");
            if (tokens[i] != Constants.ETH) {
                IERC20(tokens[i]).safeTransferFrom(msg.sender, address(this), amount);
            } else {
                require(amount == msg.value, "ETH: amount != msg.value");
            }
            rule.collateralAmounts[i] += amount;
        }

        emit CollateralAdded(ruleHash, amounts);
    }

    function reduceCollateral(bytes32 ruleHash, uint256[] memory amounts) external onlyRuleOwner(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "Can't reduce collateral");

        address[] memory tokens = getInputTokens(ruleHash);
        uint256 amount;

        for (uint256 i = 0; i < tokens.length; i++) {
            amount = amounts[i];
            require(rule.collateralAmounts[i] >= amount, "Not enough collateral.");
            rule.collateralAmounts[i] -= amount;
            if (tokens[i] != Constants.ETH) {
                IERC20(tokens[i]).safeTransfer(msg.sender, amount);
            } else {
                payable(msg.sender).transfer(amount);
            }
        }
        emit CollateralReduced(ruleHash, amounts);
    }

    function increaseReward(bytes32 ruleHash) public payable ruleExists(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE);
        rule.reward += msg.value;
        ruleRewardProviders[ruleHash][msg.sender] += msg.value;
    }

    function withdrawReward(bytes32 ruleHash) external ruleExists(ruleHash) returns (uint256 balance) {
        Rule storage rule = rules[ruleHash];
        require(rule.status != RuleStatus.EXECUTED && rule.status != RuleStatus.REDEEMED, "Reward paid");
        balance = ruleRewardProviders[ruleHash][msg.sender];
        require(balance > 0, "0 contribution");
        rule.reward -= balance;
        ruleRewardProviders[ruleHash][msg.sender] = 0;

        // slither-disable-next-line arbitrary-send
        payable(msg.sender).transfer(balance);
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions)
        external
        payable
        onlyWhitelist(triggers, actions)
        returns (bytes32)
    {
        bytes32 ruleHash = _getRuleHash(triggers, actions);
        Rule storage rule = rules[ruleHash];
        require(rule.owner == address(0), "Duplicate Rule");
        require(triggers.length > 0 && actions.length > 0);
        for (uint256 i = 0; i < triggers.length; i++) {
            require(ITrigger(triggers[i].callee).validate(triggers[i]), "Invalid Trigger");
            rule.triggers.push(triggers[i]);
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(IAction(actions[i].callee).validate(actions[i]), "Invalid Action");
            if (i != actions.length - 1) {
                address[] memory inputTokens = actions[i + 1].inputTokens;
                address[] memory outputTokens = actions[i].outputTokens;
                for (uint256 j = 0; j < outputTokens.length; j++) {
                    require(outputTokens[j] == inputTokens[j], "Invalid inputTokens->outputTokens");
                }
            }
            rule.actions.push(actions[i]);
        }
        rule.owner = msg.sender;
        rule.status = RuleStatus.INACTIVE;

        for (uint256 i = 0; i < actions[0].inputTokens.length; i++) {
            rule.collateralAmounts.push();
        }

        increaseReward(ruleHash);

        emit Created(ruleHash);
        return ruleHash;
    }

    /*
        Valid State Transitions: (from) => (to)

        ACTIVE => {inactive, executed}
        INACTIVE => {active}
        EXECUTED => {redeemed}
        REDEEMED => {}
    */
    function _setRuleStatus(bytes32 ruleHash, RuleStatus newStatus) private {
        Rule storage rule = rules[ruleHash];
        if (newStatus == RuleStatus.ACTIVE) {
            require(rule.status == RuleStatus.INACTIVE, "Can't Activate Rule");
            emit Activated(ruleHash);
        } else if (newStatus == RuleStatus.INACTIVE) {
            require(rule.status == RuleStatus.ACTIVE, "Can't Deactivate Rule");
            emit Deactivated(ruleHash);
        } else if (newStatus == RuleStatus.EXECUTED) {
            require(rule.status == RuleStatus.ACTIVE, "Rule isn't Activated");
            emit Executed(ruleHash, msg.sender);
        } else if (newStatus == RuleStatus.REDEEMED) {
            require(rule.status == RuleStatus.EXECUTED, "Rule isn't pending redemption");
            emit Redeemed(ruleHash);
        } else {
            revert("FundStatus not covered!");
        }

        rule.status = newStatus;
    }

    function activateRule(bytes32 ruleHash) external onlyRuleOwner(ruleHash) {
        _setRuleStatus(ruleHash, RuleStatus.ACTIVE);
    }

    function deactivateRule(bytes32 ruleHash) external onlyRuleOwner(ruleHash) {
        _setRuleStatus(ruleHash, RuleStatus.INACTIVE);
    }

    function _getRuleHash(Trigger[] calldata triggers, Action[] calldata actions) private view returns (bytes32) {
        return keccak256(abi.encode(triggers, actions, msg.sender, block.timestamp));
    }

    function _checkTriggers(Trigger[] storage triggers) internal view returns (bool, TriggerReturn[] memory) {
        TriggerReturn[] memory triggerReturnArr = new TriggerReturn[](triggers.length);
        TriggerReturn memory triggerReturn;
        bool valid = false;
        for (uint256 i = 0; i < triggers.length; i++) {
            (valid, triggerReturn) = ITrigger(triggers[i].callee).check(triggers[i]);
            triggerReturnArr[i] = triggerReturn;
            if (!valid) return (false, triggerReturnArr);
        }
        return (true, triggerReturnArr);
    }

    function checkRule(bytes32 ruleHash) external view returns (bool valid) {
        (valid, ) = _checkTriggers(rules[ruleHash].triggers);
    }

    function executeRule(bytes32 ruleHash) external ruleExists(ruleHash) {
        Rule storage rule = rules[ruleHash];
        _setRuleStatus(ruleHash, RuleStatus.EXECUTED); // This ensures only active rules can be executed
        (bool valid, TriggerReturn[] memory triggerReturnArr) = _checkTriggers(rule.triggers);
        require(valid, "Trigger != Satisfied");

        ActionRuntimeParams memory runtimeParams = ActionRuntimeParams({
            triggerReturnArr: triggerReturnArr,
            collateralAmounts: rule.collateralAmounts
        });

        uint256[] memory outputs;
        for (uint256 i = 0; i < rule.actions.length; i++) {
            Action storage action = rule.actions[i];
            for (uint256 j = 0; j < action.inputTokens.length; j++) {
                if (action.inputTokens[j] != Constants.ETH) {
                    IERC20(action.inputTokens[j]).safeApprove(action.callee, runtimeParams.collateralAmounts[j]);
                }
            }
            outputs = Utils._delegatePerformAction(action, runtimeParams);
            runtimeParams.collateralAmounts = outputs; // changes because outputTokens of action[i-1] is inputTokens of action[i]
        }

        rule.outputAmounts = outputs;
        // We dont need to check sender here.
        // As long as the execution reaches this point, the reward is there
        // for the taking.
        // slither-disable-next-line arbitrary-send
        payable(msg.sender).transfer(rule.reward);
    }

    receive() external payable {}
}
