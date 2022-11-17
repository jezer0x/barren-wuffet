// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import "./TokenLib.sol";

library AssetTracker {
    using TokenLib for Token;

    struct Assets {
        Token[] tokens; // tracking all the assets this fund has atm
        mapping(bytes32 => uint256) balances; // tracking balances of ERC20 and ETH, ids for NFT
    }

    function increaseAsset(
        Assets storage assets,
        Token memory token,
        uint256 amount
    ) public {
        bytes32 tokenHash = keccak256(abi.encode(token));
        if (token.isERC721()) {
            assets.balances[tokenHash] = amount;
            assets.tokens.push(token);
        } else if (token.isERC20() || token.isETH()) {
            if (assets.balances[tokenHash] == 0) {
                assets.tokens.push(token);
            }
            assets.balances[tokenHash] += amount;
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }

    function decreaseAsset(
        Assets storage assets,
        Token memory token,
        uint256 amount
    ) public {
        bytes32 tokenHash = keccak256(abi.encode(token));
        if (token.isERC721()) {
            delete assets.balances[tokenHash];
            removeFromAssets(assets, token);
        } else if (token.isERC20() || token.isETH()) {
            require(assets.balances[tokenHash] >= amount, "AssetTracker: Not enough balance");
            assets.balances[tokenHash] -= amount;
            // TODO: could be made more efficient if we kept token => idx in storage
            if (assets.balances[tokenHash] == 0) {
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
