// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./IAction.sol";
import "../utils/Constants.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAddressProvider {
    function get_address(uint256) external view returns (address);
}

interface IPlainPool {
    function add_liquidity(uint256[] memory _amounts, uint256 _min_mint_amount) external returns (uint256);
}

interface IRegistry {
    function get_pool_from_lp_token(address lp_token) external view returns (address);

    function get_coins(address pool) external view returns (address[8] memory);
}

/*
    Will only work for plain Pools
    https://curve.readthedocs.io/exchange-pools.html#plain-pools

    runtimeParams.triggerData must be ???
    action.data must be in the form of (address)

    Expects multiple input tokens and 1 output token

 */
contract AddLiquidityCurveAction is IAction {
    using SafeERC20 for IERC20;

    IAddressProvider address_provider;

    constructor(address _address_provider) {
        // should be 0x0000000022D53366457F9d5E68Ec105046FC4383, per https://curve.readthedocs.io/registry-address-provider.html
        address_provider = IAddressProvider(_address_provider);
    }

    function _getRegistry() internal view returns (address) {
        return address_provider.get_address(0);
    }

    function _coinInPool(address token, address[8] memory tokenList) internal pure returns (bool) {
        for (uint256 i = 0; i < tokenList.length; i++) {
            if (token == tokenList[i]) {
                return true;
            }
        }
        return false;
    }

    function validate(Action calldata action) external view returns (bool) {
        address poolAddr = abi.decode(action.data, (address));
        IRegistry registry = IRegistry(_getRegistry());

        require(action.inputTokens.length > 1);
        require(action.outputTokens.length == 1);
        require(registry.get_pool_from_lp_token(action.outputTokens[0]) == poolAddr);
        address[8] memory poolTokens = registry.get_coins(poolAddr);

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            require(_coinInPool(action.inputTokens[i], poolTokens));
        }

        return true;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        payable
        returns (uint256[] memory)
    {
        uint256[] memory outputs = new uint256[](1);
        address poolAddr = abi.decode(action.data, (address));
        IPlainPool pool = IPlainPool(poolAddr);
        uint256 _min_mint_amount = 0; // TODO: figure this out from runtimeParams.triggerData or let it be?

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            IERC20(action.inputTokens[i]).safeTransferFrom(
                msg.sender,
                address(this),
                runtimeParams.collateralAmounts[i]
            );
            IERC20(action.inputTokens[i]).safeApprove(address(pool), runtimeParams.collateralAmounts[i]);
        }

        outputs[0] = pool.add_liquidity(runtimeParams.collateralAmounts, _min_mint_amount);

        for (uint256 i = 0; i < action.inputTokens.length; i++) {
            IERC20(action.inputTokens[i]).safeApprove(address(pool), 0);
        }

        IERC20(action.outputTokens[0]).safeTransferFrom(address(this), msg.sender, outputs[0]);

        return outputs;
    }
}
