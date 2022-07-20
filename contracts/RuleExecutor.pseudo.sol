// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Import this file to use console.log
import "hardhat/console.sol";


contract RuleExecutor{
    
    struct Trigger {
        // eg. asset,price,gt
        string param;
        string value;
        string op;
    }

    struct Action {
        // ?? 
        string action; // eg. swapUni        
        string[] params;  // key value pairs to be added to the contract call.

        // We will approve this  much token to be transferred to the target contract.
        // and it needs to be provided as collateral.
        string token;
        uint tokenAmount;
    }

    struct Rule {        
        Trigger trigger;
        // action
        // action:data:asset:amount
        // swapUni:
        // action is a smart contract call, data is sent to the call
        // anyone can execute it. 
        Action action;
        address[] subscribers;
    }
    // hash -> Rule
    mapping(string => Rule) rules;

    struct TokenBalance {
        string token;
        uint amount;
    }

    struct Subscription {
        string ruleHash;
        TokenBalance[] balances;
    }

    // account -> [ruleHash]
    mapping(address => Subscription[]) subscriptions;    
    
    
    // we need to know what the action is so we know if it succeeded. 
    string[] allowedActions = ["uniswap", "dopex"];
    
    struct TriggerFeed {
        string dataSource;
        string fn;
        string[] params;
    }

    struct ActionCall {
        string _contract;
        string fn;
        string[][] fixedParams; // array of key, value tuples
        string[] customParams; // list of keys that can be inserted at runtime
    }
    // eth -> fn call to get data
    // if we know how to get the value, then it can be a trigger. so this serves as a list of allowed triggers
    mapping(string => TriggerFeed) triggerFeeds;

    mapping(string => ActionCall) actionCalls;

    string[] ops = ["gt", "eq", "lt"]; // gt, eq, lt
    
    function onlyOwner() private;
    
    constructor(uint _unlockTime) {
        // can have multiple, and we find median. This is a standard oracle call we can extend
        triggerFeeds["eth"] = [TriggerFeed(dataSource="0xfoobarChainlinkfeed", fn= "abicall", params=[("token", "eth")])];
        triggerFeeds["uni"] = [TriggerFeed(dataSource="0xfoobarChainlinkfeed", fn= "abicall", params=[("token", "uni")])];
        triggerFeeds["wbtc"] = [TriggerFeed(dataSource="0xfoobarChainlinkfeed", fn= "abicall", params=[("token", "wbtc")])];

        // can have multiple, they are executed in order
        // It seems like we will eventually need a library contract that wraps the functionality and exposes a common interface        
        actionCalls["swapUni"] = [ActionCall(_contract="0xfoobaruniswapcontract", fn="abicallswap", fixedParams=[("slippage", 0.001)])];
        actionCalls["swapSushi"] = [ActionCall(dataSource="0xfoobarSushiswapcontract", fn= "abicallswap", fixedParams=[("slippage", 0.001)])];
        actionCalls["buyOptionDopex"] = [ActionCall(dataSource="0xfoobarDopexContract", fn= "abicalloption", fixedParams=[("slippage", 0.001)])];
    }

    function addAllowedActionCalls(string action, address _contract, string fn, string[] params) public onlyOwner {
        actionCalls[param] = [ActionCall(dataSource=dataSource, fn=fn, fixedParams=params)];
    }

    function addTriggerFeeds(string param, address dataSource, string fn, string[] params) public onlyOwner {
        triggerFeeds[param] = [TriggerFeed(dataSource=dataSource, fn=fn, params=params)];
    }

    function checkTrigger(Trigger trigger) private {
        // get the val of var, so we can check if it matches trigger
        string (param, val, op) = (trigger.param, trigger.value, trigger.op);
        triggerFeeds = triggerFeeds[param];
        uint[] oracleValues = [];
        for (int i = 0;i < len(triggerFeeds); i++){
            (dataSource, fn, params) = triggerFeeds[0];
            oracleValue = triggerFeed.call(fn, params);
            oracleValues.push(oracleValue);
        }
        uint medianVal = median(oracleValues); // we might not want median always.
        
        if(op == "gt"){
            return medianVal > val;
        }
        if(op == "lt"){
            return medianVal < val;
        }
        if(op == "eq"){
            return medianVal == val;
        }
    }

    function performAction(Action action, address subscriber) private {
        actionCalls = actionCalls[action.action];

        for(int i=0;i < actionCalls.length; i++){
            ActionCall actionCall = actionCall[i];
            // this approves _contract to take the specified token amount from RuleExecutor
            ERC20(action.token).approve(actionCall._contract, action.tokenAmount);
            actionCall._contract.call(actionCall.fn, actionCall.fixedParams, action.params);
            // this revokes the token approval
            ERC20(action.token).approve(actionCall._contract, 0);

        }
    }

    function redeemBalance() public {
        // loop through subscriptions, cancel all of them and then return the balances.
    }

    function validateCollateral(Action action, string collateralToken, uint collateralAmount) private {
        require(action.token == collateralToken);
        require(action.tokenAmount <= collateralAmount);
    }

    function addRule(Trigger trigger, Action action) public { // var:val:op, action:data
        // ethPrice: 1000: gt, uniswap:<sellethforusdc>
        // check if action[0] is in actionTypes
        // if action[1] is "swap", we need to do a swap.
        // we could store the "swap" opcodes as data, which will allow us to whitelist rules.
        // the swap will happen on behalf of this contract, 
        // need to approve uniswap to take asset1 from this contract, and get asset2 back        
        validateTrigger(trigger);
        validateAction(action);        
        rules[hashRule(trigger, action)] = (trigger, action);
        
    }

    function hashRule(Trigger trigger, Action action) private {
        return keccak256(abiencode(str(trigger) + str(action)));
    }
    function subscribeToRule(string ruleHash, string collateralToken, uint collateralAmount) public {                        
        validateCollateral(action, collateralToken, collateralAmount);
        collateralToken.transferFrom(msg.sender, this, collateralAmount); // get the collateral
        rules[ruleHash].subscribers.push(msg.sender);
        subscriptions[msg.sender] = (subscriptions[msg.sender] || []) + 
            [Subscription(ruleHash, balances=[TokenBalance(token=collateralToken, amount=collateralAmount)])];        

        
    }
    
    function validateTrigger(Trigger trigger) private {
        require(trigger.param && trigger.value && trigger.op && triggerFeeds.includes(trigger.param), "unauthorized trigger");        
    }

    function validateAction(Action action) private {
        ActionCall actionCall = actionCalls[action.action];
        require(action.action && action.params && actionCall, "unauthorized action");
        for (int i=0;i<action.params.length; i++){
            require(actionCall.customParams.includes(action.params[i][0]), "unauthorized action param");
        }

    }

    function execute(string ruleHash) public payable { // <- send gas, get a refund if action is performed, else lose gas.
        // check if trigger is met
        // if yes, execute the tx
        // give reward to caller
        // if not, abort            
        
        Rule rule = rules[ruleHash];
        require(rule, "rule not found");
        require(checkTrigger(rule.trigger), "Trigger not satisfied");
        
        Action action = rule.action;
        for(int i=0; i < rule.subscribers.length; i++){
            performAction(action, rules.subscribers[i]);
        }        
        
    } 
}