// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "hardhat/console.sol";

library CustomEnumerableMap {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    struct Bytes32ToBytesMap {
        mapping(bytes32 => bytes) _values;
        EnumerableSet.Bytes32Set _keys;
    }

    function set(
        Bytes32ToBytesMap storage map,
        bytes32 key,
        bytes memory value
    ) internal returns (bool) {
        map._values[key] = value;
        return map._keys.add(key);
    }

    /**
     * @dev Removes a key-value pair from a map. O(1).
     *
     * Returns true if the key was removed from the map, that is if it was present.
     */
    function remove(Bytes32ToBytesMap storage map, bytes32 key) internal returns (bool) {
        delete map._values[key];
        return map._keys.remove(key);
    }

    /**
     * @dev Returns true if the key is in the map. O(1).
     */
    function contains(Bytes32ToBytesMap storage map, bytes32 key) internal view returns (bool) {
        return map._keys.contains(key);
    }

    /**
     * @dev Returns the number of key-value pairs in the map. O(1).
     */
    function length(Bytes32ToBytesMap storage map) internal view returns (uint256) {
        return map._keys.length();
    }

    /**
     * @dev Returns the key-value pair stored at position `index` in the map. O(1).
     *
     * Note that there are no guarantees on the ordering of entries inside the
     * array, and it may change when more entries are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function at(Bytes32ToBytesMap storage map, uint256 index) internal view returns (bytes32, bytes storage) {
        bytes32 key = map._keys.at(index);
        return (key, map._values[key]);
    }

    /**
     * @dev Returns the value associated with `key`.  O(1).
     *
     * Requirements:
     *
     * - `key` must be in the map.
     */
    function get(Bytes32ToBytesMap storage map, bytes32 key) internal view returns (bytes storage) {
        require(contains(map, key), "EnumerableMap: nonexistent key");
        return map._values[key];
    }

    function keys(Bytes32ToBytesMap storage map) internal view returns (bytes32[] memory) {
        return map._keys.values();
    }
}
