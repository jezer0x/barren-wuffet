// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "../DelegatePerform.sol";
import "../../utils/Constants.sol";
import "./IRegistry.sol";
import "./IAddressProvider.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../SimpleSwapUtils.sol";

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
    Reference: 
        https://curve.readthedocs.io/registry-exchanges.html
        The other way to do it is to locate the pool and then do a direct exchange https://curve.readthedocs.io/exchange-pools.html#StableSwap.exchange

    Tokens: 
        Will only have 1 input token and 1 output token

    TriggerReturn: 
        Applicable TriggerReturn must be in (asset1, asset2, val) where val.decimals = 8, asset1 = inputToken and asset2 = outputToken
        If not present, trade is in danger of getting frontrun. 

    Action: 
        action.data must be in the form of (address)

*/
contract CurveSwap is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IAddressProvider public immutable address_provider;

    constructor(address _address_provider) {
        // should be 0x0000000022D53366457F9d5E68Ec105046FC4383, per https://curve.readthedocs.io/registry-address-provider.html
        address_provider = IAddressProvider(_address_provider);
    }

    function _getSwapper() internal view returns (address) {
        return address_provider.get_address(2);
    }

    function validate(Action calldata action) external view returns (bool) {
        address poolAddr = abi.decode(action.data, (address));
        IRegistry registry = IRegistry(address_provider.get_address(0));

        require(action.inputTokens.length == 1);
        require(action.outputTokens.length == 1);

        // TODO: reverts if poolAddr does not match in/out tokens
        (int128 i, int128 j, bool exchange_underlying) = registry.get_coin_indices(
            poolAddr,
            action.inputTokens[0].addr,
            action.outputTokens[0].addr
        );

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](1);
        address poolAddr = abi.decode(action.data, (address));
        ISwapper swapper = ISwapper(_getSwapper());

        action.inputTokens[0].approve(address(swapper), runtimeParams.collaterals[0]);
        outputs[0] = swapper.exchange(
            poolAddr,
            action.inputTokens[0].addr,
            action.outputTokens[0].addr,
            runtimeParams.collaterals[0],
            (SimpleSwapUtils._getRelevantPriceTriggerData(
                action.inputTokens[0],
                action.outputTokens[0],
                runtimeParams.triggerReturnArr
            ) * runtimeParams.collaterals[0]) / 10**8,
            address(this)
        );
        action.inputTokens[0].approve(address(swapper), 0);

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
