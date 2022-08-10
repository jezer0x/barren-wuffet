// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ISubscription {
    event Deposit(bytes32 indexed hash, uint256 subIdx, address token, uint256 balance);
    event Withdraw(bytes32 indexed hash, uint256 subIdx, address token, uint256 balance);

    function deposit(
        bytes32 hash,
        address collateralToken,
        uint256 collateralAmount
    ) external payable returns (uint256);

    function withdraw(bytes32 hash, uint256 subscriptionIdx) external returns (address, uint256);
}
