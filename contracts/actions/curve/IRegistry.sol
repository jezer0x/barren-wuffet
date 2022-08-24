// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IRegistry {
    function get_coin_indices(
        address,
        address,
        address
    )
        external
        view
        returns (
            int128,
            int128,
            bool
        );

    function get_pool_from_lp_token(address lp_token) external view returns (address);

    function get_coins(address pool) external view returns (address[8] memory);
}
