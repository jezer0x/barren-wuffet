// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../../utils/Constants.sol";
import "../DelegatePerform.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ISsovV3.sol";

/*
    Reference: 
        https://arbiscan.io/address/0x1ae38835Bf3afbEC178E8a59Ca82aA383dC3DF57#code#F37#L148

    Tokens: 
        Will have only 1 input token (optionERC20token) and 1 output token 

    TriggerReturn: 

*/
contract SwapUniSingleAction is IAction, DelegatePerform {
    using SafeERC20 for IERC20;

    constructor() {}

    function validate(Action calldata action) public view returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.outputTokens.length == 1);
        (address vaultAddr, uint256 epoch, uint256 strikeIdx, uint256 amount) = abi.decode(
            action.data,
            (address, uint256, uint256, uint256)
        );
        ISsovV3 vault = ISsovV3(vaultAddr);
        ISsovV3.EpochData memory eData = vault.getEpochData(epoch);
        require(amount > 0);
        require(eData.expired);
        require(address(vault.collateralToken()) == action.outputTokens[0]);
        require(vault.getEpochStrikeData(epoch, strikeIdx).strikeToken == action.inputTokens[0]);
        require(strikeIdx < eData.strikes.length);

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (uint256[] memory)
    {
        uint256[] memory outputs = new uint256[](1);
        (address vaultAddr, uint256 epoch, uint256 strikeIdx, uint256 amount) = abi.decode(
            action.data,
            (address, uint256, uint256, uint256)
        );
        ISsovV3 vault = ISsovV3(vaultAddr);

        // TODO: anything to do with triggerdata?

        IERC20(action.inputTokens[0]).safeApprove(vaultAddr, runtimeParams.collateralAmounts[0]);
        uint256 pnl = vault.settle(strikeIdx, amount, epoch, address(this));
        IERC20(action.inputTokens[0]).safeApprove(vaultAddr, 0);
        outputs[0] = pnl;
        return outputs;
    }
}
