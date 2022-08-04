// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../RETypes.sol";
import "./ITrigger.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../Utils.sol";

contract PriceTrigger is ITrigger, Ownable {
    // keyword -> fn call to get data
    // if we know how to get the value, then it can be a trigger. so this serves as a list of allowed triggers

    // TODO We might need to have multiple feeds and reconcile them.
    mapping(string => address) priceFeeds;

    constructor() {}

    function addPriceFeed(string calldata asset, address dataSource) public onlyOwner {
        priceFeeds[asset] = dataSource;
    }

    function _getPrice(string memory asset) private view returns (uint256) {
        require(priceFeeds[asset] != address(0));
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeeds[asset]);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price >= 0, "price is negative!");
        return uint256(price); // WARNING: feels icky. Why did they not use uint?
    }

    function validate(Trigger calldata trigger) external view returns (bool) {
        (string memory asset1, string memory asset2) = abi.decode(trigger.param, (string, string));
        require(priceFeeds[asset1] != address(0), "asset1 unauthorized");
        require(Utils.strEq(asset2, "usd") || priceFeeds[asset2] != address(0));
        return true;
    }

    function check(Trigger calldata trigger) external view returns (bool, uint256) {
        // get the val of var, so we can check if it matches trigger
        (uint256 val, Ops op) = (trigger.value, trigger.op);
        (string memory asset1, string memory asset2) = abi.decode(trigger.param, (string, string));
        uint256 asset1price = _getPrice(asset1);
        uint256 res;

        if (Utils.strEq(asset2, "usd")) {
            res = asset1price;
        } else {
            uint256 asset2price = _getPrice(asset2);
            res = asset1price / asset2price;
        }

        if (op == Ops.GT) {
            return (res > val, res);
        } else if (op == Ops.LT) {
            return (res < val, res);
        }
        return (false, 0);
    }
}
