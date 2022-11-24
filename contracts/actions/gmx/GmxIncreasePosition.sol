// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IAction.sol";
import "../DelegatePerform.sol";
import "./IReader.sol";
import "./IRouter.sol";
import "./IPositionRouter.sol";
import "../SimpleSwapUtils.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"; 

struct IncreasePositionParamsCustom {
    address[] _path;
    address _indexToken;
    uint256 _minOutYPerXSwap;
    uint256 _leverage;
    uint256 _inputTokenPrice; 
    bool _isLong;
    uint256 _acceptableIndexTokenPrice;
}

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
        IncreasePositionParamsCustom memory params = abi.decode(action.data, (IncreasePositionParamsCustom));
        IRouter router = IRouter(positionRouter.router());
        router.approvePlugin(address(positionRouter));
        bytes32 key; 
        {
            uint256 size_delta = (params._leverage * params._inputTokenPrice * runtimeParams.collaterals[0]) / (10**(IERC20Metadata(params._path[0]).decimals())); 

            if (action.inputTokens[0].isETH()) {
                key = positionRouter.createIncreasePositionETH{
                    value: runtimeParams.collaterals[1] + runtimeParams.collaterals[0]
                }(
                    params._path,
                    params._indexToken,
                    (params._minOutYPerXSwap * runtimeParams.collaterals[0]) / 10**18, 
                    size_delta, 
                    params._isLong,
                    params._acceptableIndexTokenPrice,
                    runtimeParams.collaterals[1],
                    referralCode, 
                    address(0)
                );
            } else {
                action.inputTokens[0].approve(address(router), runtimeParams.collaterals[0]);
                key = positionRouter.createIncreasePosition{value: runtimeParams.collaterals[1]}(
                    params._path,
                    params._indexToken,
                    runtimeParams.collaterals[0],
                    (params._minOutYPerXSwap * runtimeParams.collaterals[0]) / 10**18, 
                    size_delta, 
                    params._isLong,
                    params._acceptableIndexTokenPrice,
                    runtimeParams.collaterals[1],
                    referralCode, 
                    address(0)
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
                    key,
                    true,
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

        abi.decode(action.data, (IncreasePositionParamsCustom));

        return true;
    }
}
