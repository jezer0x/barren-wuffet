// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Import this file to use console.log
import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./Utils.sol";


contract RuleExecutor is Ownable {
    
    enum Ops { GT, EQ, LT }
    // If Trigger and Action are update, the HashRule needs to be updated
    struct Trigger {
        // eg. asset,price,gt
        string param;
        string value;
        Ops op;
    }

    struct Action {        
        string action; // eg. swapUni        
        string[] params;  // key value pairs to be added to the contract call.

        // We will approve this  much token to be transferred to the target contract.
        // and it needs to be provided as collateral.
        address token;
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
    mapping(bytes32 => Rule) rules;

    struct TokenBalance {
        address token;
        uint amount;
    }

    struct Subscription {
        bytes32 ruleHash;
        TokenBalance[] balances;
    }

    // account -> [ruleHash]
    mapping(address => Subscription[]) subscriptions;
        
    struct TriggerFeed {
        address dataSource;
        string fn;
        mapping(string => string) params;
    }
    
    struct ActionCall {
        address callee;
        string fn;
        mapping(string => string) fixedParams; // array of key, value tuples
        string[] customParams; // list of keys that can be inserted at runtime
    }
    // keyword -> fn call to get data
    // if we know how to get the value, then it can be a trigger. so this serves as a list of allowed triggers
    // can have multiple, and we find median. This is a standard oracle call we can extend
    mapping(string => TriggerFeed[]) triggerFeeds;

    mapping(string => ActionCall[]) actionCalls;    

    constructor(uint _unlockTime) {

        // there isnt a cleaner way to init this struct.
        // https://docs.soliditylang.org/en/v0.7.1/070-breaking-changes.html#mappings-outside-storage
        // https://docs.soliditylang.org/en/v0.7.0/types.html?highlight=struct#structs
        TriggerFeed storage tf = triggerFeeds["eth"][0];
        tf.dataSource = 0xc0ffee254729296a45a3885639AC7E10F9d54979; // chainlink feed
        tf.fn="abicall";    
        tf.params["token"] = "eth";

        tf = triggerFeeds["uni"][0]; // mutating the vars yo. I feel icky enough already whatever
        tf.dataSource = 0xc0ffee254729296a45a3885639AC7E10F9d54979; // chainlink feed
        tf.fn="abicall";    
        tf.params["token"] = "uni";

        tf = triggerFeeds["wbtc"][0]; // mutating the vars yo. I feel icky enough already whatever
        tf.dataSource = 0xc0ffee254729296a45a3885639AC7E10F9d54979; // chainlink feed
        tf.fn="abicall";    
        tf.params["token"] = "wbtc";    

        // can have multiple, they are executed in order
        // It seems like we will eventually need a library contract that wraps the functionality and exposes a common interface        
        ActionCall storage ac = actionCalls["swapUni"][0];
        ac.callee = 0xc0ffee254729296a45a3885639AC7E10F9d54979; // uniswap contract
        ac.fn = "abicallswap";
        ac.fixedParams["slippage"] = "0.001";


        ac = actionCalls["swapSushi"][0];
        ac.callee = 0xc0ffee254729296a45a3885639AC7E10F9d54979; // swapSushi contract
        ac.fn = "abicallswap";
        ac.fixedParams["slippage"] = "0.001";

        
        ac = actionCalls["buyOptionDopex"][0];
        ac.callee = 0xc0ffee254729296a45a3885639AC7E10F9d54979; // buyOptionDopex contract
        ac.fn = "abicallswap";
        ac.fixedParams["slippage"] = "0.001";        
    }

    function addAllowedActionCalls(string memory action, uint idx, address callee, string memory fn, string[] memory customParams) public onlyOwner {
        ActionCall storage ac = actionCalls[action][idx]; 
        ac.callee = callee; // buyOptionDopex contract
        ac.fn = fn;
        ac.customParams = customParams;
    }    

    function addTriggerFeeds(string memory param, uint idx, address dataSource, string memory fn, string[] memory params) public onlyOwner {
        TriggerFeed storage tf = triggerFeeds[param][idx];
        tf.dataSource = dataSource;
        tf.fn = fn;
        for (uint i = 0; i < params.length; i++){
            // TODO. need to split the params by comma.
            tf.params[params[i]] = params[i];
        }        
    }

    function _first(bytes[] memory vals) private pure returns (bytes memory) {        
        return vals[0];
    }

    function _checkTrigger(Trigger storage trigger) private view returns (bool) {
        // get the val of var, so we can check if it matches trigger
        (string storage param, string storage val, Ops op) = (trigger.param, trigger.value, trigger.op);
        uint triggerFeedsLength  = 1; //TODO need to keep track of trigger feeds length separately to init this.
        TriggerFeed[] storage _triggerFeeds = triggerFeeds[param];
        bytes[] memory oracleValues = new bytes[](triggerFeedsLength);
        for (uint i = 0;i < triggerFeedsLength; i++){
            TriggerFeed storage tf = _triggerFeeds[i];
            (address dataSource, string storage fn, mapping(string => string) storage params) = (tf.dataSource, tf.fn, tf.params);
            bytes memory oracleValue = ""; //Address(dataSource).functionCall(address(fn), bytes(params));                                    
            oracleValues[i] = oracleValue;
        }
        bytes memory firstVal = _first(oracleValues); // TODO: we might want some aggregator function. see chainlink code and figure it out.
        
        if(op == Ops.GT){            
            return Utils.toUint256(firstVal, 0) > Utils.toUint256(bytes(val), 0);
        }
        if(op == Ops.LT){
            return Utils.toUint256(firstVal, 0) < Utils.toUint256(bytes(val), 0);
        }
        if(op == Ops.EQ){
            return Utils.toUint256(firstVal, 0) == Utils.toUint256(bytes(val), 0);
        }
    }

    function _performAction(Action storage action, address subscriber) private {
        ActionCall[] storage _actionCalls = actionCalls[action.action];

        // TODO: if any of them throw an exception, we need to revert the whole thing. 
        for(uint i=0; i < _actionCalls.length; i++){            
            ActionCall storage actionCall  = _actionCalls[i];
            // this approves _contract to take the specified token amount from RuleExecutor
            IERC20(action.token).approve(actionCall.callee, action.tokenAmount);
            // TODO
            // Address(actionCall.callee).functionCall(actionCall.fn, actionCall.fixedParams + action.params);
            // this revokes the token approval            
            IERC20(action.token).approve(actionCall.callee, 0);

        }
    }

    function redeemBalance() public {
        // TODO loop through subscriptions, cancel all of them and then return the balances.
    }

    function _validateCollateral(Action storage action, address collateralToken, uint collateralAmount) private view {
        require(action.token == collateralToken);
        require(action.tokenAmount <= collateralAmount);
    }

    function addRule(Trigger calldata trigger, Action calldata action) public { // var:val:op, action:data
        // ethPrice: 1000: gt, uniswap:<sellethforusdc>
        // check if action[0] is in actionTypes
        // if action[1] is "swap", we need to do a swap.
        // we could store the "swap" opcodes as data, which will allow us to whitelist rules.
        // the swap will happen on behalf of this contract, 
        // need to approve uniswap to take asset1 from this contract, and get asset2 back        
        _validateTrigger(trigger);
        _validateAction(action);
        Rule storage rule = rules[_hashRule(trigger, action)];
        rule.trigger = trigger;
        rule.action = rule.action;
    }

    function _hashRule(Trigger memory trigger, Action memory action) private pure returns (bytes32) {
        return keccak256(abi.encode(trigger.op, trigger.param, trigger.value, action.action, action.params, action.token, action.tokenAmount));
    }

    function subscribeToRule(bytes32 ruleHash, address collateralToken, uint collateralAmount) public {    

        _validateCollateral(rules[ruleHash].action, collateralToken, collateralAmount);
        IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount); // get the collateral
        rules[ruleHash].subscribers.push(msg.sender);
        Subscription storage newSubscription = subscriptions[msg.sender][subscriptions[msg.sender].length+1];
        newSubscription.ruleHash = ruleHash;
        TokenBalance storage tb = newSubscription.balances[0];
        tb.token = collateralToken;
        tb.amount = collateralAmount;        
        
    }
    
    function _validateTrigger(Trigger memory trigger) private view {
        require(bytes(trigger.param).length != 0 && bytes(trigger.value).length != 0 && triggerFeeds[trigger.param][0].dataSource != address(0), "unauthorized trigger");
    }

    function _validateAction(Action memory action) private view {
        ActionCall storage actionCall = actionCalls[action.action][0];
        require(bytes(action.action).length != 0 && action.params.length > 0 && actionCall.callee != address(0), "unauthorized action");
        for (uint i=0;i<action.params.length; i++){
            bool found = false;            
            for(uint j=0; j < actionCall.customParams.length; j++){
                found = Utils.strEq(actionCall.customParams[j], action.params[i]);
                if(found){
                    break;
                }
            }            
            require(found, "unauthorized action param");
        }
    }

    function execute(bytes32 ruleHash) public payable { // <- send gas, get a refund if action is performed, else lose gas.
        // check if trigger is met
        // if yes, execute the tx
        // give reward to caller
        // if not, abort            
        
        Rule storage rule = rules[ruleHash];
        require(bytes(rule.action.action).length > 0, "rule not found");
        require(_checkTrigger(rule.trigger), "Trigger not satisfied");
        
        Action storage action = rule.action;
        for(uint i=0; i < rule.subscribers.length; i++){
            _performAction(action, rule.subscribers[i]);
        }        
    } 
}