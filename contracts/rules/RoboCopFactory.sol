// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IRoboCop.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/**
 * Allows anyone to create their own copy of RoboCop using Clone
 * without using a BarrenWuffet. The Factory doesnt control the RC instances,
 * but it's impl address can be changed.
 * */
contract RoboCopFactory is Ownable {
    event Created(address indexed roboCopAddr);
    bytes32 triggerWhitelistHash;
    bytes32 actionWhitelistHash;
    address wlServiceAddr;
    address roboCopImplAddr;

    constructor(
        address _roboCopImplAddr,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash
    ) {
        configure(_roboCopImplAddr, _wlServiceAddr, _triggerWhitelistHash, _actionWhitelistHash);
    }

    function configure(
        address _roboCopImplAddr,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash
    ) public onlyOwner {
        triggerWhitelistHash = _triggerWhitelistHash;
        actionWhitelistHash = _actionWhitelistHash;
        wlServiceAddr = _wlServiceAddr;
        roboCopImplAddr = _roboCopImplAddr;
    }

    function createRoboCop() external {
        IRoboCop roboCop = IRoboCop(Clones.clone(roboCopImplAddr));
        roboCop.initialize(wlServiceAddr, triggerWhitelistHash, actionWhitelistHash);
        emit Created(address(roboCop));
    }
}
