// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./WhitelistType.sol";

contract WhitelistService {
    modifier onlyWhitelistOwner(bytes32 wlHash) {
        require(whitelists[wlHash].owner == msg.sender);
        _;
    }

    function whitelistExists(bytes32 wlHash) public view returns (bool) {
        return whitelists[wlHash].owner != address(0);
    }

    mapping(bytes32 => Whitelist) whitelists;

    function getWhitelistHash(address creator, string calldata name) public pure returns (bytes32) {
        return keccak256(abi.encode(creator, name));
    }

    function createWhitelist(string calldata name) public returns (bytes32) {
        bytes32 wlHash = getWhitelistHash(msg.sender, name);
        require(!whitelistExists(wlHash), "Whitelist already exists!");
        Whitelist storage wl = whitelists[wlHash];
        wl.owner = msg.sender;
        wl.enabled = true;

        return wlHash;
    }

    function addToWhitelist(bytes32 wlHash, address addr) public onlyWhitelistOwner(wlHash) {
        whitelists[wlHash].whitelist[addr] = true;
    }

    function removeFromWhitelist(bytes32 wlHash, address addr) public onlyWhitelistOwner(wlHash) {
        whitelists[wlHash].whitelist[addr] = false;
    }

    function isWhitelisted(bytes32 wlHash, address addr) public view returns (bool) {
        require(whitelistExists(wlHash), "Whitelist does not exist!");
        return (!whitelists[wlHash].enabled || whitelists[wlHash].whitelist[addr]);
    }

    function disableWhitelist(bytes32 wlHash) public onlyWhitelistOwner(wlHash) {
        whitelists[wlHash].enabled = false;
    }

    function enableWhitelist(bytes32 wlHash) public onlyWhitelistOwner(wlHash) {
        whitelists[wlHash].enabled = true;
    }

    function transferWhitelistOwnership(bytes32 wlHash, address newOwner) public onlyWhitelistOwner(wlHash) {
        require(newOwner != address(0)); // since address(0) denotes whitelist doesn't exist
        whitelists[wlHash].owner = newOwner;
    }

    function getWhitelistOwner(bytes32 wlHash) public view returns (address) {
        return whitelists[wlHash].owner;
    }
}
