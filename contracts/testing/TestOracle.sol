// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Alternatively this contract can be mocked in the test suite using Waffle by providing just the json and setting the return values
// https://ethereum.stackexchange.com/questions/127626/how-to-mock-smart-contract-function-for-testing-in-hardhat

// import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
// not actually inheriting it because I dont want to implement the whole thing.abi

contract TestOracle {
    uint price;
    constructor(uint _price) {
        price = _price;
    }

    function latestRoundData() external
    view returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    ) {
        return (uint80(1), int256(price), uint256(1), uint256(1), uint80(1));
    }
    
    function setPrice(uint _price) public {
        price = _price;
    }
}