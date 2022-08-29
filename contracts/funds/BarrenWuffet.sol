// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IFund.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract BarrenWuffet is Ownable, Pausable {
    event Created(address indexed fundAddr);

    address roboCopAddr;
    address platformWallet;
    bytes32 triggerWhitelistHash;
    bytes32 actionWhitelistHash;
    address wlServiceAddr;
    address roboCopImplAddr;
    address fundImplAddr;

    constructor(
        address _platformWallet,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address _wlServiceAddr,
        address _roboCopImplAddr,
        address _fundImplAddr
    ) {
        platformWallet = _platformWallet;
        triggerWhitelistHash = _triggerWhitelistHash;
        actionWhitelistHash = _actionWhitelistHash;
        wlServiceAddr = _wlServiceAddr;
        roboCopImplAddr = _roboCopImplAddr;
        fundImplAddr = _fundImplAddr;
    }

    // TODO: need setters for everything else too

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function createFund(string calldata name, SubscriptionConstraints calldata constraints)
        external
        whenNotPaused
        returns (address)
    {
        IFund fund = IFund(Clones.clone(fundImplAddr));
        fund.init(
            name,
            msg.sender,
            constraints,
            platformWallet,
            wlServiceAddr,
            triggerWhitelistHash,
            actionWhitelistHash,
            roboCopImplAddr
        );
        emit Created(address(fund));
        return address(fund);
    }
}
