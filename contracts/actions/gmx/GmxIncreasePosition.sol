// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../IAction.sol";
import "../DelegatePerform.sol";
import "./IReader.sol";
import "./IPositionRouter.sol";
import "../SimpleSwapUtils.sol";

contract GmxIncreasePosition is IAction, DelegatePerform {
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
        bytes32 _referralCode
    ) {
        reader = IReader(readerAddress);
        positionRouter = IPositionRouter(positionRouterAddress);
        referralCode = _referralCode;
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
            uint256 _minOut,
            uint256 _sizeDelta,
            bool _isLong,
            uint256 _acceptablePrice
        ) = abi.decode(action.data, (address[], address, uint256, uint256, bool, uint256));

        if (action.inputTokens[0].isETH()) {
            positionRouter.createIncreasePositionETH{
                value: runtimeParams.collaterals[1] + runtimeParams.collaterals[0]
            }(
                _path,
                _indexToken,
                _minOut,
                _sizeDelta,
                _isLong,
                _acceptablePrice,
                runtimeParams.collaterals[1],
                referralCode
            );
        } else {
            action.inputTokens[0].approve(address(positionRouter.router()), runtimeParams.collaterals[0]);
            positionRouter.createIncreasePosition{value: runtimeParams.collaterals[1]}(
                _path,
                _indexToken,
                runtimeParams.collaterals[0],
                _minOut,
                _sizeDelta,
                _isLong,
                _acceptablePrice,
                runtimeParams.collaterals[1],
                referralCode
            );
        }

        // increase position request -> confirmReqCancelOrExec -> confirmNoPos (if any)
        // decreasePositionRequest -> confirmReqCancelOrExec -> confirmNoPos (if any)

        // setting up position
        Action[] memory nextActions = new Action[](1);

        {
            Token[] memory outputTokens = new Token[](1);
            outputTokens[0] = action.inputTokens[0]; // will only be used for cancellations, but we won't know how much/if was refunded

            nextActions[0] = Action({
                callee: confirmReqCancelOrExecAddr,
                data: abi.encode(
                    true,
                    positionRouter.getRequestKey(address(this), positionRouter.increasePositionsIndex(address(this))),
                    _path.length == 2 ? _path[1] : _path[0],
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
        // the first is tokenIn, the second is ETH for the fee
        require(action.inputTokens.length == 2);
        require(action.inputTokens[0].isERC20() || action.inputTokens[0].isETH());
        require(action.inputTokens[1].isETH());

        // no outputToken
        require(action.outputTokens.length == 0);

        // action.data has (address[] path, address _indexToken, uint256 _minOut, uint256 _sizeDelta, bool _isLong, uint256 _acceptablePrice)
        abi.decode(action.data, (address[], address, uint256, uint256, bool, uint256));
    }
}
