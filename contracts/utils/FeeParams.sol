// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

struct FeeParams {
    address platformFeeWallet;
    uint256 subscriberToPlatformFeePercentage; // 1% = 100
    uint256 managerToPlatformFeePercentage; // 1% = 100
    uint256 subscriberToManagerFeePercentage; // 1% = 100
}
