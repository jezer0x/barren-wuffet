// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum TokenType {
    NATIVE,
    NFT,
    ERC20
}

struct Token {
    TokenType t;
    address addr;
}

function equals(Token memory t1, Token memory t2) pure returns (bool) {
    return (t1.t == t2.t && t1.addr == t2.addr);
}
