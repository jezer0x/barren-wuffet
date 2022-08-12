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
import "../utils/IAssetIO.sol";
import "../utils/whitelists/WhitelistService.sol";

contract RuleExecutor is IAssetIO, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event Created(bytes32 indexed ruleHash);
    event Activated(bytes32 indexed ruleHash);
    event Deactivated(bytes32 indexed ruleHash);
    event Cancelled(bytes32 indexed ruleHash);
    event Executed(bytes32 indexed ruleHash, address executor);
    event Redeemed(bytes32 indexed ruleHash);
    event CollateralAdded(bytes32 indexed ruleHash, uint256 amt);
    event CollateralReduced(bytes32 indexed ruleHash, uint256 amt);

    modifier onlyRuleOwner(bytes32 ruleHash) {
        require(rules[ruleHash].owner == msg.sender, "onlyRuleOwner");
        _;
    }

    modifier ruleExists(bytes32 ruleHash) {
        require(rules[ruleHash].owner != address(0), "Rule not found");
        _;
    }

    // hash -> Rule
    mapping(bytes32 => Rule) rules;
    mapping(bytes32 => mapping(address => uint256)) rewardProviders;

    bytes32 triggerWhitelistHash;
    bytes32 actionWhitelistHash;
    WhitelistService wlService;

    modifier onlyWhitelist(Trigger[] calldata triggers, Action[] calldata actions) {
        for (uint256 i = 0; i < triggers.length; i++) {
            require(wlService.isWhitelisted(triggerWhitelistHash, triggers[i].callee), "Unauthorized Trigger");
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(wlService.isWhitelisted(actionWhitelistHash, actions[i].callee), "Unauthorized Action");
        }
        _;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    constructor(
        address wlServiceAddr,
        bytes32 trigWlHash,
        bytes32 actionWlHash
    ) {
        wlService = WhitelistService(wlServiceAddr);
        triggerWhitelistHash = trigWlHash;
        actionWhitelistHash = actionWlHash;
    }

    function getRule(bytes32 ruleHash) public view ruleExists(ruleHash) returns (Rule memory) {
        return rules[ruleHash];
    }

    function getInputToken(bytes32 ruleHash) public view ruleExists(ruleHash) returns (address) {
        return rules[ruleHash].actions[0].inputToken;
    }

    function getOutputToken(bytes32 ruleHash) public view ruleExists(ruleHash) returns (address) {
        Rule storage rule = rules[ruleHash];
        return rule.actions[rule.actions.length - 1].outputToken;
    }

    function redeemBalance(bytes32 ruleHash) external whenNotPaused onlyRuleOwner(ruleHash) nonReentrant {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.EXECUTED, "Rule != executed");
        Utils._send(rule.owner, rule.outputAmount, getOutputToken(ruleHash));
        emit Redeemed(ruleHash);
    }

    function addCollateral(bytes32 ruleHash, uint256 amount)
        external
        payable
        whenNotPaused
        onlyRuleOwner(ruleHash)
        nonReentrant
    {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "Can't add collateral");

        require(amount > 0, "amount <= 0");

        if (getInputToken(ruleHash) != REConstants.ETH) {
            rule.totalCollateralAmount = rule.totalCollateralAmount + amount;
            // must have been approved first
            IERC20(getInputToken(ruleHash)).safeTransferFrom(msg.sender, address(this), amount);
        } else {
            require(amount == msg.value, "ETH: amount != msg.value");
            rule.totalCollateralAmount = rule.totalCollateralAmount + msg.value;
        }
        emit CollateralAdded(ruleHash, amount);
    }

    function reduceCollateral(bytes32 ruleHash, uint256 amount)
        external
        whenNotPaused
        onlyRuleOwner(ruleHash)
        nonReentrant
    {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "Can't reduce collateral");

        // Note: if totalCollateral = 0 and amount = 1; underflow will cause a revert,
        // so we don't have to do an explicit require here.
        rule.totalCollateralAmount = rule.totalCollateralAmount - amount;

        if (getInputToken(ruleHash) != REConstants.ETH) {
            IERC20(getInputToken(ruleHash)).safeTransfer(msg.sender, amount);
        } else {
            payable(msg.sender).transfer(amount);
        }
        emit CollateralReduced(ruleHash, amount);
    }

    function increaseReward(bytes32 ruleHash) public payable whenNotPaused ruleExists(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE);
        rule.reward += msg.value;
        rewardProviders[ruleHash][msg.sender] += msg.value;
    }

    function decreaseReward(bytes32 ruleHash) external whenNotPaused ruleExists(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status != RuleStatus.EXECUTED, "Reward paid");
        uint256 balance = rewardProviders[ruleHash][msg.sender];
        require(balance > 0, "0 contribution");
        rule.reward -= balance;
        rewardProviders[ruleHash][msg.sender] = 0;

        // slither-disable-next-line arbitrary-send
        payable(msg.sender).transfer(balance);
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions)
        external
        payable
        whenNotPaused
        nonReentrant
        onlyWhitelist(triggers, actions)
        returns (bytes32)
    {
        bytes32 ruleHash = _getRuleHash(triggers, actions);
        Rule storage rule = rules[ruleHash];
        for (uint256 i = 0; i < triggers.length; i++) {
            require(ITrigger(triggers[i].callee).validate(triggers[i]), "Invalid Trigger");
            rule.triggers.push(triggers[i]);
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(IAction(actions[i].callee).validate(actions[i]), "Invalid Action");
            if (i != actions.length - 1) {
                require(actions[i].outputToken == actions[i + 1].inputToken, "Invalid inputToken->outputToken");
            }
            rule.actions.push(actions[i]);
        }
        require(rule.owner == address(0), "Duplicate Rule");
        rule.owner = msg.sender;
        rule.status = RuleStatus.INACTIVE;
        rule.outputAmount = 0;
        increaseReward(ruleHash);

        emit Created(ruleHash);
        return ruleHash;
    }

    /*
        Valid State Transitions: (from) => (to)

        ACTIVE => {active, inactive, cancelled}
        INACTIVE => {active, cancelled}
        EXECUTED => {}
        CANCELLED => {} 
    */
    function activateRule(bytes32 ruleHash) external whenNotPaused onlyRuleOwner(ruleHash) {
        require(rules[ruleHash].status == RuleStatus.INACTIVE, "Can't Activate Rule");
        rules[ruleHash].status = RuleStatus.ACTIVE;
        emit Activated(ruleHash);
    }

    function deactivateRule(bytes32 ruleHash) external whenNotPaused onlyRuleOwner(ruleHash) {
        require(rules[ruleHash].status == RuleStatus.ACTIVE, "Can't Deactivate Rule");
        rules[ruleHash].status = RuleStatus.INACTIVE;
        emit Deactivated(ruleHash);
    }

    function cancelRule(bytes32 ruleHash) external whenNotPaused onlyRuleOwner(ruleHash) nonReentrant {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "Can't Cancel Rule");
        rule.status = RuleStatus.CANCELLED;
        Utils._send(rule.owner, rule.totalCollateralAmount, getInputToken(ruleHash));
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

    function executeRule(bytes32 ruleHash) external whenNotPaused ruleExists(ruleHash) nonReentrant {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE, "Rule != ACTIVE");
        (bool valid, uint256 triggerData) = _checkTriggers(rule.triggers);
        require(valid, "Trigger != Satisfied");

        ActionRuntimeParams memory runtimeParams = ActionRuntimeParams({
            triggerData: triggerData,
            totalCollateralAmount: rule.totalCollateralAmount
        });

        uint256 output = 0;
        for (uint256 i = 0; i < rule.actions.length; i++) {
            Action storage action = rule.actions[i];
            if (action.inputToken != REConstants.ETH) {
                IERC20(action.inputToken).safeApprove(action.callee, runtimeParams.totalCollateralAmount);
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
        // We dont need to check sender here.
        // As long as the execution reaches this point, the reward is there
        // for the taking.
        // slither-disable-next-line arbitrary-send
        payable(msg.sender).transfer(rule.reward);
        emit Executed(ruleHash, msg.sender);
    }
}
