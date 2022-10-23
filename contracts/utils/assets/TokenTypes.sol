// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum TokenType {
    NATIVE,
    ERC721,
    ERC20
}

struct Token {
    TokenType t;
    address addr;
    uint256 id; // only used for ERC721, else set to 0
}
