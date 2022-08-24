// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAddressProvider {
    function get_address(uint256) external view returns (address);
}

contract AddressProvider {
    IAddressProvider public address_provider;

    function _getRegistry() internal view returns (address) {
        return address_provider.get_address(0);
    }
}
