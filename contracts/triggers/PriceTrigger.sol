// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ITrigger.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../utils/Utils.sol";

contract PriceTrigger is ITrigger, Ownable {
    // keyword -> fn call to get data
    // if we know how to get the value, then it can be a trigger. so this serves as a list of allowed triggers

    // TODO We might need to have multiple feeds and reconcile them.
    mapping(string => address) priceFeeds;

    constructor() {}

    function addPriceFeed(string calldata asset, address dataSource) external onlyOwner {
        priceFeeds[asset] = dataSource;
    }

    // This is always against USD
    // Assume decimals = 8 (i.e. 1 USD = 1e8), because this is true for all USD feeds as of this writing
    // Note, we're not using ASSET/ETH price even if they're available. We're always doing a ETH/USD separately and changing the denominator.
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

    // See note on _getPrice to see why we don't need a _scale function as seen in
    // https://docs.chain.link/docs/get-the-latest-price/#getting-a-different-price-denomination
    function check(Trigger calldata trigger) external view returns (bool, uint256) {
        // get the val of var, so we can check if it matches trigger
        (uint256 val, Ops op) = (trigger.value, trigger.op);
        (string memory asset1, string memory asset2) = abi.decode(trigger.param, (string, string));
        uint256 asset1price = _getPrice(asset1);
        uint256 res;

        if (Utils.strEq(asset2, "usd")) {
            res = asset1price; // decimals is 10**8
        } else {
            uint256 asset2price = _getPrice(asset2);
            res = (asset1price * 10**8) / asset2price; // Keeping the decimals at 10**8
        }

        if (op == Ops.GT) {
            return (res > val, res);
        } else if (op == Ops.LT) {
            return (res < val, res);
        }
        return (false, 0);
    }
}
