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
        IncreasePositionParams memory params = abi.decode(action.data, (IncreasePositionParams));

        {
            if (action.inputTokens[0].isETH()) {
                positionRouter.createIncreasePositionETH{
                    value: runtimeParams.collaterals[1] + runtimeParams.collaterals[0]
                }(
                    params._path,
                    params._indexToken,
                    params._minOut,
                    params._sizeDelta,
                    params._isLong,
                    params._acceptablePrice,
                    runtimeParams.collaterals[1],
                    referralCode
                );
            } else {
                action.inputTokens[0].approve(address(positionRouter.router()), runtimeParams.collaterals[0]);
                positionRouter.createIncreasePosition{value: runtimeParams.collaterals[1]}(
                    params._path,
                    params._indexToken,
                    runtimeParams.collaterals[0],
                    params._minOut,
                    params._sizeDelta,
                    params._isLong,
                    params._acceptablePrice,
                    runtimeParams.collaterals[1],
                    referralCode
                );
            }
        }

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
                    params._path[params._path.length - 1],
                    params._indexToken,
                    params._isLong
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

        // action.data has (IncreasePositionParams)
        abi.decode(action.data, (IncreasePositionParams));
    }
}
