// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../utils/Constants.sol";

enum TokenType {
    NATIVE,
    ERC721,
    ERC20
}

struct Token {
    TokenType t;
    address addr;
}

function equals(Token memory t1, Token memory t2) pure returns (bool) {
    return (t1.t == t2.t && t1.addr == t2.addr);
}

function approveToken(
    Token memory token,
    address to,
    uint256 amount
) returns (uint256 ethCollateral) {
    if (token.t == TokenType.ERC20) {
        SafeERC20.safeIncreaseAllowance(IERC20(token.addr), to, amount);
    } else if (token.t == TokenType.NATIVE) {
        ethCollateral = amount;
    } else if (token.t == TokenType.ERC721) {
        IERC721(token.addr).approve(to, amount);
    } else {
        revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
    }
}
