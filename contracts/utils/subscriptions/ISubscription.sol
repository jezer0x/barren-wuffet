// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import "../assets/TokenLib.sol";

interface ISubscription {
    event Deposit(address subscriber, address token, uint256 balance);
    event Withdraw(address subscriber, address token, uint256 balance);

    function deposit(Token memory collateralToken, uint256 collateralAmount) external payable;

    function withdraw() external returns (Token[] memory, uint256[] memory);
}
