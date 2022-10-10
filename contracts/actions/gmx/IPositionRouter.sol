// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

struct IncreasePositionRequest {
    address account;
    address[] path;
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

struct DecreasePositionRequest {
    address account;
    address[] path;
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
        bytes32 _referralCode
    ) external payable;

    function createIncreasePositionETH(
        address[] memory _path,
        address _indexToken,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _acceptablePrice,
        uint256 _executionFee,
        bytes32 _referralCode
    ) external payable;

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
        bool _withdrawETH
    ) external payable;

    function increasePositionsIndex(address) external returns (uint256);

    function decreasePositionsIndex(address) external returns (uint256);

    function getRequestKey(address, uint256) external returns (bytes32);

    function increasePositionRequests(bytes32) external returns (IncreasePositionRequest memory);

    function decreasePositionRequests(bytes32) external returns (DecreasePositionRequest memory);

    function weth() external returns (address);

    function router() external returns (address);

    function vault() external returns (address);

    function minExecutionFee() external returns (uint256);
}
