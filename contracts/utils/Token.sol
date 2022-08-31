// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum TokenType {
    NATIVE,
    NFT,
    ERC20
}

struct Token {
    TokenType tokenType;
    address tokenAddr;
}

function equals(Token memory t1, Token memory t2) pure returns (bool) {
    return (t1.tokenType == t2.tokenType && t1.tokenAddr == t2.tokenAddr);
}
