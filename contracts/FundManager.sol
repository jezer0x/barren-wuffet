// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ISubscription.sol";
import "./REConstants.sol";
import "./Utils.sol";

contract FundManager is ISubscription {
    event FundCreated(bytes32 indexed fundHash);

    struct Fund {
        bytes32 fundHash;
        address manager;
        string name;
        FundStatus status;
        SubscriptionConstraints constraints;
        Subscription[] subscriptions;
        mapping(address => uint256) assets;
    }

    enum FundStatus {
        RAISING,
        INPROGRESS,
        CLOSED
    }

    mapping(bytes32 => Fund) funds;

    modifier onlyActiveSubscriber(bytes32 fundHash, uint256 subscriptionIdx) {
        require(funds[fundHash].subscriptions[subscriptionIdx].subscriber == msg.sender, "You're not the subscriber!");
        require(
            funds[fundHash].subscriptions[subscriptionIdx].status == SubscriptionStatus.ACTIVE,
            "This subscription is not active!"
        );
        _;
    }

    modifier fundExists(bytes32 fundHash) {
        require(funds[fundHash].manager != address(0));
        _;
    }

    function hashFund(address manager, string memory name) public pure returns (bytes32) {
        return keccak256(abi.encode(manager, name));
    }

    function createFund(string calldata name, SubscriptionConstraints calldata constraints) public returns (bytes32) {
        bytes32 fundHash = hashFund(msg.sender, name);
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

    function subscribe(
        bytes32 fundHash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable fundExists(fundHash) returns (uint256) {
        // For now we'll only allow subscribing with ETH
        require(collateralToken == REConstants.ETH);
        require(collateralAmount == msg.value);
        Fund storage fund = funds[fundHash];

        Subscription storage newSub = fund.subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = SubscriptionStatus.ACTIVE;
        // TODO: take a fee here
        newSub.collateralAmount = collateralAmount;
        fund.assets[collateralToken] += collateralAmount;

        emit Subscribed(fundHash, fund.subscriptions.length - 1);
        return fund.subscriptions.length - 1;
    }

    function unsubscribe(bytes32 fundHash, uint256 subscriptionIdx)
        external
        fundExists(fundHash)
        onlyActiveSubscriber(fundHash, subscriptionIdx)
    {
        Fund storage fund = funds[fundHash];
        Subscription storage subscription = fund.subscriptions[subscriptionIdx];
        fund.assets[REConstants.ETH] -= subscription.collateralAmount;
        subscription.status = SubscriptionStatus.CANCELLED;
        Utils._send(subscription.subscriber, subscription.collateralAmount, REConstants.ETH);
        emit Unsubscribed(fundHash, subscriptionIdx);
    }

    function redeemSubscriptionCollateral(bytes32 fundHash, uint256 subscriptionIdx)
        external
        fundExists(fundHash)
        onlyActiveSubscriber(fundHash, subscriptionIdx)
    {
        // TODO;
    }

    function redeemSubscriptionOutput(bytes32 fundHash, uint256 subscriptionIdx)
        external
        fundExists(fundHash)
        onlyActiveSubscriber(fundHash, subscriptionIdx)
    {}
}
