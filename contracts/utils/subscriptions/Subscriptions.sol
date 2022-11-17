// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import "../assets/TokenLib.sol";
import "../Utils.sol";
import "../assets/AssetTracker.sol";

library Subscriptions {
    using AssetTracker for AssetTracker.Assets;
    using TokenLib for Token;

    enum Status {
        ACTIVE,
        WITHDRAWN
    }

    struct Subscription {
        uint256 collateralAmount;
        Status status;
    }

    struct Constraints {
        uint256 minCollateralPerSub; // minimum amount needed as collateral to deposit
        uint256 maxCollateralPerSub; // max ...
        uint256 minCollateralTotal;
        uint256 maxCollateralTotal; // limit on subscription to protect from slippage DOS attacks
        uint256 deadline; // a block.timestamp, after which no one can deposit to this
        uint256 lockin; // a block.timestamp, until which no one can redeem (given trade/fund has been activated)
        Token allowedDepositToken;
        bool onlyWhitelistedInvestors; // if set to true, will create an investor whitelist
    }

    struct SubStuff {
        Constraints constraints;
        mapping(address => Subscription) subscriptions;
        uint256 totalCollateral; // tracking total ETH received from subscriptions
        uint256 subscriberToManagerFeePercentage; // 1% = 100;
        uint256 subscriberToPlatformFeePercentage; // 1% = 100;
        address platformFeeWallet;
    }


    modifier onlyActiveSubscriber(SubStuff storage subStuff) {
        require(
            subStuff.subscriptions[msg.sender].collateralAmount > 0 &&
                subStuff.subscriptions[msg.sender].status == Subscriptions.Status.ACTIVE,
            "F: !ActiveSubscriber"
        );
        _;
    }

    function deposit(
        SubStuff storage subStuff,
        AssetTracker.Assets storage assets,
        Token memory collateralToken,
        uint256 collateralAmount
    ) public {
        // Take the platform fee
        uint256 platformFee = (collateralAmount * subStuff.subscriberToPlatformFeePercentage) / 100_00;
        collateralToken.send(subStuff.platformFeeWallet, platformFee);

        uint256 remainingCollateralAmount = collateralAmount - platformFee;
        validateCollateral(subStuff, msg.sender, collateralToken, remainingCollateralAmount);

        Subscriptions.Subscription storage sub = subStuff.subscriptions[msg.sender];
        sub.status = Subscriptions.Status.ACTIVE;
        sub.collateralAmount += remainingCollateralAmount;

        subStuff.totalCollateral += remainingCollateralAmount;
        assets.increaseAsset(collateralToken, remainingCollateralAmount);
    }

    function setConstraints(SubStuff storage subStuff, Constraints memory constraints) public {
        validateSubscriptionConstraintsBasic(constraints);
        subStuff.constraints = constraints;
    }

    function setSubscriptionFeeParams(
        SubStuff storage subStuff,
        uint256 subscriberToManagerFeePercentage,
        uint256 subscriberToPlatformFeePercentage,
        address platformFeeWallet
    ) public {
        require(subscriberToManagerFeePercentage <= 100 * 100, "managementFee > 100%");
        require(subscriberToPlatformFeePercentage <= 100 * 100, "managementFee > 100%");

        subStuff.subscriberToManagerFeePercentage = subscriberToManagerFeePercentage;
        subStuff.subscriberToPlatformFeePercentage = subscriberToPlatformFeePercentage;
        subStuff.platformFeeWallet = platformFeeWallet;
    }

    function validateSubscriptionConstraintsBasic(Subscriptions.Constraints memory constraints) public view {
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
        require(constraints.lockin > constraints.deadline, "lockin <= deadline");
    }

    function validateCollateral(
        SubStuff storage subStuff,
        address subscriber,
        Token memory collateralToken,
        uint256 collateralAmount
    ) public view returns (bool) {
        require(collateralToken.equals(subStuff.constraints.allowedDepositToken));

        uint256 prevCollateralAmount = subStuff.subscriptions[subscriber].collateralAmount;

        if ((collateralToken.isETH())) {
            require(collateralAmount == msg.value);
        }

        require(subStuff.constraints.minCollateralPerSub <= collateralAmount, "< minCollateralPerSub");
        require(
            subStuff.constraints.maxCollateralPerSub >= collateralAmount + prevCollateralAmount,
            "> maxCollateralPerSub"
        );
        require(
            subStuff.constraints.maxCollateralTotal >= (subStuff.totalCollateral + collateralAmount),
            "> maxColalteralTotal"
        );
        require(block.timestamp < subStuff.constraints.deadline);

        return true;
    }

    function withdrawCollateral(SubStuff storage subStuff, AssetTracker.Assets storage assets)
        public
        onlyActiveSubscriber(subStuff)
        returns (Token[] memory, uint256[] memory)
    {
        Subscriptions.Subscription storage subscription = subStuff.subscriptions[msg.sender];
        subscription.status = Subscriptions.Status.WITHDRAWN;
        uint256 amountToSendBack = subscription.collateralAmount;
        subscription.collateralAmount = 0;

        subStuff.totalCollateral -= amountToSendBack;
        assets.decreaseAsset(subStuff.constraints.allowedDepositToken, amountToSendBack);

        subStuff.constraints.allowedDepositToken.send(msg.sender, amountToSendBack);

        Token[] memory tokens = new Token[](1);
        tokens[0] = subStuff.constraints.allowedDepositToken;
        uint256[] memory balances = new uint256[](1);
        balances[0] = amountToSendBack;

        return (tokens, balances);
    }

    function withdrawAssets(SubStuff storage subStuff, AssetTracker.Assets storage assets)
        public
        onlyActiveSubscriber(subStuff)
        returns (Token[] memory, uint256[] memory)
    {
        Subscriptions.Subscription storage subscription = subStuff.subscriptions[msg.sender];
        subscription.status = Subscriptions.Status.WITHDRAWN;

        Token[] memory tokens = new Token[](assets.tokens.length);
        uint256[] memory balances = new uint256[](assets.tokens.length);

        // TODO: potentially won't need the loop anymore if closing == swap back to 1 asset
        for (uint256 i = 0; i < assets.tokens.length; i++) {
            tokens[i] = assets.tokens[i];
            balances[i] =
                getShares(subStuff, assets, msg.sender, assets.tokens[i]) -
                getManagementFeeShare(subStuff, assets, tokens[i]);
            tokens[i].send(msg.sender, balances[i]);
        }
        return (tokens, balances);
    }

    function getManagementFeeShare(
        SubStuff storage subStuff,
        AssetTracker.Assets storage assets,
        Token memory token
    ) public view returns (uint256) {
        return (assets.balances[keccak256(abi.encode(token))] * subStuff.subscriberToManagerFeePercentage) / 100_00;
    }

    function getShares(
        SubStuff storage subStuff,
        AssetTracker.Assets storage assets,
        address subscriber,
        Token memory token
    ) public view returns (uint256) {
        if (token.isERC20() || token.isETH()) {
            return
                (subStuff.subscriptions[subscriber].collateralAmount * assets.balances[keccak256(abi.encode(token))]) /
                subStuff.totalCollateral;
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }
}
