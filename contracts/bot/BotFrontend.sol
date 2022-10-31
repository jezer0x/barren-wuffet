// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import "./IOps.sol";
import "./ITaskTreasury.sol";
import "../rules/IRoboCop.sol";
import "./OpsReady.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BotFrontend is OpsReady, Ownable {
    ITaskTreasury public immutable treasury;
    address public barrenWuffetAddr;
    mapping(address => mapping(bytes32 => bytes32)) public ruleToTaskIdMap;
    mapping(address => bool) public robocopRegistry;

    modifier onlyBarrenWuffet() {
        require(msg.sender == barrenWuffetAddr);
        _;
    }

    modifier onlyRobocop() {
        require(robocopRegistry[msg.sender]);
        _;
    }

    constructor(address _treasuryAddr, address _ops) OpsReady(_ops) {
        treasury = ITaskTreasury(_treasuryAddr);
    }

    function setBarrenWuffet(address _barrentWuffetAddr) external onlyOwner {
        barrenWuffetAddr = _barrentWuffetAddr;
    }

    function startTask(bytes32 ruleHash) external onlyRobocop {
        // TODO: check() and execute() is done through this frontend too (instead of only task registration)
        // asking gelato to check() and execute() directly on the robocops would be more efficient
        bytes32 taskId = IOps(ops).createTask(
            address(this),
            this.executeTask.selector,
            address(this),
            abi.encodeWithSelector(this.checker.selector, msg.sender, ruleHash)
        );

        ruleToTaskIdMap[msg.sender][ruleHash] = taskId;
    }

    function stopTask(bytes32 ruleHash) external {
        IOps(ops).cancelTask(ruleToTaskIdMap[msg.sender][ruleHash]);
    }

    // If roboCop is not registered by BarrentWuffet, it can't use startTask
    function registerRobocop(address robocopAddr) external onlyBarrenWuffet {
        robocopRegistry[robocopAddr] = true;
    }

    function checker(address robocopAddr, bytes32 ruleHash)
        external
        view
        returns (bool canExec, bytes memory execPayload)
    {
        canExec = IRoboCop(robocopAddr).checkRule(ruleHash);
        execPayload = abi.encodeWithSelector(this.executeTask.selector, robocopAddr, ruleHash);
    }

    function executeTask(address robocopAddr, bytes32 ruleHash) external {
        IRoboCop(robocopAddr).executeRule(ruleHash);
    }

    function deposit(uint256 _amount) external payable onlyOwner {
        treasury.depositFunds{value: _amount}(address(this), ETH, _amount);
    }

    function withdraw(uint256 _amount) external onlyOwner {
        treasury.withdrawFunds(payable(msg.sender), ETH, _amount);
    }
}
