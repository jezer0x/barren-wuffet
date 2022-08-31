// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract DelegatePerform {
    address immutable _this;

    constructor() {
        _this = address(this);
    }

    modifier delegateOnly() {
        require(address(this) != _this);
        _;
    }
}
