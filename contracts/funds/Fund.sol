// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
import "../actions/IAction.sol";
import "../rules/IRoboCop.sol";
import "./IFund.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract Fund is IFund, Ownable, Pausable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // Storage Start
    IRoboCop public roboCop;
    address payable platformWallet;
    string name;
    address manager;
    SubscriptionConstraints constraints;
    Subscription[] subscriptions;
    Token[] assets; // tracking all the assets this fund has atm
    bytes32[] openRules;
    mapping(bytes32 => bytes32[]) public actionPositionsMap;
    EnumerableSet.Bytes32Set private pendingPositions;
    uint256 totalCollateral;
    bool closed;
    mapping(address => uint256) fundCoins; // tracking balances of ERC20 and ETH
    mapping(address => uint256) fundNFTs; // tracking ids of NFTs

    // Storage End

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function init(
        string memory _name,
        address _manager,
        SubscriptionConstraints memory _constraints,
        address _platformWallet,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address roboCopImplementationAddr
    ) external whenNotPaused nonReentrant {
        Utils._validateSubscriptionConstraintsBasic(_constraints);
        name = _name;
        constraints = _constraints;
        manager = _manager;
        platformWallet = payable(_platformWallet);
        roboCop = IRoboCop(Clones.clone(roboCopImplementationAddr));
        roboCop.init(_wlServiceAddr, _triggerWhitelistHash, _actionWhitelistHash);
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

    function closeFund() external whenNotPaused nonReentrant {
        if (getStatus() == FundStatus.CLOSABLE) {
            _closeFund();
        } else {
            require(manager == msg.sender, "Only the fund manager can close a fund prematurely");
            // closed prematurely by barrenWuffet (so that people can withdraw their capital)
            _closeFund();
            // TODO: block rewards since closed before lockin
        }
    }

    function _closeFund() internal {
        closed = true;

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

    function takeAction(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        public
        whenNotPaused
        nonReentrant
        onlyDeployedFund
        onlyFundManager
        returns (ActionResponse memory resp)
    {
        IAction(action.callee).validate(action);
        Utils._closePosition(action, pendingPositions, actionPositionsMap);

        uint256 ethCollateral = 0;
        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            Token memory token = action.inputTokens[i];
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
        whenNotPaused
        nonReentrant
        onlyDeployedFund
        onlyFundManager
        returns (bytes32 ruleHash)
    {
        // Note: Rule is created through BarrenWuffet so that BarrenWuffet is rule.owner
        ruleHash = roboCop.createRule(triggers, actions);
        openRules.push(ruleHash);
    }

    function increaseRuleReward(uint256 openRuleIdx, uint256 amount)
        external
        onlyDeployedFund
        onlyFundManager
        whenNotPaused
        nonReentrant
    {
        _decreaseAssetBalance(Token({t: TokenType.NATIVE, addr: Constants.ETH}), amount);
        roboCop.increaseReward{value: amount}(openRules[openRuleIdx]);
    }

    function withdrawRuleReward(uint256 openRuleIdx)
        external
        onlyDeployedFund
        onlyFundManager
        whenNotPaused
        nonReentrant
    {
        _decreaseAssetBalance(
            Token({t: TokenType.NATIVE, addr: Constants.ETH}),
            roboCop.withdrawReward(openRules[openRuleIdx])
        );
    }

    function activateRule(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager whenNotPaused nonReentrant {
        roboCop.activateRule(openRules[openRuleIdx]);
    }

    function deactivateRule(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager whenNotPaused nonReentrant {
        roboCop.deactivateRule(openRules[openRuleIdx]);
    }

    function addRuleCollateral(
        uint256 openRuleIdx,
        Token[] memory collateralTokens,
        uint256[] memory collaterals
    ) external onlyDeployedFund onlyFundManager whenNotPaused nonReentrant {
        uint256 ethCollateral = 0;

        for (uint256 i = 0; i < collateralTokens.length; i++) {
            Token memory token = collateralTokens[i];
            uint256 amount = collaterals[i];
            _decreaseAssetBalance(token, amount);
            ethCollateral = approveToken(token, address(roboCop), amount);
        }

        roboCop.addCollateral{value: ethCollateral}(openRules[openRuleIdx], collaterals);
    }

    function reduceRuleCollateral(uint256 openRuleIdx, uint256[] memory collaterals)
        external
        onlyDeployedFund
        onlyFundManager
        whenNotPaused
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

    function cancelRule(uint256 openRuleIdx) external onlyDeployedFund onlyFundManager whenNotPaused nonReentrant {
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

    function redeemRuleOutput(uint256 openRuleIdx)
        external
        onlyDeployedFund
        onlyFundManager
        whenNotPaused
        nonReentrant
    {
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

    function deposit(Token memory collateralToken, uint256 collateralAmount)
        external
        payable
        whenNotPaused
        returns (uint256)
    {
        require(getStatus() == FundStatus.RAISING, "Fund is not raising");
        _validateCollateral(collateralToken, collateralAmount);

        Subscription storage newSub = subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;

        newSub.collateralAmount = collateralAmount;
        _increaseAssetBalance(collateralToken, collateralAmount);
        totalCollateral += collateralAmount;

        emit Deposit(msg.sender, subscriptions.length - 1, collateralToken.addr, collateralAmount);
        return subscriptions.length - 1;
    }

    function _getShares(uint256 subscriptionIdx, Token memory token) private view returns (uint256) {
        if (token.t == TokenType.ERC721) {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        } else if (token.t == TokenType.ERC20 || token.t == TokenType.NATIVE) {
            return (subscriptions[subscriptionIdx].collateralAmount * fundCoins[token.addr]) / totalCollateral;
        }
    }

    function getStatus() public view returns (FundStatus) {
        if (closed) {
            return FundStatus.CLOSED;
        } else if (!closed && block.timestamp >= constraints.lockin) {
            return FundStatus.CLOSABLE;
        } else if (totalCollateral == constraints.maxCollateralTotal || block.timestamp >= constraints.deadline) {
            // Question: If it hits maxCollateralTotal, do we want to immediately go to DEPLOYED state?
            // Question: If it DOESN't hit minColalteralTotal do we go to DEPLOYED state after deadline is reached?
            return FundStatus.DEPLOYED;
        } else if (totalCollateral < constraints.maxCollateralTotal && block.timestamp < constraints.deadline) {
            return FundStatus.RAISING;
        } else {
            revert(Constants.UNREACHABLE_STATE);
        }
    }

    function withdraw(uint256 subscriptionIdx)
        external
        whenNotPaused
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
            // TODO:
            // Fund manager can collect rewards by opening and closing and not doing anything with the funds.
            Token[] memory tokens = new Token[](assets.length);
            uint256[] memory balances = new uint256[](assets.length);

            // TODO: potentially won't need the loop anymore if closing == swap back to 1 asset
            for (uint256 i = 0; i < assets.length; i++) {
                tokens[i] = assets[i];
                balances[i] = _getShares(subscriptionIdx, assets[i]);
                // TODO: keep rewardPercentage here for barrenWuffet.
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

    function withdrawReward() public onlyFundManager whenNotPaused nonReentrant {
        require(getStatus() == FundStatus.CLOSED, "Fund not closed");
        // TODO: get rewards from each asset in the
        // profit share? (if yes, input asset == output asset? How to ensure?)
        // % of input instead? (don't have to tackle the problems above yet)
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
