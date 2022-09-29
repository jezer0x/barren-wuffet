// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "../../utils/Constants.sol";
import "../DelegatePerform.sol";
import "./IRegistry.sol";
import "./IAddressProvider.sol";
import "./PlainPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/*
/*
    Reference: 
        Will only work for plain Pools
        https://curve.readthedocs.io/exchange-pools.html#plain-pools

    Tokens: 
        Expects 1 input token and multiple output tokens

    TriggerReturn: 
        Applicable triggerReturn must be ???

    Action: 
        action.data must be in the form of (address)
 */
contract CurveRemoveLiquidity is PlainPool, IAction, DelegatePerform {
    using SafeERC20 for IERC20;

    IAddressProvider public immutable address_provider;

    constructor(address _address_provider) {
        // should be 0x0000000022D53366457F9d5E68Ec105046FC4383, per https://curve.readthedocs.io/registry-address-provider.html
        address_provider = IAddressProvider(_address_provider);
    }

    function validate(Action calldata action) external view returns (bool) {
        address poolAddr = abi.decode(action.data, (address));
        IRegistry registry = IRegistry(address_provider.get_address(0));

        require(action.inputTokens.length == 1);
        require(action.outputTokens.length > 1);
        require(registry.get_pool_from_lp_token(action.inputTokens[0].addr) == poolAddr);
        address[8] memory poolTokens = registry.get_coins(poolAddr);

        for (uint256 i = 0; i < action.outputTokens.length; i++) {
            require(_coinInPool(action.outputTokens[i].addr, poolTokens));
        }

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256[] memory outputs = new uint256[](action.outputTokens.length);
        address poolAddr = abi.decode(action.data, (address));
        IPlainPool pool = IPlainPool(poolAddr);
        uint256[] memory _min_amounts = new uint256[](action.outputTokens.length); // TODO

        IERC20(action.inputTokens[0].addr).safeApprove(address(pool), runtimeParams.collaterals[0]);
        outputs = pool.remove_liquidity(runtimeParams.collaterals[0], _min_amounts);
        IERC20(action.inputTokens[0].addr).safeApprove(address(pool), 0);

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }
}
