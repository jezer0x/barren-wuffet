// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Import this file to use console.log
import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Utils.sol";
import "./RETypes.sol"; 
import "./REConstants.sol"; 
import "./IAction.sol"; 
import "./ITrigger.sol"; 

contract RuleExecutor is Ownable {

    struct Rule {        
        RETypes.Trigger trigger;
        RETypes.Action action;
        bool executed; 
        uint outputAmount; 
    }

    // hash -> Rule
    mapping(bytes32 => Rule) rules;

    struct Subscription {
        address subscriber;
        uint collateralAmount; 
    }

    // ruleHash -> [Subscription]
    mapping(bytes32 => Subscription[]) subscriptions;


    constructor() {
    }


    function _redeemBalance(address receiver, uint balance, address token) internal {
        if (token != REConstants.ETH) {
            IERC20(token).transfer(receiver, balance);
        } else {
            payable(receiver).transfer(balance); 
        }        
    }

    function redeemBalance(bytes32 ruleHash, uint subscriptionIdx) public {
        Rule storage rule = rules[ruleHash]; 
        Subscription storage subscription = subscriptions[ruleHash][subscriptionIdx]; 

        if (rule.executed) {
            // withdrawing after successfully triggered rule
            uint balance = subscription.collateralAmount*rule.outputAmount/rule.action.totalCollateralAmount;
            _redeemBalance(subscription.subscriber, balance, rule.action.toToken); 
        } else {
            // withdrawing before anyone triggered this
            rule.action.totalCollateralAmount = rule.action.totalCollateralAmount - subscription.collateralAmount;
            _redeemBalance(subscription.subscriber, subscription.collateralAmount, rule.action.fromToken);
        }
    }

    function _validateCollateral(RETypes.Action storage action, address collateralToken, uint collateralAmount) private view {
        require(action.fromToken == collateralToken);
        require(action.minTokenAmount <= collateralAmount);

        if (collateralToken == REConstants.ETH) {
            require(collateralAmount == msg.value); 
        }
    }

    function addRule(RETypes.Trigger calldata trigger, RETypes.Action calldata action) public { // var:val:op, action:data
        // ethPrice: 1000: gt, uniswap:<sellethforusdc>
        // check if action[0] is in actionTypes
        // if action[1] is "swap", we need to do a swap.
        // we could store the "swap" opcodes as data, which will allow us to whitelist rules.
        // the swap will happen on behalf of this contract, 
        // need to approve uniswap to take asset1 from this contract, and get asset2 back        
        ITrigger(trigger.callee).validateTrigger(trigger);
        IAction(action.callee).validateAction(action);
        Rule storage rule = rules[_hashRule(trigger, action)];
        rule.trigger = trigger;
        rule.action = action;
        rule.executed = false; 
        rule.outputAmount = 0; 
    }

    function _hashRule(RETypes.Trigger memory trigger, RETypes.Action memory action) private pure returns (bytes32) {
        return keccak256(abi.encode(trigger, action));
    }

    function subscribeToRule(bytes32 ruleHash, address collateralToken, uint collateralAmount) public {    
        _validateCollateral(rules[ruleHash].action, collateralToken, collateralAmount);
        _collectCollateral(collateralToken, collateralAmount);  
        Subscription storage newSub = subscriptions[ruleHash].push(); 
        newSub.subscriber = msg.sender; 
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        rules[ruleHash].action.totalCollateralAmount = rules[ruleHash].action.totalCollateralAmount + collateralAmount; 
    }
    
    function _collectCollateral(address collateralToken, uint collateralAmount) private {
         if (collateralToken != REConstants.ETH) {
            IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount);
        } // else it should be in our balance already 
    }

    function checkRule(bytes32 ruleHash) public returns (bool valid) {
        (valid, ) = ITrigger(rules[ruleHash].trigger.callee).checkTrigger(rules[ruleHash].trigger); 
    }

    function executeRule(bytes32 ruleHash) public payable { // <- send gas, get a refund if action is performed, else lose gas.
        // check if trigger is met
        // if yes, execute the tx
        // give reward to caller
        // if not, abort            
        
        Rule storage rule = rules[ruleHash];
        require(rule.action.callee == address(0), "Rule not found!");
        (bool valid, uint triggerData) = ITrigger(rule.trigger.callee).checkTrigger(rule.trigger); 
        require(valid == true, "RETypes.Trigger not satisfied");

        (bool success, uint output) = IAction(rule.action.callee).performAction(rule.action, triggerData);
        require(success == true, "Action unsuccessful");

        rule.outputAmount = output;
        rule.executed = true; 

        //TODO: send reward to caller
    } 
}
