// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IFund.sol";
import "../utils/FeeParams.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

contract BarrenWuffet is Ownable, Pausable {
    // event used by frontend to pick up newly created funds
    event Created(address indexed manager, address fundAddr, string fundName);

    // event used by frontend to display manager
    event ManagerMetadata(
        address indexed walletAddr,
        string socialHandle,
        string chatroomInvite,
        string customLink,
        string aboutText,
        string strategyText
    );

    FeeParams public feeParams;

    // whitelist service passed onto Fund
    bytes32 public triggerWhitelistHash;
    bytes32 public actionWhitelistHash;
    address public wlServiceAddr;

    // singletons used for light clones later
    address public roboCopBeaconAddr;
    address public fundBeaconAddr;

    constructor(
        FeeParams memory _feeParams,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address _wlServiceAddr,
        address _roboCopBeaconAddr,
        address _fundBeaconAddr
    ) {
        setSubscriptionFeeParams(_feeParams);
        triggerWhitelistHash = _triggerWhitelistHash;
        actionWhitelistHash = _actionWhitelistHash;
        wlServiceAddr = _wlServiceAddr;
        roboCopBeaconAddr = _roboCopBeaconAddr;
        fundBeaconAddr = _fundBeaconAddr;
    }

    function setSubscriptionFeeParams(FeeParams memory _feeParams) public onlyOwner {
        require(_feeParams.subscriberToPlatformFeePercentage <= 100_00);
        require(_feeParams.managerToPlatformFeePercentage <= 100_00);
        feeParams = _feeParams;
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

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function createFund(
        string calldata name,
        Subscriptions.Constraints calldata constraints,
        uint256 subscriberToManagerFeePercentage,
        address[] calldata declaredTokens
    ) external whenNotPaused returns (address) {
        bytes memory nodata;
        IFund fund = IFund(address(new BeaconProxy(fundBeaconAddr, nodata)));

        // overwrite the default feeParams.managerToPlatformFeePercentage using the one provided
        require(subscriberToManagerFeePercentage <= 100_00);
        feeParams.subscriberToManagerFeePercentage = subscriberToManagerFeePercentage;

        fund.initialize(
            msg.sender,
            constraints,
            feeParams,
            wlServiceAddr,
            triggerWhitelistHash,
            actionWhitelistHash,
            roboCopBeaconAddr,
            declaredTokens
        );
        emit Created(msg.sender, address(fund), name);
        return address(fund);
    }

    function setManagerMetadata(
        string calldata socialHandle,
        string calldata chatroomInvite,
        string calldata customLink,
        string calldata aboutText,
        string calldata strategyText
    ) external {
        emit ManagerMetadata(msg.sender, socialHandle, chatroomInvite, customLink, aboutText, strategyText);
    }
}
