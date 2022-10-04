// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.9;

// import "../IAction.sol";
// import "../DelegatePerform.sol";
// import "./IRouter.sol";
// import "./IReader.sol";
// import "./IPositionRouter.sol";
// import "../SimpleSwapUtils.sol";

// contract GmxDecreasePosition is IAction, DelegatePerform {
//     using SafeERC20 for IERC20;
//     using TokenLib for Token;

//     IReader immutable reader;
//     IPositionRouter immutable positionRouter;
//     bytes32 immutable referralCode;

//     constructor(
//         address readerAddress,
//         address positionRouterAddress,
//         bytes32 _referralCode
//     ) {
//         reader = IReader(readerAddress);
//         positionRouter = IPositionRouter(positionRouterAddress);
//         referralCode = _referralCode;
//         closePositionAddress = _closePositionAddress;
//     }

//     function perform(Action calldata action, ActionRuntimeParams calldata runtimeParams)
//         external
//         delegateOnly
//         returns (ActionResponse memory)
//     {
//         address[] memory _path = new address[](1); // assume swaps are done with GmxSwap Action separately.

//         // TODO: what happens if greater?
//         // checking because may change in the middle. Q: Why not leave it upto GMX to reject?
//         require(runtimeParams.collaterals[1] >= positionRouter.minExecutionFee());
//         uint256 fee = runtimeParams.collaterals[1];
//         uint256 _amountIn = runtimeParams.collaterals[0];

//         (address _indexToken, uint256 _sizeDelta, bool _isLong, uint256 _acceptablePrice) = abi.decode(
//             action.data,
//             (address, uint256, bool, uint256)
//         );

//         if (action.inputTokens[0].equals(Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0}))) {
//             _path[0] = positionRouter.weth();
//             positionRouter.createIncreasePositionETH{value: fee + _amountIn}(
//                 _path,
//                 _indexToken,
//                 0, // no swapping
//                 _sizeDelta,
//                 _isLong,
//                 _acceptablePrice,
//                 fee,
//                 referralCode
//             );
//         } else {
//             _path[0] = action.inputTokens[0].addr;

//             positionRouter.createIncreasePosition{value: fee}(
//                 _path,
//                 _indexToken,
//                 _amountIn,
//                 0, // no swapping
//                 _sizeDelta,
//                 _isLong,
//                 _acceptablePrice,
//                 fee,
//                 referralCode
//             );
//         }

//         uint256[] memory noOutputs;
//         Position memory none;
//         return ActionResponse({tokenOutputs: noOutputs, position: none});
//     }

//     function validate(Action calldata action) external view returns (bool) {
//         // ETH for the fee
//         require(action.inputTokens.length == 1);

//         // output token == collateralToken
//         require(action.outputTokens.length == 1);

//     function createDecreasePosition(
//         address _receiver,
//         uint256 _acceptablePrice,
//         uint256 _minOut,
//         uint256 _executionFee,
//         bool _withdrawETH
//     ) external payable;

//         // action.data has (address[] _path, address _indexToken, uint256 _collateralDelta, uint256 _sizeDelta, bool _isLong, uint256 _acceptablePrice, uint256 _minOut)
//         abi.decode(action.data, (address, uint256, uint256, bool, uint256, uint256));
//     }
// }
