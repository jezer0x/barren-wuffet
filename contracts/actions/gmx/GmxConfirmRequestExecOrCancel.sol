// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IAction.sol";
import "../DelegatePerform.sol";
import "./IReader.sol";
import "./IPositionRouter.sol";
import "../SimpleSwapUtils.sol";

contract GmxConfirmRequestExecOrCancel is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IReader immutable reader;
    IPositionRouter immutable positionRouter;
    address public immutable confirmNoPosAddr;

    constructor(
        address readerAddress,
        address positionRouterAddress,
        address _confirmNoPosAddr
    ) {
        reader = IReader(readerAddress);
        positionRouter = IPositionRouter(positionRouterAddress);
        confirmNoPosAddr = _confirmNoPosAddr;
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        (bytes32 key, bool isIncrease, address collateralTokenAddr, address indexTokenAddr, bool _isLong) = abi.decode(
            action.data,
            (bytes32, bool, address, address, bool)
        );

        if (isIncrease) {
            IncreasePositionRequest memory req = positionRouter.increasePositionRequests(key);
            require(req.account == address(0), "Key still active");
        } else {
            DecreasePositionRequest memory req = positionRouter.decreasePositionRequests(key);
            require(req.account == address(0), "Key still active");
        }

        address[] memory collateralTokenAddrs = new address[](1);
        collateralTokenAddrs[0] = collateralTokenAddr;

        address[] memory indexTokenAddrs = new address[](1);
        indexTokenAddrs[0] = indexTokenAddr;

        bool[] memory isLongs = new bool[](1);
        isLongs[0] = _isLong;

        uint256[] memory positions = reader.getPositions(
            positionRouter.vault(),
            address(this),
            collateralTokenAddrs,
            indexTokenAddrs,
            isLongs
        );

        if (positions[0] == 0) {
            // size of the position is 0
            return
                ActionResponse({
                    tokenOutputs: new uint256[](0),
                    position: Position({actionConstraints: new ActionConstraints[](0), nextActions: new Action[](0)})
                });
        } else {
            Action[] memory nextActions = new Action[](1);

            nextActions[0] = Action({
                callee: confirmNoPosAddr,
                data: abi.encode(collateralTokenAddr, indexTokenAddr, _isLong),
                inputTokens: new Token[](0),
                outputTokens: new Token[](0)
            });

            return
                ActionResponse({
                    tokenOutputs: new uint256[](0),
                    position: Position({actionConstraints: new ActionConstraints[](0), nextActions: nextActions})
                });
        }
    }

    function validate(Action calldata action) external view returns (bool) {
        return true;
    }
}
