// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IPlainPool {
    function add_liquidity(uint256[] memory _amounts, uint256 _min_mint_amount) external returns (uint256);

    function remove_liquidity(uint256 _amount, uint256[] memory _min_amounts) external returns (uint256[] memory);
}

contract PlainPool {
    function _coinInPool(address token, address[8] memory tokenList) internal pure returns (bool) {
        for (uint256 i = 0; i < tokenList.length; i++) {
            if (token == tokenList[i]) {
                return true;
            }
        }
        return false;
    }
}
