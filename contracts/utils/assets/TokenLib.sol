// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../Constants.sol";
import "./TokenTypes.sol";

library TokenLib {
    using SafeERC20 for IERC20;

    function equals(Token memory t1, Token memory t2) public pure returns (bool) {
        return (t1.t == t2.t && t1.addr == t2.addr && t1.id == t2.id);
    }

    function approve(
        Token memory token,
        address to,
        uint256 collateral
    ) public returns (uint256 ethCollateral) {
        if (token.t == TokenType.ERC20) {
            SafeERC20.safeIncreaseAllowance(IERC20(token.addr), to, collateral);
        } else if (token.t == TokenType.NATIVE) {
            ethCollateral = collateral;
        } else if (token.t == TokenType.ERC721) {
            require(token.id == collateral);
            IERC721(token.addr).approve(to, collateral);
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }

    function send(
        Token memory token,
        address receiver,
        uint256 amount
    ) public {
        if (token.t == TokenType.ERC20) {
            IERC20(token.addr).safeTransfer(receiver, amount);
        } else if (token.t == TokenType.NATIVE) {
            payable(receiver).transfer(amount);
        } else if (token.t == TokenType.ERC721) {
            require(token.id == amount);
            IERC721(token.addr).safeTransferFrom(address(this), receiver, amount);
        } else {
            revert("Wrong token type!");
        }
    }

    function balance(Token memory token) public view returns (uint256) {
        if (token.t == TokenType.ERC20) {
            return IERC20(token.addr).balanceOf(address(this));
        } else if (token.t == TokenType.NATIVE) {
            return address(this).balance;
        } else {
            revert("Wrong token type!");
        }
    }

    function take(
        Token memory token,
        address sender,
        uint256 collateral
    ) public {
        if (token.t == TokenType.ERC20) {
            IERC20(token.addr).safeTransferFrom(sender, address(this), collateral);
        } else if (token.t == TokenType.ERC721) {
            require(token.id == collateral);
            IERC721(token.addr).safeTransferFrom(sender, address(this), collateral);
        } else if (token.t != TokenType.NATIVE) {
            revert("Wrong token type!");
        }
    }
}
