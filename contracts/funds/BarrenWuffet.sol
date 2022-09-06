// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IFund.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract BarrenWuffet is Ownable, Pausable {
    // event used by frontend to pick up newly created funds
    event Created(address indexed manager, address fundAddr);

    // wallet that will receive fees
    // may be different from owner of this contract
    address public platformFeeWallet;
    uint256 platformFeePercentage;

    // whitelist service passed onto Fund
    bytes32 public triggerWhitelistHash;
    bytes32 public actionWhitelistHash;
    address public wlServiceAddr;

    // singletons used for light clones later
    address public roboCopImplAddr;
    address public fundImplAddr;

    constructor(
        address _platformFeeWallet,
        uint256 _platformFeePercentage,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address _wlServiceAddr,
        address _roboCopImplAddr,
        address _fundImplAddr
    ) {
        platformFeeWallet = _platformFeeWallet;
        setPlatformFeePercentage(_platformFeePercentage);
        triggerWhitelistHash = _triggerWhitelistHash;
        actionWhitelistHash = _actionWhitelistHash;
        wlServiceAddr = _wlServiceAddr;
        roboCopImplAddr = _roboCopImplAddr;
        fundImplAddr = _fundImplAddr;
    }

    function setPlatformFeeWallet(address _platformFeeWallet) public onlyOwner {
        platformFeeWallet = _platformFeeWallet;
    }

    function setPlatformFeePercentage(uint256 _platformFeePercentage) public onlyOwner {
        require(_platformFeePercentage < 100_00);
        platformFeePercentage = _platformFeePercentage;
    }

    function setTriggerWhitelistHash(bytes32 _triggerWhitelistHash) public onlyOwner {
        triggerWhitelistHash = _triggerWhitelistHash;
    }

    function setActionWhitelistHash(bytes32 _actionWhitelistHash) public onlyOwner {
        actionWhitelistHash = _actionWhitelistHash;
    }

    function setWhitelistServiceAddress(address _wlServiceAddr) public onlyOwner {
        wlServiceAddr = _wlServiceAddr;
    }

    function setRoboCopImplementationAddress(address _roboCopImplAddr) public onlyOwner {
        roboCopImplAddr = _roboCopImplAddr;
    }

    function setFundImplementationAddress(address _fundImplAddr) public onlyOwner {
        fundImplAddr = _fundImplAddr;
    }

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
        fund.initialize(
            name,
            msg.sender,
            constraints,
            platformFeeWallet,
            platformFeePercentage,
            wlServiceAddr,
            triggerWhitelistHash,
            actionWhitelistHash,
            roboCopImplAddr
        );
        emit Created(msg.sender, address(fund));
        return address(fund);
    }
}
