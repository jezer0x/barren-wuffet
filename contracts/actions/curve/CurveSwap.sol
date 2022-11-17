// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

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

    Action.data: 
        - address: poolAddr 
        - uint256: minimum amount of Y tokens per X accepted (18 decimals)
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
        (address poolAddr, uint256 minYPerX) = abi.decode(action.data, (address, uint256));
        ISwapper swapper = ISwapper(_getSwapper());

        action.inputTokens[0].approve(address(swapper), runtimeParams.collaterals[0]);
        outputs[0] = swapper.exchange(
            poolAddr,
            action.inputTokens[0].addr,
            action.outputTokens[0].addr,
            runtimeParams.collaterals[0],
            (minYPerX * runtimeParams.collaterals[0]) / 10**18,
            address(this)
        );
        action.inputTokens[0].approve(address(swapper), 0);

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
