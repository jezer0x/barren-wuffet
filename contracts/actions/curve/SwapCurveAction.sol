// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "../../utils/Constants.sol";
import "./IRegistry.sol";
import "./AddressProvider.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ISwapper {
    function exchange(
        address _pool,
        address _from,
        address _to,
        uint256 _amount,
        uint256 _expected,
        address _receiver
    ) external payable returns (uint256);
}

/*
    https://curve.readthedocs.io/registry-exchanges.html
    
    The other way to do it is to locate the pool and then do a direct exchange https://curve.readthedocs.io/exchange-pools.html#StableSwap.exchange

    runtimeParams.triggerData must be in decimals = 8
    Notes with examples: 
    ETH/USD -> USD per ETH -> ETH Price in USD -> triggerData = ["eth", "usd"] -> Must use when tokenIn = ETH and tokenOut = USD (i.e. buying USD with ETH)
    USD/ETH -> ETH per USD -> USD Price in ETH -> triggerData = ["usd", "eth"] -> Must use when tokenIn = USD* and tokenOut = ETH (i.e. buying ETH with USD)
 
    action.data must be in the form of (address)

    only 1 input token and 1 output token

 */
contract SwapCurveAction is AddressProvider, IAction {
    using SafeERC20 for IERC20;

    constructor(address _address_provider) {
        // should be 0x0000000022D53366457F9d5E68Ec105046FC4383, per https://curve.readthedocs.io/registry-address-provider.html
        address_provider = IAddressProvider(_address_provider);
    }

    function _getSwapper() internal view returns (address) {
        return address_provider.get_address(2);
    }

    function validate(Action calldata action) external view returns (bool) {
        address poolAddr = abi.decode(action.data, (address));
        IRegistry registry = IRegistry(_getRegistry());

        require(action.inputTokens.length == 1);
        require(action.outputTokens.length == 1);

        // TODO: reverts if poolAddr does not match in/out tokens
        (int128 i, int128 j, bool exchange_underlying) = registry.get_coin_indices(
            poolAddr,
            action.inputTokens[0],
            action.outputTokens[0]
        );

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        payable
        returns (uint256[] memory)
    {
        uint256[] memory outputs = new uint256[](1);
        address poolAddr = abi.decode(action.data, (address));
        ISwapper swapper = ISwapper(_getSwapper());

        IERC20(action.inputTokens[0]).safeTransferFrom(msg.sender, address(this), runtimeParams.collateralAmounts[0]);
        IERC20(action.inputTokens[0]).safeApprove(address(swapper), runtimeParams.collateralAmounts[0]);
        outputs[0] = swapper.exchange(
            poolAddr,
            action.inputTokens[0],
            action.outputTokens[0],
            runtimeParams.collateralAmounts[0],
            (runtimeParams.triggerData * runtimeParams.collateralAmounts[0]) / 10**8,
            msg.sender
        );
        IERC20(action.inputTokens[0]).safeApprove(address(swapper), 0);

        return outputs;
    }
}
