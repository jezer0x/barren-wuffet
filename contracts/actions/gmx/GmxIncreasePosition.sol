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
    address public immutable closePositionAddress;

    constructor(
        address readerAddress,
        address positionRouterAddress,
        address _closePositionAddress,
        bytes32 _referralCode
    ) {
        reader = IReader(readerAddress);
        positionRouter = IPositionRouter(positionRouterAddress);
        referralCode = _referralCode;
        closePositionAddress = _closePositionAddress;
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
            IERC20(action.inputTokens[0].addr).safeApprove(
                address(positionRouter.router()),
                runtimeParams.collaterals[0]
            );
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

        // setting up position
        Token[] memory inputTokens = new Token[](1);
        Action[] memory nextActions = new Action[](1);
        nextActions[0] = Action({
            callee: closePositionAddress,
            data: abi.encode(positionRouter.vault(), address(this), _path, _path, [_isLong]),
            inputTokens: new Token[](0),
            outputTokens: new Token[](0)
        });
        Position memory pos = Position({actionConstraints: new ActionConstraints[](0), nextActions: nextActions});
        return ActionResponse({tokenOutputs: new uint256[](0), position: pos});
    }

    function validate(Action calldata action) external view returns (bool) {
        // the first is tokenIn, the second is ETH for the fee
        require(action.inputTokens.length == 2);
        require(action.inputTokens[0].t == TokenType.ERC20 || action.inputTokens[0].t == TokenType.NATIVE);
        require(action.inputTokens[1].isETH());

        // no outputToken
        require(action.outputTokens.length == 0);

        // action.data has (address[] path, address _indexToken, uint256 _minOut, uint256 _sizeDelta, bool _isLong, uint256 _acceptablePrice)
        abi.decode(action.data, (address[], address, uint256, uint256, bool, uint256));
    }
}
