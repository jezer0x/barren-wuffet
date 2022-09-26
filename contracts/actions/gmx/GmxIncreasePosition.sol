// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "../DelegatePerform.sol";
import "./IRouter.sol";
import "./IReader.sol";
import "./IPositionRouter.sol";
import "../SimpleSwapUtils.sol";

contract GmxSwap is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IReader immutable reader;
    IPositionRouter immutable positionRouter;
    bytes32 immutable referralCode;

    constructor(
        address readerAddress,
        address positionRouterAddress,
        bytes32 _referralCode
    ) {
        reader = IReader(readerAddress);
        positionRouter = IPositionRouter(positionRouterAddress);
        referralCode = _referralCode;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        address[] memory _path = new address[](1); // assume swaps are done with GmxSwap Action separately.

        // TODO: what happens if greater?
        // checking because may change in the middle. Q: Why not leave it upto GMX to reject?
        require(runtimeParams.collaterals[1] >= positionRouter.minExecutionFee());
        uint256 fee = runtimeParams.collaterals[1];
        uint256 _amountIn = runtimeParams.collaterals[0];

        (address _indexToken, uint256 _sizeDelta, bool _isLong, uint256 _acceptablePrice) = abi.decode(
            action.data,
            (address, uint256, bool, uint256)
        );

        if (action.inputTokens[0].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH}))) {
            _path[0] = positionRouter.weth();
            createIncreasePositionETH{value: fee + _amountIn}(
                _path,
                _indexToken,
                _amountIn,
                0, // no swapping
                _sizeDelta,
                _isLong,
                _acceptablePrice,
                fee,
                referralCode
            );
        } else {
            _path[0] = action.inputTokens[0].addr;
            IERC20(_path[0]).safeApprove(address(positionRouter.router()), _amountIn);
            createIncreasePosition{value: fee}(
                _path,
                _indexToken,
                _amountIn,
                0, // no swapping
                _sizeDelta,
                _isLong,
                _acceptablePrice,
                fee,
                referralCode
            );
        }

        uint256[] memory noOutputs;
        // TODO: create position
        Position memory none;
        return ActionResponse({tokenOutputs: noOutputs, position: none});
    }

    function validate(Action calldata action) external view returns (bool) {
        // note: _path[1] not supported; swap beforehand manually
        // the first is tokenIn, the second is ETH for the fee
        require(action.inputTokens.length == 2);
        require(action.inputTokens[1].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH})));
        require(action.inputTokens[0].t == TokenType.ERC20 || action.inputTokens[0].t == TokenType.NATIVE);

        // no outputToken
        require(action.outputTokens.length == 0);

        // action.data has (address _indexToken, uint256 _sizeDelta, bool _isLong, uint256 _acceptablePrice)
        abi.decode(action.data, (address, uint256, bool, uint256));
    }
}
