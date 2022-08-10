// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ISubscription.sol";
import "./REConstants.sol";
import "./Utils.sol";
import "./RETypes.sol";
import "./actions/IAction.sol";
import "./TradeManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FundManager is ISubscription, Ownable {
    event FundCreated(bytes32 indexed fundHash);
    event FundClosed(bytes32 indexed fundHash);

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
    }

    enum FundStatus {
        RAISING,
        DEPLOYED,
        CLOSED
    }

    mapping(bytes32 => Fund) funds;
    TradeManager tradeManager;

    constructor(address TmAddr) {
        tradeManager = TradeManager(TmAddr);
    }

    function setTradeManangerAddress(address TmAddr) external onlyOwner {
        tradeManager = TradeManager(TmAddr);
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

    function getFundHash(address manager, string memory name) public pure returns (bytes32) {
        return keccak256(abi.encode(manager, name));
    }

    function createFund(string calldata name, SubscriptionConstraints calldata constraints) external returns (bytes32) {
        bytes32 fundHash = getFundHash(msg.sender, name);
        require(funds[fundHash].manager == address(0), "Fund already exists!");
        Fund storage fund = funds[fundHash];
        fund.fundHash = fundHash;
        fund.manager = msg.sender;
        fund.name = name;
        fund.status = FundStatus.RAISING;
        fund.constraints = constraints;

        emit FundCreated(fundHash);
        return fundHash;
    }

    function closeFund(bytes32 fundHash) external onlyFundManager(fundHash) {
        Fund storage fund = funds[fundHash];
        fund.status = FundStatus.CLOSED;

        for (uint256 i = 0; i < fund.openPositions.length; i++) {
            closePosition(fundHash, i);
        }

        emit FundClosed(fundHash);
    }

    function takeAction(
        bytes32 fundHash,
        Action calldata action,
        ActionRuntimeParams calldata runtimeParams
    ) external onlyFundManager(fundHash) returns (uint256 output) {
        Fund storage fund = funds[fundHash];
        _decreaseAssetBalance(fund, action.fromToken, runtimeParams.totalCollateralAmount);
        if (action.fromToken != REConstants.ETH) {
            IERC20(action.fromToken).approve(action.callee, runtimeParams.totalCollateralAmount);
            output = IAction(action.callee).perform(action, runtimeParams);
        } else {
            output = IAction(action.callee).perform{value: runtimeParams.totalCollateralAmount}(action, runtimeParams);
        }
        _increaseAssetBalance(fund, action.toToken, output);
    }

    function openPosition(
        bytes32 fundHash,
        bytes32 tradeHash,
        uint256 amount
    ) external onlyFundManager(fundHash) {
        Fund storage fund = funds[fundHash];
        address inputToken = tradeManager.getCollateralToken(tradeHash);
        uint256 subIdx;
        if (inputToken == REConstants.ETH) {
            subIdx = tradeManager.deposit{value: amount}(tradeHash, inputToken, amount);
        } else {
            IERC20(inputToken).approve(address(tradeManager), amount);
            subIdx = tradeManager.deposit(tradeHash, inputToken, amount);
        }
        _decreaseAssetBalance(fund, inputToken, amount);
        fund.openPositions.push(Position({tradeHash: tradeHash, subIdx: subIdx}));
    }

    function closePosition(bytes32 fundHash, uint256 openPositionIdx) public onlyFundManager(fundHash) {
        Fund storage fund = funds[fundHash];
        Position storage position = fund.openPositions[openPositionIdx];
        bytes32 tradeHash = position.tradeHash;
        uint256 subIdx = position.subIdx;
        (address[] memory tokens, uint256[] memory amounts) = tradeManager.withdraw(tradeHash, subIdx);
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

    function deposit(
        bytes32 fundHash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable fundExists(fundHash) returns (uint256) {
        // For now we'll only allow subscribing with ETH
        require(collateralToken == REConstants.ETH);
        require(collateralAmount == msg.value);

        // TODO: check against all constraints here

        Fund storage fund = funds[fundHash];

        Subscription storage newSub = fund.subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        _increaseAssetBalance(fund, collateralToken, collateralAmount);

        emit Deposit(fundHash, fund.subscriptions.length - 1, collateralToken, collateralAmount);
        return fund.subscriptions.length - 1;
    }

    function _getShares(
        bytes32 fundHash,
        uint256 subscriptionIdx,
        address token
    ) private returns (uint256) {
        Fund storage fund = funds[fundHash];
        return (fund.subscriptions[subscriptionIdx].collateralAmount * fund.balances[token]) / fund.totalCollateral;
    }

    function withdraw(bytes32 fundHash, uint256 subscriptionIdx)
        external
        fundExists(fundHash)
        onlyActiveSubscriber(fundHash, subscriptionIdx)
        returns (address[] memory, uint256[] memory)
    {
        Fund storage fund = funds[fundHash];
        Subscription storage subscription = fund.subscriptions[subscriptionIdx];

        subscription.status = SubscriptionStatus.WITHDRAWN;
        address[] memory tokens;
        uint256[] memory balances;

        if (fund.status == FundStatus.RAISING) {
            _decreaseAssetBalance(fund, REConstants.ETH, subscription.collateralAmount);
            subscription.status = SubscriptionStatus.WITHDRAWN;
            tokens[0] = REConstants.ETH;
            balances[0] = subscription.collateralAmount;
            emit Withdraw(fundHash, subscriptionIdx, tokens[0], balances[0]);
            Utils._send(subscription.subscriber, balances[0], tokens[0]);
        } else if (fund.status == FundStatus.CLOSED) {
            for (uint256 i = 0; i < fund.assets.length; i++) {
                tokens[i] = fund.assets[i];
                balances[i] = _getShares(fundHash, subscriptionIdx, fund.assets[i]);
                emit Withdraw(fundHash, subscriptionIdx, tokens[i], balances[i]);
                Utils._send(subscription.subscriber, balances[i], tokens[i]);
            }
        }

        return (tokens, balances);
    }
}
