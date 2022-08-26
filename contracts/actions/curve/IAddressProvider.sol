// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAddressProvider {
    function get_address(uint256) external view returns (address);
}
