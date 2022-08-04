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
    event RuleCreated(bytes32 indexed ruleHash);
    event Executed(bytes32 indexed ruleHash, address executor);
    event Redeemed(bytes32 indexed ruleHash);
    event Cancelled(bytes32 indexed ruleHash);
    event AddCollateral(bytes32 indexed ruleHash, uint256 amt);
    event ReduceCollateral(bytes32 indexed ruleHash, uint256 amt);

    // hash -> Rule
    mapping(bytes32 => Rule) public rules;

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

    function addTriggerToWhitelist(address triggerAddr) public onlyOwner {
        whitelistedTriggers[triggerAddr] = true;
    }

    function addActionToWhitelist(address actionAddr) public onlyOwner {
        whitelistedActions[actionAddr] = true;
    }

    function removeTriggerFromWhitelist(address triggerAddr) public onlyOwner {
        whitelistedTriggers[triggerAddr] = false;
    }

    function removeActionFromWhitelist(address actionAddr) public onlyOwner {
        whitelistedActions[actionAddr] = false;
    }

    function disableTriggerWhitelist() public onlyOwner {
        _disableTriggerWhitelist = true;
    }

    function disableActionWhitelist() public onlyOwner {
        _disableActionWhitelist = true;
    }

    function enableTriggerWhitelist() public onlyOwner {
        _disableTriggerWhitelist = false;
    }

    function enableActionWhitelist() public onlyOwner {
        _disableActionWhitelist = false;
    }

    constructor() {}

    function _redeemBalance(
        address receiver,
        uint256 balance,
        address token
    ) internal {
        if (token != REConstants.ETH) {
            IERC20(token).transfer(receiver, balance);
        } else {
            payable(receiver).transfer(balance);
        }
    }

    function redeemBalance(bytes32 ruleHash) public {
        Rule storage rule = rules[ruleHash];

        require(msg.sender == rule.owner, "You're not the owner of this rule!");

        if (rule.status == RuleStatus.EXECUTED) {
            // withdrawing after successfully triggered rule
            _redeemBalance(rule.owner, rule.outputAmount, rule.actions[rule.actions.length - 1].toToken);
            emit Redeemed(ruleHash);
        } else {
            // withdrawing before anyone triggered this
            _redeemBalance(rule.owner, rule.totalCollateralAmount, rule.actions[0].fromToken);
            rule.status = RuleStatus.CANCELLED;
            emit Cancelled(ruleHash);
        }
    }

    function addCollateral(bytes32 ruleHash, uint256 amount) public payable {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.CREATED, "Can't add collateral to this rule");
        require(msg.sender == rule.owner);
        if (rule.actions[0].fromToken != REConstants.ETH) {
            // must have been approved first
            IERC20(rule.actions[0].fromToken).transferFrom(msg.sender, address(this), amount);
            rule.totalCollateralAmount = rule.totalCollateralAmount + amount;
        } else {
            rule.totalCollateralAmount = rule.totalCollateralAmount + msg.value;
        }
        emit AddCollateral(ruleHash, amount);
    }

    function reduceCollateral(bytes32 ruleHash, uint256 amount) public {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.CREATED, "Can't add collateral to this rule");
        require(msg.sender == rule.owner);
        if (rule.actions[0].fromToken != REConstants.ETH) {
            // must have been approved first
            IERC20(rule.actions[0].fromToken).transfer(msg.sender, amount);
        } else {
            payable(msg.sender).transfer(amount);
        }
        rule.totalCollateralAmount = rule.totalCollateralAmount - amount;
        emit ReduceCollateral(ruleHash, amount);
    }

    function addRule(Trigger[] calldata triggers, Action[] calldata actions) public onlyWhitelist(triggers, actions) {
        // var:val:op, action:data
        // ethPrice: 1000: gt, uniswap:<sellethforusdc>
        // check if action[0] is in actionTypes
        // if action[1] is "swap", we need to do a swap.
        // we could store the "swap" opcodes as data, which will allow us to whitelist rules.
        // the swap will happen on behalf of this contract,
        // need to approve uniswap to take asset1 from this contract, and get asset2 back
        for (uint256 i = 0; i < triggers.length; i++) {
            require(ITrigger(triggers[i].callee).validate(triggers[i]), "Invalid trigger provided");
        }

        for (uint256 i = 0; i < actions.length; i++) {
            require(IAction(actions[i].callee).validate(actions[i]), "Invalid action provided");
            if (i != actions.length - 1) {
                require(actions[i].toToken == actions[i + 1].fromToken, "check fromToken -> toToken chain is valid");
            }
        }

        bytes32 ruleHash = _hashRule(triggers, actions);
        Rule storage rule = rules[ruleHash];
        rule.owner = msg.sender;
        rule.triggers = triggers;
        rule.actions = actions;
        rule.status = RuleStatus.CREATED;
        rule.outputAmount = 0;
        emit RuleCreated(ruleHash);
    }

    function _hashRule(Trigger[] calldata triggers, Action[] calldata actions) private view returns (bytes32) {
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

    function executeRule(bytes32 ruleHash) public {
        // <- send gas, get a refund if action is performed, else lose gas.
        // check if trigger is met
        // if yes, execute the tx
        // give reward to caller
        // if not, abort

        Rule storage rule = rules[ruleHash];
        require(rule.actions[0].callee != address(0), "Rule not found!");
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

        //TODO: send reward to caller

        emit Executed(ruleHash, msg.sender);
    }
}
