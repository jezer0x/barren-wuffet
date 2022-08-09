// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ISubscription.sol";

contract FundManager is ISubscription {
    struct Fund {
        bytes32 fundHash;
        address manager;
        string name;
        address[] assets;
        uint256 balances;
        Subscription[] subscriptions;
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

    function subscribe(
        bytes32 fundHash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable fundExists(fundHash) {}

    function unsubscribe(bytes32 fundHash, uint256 subscriptionIdx) external fundExists(fundHash) {}

    function redeemSubscriptionCollateral(bytes32 fundHash, uint256 subscriptionIdx) external fundExists(fundHash) {}

    function redeemSubscriptionOutput(bytes32 fundHash, uint256 subscriptionIdx) external fundExists(fundHash) {}
}
