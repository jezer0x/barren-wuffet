// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../utils/Utils.sol";
import "../utils/Constants.sol";
import "../utils/assets/TokenLib.sol";
import "../utils/CustomEnumerableMap.sol";
import "../actions/IAction.sol";
import "../triggers/ITrigger.sol";
import "../bot/IBotFrontend.sol";
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
    using CustomEnumerableMap for CustomEnumerableMap.Bytes32ToBytesMap;
    using TokenLib for Token;

    // Storage Start
    CustomEnumerableMap.Bytes32ToBytesMap rules;
    mapping(bytes32 => bytes32[]) public actionPositionsMap;
    EnumerableSet.Bytes32Set private pendingPositions;
    mapping(bytes32 => uint256) tokensOnHold; // demarcate tokens which can't be redeemed
    uint256 totalNumOutputTokens; // convenience variable
    IBotFrontend public botFrontend;

    // Storage End

    // disable calling initialize() on the implementation contract
    constructor() {
        _disableInitializers();
    }

    function initialize(address newOwner, address botFrontendAddr) external nonReentrant initializer {
        _transferOwnership(newOwner);
        botFrontend = IBotFrontend(botFrontendAddr);
    }

    function getRule(bytes32 ruleHash) public view returns (Rule memory) {
        return abi.decode(rules.get(ruleHash), (Rule));
    }

    function _setRule(bytes32 ruleHash, Rule memory rule) internal {
        rules.set(ruleHash, abi.encode(rule));
    }

    function getInputTokens(bytes32 ruleHash) public view returns (Token[] memory) {
        return getRule(ruleHash).actions[0].inputTokens;
    }

    function getOutputTokens(bytes32 ruleHash) public view returns (Token[] memory) {
        Rule memory rule = getRule(ruleHash);
        return rule.actions[rule.actions.length - 1].outputTokens;
    }

    // Redeems balance of all executed rules
    function redeemOutputs() external nonReentrant onlyOwner returns (Token[] memory, uint256[] memory) {
        bytes32[] memory redeemableHashes = getRuleHashesByStatus(RuleStatus.EXECUTED);
        Token[] memory rawResTokens = new Token[](totalNumOutputTokens);
        uint256[] memory rawResAmounts = new uint256[](totalNumOutputTokens);
        uint256 rawResIdx = 0;

        for (uint256 i = 0; i < redeemableHashes.length; i++) {
            _setRuleStatus(redeemableHashes[i], RuleStatus.REDEEMED);
            Token[] memory tokens = getOutputTokens(redeemableHashes[i]);

            for (uint256 j = 0; j < tokens.length; j++) {
                if (tokens[j].isETH() || tokens[j].isERC20()) {
                    uint256 amount = tokens[j].balance();
                    uint256 canSend = amount - tokensOnHold[keccak256(abi.encode(tokens[j]))];
                    if (canSend > 0) {
                        tokens[j].send(owner(), canSend);
                        rawResTokens[rawResIdx] = tokens[j];
                        rawResAmounts[rawResIdx] = canSend;
                        rawResIdx++;
                    }
                } else if (tokens[j].isERC721()) {
                    uint256 nft_id = getRule(redeemableHashes[i]).outputs[j];
                    tokens[j].send(owner(), nft_id);
                    rawResTokens[rawResIdx] = tokens[j];
                    rawResAmounts[rawResIdx] = nft_id;
                    rawResIdx++;
                }
            }
        }

        // Give back only the non-empty part of the arrays
        Token[] memory resTokens = new Token[](rawResIdx);
        uint256[] memory resAmounts = new uint256[](rawResIdx);

        for (uint256 i = 0; i < rawResIdx; i++) {
            resTokens[i] = rawResTokens[i];
            resAmounts[i] = rawResAmounts[i];
        }

        return (resTokens, resAmounts);
    }

    function getRuleHashesByStatus(RuleStatus status) public view returns (bytes32[] memory) {
        bytes32[] memory keys = rules.keys();

        // Allocate the max length
        bytes32[] memory rawRes = new bytes32[](keys.length);
        uint256 rawResIdx = 0;

        bytes32 ruleHash;
        Rule memory rule;

        for (uint256 i = 0; i < keys.length; i++) {
            ruleHash = keys[i];
            rule = getRule(ruleHash);

            if (rule.status == status) {
                rawRes[rawResIdx] = ruleHash;
                rawResIdx++;
            }
        }

        // Give back only the non-empty part of the array
        bytes32[] memory res = new bytes32[](rawResIdx);
        for (uint256 i = 0; i < rawResIdx; i++) {
            res[i] = rawRes[i];
        }

        return res;
    }

    function addCollateral(bytes32 ruleHash, uint256[] memory collaterals) external payable onlyOwner nonReentrant {
        Rule memory rule = getRule(ruleHash);
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "RC: Can't add collateral");

        Token[] memory tokens = getInputTokens(ruleHash);
        uint256 collateral;

        for (uint256 i = 0; i < tokens.length; i++) {
            collateral = collaterals[i];

            if (tokens[i].isETH() || tokens[i].isERC20()) {
                require(collateral > 0, "RC: amount <= 0");
                rule.collaterals[i] += collateral;
            } else {
                // NFT
                rule.collaterals[i] = collateral; //TODO: already part of token.id; why store again?
            }

            if (tokens[i].isETH()) {
                // slither warns about msg.value in a loop. 
                // But ETH will be input token at most once in the list. 
                // So this is safe
                // slither-disable-next-line msg-value-loop
                require(collateral == msg.value, "RC: amount != msg.value");
            } else {
                tokens[i].take(msg.sender, collateral);
            }

            tokensOnHold[keccak256(abi.encode(tokens[i]))] += collateral;
        }

        _setRule(ruleHash, rule);
        emit CollateralAdded(ruleHash, collaterals);
    }

    function reduceCollateral(bytes32 ruleHash, uint256[] memory amounts) external onlyOwner nonReentrant {
        Rule memory rule = getRule(ruleHash);
        require(rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE, "RC: Can't reduce collateral");

        Token[] memory tokens = getInputTokens(ruleHash);
        uint256 amount;

        for (uint256 i = 0; i < tokens.length; i++) {
            amount = amounts[i];
            require(rule.collaterals[i] >= amount, "RC: Not enough collateral.");
            rule.collaterals[i] -= amount;
            tokens[i].send(owner(), amount);
            tokensOnHold[keccak256(abi.encode(tokens[i]))] -= amount;
        }
        _setRule(ruleHash, rule);
        emit CollateralReduced(ruleHash, amounts);
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions)
        external
        nonReentrant
        onlyOwner
        returns (bytes32)
    {
        bytes32 ruleHash = getRuleHash(triggers, actions, address(this));
        require(!rules.contains(ruleHash), "RC: Duplicate Rule");
        Rule memory newRule;
        require(actions.length > 0); // has to do something, else is a waste!

        newRule.triggers = new Trigger[](triggers.length);
        for (uint256 i = 0; i < triggers.length; i++) {
            require(ITrigger(triggers[i].callee).validate(triggers[i]), "RC: Invalid Trigger");
            newRule.triggers[i] = triggers[i];
        }

        newRule.actions = new Action[](actions.length);
        for (uint256 i = 0; i < actions.length; i++) {
            require(IAction(actions[i].callee).validate(actions[i]), "RC: Invalid Action");

            if (i != actions.length - 1) {
                Token[] memory inputTokens = actions[i + 1].inputTokens;
                Token[] memory outputTokens = actions[i].outputTokens;
                for (uint256 j = 0; j < outputTokens.length; j++) {
                    require(outputTokens[j].equals(inputTokens[j]), "RC: Invalid inputTokens->outputTokens");
                }
            }
            newRule.actions[i] = actions[i];
        }

        newRule.status = RuleStatus.INACTIVE;

        newRule.collaterals = new uint256[](actions[0].inputTokens.length);

        _setRule(ruleHash, newRule);

        totalNumOutputTokens += actions[actions.length - 1].outputTokens.length;

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
    function _setRuleStatus(bytes32 ruleHash, RuleStatus newStatus) private returns (Rule memory) {
        Rule memory rule = getRule(ruleHash);

        if (newStatus == RuleStatus.ACTIVE) {
            require(rule.status == RuleStatus.INACTIVE, "RC: Can't Activate");
            emit Activated(ruleHash);
        } else if (newStatus == RuleStatus.INACTIVE) {
            require(rule.status == RuleStatus.ACTIVE, "RC: Can't Deactivate");
            emit Deactivated(ruleHash);
        } else if (newStatus == RuleStatus.EXECUTED) {
            require(rule.status == RuleStatus.ACTIVE, "RC: !Activated");
            emit Executed(ruleHash, msg.sender);
        } else if (newStatus == RuleStatus.REDEEMED) {
            require(rule.status == RuleStatus.EXECUTED, "RC: !pendingRedemption");
            emit Redeemed(ruleHash);
        } else {
            revert("RC: RuleStatus not covered!");
        }

        rule.status = newStatus;

        _setRule(ruleHash, rule);

        return rule;
    }

    function activateRule(bytes32 ruleHash) external onlyOwner {
        _setRuleStatus(ruleHash, RuleStatus.ACTIVE);
        botFrontend.startTask(ruleHash);
    }

    function deactivateRule(bytes32 ruleHash) external onlyOwner {
        _setRuleStatus(ruleHash, RuleStatus.INACTIVE);
        botFrontend.stopTask(ruleHash);
    }

    function getRuleHash(Trigger[] calldata triggers, Action[] calldata actions, address fund) public pure returns (bytes32) {
        return keccak256(abi.encode(triggers, actions, fund));
    }

    function _checkTriggers(Trigger[] memory triggers) internal view returns (bool, TriggerReturn[] memory) {
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
        (valid, ) = _checkTriggers(getRule(ruleHash).triggers);
    }

    function _takeAction(Action memory action, ActionRuntimeParams memory runtimeParams)
        private
        returns (uint256[] memory)
    {
        for (uint256 j = 0; j < action.inputTokens.length; j++) {
            // ignore return value
            action.inputTokens[j].approve(action.callee, runtimeParams.collaterals[j]);
            tokensOnHold[keccak256(abi.encode(action.inputTokens[j]))] -= runtimeParams.collaterals[j];
        }
        bool positionsClosed;
        bytes32[] memory deletedPositionHashes;
        (positionsClosed, deletedPositionHashes) = Utils._closePosition(action, pendingPositions, actionPositionsMap);
        if (positionsClosed) {
            emit PositionsClosed(abi.encode(action), deletedPositionHashes);
        }

        ActionResponse memory response = Utils._delegatePerformAction(action, runtimeParams);

        bool positionCreated;
        bytes32 positionHash;
        (positionCreated, positionHash) = Utils._createPosition(
            response.position.nextActions,
            pendingPositions,
            actionPositionsMap
        );

        if (positionCreated) {
            bytes[] memory abiEncodedNextActions = new bytes[](response.position.nextActions.length);
            for (uint256 i = 0; i < response.position.nextActions.length; i++) {
                abiEncodedNextActions[i] = abi.encode(response.position.nextActions[i]);
            }
            emit PositionCreated(positionHash, abi.encode(action), abiEncodedNextActions);
        }

        return response.tokenOutputs;
    }

    function executeRule(bytes32 ruleHash) external nonReentrant {
        Rule memory rule = getRule(ruleHash);
        rule = _setRuleStatus(ruleHash, RuleStatus.EXECUTED); // This ensures only active rules can be executed
        (bool valid, TriggerReturn[] memory triggerReturnArr) = _checkTriggers(rule.triggers);
        require(valid, "RC: Trigger not satisfied");

        ActionRuntimeParams memory runtimeParams = ActionRuntimeParams({
            triggerReturnArr: triggerReturnArr,
            collaterals: rule.collaterals
        });

        uint256[] memory outputs;
        for (uint256 i = 0; i < rule.actions.length; i++) {
            Action memory action = rule.actions[i];
            outputs = _takeAction(action, runtimeParams);
            runtimeParams.collaterals = outputs; // changes because outputTokens of action[i-1] is inputTokens of action[i]
            _noteIdOfERC721Outputs(outputs, action.outputTokens);
        }

        rule.outputs = outputs;
        _setRule(ruleHash, rule);
        botFrontend.stopTask(ruleHash);
    }

    function hasPendingPosition() public view returns (bool) {
        return pendingPositions.length() > 0;
    }

    function actionClosesPendingPosition(Action calldata action) public view returns (bool) {
        return actionPositionsMap[keccak256(abi.encode(action))].length > 0;
    }

    function _noteIdOfERC721Outputs(uint256[] memory outputs, Token[] memory outputTokens) internal pure {
        // Even if we know which NFT contract we're going to get an output from,
        // we probably don't know the id of the token issued (determined at the point of execution)
        // so we mutate the rule.outputToken accordingly
        for (uint256 i = 0; i < outputTokens.length; i++) {
            if (outputTokens[i].isERC721()) {
                outputTokens[i].id = outputs[i];
            }
        }
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
