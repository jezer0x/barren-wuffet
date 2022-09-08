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

contract Fund is IFund, ReentrancyGuard, IERC721Receiver, Initializable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // unique identifier for fund
    string name;
    address manager;

    // subscription stuff
    SubscriptionConstraints constraints;
    Subscription[] subscriptions;

    bool public degenMode; // if true, then ignore declaredTokens and let traders trade whatever token

    // vars the fund needs to know
    IRoboCop public roboCop; // roboCop dedicated to this fund
    FeeParams feeParams;
    WhitelistService public wlService;
    bytes32 actionWhitelistHash;

    // fund state that is modified over time
    Token[] assets; // tracking all the assets this fund has atm
    bytes32[] openRules; // tracking all rules that the fund created but did not complete
    mapping(bytes32 => bytes32[]) public actionPositionsMap;
    EnumerableSet.Bytes32Set private pendingPositions;
    uint256 totalCollateral; // tracking total ETH received from subscriptions
    bool closed;
    mapping(address => uint256) fundCoins; // tracking balances of ERC20 and ETH
    mapping(address => uint256) fundNFTs; // tracking ids of NFTs

    // disable calling initialize() on the implementation contract
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory _name,
        address _manager,
        SubscriptionConstraints memory _constraints,
        FeeParams calldata _feeParams,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address roboCopImplementationAddr,
        address[] calldata _declaredTokenAddrs
    ) external nonReentrant initializer {
        Utils._validateSubscriptionConstraintsBasic(_constraints);
        name = _name;
        constraints = _constraints;
        manager = _manager;
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
        actionWhitelistHash = _actionWhitelistHash;

        roboCop = IRoboCop(Clones.clone(roboCopImplementationAddr));
        roboCop.initialize(_wlServiceAddr, _triggerWhitelistHash, _actionWhitelistHash);
    }

    function _onlyDeclaredTokens(Token[] calldata tokens) internal view returns (bool) {
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
        require(subscriptions[subscriptionIdx].subscriber == msg.sender, "You're not the subscriber!");
        require(subscriptions[subscriptionIdx].status == SubscriptionStatus.ACTIVE, "This subscription is not active!");
        _;
    }

    modifier onlyFundManager() {
        require(manager == msg.sender);
        _;
    }

    modifier onlyDeployedFund() {
        require(getStatus() == FundStatus.DEPLOYED);
        _;
    }

    function getInputTokens() external pure returns (Token[] memory) {
        Token[] memory tokens = new Token[](1);
        tokens[0] = Token({t: TokenType.NATIVE, addr: Constants.ETH});
        return tokens;
    }

    function getOutputTokens() external pure returns (Token[] memory) {
        revert("Undefined: Funds may have multiple output tokens, determined only after it's closed.");
    }

    function closeFund() external nonReentrant {
        require(pendingPositions.length() == 0 && !roboCop.hasPendingPosition(), "Positions still pending!");
        if (getStatus() == FundStatus.CLOSABLE) {
            // anyone can call if closable
            if (totalCollateral < constraints.minCollateralTotal) {
                // never reached minCollateral, no managementFee
                constraints.managementFeePercentage = 0;
            }
        } else {
            require(manager == msg.sender, "Only the fund manager can close a fund prematurely");
            // closed prematurely (so that people can withdraw their capital)
            // no managementFee since did not see through lockin
            constraints.managementFeePercentage = 0;
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
                require(fees[i] >= ((collaterals[i] * feeParams.managerFeePercentage) / 100_00));
                Utils._send(tokens[i], feeParams.platformFeeWallet, fees[i]);
            }
        }
    }

    function takeAction(
        Action calldata action,
        ActionRuntimeParams calldata runtimeParams,
        uint256[] calldata fees
    ) public nonReentrant onlyDeployedFund onlyFundManager returns (ActionResponse memory resp) {
        require(wlService.isWhitelisted(actionWhitelistHash, action.callee), "Unauthorized Action");
        require(_onlyDeclaredTokens(action.outputTokens), "Unauthorized Token");
        IAction(action.callee).validate(action);
        _validateAndTakeFees(action.inputTokens, runtimeParams.collaterals, fees);

        Utils._closePosition(action, pendingPositions, actionPositionsMap);

        uint256 ethCollateral = 0;
        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            Token memory token = action.inputTokens[i];
            // TODO: take managerFeePercentage from collaterals[i] here; what about NFT?
            uint256 amount = runtimeParams.collaterals[i];
            _decreaseAssetBalance(token, amount);
            // only 1 of these tokens should be ETH, so we can just overwrite
            ethCollateral = approveToken(token, action.callee, amount);
        }

        resp = Utils._delegatePerformAction(action, runtimeParams);

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            _increaseAssetBalance(action.outputTokens[i], resp.tokenOutputs[i]);
        }

        Utils._createPosition(resp.position.nextActions, pendingPositions, actionPositionsMap);
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions)
        external
        nonReentrant
        onlyDeployedFund
        onlyFundManager
        returns (bytes32 ruleHash)
    {
        for (uint256 i = 0; i < actions.length; i++) {
            require(_onlyDeclaredTokens(actions[i].outputTokens), "Unauthorized Token");
        }
        // Note: Rule is created through BarrenWuffet so that BarrenWuffet is rule.owner
        ruleHash = roboCop.createRule(triggers, actions);
        openRules.push(ruleHash);
    }

    function increaseRuleIncentive(uint256 openRuleIdx, uint256 amount)
        external
        onlyDeployedFund
        onlyFundManager
        nonReentrant
    {
        _decreaseAssetBalance(Token({t: TokenType.NATIVE, addr: Constants.ETH}), amount);
        roboCop.increaseIncentive{value: amount}(openRules[openRuleIdx]);
    }

    function withdrawRuleIncentive(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager nonReentrant {
        _decreaseAssetBalance(
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
            _decreaseAssetBalance(token, amount);
            ethCollateral = approveToken(token, address(roboCop), amount);
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
            _increaseAssetBalance(inputTokens[i], collaterals[i]);
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
            _increaseAssetBalance(outputTokens[i], outputs[i]);
        }
    }

    function _removeOpenRuleIdx(uint256 openRuleIdx) private {
        openRules[openRuleIdx] = openRules[openRules.length - 1];
        openRules.pop();
    }

    function _increaseAssetBalance(Token memory token, uint256 amount) private {
        if (token.t == TokenType.ERC721) {
            fundNFTs[token.addr] = amount;
            assets.push(token);
        } else if (token.t == TokenType.ERC20 || token.t == TokenType.NATIVE) {
            if (fundCoins[token.addr] == 0) {
                fundCoins[token.addr] = amount;
                assets.push(token);
            } else {
                fundCoins[token.addr] += amount;
            }
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }

    function _decreaseAssetBalance(Token memory token, uint256 amount) private {
        if (token.t == TokenType.ERC721) {
            delete fundNFTs[token.addr];
            _removeFromAssets(token);
        } else if (token.t == TokenType.ERC20 || token.t == TokenType.NATIVE) {
            require(fundCoins[token.addr] >= amount);
            fundCoins[token.addr] -= amount;
            // TODO: could be made more efficient if we kept token => idx in storage
            if (fundCoins[token.addr] == 0) {
                _removeFromAssets(token);
            }
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }

    function _removeFromAssets(Token memory token) private {
        for (uint256 i = 0; i < assets.length; i++) {
            if (equals(assets[i], token)) {
                assets[i] = assets[assets.length - 1];
                assets.pop();
                break;
            }
        }
    }

    function _validateCollateral(Token memory collateralToken, uint256 collateralAmount) private view {
        // For now we'll only allow subscribing with ETH
        require(equals(collateralToken, Token({t: TokenType.NATIVE, addr: Constants.ETH})));
        require(collateralAmount == msg.value);
        require(constraints.minCollateralPerSub <= collateralAmount, "Insufficient Collateral for Subscription");
        require(constraints.maxCollateralPerSub >= collateralAmount, "Max Collateral for Subscription exceeded");
        require(
            constraints.maxCollateralTotal >= (totalCollateral + collateralAmount),
            "Max Collateral for Fund exceeded"
        );
        require(block.timestamp < constraints.deadline);
    }

    function deposit(Token memory collateralToken, uint256 collateralAmount) external payable returns (uint256) {
        require(getStatus() == FundStatus.RAISING, "Fund is not raising");
        _validateCollateral(collateralToken, collateralAmount);

        Subscription storage newSub = subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;

        uint256 platformFee = (collateralAmount * feeParams.subscriberFeePercentage) / 100_00;
        Utils._send(collateralToken, feeParams.platformFeeWallet, platformFee);
        uint256 remainingColalteralAmount = collateralAmount - platformFee;
        newSub.collateralAmount = remainingColalteralAmount;
        _increaseAssetBalance(collateralToken, remainingColalteralAmount);
        totalCollateral += remainingColalteralAmount;

        emit Deposit(msg.sender, subscriptions.length - 1, collateralToken.addr, remainingColalteralAmount);
        return subscriptions.length - 1;
    }

    function _getShares(uint256 subscriptionIdx, Token memory token) private view returns (uint256) {
        if (token.t == TokenType.ERC20 || token.t == TokenType.NATIVE) {
            return (subscriptions[subscriptionIdx].collateralAmount * fundCoins[token.addr]) / totalCollateral;
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }

    function getStatus() public view returns (FundStatus) {
        if (closed) {
            return FundStatus.CLOSED;
        } else {
            if (block.timestamp < constraints.deadline) {
                return FundStatus.RAISING;
            } else {
                if (block.timestamp >= constraints.lockin) {
                    return FundStatus.CLOSABLE;
                } else {
                    if (totalCollateral < constraints.minCollateralTotal) {
                        return FundStatus.CLOSABLE;
                    } else {
                        return FundStatus.DEPLOYED;
                    }
                }
            }
        }
    }

    function withdraw(uint256 subscriptionIdx)
        external
        nonReentrant
        onlyActiveSubscriber(subscriptionIdx)
        returns (Token[] memory, uint256[] memory)
    {
        Subscription storage subscription = subscriptions[subscriptionIdx];

        subscription.status = SubscriptionStatus.WITHDRAWN;

        FundStatus status = getStatus();
        if (status == FundStatus.CLOSABLE) {
            revert("Call closeFund before withdrawing!");
        } else if (status == FundStatus.RAISING) {
            _decreaseAssetBalance(Token({t: TokenType.NATIVE, addr: Constants.ETH}), subscription.collateralAmount);
            subscription.status = SubscriptionStatus.WITHDRAWN;

            emit Withdraw(msg.sender, subscriptionIdx, Constants.ETH, subscription.collateralAmount);
            Utils._send(
                Token({t: TokenType.NATIVE, addr: Constants.ETH}),
                subscription.subscriber,
                subscription.collateralAmount
            );

            Token[] memory tokens = new Token[](1);
            tokens[0] = Token({t: TokenType.NATIVE, addr: Constants.ETH});
            uint256[] memory balances = new uint256[](1);
            balances[0] = subscription.collateralAmount;
            return (tokens, balances);
        } else if (status == FundStatus.CLOSED) {
            Token[] memory tokens = new Token[](assets.length);
            uint256[] memory balances = new uint256[](assets.length);

            // TODO: potentially won't need the loop anymore if closing == swap back to 1 asset
            for (uint256 i = 0; i < assets.length; i++) {
                tokens[i] = assets[i];
                balances[i] = _getShares(subscriptionIdx, assets[i]) - _getManagementFeeShare(tokens[i]);
                emit Withdraw(msg.sender, subscriptionIdx, tokens[i].addr, balances[i]);
                Utils._send(tokens[i], subscription.subscriber, balances[i]);
            }
            return (tokens, balances);
        } else if (status == FundStatus.DEPLOYED) {
            revert("Can't get money back from deployed fund!");
        } else {
            revert(Constants.UNREACHABLE_STATE);
        }
    }

    function _getManagementFeeShare(Token memory token) internal view returns (uint256) {
        return (fundCoins[token.addr] * constraints.managementFeePercentage) / 100_00;
    }

    function withdrawManagementFee() public onlyFundManager nonReentrant returns (Token[] memory, uint256[] memory) {
        require(getStatus() == FundStatus.CLOSED, "Fund not closed");

        Token[] memory tokens = new Token[](assets.length);
        uint256[] memory balances = new uint256[](assets.length);

        if (constraints.managementFeePercentage == 0) {
            revert("No management fee for you!");
        } else {
            for (uint256 i = 0; i < assets.length; i++) {
                tokens[i] = assets[i];
                balances[i] = _getManagementFeeShare(tokens[i]);
                Utils._send(tokens[i], manager, balances[i]);
            }
            return (tokens, balances);
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
