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

contract BarrenWuffet is ISubscription, IAssetIO, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event Created(bytes32 indexed fundHash);
    event Closed(bytes32 indexed fundHash);

    struct Fund {
        bytes32 fundHash;
        address manager;
        string name;
        FundStatus status;
        SubscriptionConstraints constraints;
        Subscription[] subscriptions;
        address[] assets; // tracking all the assets this fund has atm
        bytes32[] openRules;
        uint256 totalCollateral;
        bool closed;
    }

    mapping(bytes32 => mapping(address => uint256)) fundBalances; // tracking balances of assets

    /*
    Valid transitions (to -> from): 

    RAISING -> {DEPLOYED, CLOSED (premature)}
    DEPLOYED -> {CLOSED (premature), CLOSABLE}
    CLOSABLE -> {CLOSED}
    CLOSED -> {}
    */
    enum FundStatus {
        RAISING, // deposits possible, withdraws possible (inputToken), manager can't move funds
        DEPLOYED, // deposits not possible, withdraws not possible, manager can move funds
        CLOSABLE, // deposits not possible, withdraws not possible, manager can't move funds
        CLOSED // deposits not possible, withdraws possible (outputTokens), manager can take out rewards but not move funds
    }

    mapping(bytes32 => Fund) funds;
    RoboCop roboCop;

    constructor(address payable RcAddr) {
        roboCop = RoboCop(RcAddr);
    }

    function setTradeManangerAddress(address payable RcAddr) external onlyOwner {
        roboCop = RoboCop(RcAddr);
    }

    modifier onlyActiveSubscriber(bytes32 fundHash, uint256 subscriptionIdx) {
        require(funds[fundHash].subscriptions[subscriptionIdx].subscriber == msg.sender, "You're not the subscriber!");
        require(
            funds[fundHash].subscriptions[subscriptionIdx].status == SubscriptionStatus.ACTIVE,
            "This subscription is not active!"
        );
        _;
    }

    modifier onlyFundManager(bytes32 fundHash) {
        require(funds[fundHash].manager == msg.sender);
        _;
    }

    modifier fundExists(bytes32 fundHash) {
        require(funds[fundHash].manager != address(0));
        _;
    }

    modifier onlyDeployedFund(bytes32 fundHash) {
        require(getStatus(fundHash) == FundStatus.DEPLOYED);
        _;
    }

    function getFundHash(address manager, string memory name) public pure returns (bytes32) {
        return keccak256(abi.encode(manager, name));
    }

    function getFund(bytes32 fundHash) public view fundExists(fundHash) returns (Fund memory) {
        return funds[fundHash];
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function createFund(string calldata name, SubscriptionConstraints calldata constraints)
        external
        whenNotPaused
        returns (bytes32)
    {
        bytes32 fundHash = getFundHash(msg.sender, name);
        require(funds[fundHash].manager == address(0), "Fund already exists!");
        Utils._validateSubscriptionConstraintsBasic(constraints);
        Fund storage fund = funds[fundHash];
        fund.fundHash = fundHash;
        fund.manager = msg.sender;
        fund.name = name;
        fund.constraints = constraints;

        // TODO: take a platform fee here

        emit Created(fundHash);
        return fundHash;
    }

    function getInputTokens(bytes32 fundHash) external view fundExists(fundHash) returns (address[] memory) {
        address[] memory tokens = new address[](1);
        tokens[0] = REConstants.ETH;
        return tokens;
    }

    function getOutputTokens(bytes32) external pure returns (address[] memory) {
        revert("Undefined: Funds may have multiple output tokens, determined only after it's closed.");
    }

    function closeFund(bytes32 fundHash) external nonReentrant whenNotPaused {
        if (getStatus(fundHash) == FundStatus.CLOSABLE) {
            _closeFund(fundHash);
        } else {
            require(funds[fundHash].manager == msg.sender, "Only the fund manager can close a fund prematurely");
            // closed prematurely by barrenWuffet (so that people can withdraw their capital)
            _closeFund(fundHash);
            // TODO: block rewards since closed before fund.lockin
        }
    }

    function _closeFund(bytes32 fundHash) internal {
        Fund storage fund = funds[fundHash];
        fund.closed = true;

        for (uint256 i = 0; i < fund.openRules.length; i++) {
            _closeRule(fundHash, i);
        }

        // TODO: potentially swap back all assets to 1 terminal asset
        // How?

        emit Closed(fundHash);
    }

    function takeAction(
        bytes32 fundHash,
        Action calldata action,
        ActionRuntimeParams calldata runtimeParams
    )
        external
        payable
        onlyDeployedFund(fundHash)
        onlyFundManager(fundHash)
        whenNotPaused
        nonReentrant
        returns (uint256[] memory outputs)
    {
        address token;
        uint256 amount;
        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            token = action.inputTokens[i];
            amount = runtimeParams.collateralAmounts[i];
            _decreaseAssetBalance(fundHash, token, amount);
            if (token != REConstants.ETH) {
                IERC20(token).safeApprove(action.callee, runtimeParams.collateralAmounts[i]);
            }
        }

        outputs = IAction(action.callee).perform{value: msg.value}(action, runtimeParams);

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            token = action.outputTokens[i];
            amount = outputs[i];
            _increaseAssetBalance(fundHash, token, amount);
        }
    }

    function createRule(
        bytes32 fundHash,
        Trigger[] calldata triggers,
        Action[] calldata actions
    )
        external
        payable
        nonReentrant
        whenNotPaused
        onlyDeployedFund(fundHash)
        onlyFundManager(fundHash)
        returns (bytes32 ruleHash)
    {
        // Note: Rule is created through BarrenWuffet so that BarrenWuffet is rule.owner
        ruleHash = roboCop.createRule{value: msg.value}(triggers, actions);
        funds[fundHash].openRules.push(ruleHash);
    }

    function activateRule(bytes32 fundHash, uint256 openRuleIdx)
        external
        whenNotPaused
        nonReentrant
        onlyDeployedFund(fundHash)
        onlyFundManager(fundHash)
    {
        roboCop.activateRule(funds[fundHash].openRules[openRuleIdx]);
    }

    function deactivateRule(bytes32 fundHash, uint256 openRuleIdx)
        external
        whenNotPaused
        nonReentrant
        onlyDeployedFund(fundHash)
        onlyFundManager(fundHash)
    {
        roboCop.deactivateRule(funds[fundHash].openRules[openRuleIdx]);
    }

    function addRuleCollateral(
        bytes32 fundHash,
        uint256 openRuleIdx,
        address[] memory collateralTokens,
        uint256[] memory collateralAmounts
    ) external payable whenNotPaused nonReentrant onlyDeployedFund(fundHash) onlyFundManager(fundHash) {
        Fund storage fund = funds[fundHash];

        address token;
        uint256 amount;
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            token = collateralTokens[i];
            amount = collateralAmounts[i];
            _decreaseAssetBalance(fundHash, token, amount);
            if (token != REConstants.ETH) {
                IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
                IERC20(token).safeApprove(address(roboCop), amount);
            }
        }

        roboCop.addCollateral{value: msg.value}(fund.openRules[openRuleIdx], collateralAmounts);
    }

    function reduceRuleCollateral(
        bytes32 fundHash,
        uint256 openRuleIdx,
        uint256[] memory collateralAmounts
    ) external whenNotPaused nonReentrant onlyDeployedFund(fundHash) onlyFundManager(fundHash) {
        _reduceRuleCollateral(fundHash, openRuleIdx, collateralAmounts);
    }

    function _reduceRuleCollateral(
        bytes32 fundHash,
        uint256 openRuleIdx,
        uint256[] memory collateralAmounts
    ) internal {
        Fund storage fund = funds[fundHash];
        bytes32 ruleHash = funds[fundHash].openRules[openRuleIdx];
        address[] memory inputTokens = roboCop.getInputTokens(ruleHash);
        roboCop.reduceCollateral(ruleHash, collateralAmounts);

        for (uint256 i = 0; i < inputTokens.length; i++) {
            _increaseAssetBalance(fundHash, inputTokens[i], collateralAmounts[i]);
        }
    }

    function cancelRule(bytes32 fundHash, uint256 openRuleIdx)
        public
        whenNotPaused
        nonReentrant
        onlyDeployedFund(fundHash)
        onlyFundManager(fundHash)
    {
        Fund storage fund = funds[fundHash];
        bytes32 ruleHash = funds[fundHash].openRules[openRuleIdx];
        Rule memory rule = roboCop.getRule(ruleHash);
        if (rule.status != RuleStatus.INACTIVE) {
            roboCop.deactivateRule(ruleHash);
        }
        _reduceRuleCollateral(fundHash, openRuleIdx, rule.collateralAmounts);
        _removeOpenRuleIdx(fundHash, openRuleIdx);
    }

    function redeemRuleOutput(bytes32 fundHash, uint256 openRuleIdx)
        public
        whenNotPaused
        nonReentrant
        onlyDeployedFund(fundHash)
        onlyFundManager(fundHash)
    {
        bytes32 ruleHash = funds[fundHash].openRules[openRuleIdx];
        Rule memory rule = roboCop.getRule(ruleHash);
        address[] memory outputTokens = roboCop.getOutputTokens(ruleHash);
        uint256[] memory outputAmounts = rule.outputAmounts;
        roboCop.redeemBalance(ruleHash);

        for (uint256 i = 0; i < outputTokens.length; i++) {
            _increaseAssetBalance(fundHash, outputTokens[i], outputAmounts[i]);
        }
        _removeOpenRuleIdx(fundHash, openRuleIdx);
    }

    function _closeRule(bytes32 fundHash, uint256 openRuleIdx) private {
        bytes32 ruleHash = funds[fundHash].openRules[openRuleIdx];
        Rule memory rule = roboCop.getRule(ruleHash);

        if (rule.status == RuleStatus.ACTIVE || rule.status == RuleStatus.INACTIVE) {
            cancelRule(fundHash, openRuleIdx);
        } else if (rule.status == RuleStatus.EXECUTED) {
            redeemRuleOutput(fundHash, openRuleIdx);
        }
    }

    function _removeOpenRuleIdx(bytes32 fundHash, uint256 openRuleIdx) private {
        Fund storage fund = funds[fundHash];
        fund.openRules[openRuleIdx] = fund.openRules[fund.openRules.length - 1];
        fund.openRules.pop();
    }

    function _increaseAssetBalance(
        bytes32 fundHash,
        address token,
        uint256 amount
    ) private {
        Fund storage fund = funds[fundHash];
        if (fundBalances[fundHash][token] == 0) {
            fundBalances[fundHash][token] = amount;
            fund.assets.push(token);
        } else {
            fundBalances[fundHash][token] += amount;
        }
    }

    function _decreaseAssetBalance(
        bytes32 fundHash,
        address token,
        uint256 amount
    ) private {
        Fund storage fund = funds[fundHash];

        fundBalances[fundHash][token] -= amount;

        // TODO: could be made more efficient if we kept token => idx in storage
        if (fundBalances[fundHash][token] == 0) {
            for (uint256 i = 0; i < fund.assets.length; i++) {
                if (fund.assets[i] == token) {
                    fund.assets[i] = fund.assets[fund.assets.length - 1];
                    fund.assets.pop();
                    break;
                }
            }
        }
    }

    function _validateCollateral(
        bytes32 fundHash,
        address collateralToken,
        uint256 collateralAmount
    ) private view {
        // For now we'll only allow subscribing with ETH
        require(collateralToken == REConstants.ETH);
        require(collateralAmount == msg.value);

        Fund storage fund = funds[fundHash];
        SubscriptionConstraints memory constraints = fund.constraints;
        require(constraints.minCollateralPerSub <= collateralAmount, "Insufficient Collateral for Subscription");
        require(constraints.maxCollateralPerSub >= collateralAmount, "Max Collateral for Subscription exceeded");
        require(
            constraints.maxCollateralTotal >= (fund.totalCollateral + collateralAmount),
            "Max Collateral for Fund exceeded"
        );
        require(block.timestamp < constraints.deadline);
    }

    function deposit(
        bytes32 fundHash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable fundExists(fundHash) whenNotPaused returns (uint256) {
        require(getStatus(fundHash) == FundStatus.RAISING, "Fund is not raising");
        _validateCollateral(fundHash, collateralToken, collateralAmount);

        Fund storage fund = funds[fundHash];

        Subscription storage newSub = fund.subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;

        newSub.collateralAmount = collateralAmount;
        _increaseAssetBalance(fundHash, collateralToken, collateralAmount);
        fund.totalCollateral += collateralAmount;

        emit Deposit(fundHash, fund.subscriptions.length - 1, collateralToken, collateralAmount);
        return fund.subscriptions.length - 1;
    }

    function _getShares(
        bytes32 fundHash,
        uint256 subscriptionIdx,
        address token
    ) private view returns (uint256) {
        Fund storage fund = funds[fundHash];
        return
            (fund.subscriptions[subscriptionIdx].collateralAmount * fundBalances[fundHash][token]) /
            fund.totalCollateral;
    }

    function getStatus(bytes32 fundHash) public view returns (FundStatus) {
        Fund storage fund = funds[fundHash];
        if (fund.closed) {
            return FundStatus.CLOSED;
        } else if (!fund.closed && block.timestamp >= fund.constraints.lockin) {
            return FundStatus.CLOSABLE;
        } else if (
            fund.totalCollateral == fund.constraints.maxCollateralTotal || block.timestamp >= fund.constraints.deadline
        ) {
            // Question: If it hits maxCollateralTotal, do we want to immediately go to DEPLOYED state?
            // Question: If it DOESN't hit minColalteralTotal do we go to DEPLOYED state after deadline is reached?
            return FundStatus.DEPLOYED;
        } else if (
            fund.totalCollateral < fund.constraints.maxCollateralTotal && block.timestamp < fund.constraints.deadline
        ) {
            return FundStatus.RAISING;
        } else {
            revert("This state should never be reached!");
        }
    }

    function withdraw(bytes32 fundHash, uint256 subscriptionIdx)
        external
        whenNotPaused
        nonReentrant
        fundExists(fundHash)
        onlyActiveSubscriber(fundHash, subscriptionIdx)
        returns (address[] memory, uint256[] memory)
    {
        Fund storage fund = funds[fundHash];
        Subscription storage subscription = fund.subscriptions[subscriptionIdx];
        FundStatus status = getStatus(fundHash);

        subscription.status = SubscriptionStatus.WITHDRAWN;

        if (status == FundStatus.CLOSABLE) {
            revert("Call closeFund before withdrawing!");
        } else if (status == FundStatus.RAISING) {
            _decreaseAssetBalance(fundHash, REConstants.ETH, subscription.collateralAmount);
            subscription.status = SubscriptionStatus.WITHDRAWN;

            emit Withdraw(fundHash, subscriptionIdx, REConstants.ETH, subscription.collateralAmount);
            Utils._send(subscription.subscriber, subscription.collateralAmount, REConstants.ETH);

            address[] memory tokens = new address[](1);
            tokens[0] = REConstants.ETH;
            uint256[] memory balances = new uint256[](1);
            balances[0] = subscription.collateralAmount;
            return (tokens, balances);
        } else if (status == FundStatus.CLOSED) {
            // TODO:
            // Fund manager can collect rewards by opening and closing and not doing anything with the funds.
            address[] memory tokens = new address[](fund.assets.length);
            uint256[] memory balances = new uint256[](fund.assets.length);

            // TODO: potentially won't need the loop anymore if closing == swap back to 1 asset
            for (uint256 i = 0; i < fund.assets.length; i++) {
                tokens[i] = fund.assets[i];
                balances[i] = _getShares(fundHash, subscriptionIdx, fund.assets[i]);
                // TODO: keep rewardPercentage here for barrenWuffet.
                emit Withdraw(fundHash, subscriptionIdx, tokens[i], balances[i]);
                Utils._send(subscription.subscriber, balances[i], tokens[i]);
            }
            return (tokens, balances);
        } else if (status == FundStatus.DEPLOYED) {
            revert("Can't get money back from deployed fund!");
        } else {
            revert("Should never reach this state!");
        }
    }

    function withdrawReward(bytes32 fundHash) public onlyFundManager(fundHash) {
        require(getStatus(fundHash) == FundStatus.CLOSED, "Fund not closed");
        // TODO: get rewards from each asset in the fund.
        // profit share? (if yes, input asset == output asset? How to ensure?)
        // % of input instead? (don't have to tackle the problems above yet)
    }

    receive() external payable {}
}
