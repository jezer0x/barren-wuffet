// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "../../utils/Constants.sol";
import "./IRegistry.sol";
import "./AddressProvider.sol";
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
contract AddLiquidityCurveAction is AddressProvider, PlainPool, IAction {
    using SafeERC20 for IERC20;

    constructor(address _address_provider) {
        // should be 0x0000000022D53366457F9d5E68Ec105046FC4383, per https://curve.readthedocs.io/registry-address-provider.html
        address_provider = IAddressProvider(_address_provider);
    }

    function validate(Action calldata action) external view returns (bool) {
        address poolAddr = abi.decode(action.data, (address));
        IRegistry registry = IRegistry(_getRegistry());

        require(action.inputTokens.length == 1);
        require(action.outputTokens.length > 1);
        require(registry.get_pool_from_lp_token(action.inputTokens[0]) == poolAddr);
        address[8] memory poolTokens = registry.get_coins(poolAddr);

        for (uint256 i = 0; i < action.outputTokens.length; i++) {
            require(_coinInPool(action.outputTokens[i], poolTokens));
        }

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        payable
        returns (uint256[] memory)
    {
        uint256[] memory outputs = new uint256[](action.outputTokens.length);
        address poolAddr = abi.decode(action.data, (address));
        IPlainPool pool = IPlainPool(poolAddr);
        uint256[] memory _min_amounts = new uint256[](action.outputTokens.length); // TODO

        IERC20(action.inputTokens[0]).safeTransferFrom(msg.sender, address(this), runtimeParams.collateralAmounts[0]);
        IERC20(action.inputTokens[0]).safeApprove(address(pool), runtimeParams.collateralAmounts[0]);

        outputs = pool.remove_liquidity(runtimeParams.collateralAmounts[0], _min_amounts);

        IERC20(action.inputTokens[0]).safeApprove(address(pool), 0);

        for (uint256 i = 0; i < action.outputTokens.length; i++) {
            IERC20(action.outputTokens[i]).safeTransferFrom(address(this), msg.sender, outputs[i]);
        }

        return outputs;
    }
}
