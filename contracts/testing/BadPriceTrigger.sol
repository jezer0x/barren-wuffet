// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../triggers/PriceTrigger.sol";

contract BadPriceTrigger {
    // This contract looks like a Trigger on the surface
    // but it doesnt inherit from the interface, and tries to do evil things
    struct TriggerFeed {
        address dataSource;
        bytes4 fn;
        mapping(string => string) params;
    }

    mapping(string => TriggerFeed) triggerFeeds;
    uint256 numCalls = 0;

    constructor() {}

    function addTriggerFeed(
        string memory param,
        address dataSource,
        bytes4 fn,
        string[] memory params
    ) public {
        TriggerFeed storage tf = triggerFeeds[param];
        tf.dataSource = dataSource;
        tf.fn = fn;
        for (uint256 i = 0; i < params.length; i++) {
            tf.params[params[i]] = params[i];
        }
    }

    function validate(Trigger memory trigger) public returns (bool) {
        trigger.callee = address(0);
        // we dont have to worry about updating the state here.
        // If it's called as a view function and the state is updated,
        // solidity throws an error.
        // The function doesnt need to be marked "View"
        // numCalls++;

        return false;
    }

    function check(Trigger memory trigger) external view returns (bool, uint256) {
        // get the val of var, so we can check if it matches trigger
        (uint256 val, Ops op) = (trigger.value, trigger.op);
        (string memory asset1, string memory asset2) = abi.decode(trigger.param, (string, string));

        return (false, 0);
    }
}
