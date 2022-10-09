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
    bytes32 immutable referralCode;
    address public immutable confirmReqCancelOrExecAddr;

    constructor(
        address readerAddress,
        address positionRouterAddress,
        address _confirmReqCancelOrExecAddr,
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

        positionRouter.createDecreasePosition(
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
            nextActions[0] = Action({
                callee: confirmReqCancelOrExecAddr,
                data: abi.encode(
                    false,
                    positionRouter.getRequestKey(address(this), positionRouter.decreasePositionsIndex(address(this))),
                    _path.length == 2 ? _path[1] : _path[0],
                    _indexToken,
                    _isLong
                ),
                inputTokens: new Token[](0),
                outputTokens: new Token[](0)
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
