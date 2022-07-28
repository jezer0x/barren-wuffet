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

    event RuleCreated(
        bytes32 indexed ruleHash, 
        Rule rule
    ); 

    event Subscribed(
        bytes32 indexed ruleHash, 
        uint SubIdx, 
        Subscription subscription 
    ); 

    event Executed(
        bytes32 indexed ruleHash, 
        address executor 
    ); 

    event Redeemed(
        bytes32 indexed ruleHash,
        uint SubIdx, 
        uint balance, 
        address token
    ); 

    enum RuleStatus {
        CREATED, 
        EXECUTED
    }

    struct Rule {        
        RETypes.Trigger trigger;
        RETypes.Action action;
        SubscriptionConstraints constraints; 
        uint totalCollateralAmount;
        RuleStatus status; 
        uint outputAmount;  
    }

    // hash -> Rule
    mapping(bytes32 => Rule) rules;

    struct Subscription {
        address subscriber;
        uint collateralAmount; 
    }

    struct SubscriptionConstraints {
        uint minTokenAmount;        // minimum amount needed as collateral to subscribe 
        uint maxCollateralAmount;   // limit on subscription to protect from slippage DOS attacks
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

        if (rule.status == RuleStatus.EXECUTED) {
            // withdrawing after successfully triggered rule
            uint balance = subscription.collateralAmount*rule.outputAmount/rule.totalCollateralAmount;
            _redeemBalance(subscription.subscriber, balance, rule.action.toToken); 
            emit Redeemed(ruleHash, subscriptionIdx, balance, rule.action.toToken); 
        } else {
            // withdrawing before anyone triggered this
            rule.totalCollateralAmount = rule.totalCollateralAmount - subscription.collateralAmount;
            _redeemBalance(subscription.subscriber, subscription.collateralAmount, rule.action.fromToken);
            emit Redeemed(ruleHash, subscriptionIdx, subscription.collateralAmount, rule.action.fromToken); 
        }
    }

    function _validateCollateral(Rule storage rule, RETypes.Action storage action, address collateralToken, uint collateralAmount) private view {
        require(action.fromToken == collateralToken);
        require(rule.constraints.minTokenAmount <= collateralAmount);
        require(rule.constraints.maxCollateralAmount <= rule.totalCollateralAmount + collateralAmount); 

        if (collateralToken == REConstants.ETH) {
            require(collateralAmount == msg.value); 
        }
    }

    function addRule(RETypes.Trigger calldata trigger, RETypes.Action calldata action, SubscriptionConstraints memory constraints) public { // var:val:op, action:data
        // ethPrice: 1000: gt, uniswap:<sellethforusdc>
        // check if action[0] is in actionTypes
        // if action[1] is "swap", we need to do a swap.
        // we could store the "swap" opcodes as data, which will allow us to whitelist rules.
        // the swap will happen on behalf of this contract, 
        // need to approve uniswap to take asset1 from this contract, and get asset2 back        
        ITrigger(trigger.callee).validateTrigger(trigger);
        IAction(action.callee).validateAction(action);

        bytes32 ruleHash = _hashRule(trigger, action, constraints); 
        Rule storage rule = rules[ruleHash];
        rule.trigger = trigger;
        rule.action = action;
        rule.status = RuleStatus.CREATED; 
        rule.outputAmount = 0; 

        emit RuleCreated(ruleHash, rule);
    }

    function _hashRule(RETypes.Trigger memory trigger, RETypes.Action memory action, SubscriptionConstraints memory constraints) private view returns (bytes32) {
        return keccak256(abi.encode(trigger, action, constraints, msg.sender, block.timestamp));
    }

    function subscribeToRule(bytes32 ruleHash, address collateralToken, uint collateralAmount) public {    
        _validateCollateral(rules[ruleHash], rules[ruleHash].action, collateralToken, collateralAmount);
        _collectCollateral(collateralToken, collateralAmount);  
        Subscription storage newSub = subscriptions[ruleHash].push(); 
        newSub.subscriber = msg.sender; 
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        rules[ruleHash].totalCollateralAmount = rules[ruleHash].totalCollateralAmount + collateralAmount; 

        emit Subscribed(ruleHash, subscriptions[ruleHash].length-1, newSub); 
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

        RETypes.ActionRuntimeParams memory runtimeParams = RETypes.ActionRuntimeParams({triggerData: triggerData , totalCollateralAmount: rule.totalCollateralAmount}); 

        (bool success, uint output) = IAction(rule.action.callee).performAction(rule.action, runtimeParams);
        require(success == true, "Action unsuccessful");

        rule.outputAmount = output;
        rule.status = RuleStatus.EXECUTED; 

        //TODO: send reward to caller

        emit Executed(ruleHash, msg.sender); 
    } 
}
