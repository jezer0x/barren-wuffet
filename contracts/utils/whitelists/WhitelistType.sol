// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

struct Whitelist {
    address owner;
    bool enabled;
    mapping(address => bool) whitelist;
}
