// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct FeeParams {
    address platformFeeWallet;
    uint256 subscriberFeePercentage; // 1% = 100
    uint256 managerFeePercentage; // 1% = 100
}
