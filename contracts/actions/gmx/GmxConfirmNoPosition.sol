// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IAction.sol";
import "../DelegatePerform.sol";
import "./IReader.sol";
import "./IPositionRouter.sol";
import "../SimpleSwapUtils.sol";

contract GmxConfirmNoPosition is IAction, DelegatePerform {
    using SafeERC20 for IERC20;
    using TokenLib for Token;

    IReader immutable reader;
    IPositionRouter immutable positionRouter;

    constructor(address readerAddress, address positionRouterAddress) {
        reader = IReader(readerAddress);
        positionRouter = IPositionRouter(positionRouterAddress);
    }

    function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
        external
        delegateOnly
        returns (ActionResponse memory)
    {
        (address collateralTokenAddr, address indexTokenAddr, bool _isLong) = abi.decode(
            action.data,
            (address, address, bool)
        );
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

        require(positions[0] == 0, "Position still exists!");
        
        return
            ActionResponse({
                tokenOutputs: new uint256[](0),
                position: Position({actionConstraints: new ActionConstraints[](0), nextActions: new Action[](0)})
            });
    }

    function validate(Action calldata action) external view returns (bool) {
        return true;
    }
}
