// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "../assets/TokenLib.sol";
import "../Utils.sol";
import "../assets/AssetTracker.sol";

library Subscriptions {
    using AssetTracker for AssetTracker.Assets;
    using TokenLib for Token;

    event Deposit(address subscriber, uint256 subIdx, address token, uint256 balance);
    event Withdraw(address subscriber, uint256 subIdx, address token, uint256 balance);

    enum Status {
        ACTIVE,
        WITHDRAWN
    }

    struct Subscription {
        address subscriber;
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
    }

    struct SubStuff {
        Constraints constraints;
        Subscription[] subscriptions;
        uint256 totalCollateral; // tracking total ETH received from subscriptions
        uint256 subscriberToManagerFeePercentage; // 1% = 100;
        uint256 subscriberToPlatformFeePercentage; // 1% = 100;
        address platformFeeWallet;
    }

    function deposit(
        SubStuff storage subStuff,
        AssetTracker.Assets storage assets,
        Token memory collateralToken,
        uint256 collateralAmount
    ) public returns (uint256) {
        uint256 platformFee = (collateralAmount * subStuff.subscriberToPlatformFeePercentage) / 100_00;
        uint256 remainingColalteralAmount = collateralAmount - platformFee;
        validateCollateral(subStuff, collateralToken, remainingColalteralAmount);

        collateralToken.send(subStuff.platformFeeWallet, platformFee);

        Subscriptions.Subscription storage newSub = subStuff.subscriptions.push();
        newSub.subscriber = msg.sender;
        newSub.status = Subscriptions.Status.ACTIVE;
        newSub.collateralAmount = remainingColalteralAmount;

        subStuff.totalCollateral += remainingColalteralAmount;
        assets.increaseAsset(collateralToken, remainingColalteralAmount);

        emit Deposit(msg.sender, subStuff.subscriptions.length - 1, collateralToken.addr, collateralAmount);
        return subStuff.subscriptions.length - 1;
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
        Token memory collateralToken,
        uint256 collateralAmount
    ) public view returns (bool) {
        require(collateralToken.equals(subStuff.constraints.allowedDepositToken));

        if ((collateralToken.equals(Token({t: TokenType.NATIVE, addr: Constants.ETH})))) {
            require(collateralAmount == msg.value);
        }

        require(subStuff.constraints.minCollateralPerSub <= collateralAmount, "< minCollateralPerSub");
        require(subStuff.constraints.maxCollateralPerSub >= collateralAmount, "> maxCollateralPerSub");
        require(
            subStuff.constraints.maxCollateralTotal >= (subStuff.totalCollateral + collateralAmount),
            "> maxColalteralTotal"
        );
        require(block.timestamp < subStuff.constraints.deadline);

        return true;
    }

    function withdrawCollateral(
        SubStuff storage subStuff,
        uint256 subscriptionIdx,
        AssetTracker.Assets storage assets
    ) public returns (Token[] memory, uint256[] memory) {
        Subscriptions.Subscription storage subscription = subStuff.subscriptions[subscriptionIdx];
        subscription.status = Subscriptions.Status.WITHDRAWN;

        assets.decreaseAsset(subStuff.constraints.allowedDepositToken, subscription.collateralAmount);
        subscription.status = Subscriptions.Status.WITHDRAWN;

        emit Withdraw(msg.sender, subscriptionIdx, Constants.ETH, subscription.collateralAmount);
        subStuff.constraints.allowedDepositToken.send(subscription.subscriber, subscription.collateralAmount);

        Token[] memory tokens = new Token[](1);
        tokens[0] = subStuff.constraints.allowedDepositToken;
        uint256[] memory balances = new uint256[](1);
        balances[0] = subscription.collateralAmount;
        return (tokens, balances);
    }

    function withdrawAssets(
        SubStuff storage subStuff,
        uint256 subscriptionIdx,
        AssetTracker.Assets storage assets
    ) public returns (Token[] memory, uint256[] memory) {
        Subscriptions.Subscription storage subscription = subStuff.subscriptions[subscriptionIdx];
        subscription.status = Subscriptions.Status.WITHDRAWN;

        Token[] memory tokens = new Token[](assets.tokens.length);
        uint256[] memory balances = new uint256[](assets.tokens.length);

        // TODO: potentially won't need the loop anymore if closing == swap back to 1 asset
        for (uint256 i = 0; i < assets.tokens.length; i++) {
            tokens[i] = assets.tokens[i];
            balances[i] =
                getShares(subStuff, assets, subscriptionIdx, assets.tokens[i]) -
                getManagementFeeShare(subStuff, assets, tokens[i]);
            emit Withdraw(msg.sender, subscriptionIdx, tokens[i].addr, balances[i]);
            tokens[i].send(subscription.subscriber, balances[i]);
        }
        return (tokens, balances);
    }

    function getManagementFeeShare(
        SubStuff memory subStuff,
        AssetTracker.Assets storage assets,
        Token memory token
    ) public view returns (uint256) {
        return (assets.coinBalances[token.addr] * subStuff.subscriberToManagerFeePercentage) / 100_00;
    }

    function getShares(
        SubStuff memory subStuff,
        AssetTracker.Assets storage assets,
        uint256 subscriptionIdx,
        Token memory token
    ) public view returns (uint256) {
        if (token.t == TokenType.ERC20 || token.t == TokenType.NATIVE) {
            return
                (subStuff.subscriptions[subscriptionIdx].collateralAmount * assets.coinBalances[token.addr]) /
                subStuff.totalCollateral;
        } else {
            revert(Constants.TOKEN_TYPE_NOT_RECOGNIZED);
        }
    }
}
