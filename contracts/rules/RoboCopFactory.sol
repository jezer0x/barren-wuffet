// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

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
    address roboCopBeaconAddr;
    address botFrontendAddr;

    constructor(address _roboCopBeaconAddr, address _botFrontendAddr) {
        configure(_roboCopBeaconAddr);
        botFrontendAddr = _botFrontendAddr;
    }

    function configure(address _roboCopBeaconAddr) public onlyOwner {
        roboCopBeaconAddr = _roboCopBeaconAddr;
    }

    function createRoboCop() external {
        IRoboCop roboCop = IRoboCop(Clones.clone(roboCopBeaconAddr));
        roboCop.initialize(msg.sender, botFrontendAddr);
        emit Created(address(roboCop));
    }
}
