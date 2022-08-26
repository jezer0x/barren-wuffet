// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ISubscription {
    event Deposit(address subscriber, uint256 subIdx, address token, uint256 balance);
    event Withdraw(address subscriber, uint256 subIdx, address token, uint256 balance);

    function deposit(address collateralToken, uint256 collateralAmount) external payable returns (uint256);

    function withdraw(uint256 subscriptionIdx) external returns (address[] memory, uint256[] memory);
}
