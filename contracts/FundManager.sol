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

    modifier onlyActiveSubscriber(bytes32 hash, uint256 subscriptionIdx) {
        require(funds[hash].subscriptions[subscriptionIdx].subscriber == msg.sender, "You're not the subscriber!");
        require(
            funds[hash].subscriptions[subscriptionIdx].status == SubscriptionStatus.ACTIVE,
            "This subscription is not active!"
        );
        _;
    }

    function subscribe(
        bytes32 hash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable {}

    function unsubscribe(bytes32 hash, uint256 subscriptionIdx) external {}

    function redeemSubscriptionCollateral(bytes32 hash, uint256 subscriptionIdx) external {}

    function redeemSubscriptionOutput(bytes32 hash, uint256 subscriptionIdx) external {}
}
