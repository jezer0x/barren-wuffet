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
    event RuleCreated(bytes32 indexed ruleHash);
    event Subscribed(bytes32 indexed ruleHash, uint256 SubIdx);
    event Executed(bytes32 indexed ruleHash, address executor);
    event Redeemed(bytes32 indexed ruleHash, uint256 SubIdx);
    event Cancelled(bytes32 indexed ruleHash, uint256 SubIdx);

    enum RuleStatus {
        CREATED,
        EXECUTED
    }

    struct Rule {
        RETypes.Trigger trigger;
        RETypes.Action action;
        SubscriptionConstraints constraints;
        uint256 totalCollateralAmount;
        RuleStatus status;
        uint256 outputAmount;
    }

    // hash -> Rule
    mapping(bytes32 => Rule) public rules;

    enum SubscriptionStatus {
        ACTIVE,
        CANCELLED,
        REDEEMED
    }

    struct Subscription {
        address subscriber;
        uint256 collateralAmount;
        SubscriptionStatus status;
    }

    struct SubscriptionConstraints {
        uint256 minCollateralPerSub; // minimum amount needed as collateral to subscribe
        uint256 maxCollateralPerSub; // max ...
        uint256 minCollateralTotal;
        uint256 maxCollateralTotal; // limit on subscription to protect from slippage DOS attacks
    }

    // ruleHash -> [Subscription]
    mapping(bytes32 => Subscription[]) public subscriptions;

    mapping(address => bool) whitelistedActions;
    mapping(address => bool) whitelistedTriggers;
    bool _disableActionWhitelist = false;
    bool _disableTriggerWhitelist = false;

    modifier onlyWhitelist(address triggerAddr, address actionAddr) {
        require(_disableTriggerWhitelist || whitelistedTriggers[triggerAddr], "Unauthorized trigger");
        require(_disableActionWhitelist || whitelistedActions[actionAddr], "Unauthorized action");
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

    function redeemBalance(bytes32 ruleHash, uint256 subscriptionIdx) public {
        Rule storage rule = rules[ruleHash];
        Subscription storage subscription = subscriptions[ruleHash][subscriptionIdx];

        require(subscription.status == SubscriptionStatus.ACTIVE, "subscription is not active!");

        if (rule.status == RuleStatus.EXECUTED) {
            // withdrawing after successfully triggered rule
            uint256 balance = (subscription.collateralAmount * rule.outputAmount) / rule.totalCollateralAmount;
            _redeemBalance(subscription.subscriber, balance, rule.action.toToken);
            subscription.status = SubscriptionStatus.REDEEMED;
            emit Redeemed(ruleHash, subscriptionIdx);
        } else {
            // withdrawing before anyone triggered this
            rule.totalCollateralAmount = rule.totalCollateralAmount - subscription.collateralAmount;
            _redeemBalance(subscription.subscriber, subscription.collateralAmount, rule.action.fromToken);
            subscription.status = SubscriptionStatus.CANCELLED;
            emit Cancelled(ruleHash, subscriptionIdx);
        }
    }

    function _validateCollateral(
        Rule memory rule,
        RETypes.Action memory action,
        address collateralToken,
        uint256 collateralAmount
    ) private view {
        require(action.fromToken == collateralToken, "Wrong Collateral Type");
        require(rule.constraints.minCollateralPerSub <= collateralAmount, "Insufficient Collateral for Subscription");
        require(rule.constraints.maxCollateralPerSub >= collateralAmount, "Max Collateral for Subscription exceeded");
        require(
            rule.constraints.maxCollateralTotal >= (rule.totalCollateralAmount + collateralAmount),
            "Max Collateral for Rule exceeded"
        );

        if (collateralToken == REConstants.ETH) {
            require(collateralAmount == msg.value);
        }
    }

    function addRule(
        RETypes.Trigger calldata trigger,
        RETypes.Action calldata action,
        SubscriptionConstraints calldata constraints
    ) public onlyWhitelist(trigger.callee, action.callee) {
        // var:val:op, action:data
        // ethPrice: 1000: gt, uniswap:<sellethforusdc>
        // check if action[0] is in actionTypes
        // if action[1] is "swap", we need to do a swap.
        // we could store the "swap" opcodes as data, which will allow us to whitelist rules.
        // the swap will happen on behalf of this contract,
        // need to approve uniswap to take asset1 from this contract, and get asset2 back
        require(ITrigger(trigger.callee).validateTrigger(trigger), "Invalid trigger");
        require(IAction(action.callee).validateAction(action), "Invalid action");

        bytes32 ruleHash = _hashRule(trigger, action, constraints);
        Rule storage rule = rules[ruleHash];
        rule.trigger = trigger;
        rule.action = action;
        rule.status = RuleStatus.CREATED;
        rule.outputAmount = 0;
        rule.constraints = constraints;

        emit RuleCreated(ruleHash);
    }

    function _hashRule(
        RETypes.Trigger memory trigger,
        RETypes.Action memory action,
        SubscriptionConstraints memory constraints
    ) private view returns (bytes32) {
        return keccak256(abi.encode(trigger, action, constraints, msg.sender, block.timestamp));
    }

    function subscribeToRule(
        bytes32 ruleHash,
        address collateralToken,
        uint256 collateralAmount
    ) public payable {
        _validateCollateral(rules[ruleHash], rules[ruleHash].action, collateralToken, collateralAmount);
        _collectCollateral(collateralToken, collateralAmount);
        Subscription storage newSub = subscriptions[ruleHash].push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        rules[ruleHash].totalCollateralAmount = rules[ruleHash].totalCollateralAmount + collateralAmount;

        emit Subscribed(ruleHash, subscriptions[ruleHash].length - 1);
    }

    function _collectCollateral(address collateralToken, uint256 collateralAmount) private {
        if (collateralToken != REConstants.ETH) {
            IERC20(collateralToken).transferFrom(msg.sender, address(this), collateralAmount);
        } // else it should be in our balance already
    }

    function checkRule(bytes32 ruleHash) external view returns (bool valid) {
        (valid, ) = ITrigger(rules[ruleHash].trigger.callee).checkTrigger(rules[ruleHash].trigger);
    }

    function executeRule(bytes32 ruleHash) public {
        // <- send gas, get a refund if action is performed, else lose gas.
        // check if trigger is met
        // if yes, execute the tx
        // give reward to caller
        // if not, abort

        Rule storage rule = rules[ruleHash];
        require(rule.action.callee != address(0), "Rule not found!");
        (bool valid, uint256 triggerData) = ITrigger(rule.trigger.callee).checkTrigger(rule.trigger);
        require(valid, "Trigger not satisfied");
        require(
            rule.totalCollateralAmount >= rule.constraints.minCollateralTotal,
            "Not enough collateral for executing"
        );

        RETypes.ActionRuntimeParams memory runtimeParams = RETypes.ActionRuntimeParams({
            triggerData: triggerData,
            totalCollateralAmount: rule.totalCollateralAmount
        });

        uint256 output;
        if (rule.action.fromToken != REConstants.ETH) {
            IERC20(rule.action.fromToken).approve(rule.action.callee, rule.totalCollateralAmount);
            output = IAction(rule.action.callee).performAction(rule.action, runtimeParams);
        } else {
            output = IAction(rule.action.callee).performAction{value: rule.totalCollateralAmount}(
                rule.action,
                runtimeParams
            );
        }

        rule.outputAmount = output;
        rule.status = RuleStatus.EXECUTED;

        //TODO: send reward to caller

        emit Executed(ruleHash, msg.sender);
    }
}
