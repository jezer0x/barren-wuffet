// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./TokenLib.sol";

library AssetTracker {
    using TokenLib for Token;

    struct Assets {
        Token[] tokens; // tracking all the assets this fund has atm
        mapping(address => uint256) coinBalances; // tracking balances of ERC20 and ETH
        mapping(address => uint256) NftIdx; // tracking ids of NFTs
    }

    function increaseAsset(
        Assets storage assets,
        Token memory token,
        uint256 amount
    ) public {
        if (token.t == TokenType.ERC721) {
            assets.NftIdx[token.addr] = amount;
            assets.tokens.push(token);
        } else if (token.t == TokenType.ERC20 || token.t == TokenType.NATIVE) {
            if (assets.coinBalances[token.addr] == 0) {
                assets.coinBalances[token.addr] = amount;
                assets.tokens.push(token);
            } else {
                assets.coinBalances[token.addr] += amount;
            }
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }

    function decreaseAsset(
        Assets storage assets,
        Token memory token,
        uint256 amount
    ) public {
        if (token.t == TokenType.ERC721) {
            delete assets.NftIdx[token.addr];
            removeFromAssets(assets, token);
        } else if (token.t == TokenType.ERC20 || token.t == TokenType.NATIVE) {
            require(assets.coinBalances[token.addr] >= amount);
            assets.coinBalances[token.addr] -= amount;
            // TODO: could be made more efficient if we kept token => idx in storage
            if (assets.coinBalances[token.addr] == 0) {
                removeFromAssets(assets, token);
            }
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }

    function removeFromAssets(Assets storage assets, Token memory token) public {
        for (uint256 i = 0; i < assets.tokens.length; i++) {
            if (assets.tokens[i].equals(token)) {
                assets.tokens[i] = assets.tokens[assets.tokens.length - 1];
                assets.tokens.pop();
                break;
            }
        }
    }
}
