// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
import "../actions/IAction.sol";
import "../rules/RoboCop.sol";
import "./Fund.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BarrenWuffet is Ownable, Pausable {
    event Created(address indexed fundAddr);

    address roboCopAddr;
    address platformWallet;
    bytes32 triggerWhitelistHash;
    bytes32 actionWhitelistHash;
    address wlServiceAddr;

    constructor(
        address _roboCopAddr,
        address _platformWallet,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address _wlService
    ) {
        roboCopAddr = _roboCopAddr;
        platformWallet = _platformWallet;

        triggerWhitelistHash = _triggerWhitelistHash;
        actionWhitelistHash = _actionWhitelistHash;
        wlServiceAddr = _wlServiceAddr;
    }

    function setRoboCopAddress(address RcAddr) external onlyOwner {
        roboCopAddr = RcAddr;
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
        Fund fund = new Fund(
            name,
            msg.sender,
            constraints,
            platformWallet,
            wlServiceAddr,
            triggerWhitelistHash,
            actionWhitelistHash
        );
        emit Created(address(fund));
        return address(fund);
    }
}
