// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

struct IncreasePositionRequest {
    address account;
    address indexToken;
    uint256 amountIn;
    uint256 minOut;
    uint256 sizeDelta;
    bool isLong;
    uint256 acceptablePrice;
    uint256 executionFee;
    uint256 blockNumber;
    uint256 blockTime;
    bool hasCollateralInETH;
    address callbackTarget;
}

struct DecreasePositionRequest {
    address account;
    address indexToken;
    uint256 collateralDelta;
    uint256 sizeDelta;
    bool isLong;
    address receiver;
    uint256 acceptablePrice;
    uint256 minOut;
    uint256 executionFee;
    uint256 blockNumber;
    uint256 blockTime;
    bool withdrawETH;
    address callbackTarget;
}

struct DecreasePositionParams {
    address[] _path;
    address _indexToken;
    uint256 _collateralDelta;
    uint256 _sizeDelta;
    bool _isLong;
    uint256 _acceptablePrice;
    uint256 _minOut;
    bool _withdrawETH;
}

struct IncreasePositionParams {
    address[] _path;
    address _indexToken;
    uint256 _minOut;
    uint256 _sizeDelta;
    bool _isLong;
    uint256 _acceptablePrice;
}

interface IPositionRouter {
    function createIncreasePosition(
        address[] memory _path,
        address _indexToken,
        uint256 _amountIn,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _acceptablePrice,
        uint256 _executionFee,
        bytes32 _referralCode,
        address _callbackTarget
    ) external payable returns (bytes32); 

    function createIncreasePositionETH(
        address[] memory _path,
        address _indexToken,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _acceptablePrice,
        uint256 _executionFee,
        bytes32 _referralCode,
        address _callbackTarget
    ) external payable returns (bytes32); 

    function createDecreasePosition(
        address[] memory _path,
        address _indexToken,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver,
        uint256 _acceptablePrice,
        uint256 _minOut,
        uint256 _executionFee,
        bool _withdrawETH,
        address _callbackTarget
    ) external payable returns (bytes32); 

    function increasePositionsIndex(address) external returns (uint256);

    function decreasePositionsIndex(address) external returns (uint256);

    function getRequestKey(address, uint256) external returns (bytes32);

    function increasePositionRequests(bytes32) external view returns (IncreasePositionRequest memory);

    function decreasePositionRequests(bytes32) external view returns (DecreasePositionRequest memory);

    function weth() external returns (address);

    function router() external returns (address);

    function vault() external returns (address);

    function minExecutionFee() external returns (uint256);
}
