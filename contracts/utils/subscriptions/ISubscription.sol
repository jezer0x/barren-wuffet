// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../Token.sol";

interface ISubscription {
    event Deposit(address subscriber, uint256 subIdx, address token, uint256 balance);
    event Withdraw(address subscriber, uint256 subIdx, address token, uint256 balance);

    function deposit(Token memory collateralToken, uint256 collateralAmount) external payable returns (uint256);

    function withdraw(uint256 subscriptionIdx) external returns (Token[] memory, uint256[] memory);
}
