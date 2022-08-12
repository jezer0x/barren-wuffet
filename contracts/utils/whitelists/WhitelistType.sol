// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct Whitelist {
    address owner;
    bool disabled;
    mapping(address => bool) whitelist;
}
