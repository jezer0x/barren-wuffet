// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../../utils/Constants.sol";
import "../DelegatePerform.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
    PERFORM() CAN ONLY TO BE USED VIA DELEGATECALL

    Reference: 
        https://docs.uniswap.org/protocol/guides/swaps/single-swaps

    Tokens: 
        Can have any number of input tokens (?)
        Depending on the situation, it might return a position
        A position can be fed into perform as a runtime param

    TriggerReturn: 
        Applicable TriggerReturn must be in (asset1, asset2, val) where val.decimals = 8, asset1 = inputToken and asset2 = outputToken
            Example: 
            ETH/USD -> USD per ETH -> ETH Price in USD -> triggerReturn = [ETH, USD, val] -> Must use when tokenIn = ETH and tokenOut = USD (i.e. buying USD with ETH)
            USD/ETH -> ETH per USD -> USD Price in ETH -> triggerReturn = [USD, ETH, val] -> Must use when tokenIn = USD* and tokenOut = ETH (i.e. buying ETH with USD)
*/
contract CapFinanceAction is IAction, DelegatePerform {
    using SafeERC20 for IERC20;

    address immutable WETH9;

    constructor(address wethAddress) {
        WETH9 = wethAddress;
    }

    function validate(Action calldata action) external pure returns (bool) {
        require(action.inputTokens.length == 1);
        require(action.outputTokens.length == 1);
        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](1);
        outputs[0] = 1;

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
