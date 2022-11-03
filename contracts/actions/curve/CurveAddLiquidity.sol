// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IAction.sol";
import "../../utils/Constants.sol";
import "../DelegatePerform.sol";
import "./IRegistry.sol";
import "./IAddressProvider.sol";
import "./PlainPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/*
    Reference: 
        Will only work for plain Pools
        https://curve.readthedocs.io/exchange-pools.html#plain-pools

    Tokens: 
        Expects multiple input tokens and 1 output token

    TriggerReturn: 
        Applicable triggerReturn must be ???

    Action: 
        action.data must be in the form of (address)
 */
contract CurveAddLiquidity is PlainPool, IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IAddressProvider public immutable address_provider;

    constructor(address _address_provider) {
        // should be 0x0000000022D53366457F9d5E68Ec105046FC4383, per https://curve.readthedocs.io/registry-address-provider.html
        address_provider = IAddressProvider(_address_provider);
    }

    function validate(Action calldata action) external view returns (bool) {
        address poolAddr = abi.decode(action.data, (address));
        IRegistry registry = IRegistry(address_provider.get_address(0));

        require(action.inputTokens.length > 1);
        require(action.outputTokens.length == 1);
        require(registry.get_pool_from_lp_token(action.outputTokens[0].addr) == poolAddr);
        address[8] memory poolTokens = registry.get_coins(poolAddr);

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            require(_coinInPool(action.inputTokens[i].addr, poolTokens));
        }

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](1);
        address poolAddr = abi.decode(action.data, (address));
        IPlainPool pool = IPlainPool(poolAddr);
        uint256 _min_mint_amount = 0; // TODO

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            action.inputTokens[i].approve(address(pool), runtimeParams.collaterals[i]);
        }

        outputs[0] = pool.add_liquidity(runtimeParams.collaterals, _min_mint_amount);

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            action.inputTokens[i].approve(address(pool), 0);
        }
        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
