// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IAction.sol";
import "../DelegatePerform.sol";
import "./IRouter.sol";
import "./IReader.sol";
import "../SimpleSwapUtils.sol";

/*
    Action.data: 
        - address: poolAddr 
        - uint256: minimum amount of Y tokens per X accepted (18 decimals)
*/
contract GmxSwap is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IRouter immutable router;
    IReader immutable reader;

    constructor(address routerAddress, address readerAddress) {
        router = IRouter(routerAddress);
        reader = IReader(readerAddress);
    }

    // unpacks action and triggerdata and creates calldata of the callee
    // calls the function
    // returns (ActionResponse[]) if successful, else should revert
    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        uint256 _amountIn = runtimeParams.collaterals[0];
        uint256 _minOut;
        address[] memory _path = new address[](2);
        uint256 amountOut;
        uint256 fee;

        if (action.inputTokens[0].isETH()) {
            _path[0] = router.weth();
            _path[1] = action.outputTokens[0].addr;
        } else if (action.outputTokens[0].isETH()) {
            _path[0] = action.inputTokens[0].addr;
            _path[1] = router.weth();
            IERC20(_path[0]).safeApprove(address(router), _amountIn);
        } else {
            _path[0] = action.inputTokens[0].addr;
            _path[1] = action.outputTokens[0].addr;
            IERC20(_path[0]).safeApprove(address(router), _amountIn);
        }

        (amountOut, fee) = reader.getAmountOut(router.vault(), _path[0], _path[1], _amountIn);
        _minOut = (abi.decode(action.data, (uint256)) * runtimeParams.collaterals[0]) / 10**18; 
        _minOut = _minOut > fee ? _minOut - fee : 0;

        if (action.inputTokens[0].isETH()) {
            router.swapETHToTokens{value: _amountIn}(_path, _minOut, address(this));
        } else if (action.outputTokens[0].isETH()) {
            router.swapTokensToETH(_path, _amountIn, _minOut, payable(address(this)));
        } else {
            router.swap(_path, _amountIn, _minOut, address(this));
        }

        uint256[] memory outputs = new uint256[](1);
        outputs[0] = amountOut;

        // If the ORIGINAL inputToken was not ETH, need to take back approval
        if (action.inputTokens[0].isERC20()) {
            action.inputTokens[0].approve(address(router), 0);
        }

        Position memory none;
        return ActionResponse({tokenOutputs: outputs, position: none});
    }

    // reverts if action fails to validate, otherwise returns true
    function validate(Action calldata action) external view returns (bool) {
        return SimpleSwapUtils._validate(action);
    }
}
