// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
import "../utils/FeeParams.sol";
import "../actions/IAction.sol";
import "../rules/IRoboCop.sol";
import "./IFund.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../utils/whitelists/WhitelistService.sol";
import "../utils/assets/AssetTracker.sol";

contract Fund is IFund, ReentrancyGuard, IERC721Receiver, Initializable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using AssetTracker for AssetTracker.Assets;
    using Subscriptions for Subscriptions.SubStuff;
    using TokenLib for Token;

    // unique identifier for fund
    string name;
    address manager;

    Subscriptions.SubStuff subStuff;

    bool public degenMode; // if true, then ignore declaredTokens and let traders trade whatever token

    // vars the fund needs to know
    IRoboCop public roboCop; // roboCop dedicated to this fund
    FeeParams feeParams;
    WhitelistService public wlService;
    bytes32 triggerWhitelistHash;
    bytes32 actionWhitelistHash;

    // fund state that is modified over time
    AssetTracker.Assets assets;

    bytes32[] openRules; // tracking all rules that the fund created but did not complete
    mapping(bytes32 => bytes32[]) public actionPositionsMap;
    EnumerableSet.Bytes32Set private pendingPositions;
    bool closed;

    // disable calling initialize() on the implementation contract
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory _name,
        address _manager,
        Subscriptions.Constraints memory _constraints,
        FeeParams calldata _feeParams,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address roboCopImplementationAddr,
        address[] calldata _declaredTokenAddrs
    ) external nonReentrant initializer {
        name = _name;
        manager = _manager;

        // For now we'll only allow subscribing with ETH
        require(_constraints.allowedDepositToken.equals(Token({t: TokenType.NATIVE, addr: Constants.ETH})));
        subStuff.setConstraints(_constraints);
        subStuff.setSubscriptionFeeParams(
            _feeParams.subscriberToManagerFeePercentage,
            _feeParams.subscriberToPlatformFeePercentage,
            _feeParams.platformFeeWallet
        );
        feeParams = _feeParams;

        if (_declaredTokenAddrs.length == 0) {
            degenMode = true;
        } else {
            bytes32 declaredTokenAddrWlHash = wlService.createWhitelist(_name);
            for (uint256 i = 0; i < _declaredTokenAddrs.length; i++) {
                wlService.addToWhitelist(declaredTokenAddrWlHash, _declaredTokenAddrs[i]);
            }
        }

        // same action whitelist as RoboCop
        wlService = WhitelistService(_wlServiceAddr);
        triggerWhitelistHash = _triggerWhitelistHash;
        actionWhitelistHash = _actionWhitelistHash;

        roboCop = IRoboCop(Clones.clone(roboCopImplementationAddr));
        roboCop.initialize(address(this));
    }

    function _onlyDeclaredTokens(Token[] memory tokens) internal view returns (bool) {
        if (degenMode) return true;
        else {
            for (uint256 i = 0; i < tokens.length; i++) {
                if (!wlService.isWhitelisted(wlService.getWhitelistHash(address(this), name), tokens[i].addr)) {
                    return false;
                }
            }
        }
        return true;
    }

    modifier onlyActiveSubscriber(uint256 subscriptionIdx) {
        require(
            subStuff.subscriptions[subscriptionIdx].subscriber == msg.sender &&
                subStuff.subscriptions[subscriptionIdx].status == Subscriptions.Status.ACTIVE,
            "Not Active Subscriber"
        );
        _;
    }

    modifier onlyFundManager() {
        require(manager == msg.sender);
        _;
    }

    modifier onlyDeployedFund() {
        require(getStatus() == FundStatus.DEPLOYED, "Not Deployed");
        _;
    }

    function getInputTokens() external pure returns (Token[] memory) {
        Token[] memory tokens = new Token[](1);
        tokens[0] = Token({t: TokenType.NATIVE, addr: Constants.ETH});
        return tokens;
    }

    function getOutputTokens() external pure returns (Token[] memory) {
        revert("Undefined");
    }

    function closeFund() external nonReentrant {
        require(!hasPendingPosition(), "pending positions");

        if (getStatus() == FundStatus.CLOSABLE) {
            // anyone can call if closable
            if (subStuff.totalCollateral < subStuff.constraints.minCollateralTotal) {
                // never reached minCollateral, no managementFee
                subStuff.subscriberToManagerFeePercentage = 0;
            }
        } else {
            require(manager == msg.sender, "onlyFundManager");
            // closed prematurely (so that people can withdraw their capital)
            // no managementFee since did not see through lockin
            subStuff.subscriberToManagerFeePercentage = 0;
        }

        _closeFund();
    }

    function _closeFund() internal {
        closed = true;

        // TODO: this is potentially broken after the position stuff
        for (uint256 i = 0; i < openRules.length; i++) {
            bytes32 ruleHash = openRules[i];
            Rule memory rule = roboCop.getRule(ruleHash);

            if (rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE) {
                _cancelRule(i);
            } else if (rule.status == RuleStatus.EXECUTED) {
                _redeemRuleOutput(i);
            }
        }

        for (uint256 i = 0; i < openRules.length; i++) {
            _removeOpenRuleIdx(i);
        }

        // TODO: potentially swap back all assets to 1 terminal asset
        // How?

        emit Closed(address(this));
    }

    function _validateAndTakeFees(
        Token[] calldata tokens,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) internal {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i].t == TokenType.ERC20 || tokens[i].t == TokenType.NATIVE) {
                require(fees[i] >= ((collaterals[i] * feeParams.managerToPlatformFeePercentage) / 100_00));
                tokens[i].send(feeParams.platformFeeWallet, fees[i]);
            }
        }
    }

    function takeAction(
        Action calldata action,
        ActionRuntimeParams calldata runtimeParams,
        uint256[] calldata fees
    ) public nonReentrant onlyDeployedFund onlyFundManager returns (ActionResponse memory) {
        return _takeAction(action, runtimeParams, fees);
    }

    function takeActionToClosePosition(
        Action calldata action,
        ActionRuntimeParams calldata runtimeParams,
        uint256[] calldata fees
    ) public nonReentrant onlyDeployedFund returns (ActionResponse memory resp) {
        require(actionPositionsMap[keccak256(abi.encode(action))].length > 0);
        resp = _takeAction(action, runtimeParams, fees);
        require(resp.position.nextActions.length == 0);
    }

    function _takeAction(
        Action calldata action,
        ActionRuntimeParams calldata runtimeParams,
        uint256[] calldata fees
    ) internal returns (ActionResponse memory resp) {
        require(wlService.isWhitelisted(actionWhitelistHash, action.callee), "Unauthorized Action");
        require(_onlyDeclaredTokens(action.outputTokens), "Unauthorized Token");
        IAction(action.callee).validate(action);
        _validateAndTakeFees(action.inputTokens, runtimeParams.collaterals, fees);

        bool positionsClosed;
        bytes32[] memory deletedPositionHashes;
        (positionsClosed, deletedPositionHashes) = Utils._closePosition(action, pendingPositions, actionPositionsMap);
        if (positionsClosed) {
            emit PositionsClosed(action, deletedPositionHashes);
        }

        uint256 ethCollateral = 0;
        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            Token memory token = action.inputTokens[i];
            // TODO: take managerToPlatformFeePercentage from collaterals[i] here; what about NFT?
            uint256 amount = runtimeParams.collaterals[i];
            assets.decreaseAsset(token, amount);
            // only 1 of these tokens should be ETH, so we can just overwrite
            ethCollateral = token.approve(action.callee, amount);
        }

        resp = Utils._delegatePerformAction(action, runtimeParams);

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            assets.increaseAsset(action.outputTokens[i], resp.tokenOutputs[i]);
        }

        bool positionCreated;
        bytes32 positionHash;
        (positionCreated, positionHash) = Utils._createPosition(
            action,
            resp.position.nextActions,
            pendingPositions,
            actionPositionsMap
        );
        if (positionCreated) {
            emit PositionCreated(positionHash, action, resp.position.nextActions);
        }

        emit Executed(abi.encode(action));
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions)
        external
        nonReentrant
        onlyDeployedFund
        onlyFundManager
        returns (bytes32)
    {
        return _createRule(triggers, actions);
    }

    function createRuleToClosePosition(Action calldata action)
        external
        nonReentrant
        onlyDeployedFund
        returns (bytes32)
    {
        require(block.timestamp >= subStuff.constraints.lockin); // fund expired
        require(roboCop.actionClosesPendingPosition(action)); // but positions are still open that can be closed by this

        Trigger[] memory noTriggers; // should be immediately executable
        Action[] memory actions = new Action[](1);
        actions[0] = action;
        return _createRule(noTriggers, actions);
    }

    function _createRule(Trigger[] memory triggers, Action[] memory actions) internal returns (bytes32 ruleHash) {
        for (uint256 i = 0; i < triggers.length; i++) {
            require(wlService.isWhitelisted(triggerWhitelistHash, triggers[i].callee), "Unauthorized Trigger");
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(wlService.isWhitelisted(actionWhitelistHash, actions[i].callee), "Unauthorized Action");
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(_onlyDeclaredTokens(actions[i].outputTokens), "Unauthorized Token");
        }
        ruleHash = roboCop.createRule(triggers, actions);
        openRules.push(ruleHash);
    }

    function increaseRuleIncentive(uint256 openRuleIdx, uint256 amount)
        external
        onlyDeployedFund
        onlyFundManager
        nonReentrant
    {
        assets.decreaseAsset(Token({t: TokenType.NATIVE, addr: Constants.ETH}), amount);
        roboCop.increaseIncentive{value: amount}(openRules[openRuleIdx]);
    }

    function withdrawRuleIncentive(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager nonReentrant {
        assets.decreaseAsset(
            Token({t: TokenType.NATIVE, addr: Constants.ETH}),
            roboCop.withdrawIncentive(openRules[openRuleIdx])
        );
    }

    function activateRule(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager nonReentrant {
        roboCop.activateRule(openRules[openRuleIdx]);
    }

    function deactivateRule(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager nonReentrant {
        roboCop.deactivateRule(openRules[openRuleIdx]);
    }

    function addRuleCollateral(
        uint256 openRuleIdx,
        Token[] calldata collateralTokens,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) external onlyDeployedFund onlyFundManager nonReentrant {
        _validateAndTakeFees(collateralTokens, collaterals, fees);
        uint256 ethCollateral = 0;

        for (uint256 i = 0; i < collateralTokens.length; i++) {
            Token memory token = collateralTokens[i];
            uint256 amount = collaterals[i];
            assets.decreaseAsset(token, amount);
            ethCollateral = token.approve(address(roboCop), amount);
        }

        roboCop.addCollateral{value: ethCollateral}(openRules[openRuleIdx], collaterals);
    }

    function reduceRuleCollateral(uint256 openRuleIdx, uint256[] calldata collaterals)
        external
        onlyDeployedFund
        onlyFundManager
        nonReentrant
    {
        _reduceRuleCollateral(openRuleIdx, collaterals);
    }

    function _reduceRuleCollateral(uint256 openRuleIdx, uint256[] memory collaterals) internal {
        bytes32 ruleHash = openRules[openRuleIdx];
        Token[] memory inputTokens = roboCop.getInputTokens(ruleHash);
        roboCop.reduceCollateral(ruleHash, collaterals);

        for (uint256 i = 0; i < inputTokens.length; i++) {
            assets.increaseAsset(inputTokens[i], collaterals[i]);
        }
    }

    function cancelRule(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager nonReentrant {
        _cancelRule(openRuleIdx);
        _removeOpenRuleIdx(openRuleIdx);
    }

    function _cancelRule(uint256 openRuleIdx) internal {
        bytes32 ruleHash = openRules[openRuleIdx];
        Rule memory rule = roboCop.getRule(ruleHash);
        if (rule.status != RuleStatus.INACTIVE) {
            roboCop.deactivateRule(ruleHash);
        }
        _reduceRuleCollateral(openRuleIdx, rule.collaterals);
    }

    function redeemRuleOutput(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager nonReentrant {
        _redeemRuleOutput(openRuleIdx);
        _removeOpenRuleIdx(openRuleIdx);
    }

    function _redeemRuleOutput(uint256 openRuleIdx) internal {
        bytes32 ruleHash = openRules[openRuleIdx];
        Rule memory rule = roboCop.getRule(ruleHash);
        Token[] memory outputTokens = roboCop.getOutputTokens(ruleHash);
        uint256[] memory outputs = rule.outputs;
        roboCop.redeemBalance(ruleHash);

        for (uint256 i = 0; i < outputTokens.length; i++) {
            assets.increaseAsset(outputTokens[i], outputs[i]);
        }
    }

    function _removeOpenRuleIdx(uint256 openRuleIdx) private {
        openRules[openRuleIdx] = openRules[openRules.length - 1];
        openRules.pop();
    }

    function deposit(Token memory collateralToken, uint256 amountSent) external payable returns (uint256 idx) {
        require(getStatus() == FundStatus.RAISING, "Not Raising");
        idx = subStuff.deposit(assets, collateralToken, amountSent);
        emit Deposit(msg.sender, idx, collateralToken.addr, subStuff.subscriptions[idx].collateralAmount);
    }

    function getStatus() public view returns (FundStatus) {
        if (closed) {
            return FundStatus.CLOSED;
        } else {
            // not closed yet
            if (block.timestamp < subStuff.constraints.deadline) {
                return FundStatus.RAISING;
            } else {
                // reached raising deadline
                if (subStuff.totalCollateral < subStuff.constraints.minCollateralTotal) {
                    return FundStatus.CLOSABLE;
                } else {
                    // raised enough to deploy
                    if (block.timestamp < subStuff.constraints.lockin) {
                        return FundStatus.DEPLOYED;
                    } else {
                        // lockin exceeded
                        if (!hasPendingPosition()) {
                            return FundStatus.CLOSABLE;
                        } else {
                            // positions still open
                            return FundStatus.DEPLOYED;
                        }
                    }
                }
            }
        }
    }

    function withdraw(uint256 subscriptionIdx)
        external
        nonReentrant
        onlyActiveSubscriber(subscriptionIdx)
        returns (Token[] memory tokens, uint256[] memory balances)
    {
        FundStatus status = getStatus();
        if (status == FundStatus.CLOSABLE) {
            revert("Call closeFund before withdrawing!");
        } else if (status == FundStatus.RAISING) {
            emit Withdraw(
                msg.sender,
                subscriptionIdx,
                Constants.ETH,
                subStuff.subscriptions[subscriptionIdx].collateralAmount
            );
            (tokens, balances) = subStuff.withdrawCollateral(subscriptionIdx, assets);
        } else if (status == FundStatus.CLOSED) {
            (tokens, balances) = subStuff.withdrawAssets(subscriptionIdx, assets);
            for (uint256 i = 0; i < tokens.length; i++) {
                emit Withdraw(msg.sender, subscriptionIdx, tokens[i].addr, balances[i]);
            }
        } else if (status == FundStatus.DEPLOYED) {
            revert("Can't get money back from deployed fund!");
        } else {
            revert(Constants.UNREACHABLE_STATE);
        }
    }

    function withdrawManagementFee() public onlyFundManager nonReentrant returns (Token[] memory, uint256[] memory) {
        require(getStatus() == FundStatus.CLOSED, "Not Closed");

        Token[] memory tokens = new Token[](assets.tokens.length);
        uint256[] memory balances = new uint256[](assets.tokens.length);

        for (uint256 i = 0; i < assets.tokens.length; i++) {
            tokens[i] = assets.tokens[i];
            balances[i] = subStuff.getManagementFeeShare(assets, tokens[i]);
            tokens[i].send(manager, balances[i]);
        }

        return (tokens, balances);
    }

    function hasPendingPosition() public view returns (bool) {
        return pendingPositions.length() > 0 || roboCop.hasPendingPosition();
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
