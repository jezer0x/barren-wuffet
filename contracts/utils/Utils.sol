// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "./Constants.sol";
import "./subscriptions/SubscriptionTypes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

library Utils {
    using SafeERC20 for IERC20;

    // https://github.com/GNSPS/solidity-bytes-utils/blob/6458fb2780a3092bc756e737f246be1de6d3d362/contracts/BytesLib.sol
    function toUint256(bytes memory _bytes, uint256 _start) internal pure returns (uint256) {
        require(_bytes.length >= _start + 32, "toUint256_outOfBounds");
        uint256 tempUint;

        assembly {
            tempUint := mload(add(add(_bytes, 0x20), _start))
        }

        return tempUint;
    }

    function strEq(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function _send(
        address receiver,
        uint256 balance,
        address token
    ) internal {
        if (token != Constants.ETH) {
            IERC20(token).safeTransfer(receiver, balance);
        } else {
            payable(receiver).transfer(balance);
        }
    }

    function _validateSubscriptionConstraintsBasic(SubscriptionConstraints calldata constraints) internal view {
        require(
            constraints.minCollateralPerSub <= constraints.maxCollateralPerSub,
            "minCollateralPerSub > maxCollateralPerSub"
        );
        require(
            constraints.minCollateralTotal <= constraints.maxCollateralTotal,
            "minTotalCollaterl > maxTotalCollateral"
        );
        require(constraints.minCollateralTotal >= constraints.minCollateralPerSub, "mininmums don't make sense");
        require(constraints.maxCollateralTotal >= constraints.maxCollateralPerSub, "maximums don't make sense");
        require(constraints.deadline >= block.timestamp, "deadline is in the past");
        require(constraints.lockin >= block.timestamp, "lockin is in the past");
        require(constraints.lockin > constraints.deadline, "lockin <= dealdine");
        require(constraints.rewardPercentage <= 100 * 100, "reward > 100%");
    }
}
