// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../Token.sol";

interface ISubscription {
    function deposit(Token memory collateralToken, uint256 collateralAmount) external payable returns (uint256);

    function withdraw(uint256 subscriptionIdx) external returns (Token[] memory, uint256[] memory);
}
