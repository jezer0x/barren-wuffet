// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

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
        DecreasePositionParams memory params = abi.decode(action.data, (DecreasePositionParams));

        
            bytes32 key = positionRouter.createDecreasePosition{value: runtimeParams.collaterals[0]}(
                params._path,
                params._indexToken,
                params._collateralDelta,
                params._sizeDelta,
                params._isLong,
                address(this),
                params._acceptablePrice,
                params._minOut,
                runtimeParams.collaterals[0],
                params._withdrawETH, 
                address(0)
            );
        

        return
            ActionResponse({
                tokenOutputs: new uint256[](0),
                position: Position({
                    actionConstraints: new ActionConstraints[](0),
                    nextActions: _getNextActions(params._withdrawETH, key, params._path, params._indexToken, params._isLong)
                })
            });
    }

    function validate(Action calldata action) external view returns (bool) {
        // ETH for fee
        require(action.inputTokens.length == 1);
        require(action.inputTokens[0].isETH());

        // no outputToken
        require(action.outputTokens.length == 0);

        abi.decode(action.data, (DecreasePositionParams));

        return true;
    }

    function _getNextActions(
        bool _withdrawETH,
        bytes32 key, 
        address[] memory _path,
        address _indexToken,
        bool _isLong
    ) internal returns (Action[] memory) {
        // setting up position
        Action[] memory nextActions = new Action[](1);

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
                key, 
                _path[_path.length - 1],
                _indexToken,
                _isLong
            ),
            inputTokens: new Token[](0),
            outputTokens: outputTokens
        });
    }
}
