// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../utils/Utils.sol";
import "../utils/Constants.sol";
import "../utils/assets/TokenLib.sol";
import "../actions/IAction.sol";
import "../triggers/ITrigger.sol";
import "./RuleTypes.sol";
import "./IRoboCop.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RoboCop is IRoboCop, IERC721Receiver, Initializable, Ownable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using TokenLib for Token;

    // Storage Start
    mapping(bytes32 => Rule) rules;
    mapping(bytes32 => bytes32[]) public actionPositionsMap;
    EnumerableSet.Bytes32Set private pendingPositions;
    mapping(bytes32 => mapping(address => uint256)) public ruleIncentiveProviders;
    // Storage End

    modifier ruleExists(bytes32 ruleHash) {
        require(rules[ruleHash].status != RuleStatus.NULL, "Rule not found");
        _;
    }

    // disable calling initialize() on the implementation contract
    constructor() {
        _disableInitializers();
    }

    function initialize(address _newOwner) external nonReentrant initializer {
        _transferOwnership(_newOwner);
    }

    function getRule(bytes32 ruleHash) public view ruleExists(ruleHash) returns (Rule memory) {
        return rules[ruleHash];
    }

    function getInputTokens(bytes32 ruleHash) public view ruleExists(ruleHash) returns (Token[] memory) {
        return rules[ruleHash].actions[0].inputTokens;
    }

    function getOutputTokens(bytes32 ruleHash) public view ruleExists(ruleHash) returns (Token[] memory) {
        Rule storage rule = rules[ruleHash];
        return rule.actions[rule.actions.length - 1].outputTokens;
    }

    function redeemBalance(bytes32 ruleHash) external nonReentrant onlyOwner {
        Rule storage rule = rules[ruleHash];
        _setRuleStatus(ruleHash, RuleStatus.REDEEMED);
        Token[] memory tokens = getOutputTokens(ruleHash);

        for (uint256 i = 0; i < tokens.length; i++) {
            tokens[i].send(owner(), rule.outputs[i]);
        }
    }

    function addCollateral(bytes32 ruleHash, uint256[] memory amounts) external payable onlyOwner nonReentrant {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "Can't add collateral");

        Token[] memory tokens = getInputTokens(ruleHash);
        uint256 amount;

        for (uint256 i = 0; i < tokens.length; i++) {
            amount = amounts[i];
            require(amount > 0, "amount <= 0");
            if (tokens[i].t == TokenType.NATIVE) {
                require(amount == msg.value, "ETH: amount != msg.value");
            } else {
                tokens[i].take(msg.sender, amount);
            }

            rule.collaterals[i] += amount;
        }

        emit CollateralAdded(ruleHash, amounts);
    }

    function reduceCollateral(bytes32 ruleHash, uint256[] memory amounts) external onlyOwner nonReentrant {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "Can't reduce collateral");

        Token[] memory tokens = getInputTokens(ruleHash);
        uint256 amount;

        for (uint256 i = 0; i < tokens.length; i++) {
            amount = amounts[i];
            require(rule.collaterals[i] >= amount, "Not enough collateral.");
            rule.collaterals[i] -= amount;
            tokens[i].send(msg.sender, amount);
        }
        emit CollateralReduced(ruleHash, amounts);
    }

    function increaseIncentive(bytes32 ruleHash) public payable ruleExists(ruleHash) {
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE);
        rule.incentive += msg.value;
        ruleIncentiveProviders[ruleHash][msg.sender] += msg.value;
    }

    function withdrawIncentive(bytes32 ruleHash) external ruleExists(ruleHash) returns (uint256 balance) {
        Rule storage rule = rules[ruleHash];
        require(rule.status != RuleStatus.EXECUTED && rule.status != RuleStatus.REDEEMED, "Incentive paid");
        balance = ruleIncentiveProviders[ruleHash][msg.sender];
        require(balance > 0, "0 contribution");
        rule.incentive -= balance;
        ruleIncentiveProviders[ruleHash][msg.sender] = 0;

        // slither-disable-next-line arbitrary-send
        payable(msg.sender).transfer(balance);
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions)
        external
        payable
        nonReentrant
        onlyOwner
        returns (bytes32)
    {
        bytes32 ruleHash = _getRuleHash(triggers, actions);
        Rule storage rule = rules[ruleHash];
        require(rule.status == RuleStatus.NULL, "Duplicate Rule");
        require(actions.length > 0); // has to do something, else is a waste!
        for (uint256 i = 0; i < triggers.length; i++) {
            require(ITrigger(triggers[i].callee).validate(triggers[i]), "Invalid Trigger");
            rule.triggers.push(triggers[i]);
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(IAction(actions[i].callee).validate(actions[i]), "Invalid Action");

            if (i != actions.length - 1) {
                Token[] memory inputTokens = actions[i + 1].inputTokens;
                Token[] memory outputTokens = actions[i].outputTokens;
                for (uint256 j = 0; j < outputTokens.length; j++) {
                    require(outputTokens[j].equals(inputTokens[j]), "Invalid inputTokens->outputTokens");
                }
            }
            rule.actions.push(actions[i]);
        }
        rule.status = RuleStatus.INACTIVE;

        for (uint256 i = 0; i < actions[0].inputTokens.length; i++) {
            rule.collaterals.push();
        }

        increaseIncentive(ruleHash);

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

    function activateRule(bytes32 ruleHash) external onlyOwner {
        _setRuleStatus(ruleHash, RuleStatus.ACTIVE);
    }

    function deactivateRule(bytes32 ruleHash) external onlyOwner {
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

    function _takeAction(Action storage action, ActionRuntimeParams memory runtimeParams)
        private
        returns (uint256[] memory)
    {
        for (uint256 j = 0; j < action.inputTokens.length; j++) {
            // ignore return value
            action.inputTokens[j].approve(action.callee, runtimeParams.collaterals[j]);
        }

        Utils._closePosition(action, pendingPositions, actionPositionsMap);

        ActionResponse memory response = Utils._delegatePerformAction(action, runtimeParams);

        Utils._createPosition(action, response.position.nextActions, pendingPositions, actionPositionsMap);

        return response.tokenOutputs;
    }

    function executeRule(bytes32 ruleHash) external ruleExists(ruleHash) nonReentrant {
        Rule storage rule = rules[ruleHash];
        _setRuleStatus(ruleHash, RuleStatus.EXECUTED); // This ensures only active rules can be executed
        (bool valid, TriggerReturn[] memory triggerReturnArr) = _checkTriggers(rule.triggers);
        require(valid, "Trigger != Satisfied");

        ActionRuntimeParams memory runtimeParams = ActionRuntimeParams({
            triggerReturnArr: triggerReturnArr,
            collaterals: rule.collaterals
        });

        uint256[] memory outputs;
        for (uint256 i = 0; i < rule.actions.length; i++) {
            Action storage action = rule.actions[i];
            outputs = _takeAction(action, runtimeParams);
            runtimeParams.collaterals = outputs; // changes because outputTokens of action[i-1] is inputTokens of action[i]
        }

        rule.outputs = outputs;
        payable(msg.sender).transfer(rule.incentive); // slither-disable-next-line arbitrary-send // for the taking. // As long as the execution reaches this point, the incentive is there // We dont need to check sender here.
    }

    function hasPendingPosition() public view returns (bool) {
        return pendingPositions.length() > 0;
    }

    function actionClosesPendingPosition(Action calldata action) public view returns (bool) {
        return actionPositionsMap[keccak256(abi.encode(action))].length > 0;
    }

    receive() external payable {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        // we don't need to save any info
        return this.onERC721Received.selector;
    }
}
