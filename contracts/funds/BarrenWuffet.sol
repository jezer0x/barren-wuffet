// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
import "../actions/IAction.sol";
import "../trades/DegenStreet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BarrenWuffet is ISubscription, IAssetIO, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event Created(bytes32 indexed fundHash);
    event Closed(bytes32 indexed fundHash);

    struct Position {
        bytes32 tradeHash;
        uint256 subIdx;
    }

    struct Fund {
        bytes32 fundHash;
        address manager;
        string name;
        FundStatus status;
        SubscriptionConstraints constraints;
        Subscription[] subscriptions;
        address[] assets; // tracking all the assets this fund has atm
        mapping(address => uint256) balances; // tracking balances of assets
        Position[] openPositions;
        uint256 totalCollateral;
        bool closed;
    }

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
    DegenStreet degenStreet;

    constructor(address payable TmAddr) {
        degenStreet = DegenStreet(TmAddr);
    }

    function setTradeManangerAddress(address payable TmAddr) external onlyOwner {
        degenStreet = DegenStreet(TmAddr);
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

    function getInputToken(bytes32 fundHash) external view fundExists(fundHash) returns (address) {
        return REConstants.ETH;
    }

    function getOutputToken(bytes32) external pure returns (address) {
        revert("Undefined: Funds may have multiple output tokens, determined only after it's closed.");
    }

    function closeFund(bytes32 fundHash) external nonReentrant whenNotPaused {
        if (getStatus(fundHash) == FundStatus.CLOSABLE) {
            _closeFund(fundHash);
        } else if (funds[fundHash].manager == msg.sender) {
            // closed prematurely by barrenWuffet (so that people can withdraw their capital)
            _closeFund(fundHash);
            // TODO: block rewards since closed before fund.lockin
        }
    }

    function _closeFund(bytes32 fundHash) internal {
        Fund storage fund = funds[fundHash];
        fund.closed = true;

        for (uint256 i = 0; i < fund.openPositions.length; i++) {
            _closePosition(fundHash, i);
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
        onlyDeployedFund(fundHash)
        onlyFundManager(fundHash)
        whenNotPaused
        nonReentrant
        returns (uint256 output)
    {
        Fund storage fund = funds[fundHash];
        _decreaseAssetBalance(fund, action.inputToken, runtimeParams.totalCollateralAmount);
        if (action.inputToken != REConstants.ETH) {
            IERC20(action.inputToken).safeApprove(action.callee, runtimeParams.totalCollateralAmount);
            output = IAction(action.callee).perform(action, runtimeParams);
        } else {
            output = IAction(action.callee).perform{value: runtimeParams.totalCollateralAmount}(action, runtimeParams);
        }
        _increaseAssetBalance(fund, action.outputToken, output);
    }

    function openPosition(
        bytes32 fundHash,
        bytes32 tradeHash,
        uint256 amount
    ) external onlyDeployedFund(fundHash) onlyFundManager(fundHash) whenNotPaused nonReentrant {
        Fund storage fund = funds[fundHash];

        // Assumes that the trade already exists on degenStreet to subscribe to
        // if it is a novel trade, the fundManager will have to create it with an additional TX
        address inputToken = degenStreet.getInputToken(tradeHash);
        uint256 subIdx;
        _decreaseAssetBalance(fund, inputToken, amount);
        fund.openPositions.push(Position({tradeHash: tradeHash, subIdx: subIdx}));

        if (inputToken == REConstants.ETH) {
            subIdx = degenStreet.deposit{value: amount}(tradeHash, inputToken, amount);
        } else {
            IERC20(inputToken).safeApprove(address(degenStreet), amount);
            subIdx = degenStreet.deposit(tradeHash, inputToken, amount);
        }
    }

    function closePosition(bytes32 fundHash, uint256 openPositionIdx)
        external
        whenNotPaused
        nonReentrant
        onlyFundManager(fundHash)
    {
        _closePosition(fundHash, openPositionIdx);
    }

    function _closePosition(bytes32 fundHash, uint256 openPositionIdx) private {
        Fund storage fund = funds[fundHash];
        // Following line should blow up if openPosIdx does not exist
        Position storage position = fund.openPositions[openPositionIdx];
        bytes32 tradeHash = position.tradeHash;
        uint256 subIdx = position.subIdx;
        (address[] memory tokens, uint256[] memory amounts) = degenStreet.withdraw(tradeHash, subIdx);
        _removeOpenPosition(fund, openPositionIdx);
        _increaseAssetBalance(fund, tokens[0], amounts[0]);
    }

    function _removeOpenPosition(Fund storage fund, uint256 openPositionIdx) private {
        fund.openPositions[openPositionIdx] = fund.openPositions[fund.openPositions.length - 1];
        fund.openPositions.pop();
    }

    function _increaseAssetBalance(
        Fund storage fund,
        address token,
        uint256 amount
    ) private {
        if (fund.balances[token] == 0) {
            fund.balances[token] = amount;
            fund.assets.push(token);
        } else {
            fund.balances[token] += amount;
        }
    }

    function _decreaseAssetBalance(
        Fund storage fund,
        address token,
        uint256 amount
    ) private {
        fund.balances[token] -= amount;

        // TODO: could be made more efficient if we kept token => idx in storage
        if (fund.balances[token] == 0) {
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
        _increaseAssetBalance(fund, collateralToken, collateralAmount);
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
        return (fund.subscriptions[subscriptionIdx].collateralAmount * fund.balances[token]) / fund.totalCollateral;
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
            _decreaseAssetBalance(fund, REConstants.ETH, subscription.collateralAmount);
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
