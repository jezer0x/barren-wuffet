// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "../DelegatePerform.sol";
import "./IReader.sol";
import "./IPositionRouter.sol";
import "../SimpleSwapUtils.sol";

contract GmxDecreasePosition is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IReader immutable reader;
    IPositionRouter immutable positionRouter;
    address public immutable confirmReqCancelOrExecAddr;

    constructor(
        address readerAddress,
        address positionRouterAddress,
        address _confirmReqCancelOrExecAddr
    ) {
        reader = IReader(readerAddress);
        positionRouter = IPositionRouter(positionRouterAddress);
        confirmReqCancelOrExecAddr = _confirmReqCancelOrExecAddr;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        (
            address[] memory _path,
            address _indexToken,
            uint256 _collateralDelta,
            uint256 _sizeDelta,
            bool _isLong,
            uint256 _acceptablePrice,
            uint256 _minOut,
            bool _withdrawETH
        ) = abi.decode(action.data, (address[], address, uint256, uint256, bool, uint256, uint256, bool));

        positionRouter.createDecreasePosition{value: runtimeParams.collaterals[0]}(
            _path,
            _indexToken,
            _collateralDelta,
            _sizeDelta,
            _isLong,
            address(this),
            _acceptablePrice,
            _minOut,
            runtimeParams.collaterals[0],
            _withdrawETH
        );

        // setting up position
        Action[] memory nextActions = new Action[](1);

        {
            Token[] memory outputTokens = new Token[](1); // will only be used if successful, but we won't know how much/if was given
            if (_withdrawETH) {
                outputTokens[0] = Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0});
            } else {
                outputTokens[0] = Token({t: TokenType.NATIVE, addr: _path[_path.length - 1], id: 0});
            }

            nextActions[0] = Action({
                callee: confirmReqCancelOrExecAddr,
                data: abi.encode(
                    false,
                    positionRouter.getRequestKey(address(this), positionRouter.decreasePositionsIndex(address(this))),
                    _path[_path.length - 1],
                    _indexToken,
                    _isLong
                ),
                inputTokens: new Token[](0),
                outputTokens: outputTokens
            });
        }

        return
            ActionResponse({
                tokenOutputs: new uint256[](0),
                position: Position({actionConstraints: new ActionConstraints[](0), nextActions: nextActions})
            });
    }

    function validate(Action calldata action) external view returns (bool) {
        // ETH for fee
        require(action.inputTokens.length == 1);
        require(action.inputTokens[0].isETH());

        // no outputToken
        require(action.outputTokens.length == 0);

        abi.decode(action.data, (address[], address, uint256, uint256, bool, uint256, uint256, bool));
    }
}
