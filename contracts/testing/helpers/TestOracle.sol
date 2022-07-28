// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Alternatively this contract can be mocked in the test suite using Waffle by providing just the json and setting the return values
// https://ethereum.stackexchange.com/questions/127626/how-to-mock-smart-contract-function-for-testing-in-hardhat

// Will return the value set in the constructor when getPrice is called with any value
contract TestOracle {
    uint price;
    constructor(uint _price) {
        price = _price;
    }
    function getPrice() public view returns (uint) {
        return price;
    }
}