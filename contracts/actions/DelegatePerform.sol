// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract DelegatePerform {
    address immutable _this;

    constructor() {
        _this = address(this);
    }

    // Ensures that function can only be called via `delegateCall` and not directly.
    modifier delegateOnly() {
        require(address(this) != _this);
        _;
    }
}
