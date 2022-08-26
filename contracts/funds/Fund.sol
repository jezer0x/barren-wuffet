// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
import "../actions/IAction.sol";
import "../rules/RoboCop.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Fund is ISubscription, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event Closed(address indexed fundAddr);

    /*
    Valid transitions (to -> from): 

    RAISING -> {DEPLOYED, CLOSED (premature)}
    DEPLOYED -> {CLOSED (premature), CLOSABLE}
    CLOSABLE -> {CLOSED}
    CLOSED -> {}
    */
    enum Status {
        RAISING, // deposits possible, withdraws possible (inputToken), manager can't move funds
        DEPLOYED, // deposits not possible, withdraws not possible, manager can move funds
        CLOSABLE, // deposits not possible, withdraws not possible, manager can't move funds
        CLOSED // deposits not possible, withdraws possible (outputTokens), manager can take out rewards but not move funds
    }

    RoboCop roboCop;
    address payable platforWallet;

    string name;
    address manager;
    SubscriptionConstraints constraints;
    Status status;
    Subscription[] subscriptions;
    address[] assets; // tracking all the assets this fund has atm
    bytes32[] openRules;
    uint256 totalCollateral;
    bool closed;

    mapping(address => uint256) fundBalances; // tracking balances of assets

    constructor(
        string memory _name,
        address _manager,
        SubscriptionConstraints memory _constraints,
        address _platformWallet,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash
    ) {
        Utils._validateSubscriptionConstraintsBasic(_constraints);
        name = _name;
        constraints = _constraints;
        manager = _manager;
        platforWallet = payable(_platformWallet);
        roboCop = new RoboCop(_wlServiceAddr, _triggerWhitelistHash, _actionWhitelistHash);
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
        require(getStatus() == Status.DEPLOYED);
        _;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function getInputTokens() external pure returns (address[] memory) {
        address[] memory tokens = new address[](1);
        tokens[0] = Constants.ETH;
        return tokens;
    }

    function getOutputTokens() external pure returns (address[] memory) {
        revert("Undefined: Funds may have multiple output tokens, determined only after it's closed.");
    }

    function closeFund() external nonReentrant whenNotPaused {
        if (getStatus() == Status.CLOSABLE) {
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
        external
        onlyDeployedFund
        onlyFundManager
        whenNotPaused
        nonReentrant
        returns (uint256[] memory outputs)
    {
        uint256 ethCollateral = 0;
        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            address token = action.inputTokens[i];
            uint256 amount = runtimeParams.collateralAmounts[i];
            _decreaseAssetBalance(token, amount);
            if (token != Constants.ETH) {
                IERC20(token).safeApprove(action.callee, amount);
            } else {
                ethCollateral = amount;
            }
        }

        outputs = IAction(action.callee).perform{value: ethCollateral}(action, runtimeParams);

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            _increaseAssetBalance(action.outputTokens[i], outputs[i]);
        }
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions)
        external
        nonReentrant
        whenNotPaused
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
        nonReentrant
        whenNotPaused
        onlyDeployedFund
        onlyFundManager
    {
        _decreaseAssetBalance(Constants.ETH, amount);
        roboCop.increaseReward{value: amount}(openRules[openRuleIdx]);
    }

    function withdrawRuleReward(uint256 openRuleIdx)
        external
        nonReentrant
        whenNotPaused
        onlyDeployedFund
        onlyFundManager
    {
        _decreaseAssetBalance(Constants.ETH, roboCop.withdrawReward(openRules[openRuleIdx]));
    }

    function activateRule(uint256 openRuleIdx) external whenNotPaused nonReentrant onlyDeployedFund onlyFundManager {
        roboCop.activateRule(openRules[openRuleIdx]);
    }

    function deactivateRule(uint256 openRuleIdx) external whenNotPaused nonReentrant onlyDeployedFund onlyFundManager {
        roboCop.deactivateRule(openRules[openRuleIdx]);
    }

    function addRuleCollateral(
        uint256 openRuleIdx,
        address[] memory collateralTokens,
        uint256[] memory collateralAmounts
    ) external whenNotPaused nonReentrant onlyDeployedFund onlyFundManager {
        uint256 ethCollateral = 0;
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            address token = collateralTokens[i];
            uint256 amount = collateralAmounts[i];
            _decreaseAssetBalance(token, amount);
            if (token != Constants.ETH) {
                IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
                IERC20(token).safeApprove(address(roboCop), amount);
            } else {
                ethCollateral = amount;
            }
        }

        roboCop.addCollateral{value: ethCollateral}(openRules[openRuleIdx], collateralAmounts);
    }

    function reduceRuleCollateral(uint256 openRuleIdx, uint256[] memory collateralAmounts)
        external
        whenNotPaused
        nonReentrant
        onlyDeployedFund
        onlyFundManager
    {
        _reduceRuleCollateral(openRuleIdx, collateralAmounts);
    }

    function _reduceRuleCollateral(uint256 openRuleIdx, uint256[] memory collateralAmounts) internal {
        bytes32 ruleHash = openRules[openRuleIdx];
        address[] memory inputTokens = roboCop.getInputTokens(ruleHash);
        roboCop.reduceCollateral(ruleHash, collateralAmounts);

        for (uint256 i = 0; i < inputTokens.length; i++) {
            _increaseAssetBalance(inputTokens[i], collateralAmounts[i]);
        }
    }

    function cancelRule(uint256 openRuleIdx) external whenNotPaused nonReentrant onlyDeployedFund onlyFundManager {
        _cancelRule(openRuleIdx);
        _removeOpenRuleIdx(openRuleIdx);
    }

    function _cancelRule(uint256 openRuleIdx) internal {
        bytes32 ruleHash = openRules[openRuleIdx];
        Rule memory rule = roboCop.getRule(ruleHash);
        if (rule.status != RuleStatus.INACTIVE) {
            roboCop.deactivateRule(ruleHash);
        }
        _reduceRuleCollateral(openRuleIdx, rule.collateralAmounts);
    }

    function redeemRuleOutput(uint256 openRuleIdx)
        external
        whenNotPaused
        nonReentrant
        onlyDeployedFund
        onlyFundManager
    {
        _redeemRuleOutput(openRuleIdx);
        _removeOpenRuleIdx(openRuleIdx);
    }

    function _redeemRuleOutput(uint256 openRuleIdx) internal {
        bytes32 ruleHash = openRules[openRuleIdx];
        Rule memory rule = roboCop.getRule(ruleHash);
        address[] memory outputTokens = roboCop.getOutputTokens(ruleHash);
        uint256[] memory outputAmounts = rule.outputAmounts;
        roboCop.redeemBalance(ruleHash);

        for (uint256 i = 0; i < outputTokens.length; i++) {
            _increaseAssetBalance(outputTokens[i], outputAmounts[i]);
        }
    }

    function _removeOpenRuleIdx(uint256 openRuleIdx) private {
        openRules[openRuleIdx] = openRules[openRules.length - 1];
        openRules.pop();
    }

    function _increaseAssetBalance(address token, uint256 amount) private {
        if (fundBalances[token] == 0) {
            fundBalances[token] = amount;
            assets.push(token);
        } else {
            fundBalances[token] += amount;
        }
    }

    function _decreaseAssetBalance(address token, uint256 amount) private {
        require(fundBalances[token] >= amount);
        fundBalances[token] -= amount;

        // TODO: could be made more efficient if we kept token => idx in storage
        if (fundBalances[token] == 0) {
            for (uint256 i = 0; i < assets.length; i++) {
                if (assets[i] == token) {
                    assets[i] = assets[assets.length - 1];
                    assets.pop();
                    break;
                }
            }
        }
    }

    function _validateCollateral(address collateralToken, uint256 collateralAmount) private view {
        // For now we'll only allow subscribing with ETH
        require(collateralToken == Constants.ETH);
        require(collateralAmount == msg.value);
        require(constraints.minCollateralPerSub <= collateralAmount, "Insufficient Collateral for Subscription");
        require(constraints.maxCollateralPerSub >= collateralAmount, "Max Collateral for Subscription exceeded");
        require(
            constraints.maxCollateralTotal >= (totalCollateral + collateralAmount),
            "Max Collateral for Fund exceeded"
        );
        require(block.timestamp < constraints.deadline);
    }

    function deposit(address collateralToken, uint256 collateralAmount)
        external
        payable
        whenNotPaused
        returns (uint256)
    {
        require(getStatus() == Status.RAISING, "Fund is not raising");
        _validateCollateral(collateralToken, collateralAmount);

        Subscription storage newSub = subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;

        newSub.collateralAmount = collateralAmount;
        _increaseAssetBalance(collateralToken, collateralAmount);
        totalCollateral += collateralAmount;

        emit Deposit(msg.sender, subscriptions.length - 1, collateralToken, collateralAmount);
        return subscriptions.length - 1;
    }

    function _getShares(uint256 subscriptionIdx, address token) private view returns (uint256) {
        return (subscriptions[subscriptionIdx].collateralAmount * fundBalances[token]) / totalCollateral;
    }

    function getStatus() public view returns (Status) {
        if (closed) {
            return Status.CLOSED;
        } else if (!closed && block.timestamp >= constraints.lockin) {
            return Status.CLOSABLE;
        } else if (totalCollateral == constraints.maxCollateralTotal || block.timestamp >= constraints.deadline) {
            // Question: If it hits maxCollateralTotal, do we want to immediately go to DEPLOYED state?
            // Question: If it DOESN't hit minColalteralTotal do we go to DEPLOYED state after deadline is reached?
            return Status.DEPLOYED;
        } else if (totalCollateral < constraints.maxCollateralTotal && block.timestamp < constraints.deadline) {
            return Status.RAISING;
        } else {
            revert("This state should never be reached!");
        }
    }

    function withdraw(uint256 subscriptionIdx)
        external
        whenNotPaused
        nonReentrant
        onlyActiveSubscriber(subscriptionIdx)
        returns (address[] memory, uint256[] memory)
    {
        Subscription storage subscription = subscriptions[subscriptionIdx];

        subscription.status = SubscriptionStatus.WITHDRAWN;

        if (status == Status.CLOSABLE) {
            revert("Call closeFund before withdrawing!");
        } else if (status == Status.RAISING) {
            _decreaseAssetBalance(Constants.ETH, subscription.collateralAmount);
            subscription.status = SubscriptionStatus.WITHDRAWN;

            emit Withdraw(msg.sender, subscriptionIdx, Constants.ETH, subscription.collateralAmount);
            Utils._send(subscription.subscriber, subscription.collateralAmount, Constants.ETH);

            address[] memory tokens = new address[](1);
            tokens[0] = Constants.ETH;
            uint256[] memory balances = new uint256[](1);
            balances[0] = subscription.collateralAmount;
            return (tokens, balances);
        } else if (status == Status.CLOSED) {
            // TODO:
            // Fund manager can collect rewards by opening and closing and not doing anything with the funds.
            address[] memory tokens = new address[](assets.length);
            uint256[] memory balances = new uint256[](assets.length);

            // TODO: potentially won't need the loop anymore if closing == swap back to 1 asset
            for (uint256 i = 0; i < assets.length; i++) {
                tokens[i] = assets[i];
                balances[i] = _getShares(subscriptionIdx, assets[i]);
                // TODO: keep rewardPercentage here for barrenWuffet.
                emit Withdraw(msg.sender, subscriptionIdx, tokens[i], balances[i]);
                Utils._send(subscription.subscriber, balances[i], tokens[i]);
            }
            return (tokens, balances);
        } else if (status == Status.DEPLOYED) {
            revert("Can't get money back from deployed fund!");
        } else {
            revert("Should never reach this state!");
        }
    }

    function withdrawReward() public onlyFundManager {
        require(getStatus() == Status.CLOSED, "Fund not closed");
        // TODO: get rewards from each asset in the
        // profit share? (if yes, input asset == output asset? How to ensure?)
        // % of input instead? (don't have to tackle the problems above yet)
    }

    receive() external payable {}
}
