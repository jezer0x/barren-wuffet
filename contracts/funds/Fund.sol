// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../utils/subscriptions/ISubscription.sol";
import "../utils/Constants.sol";
import "../utils/Utils.sol";
import "../utils/FeeParams.sol";
import "../actions/IAction.sol";
import "../rules/IRoboCop.sol";
import "./IFund.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../utils/whitelists/WhitelistService.sol";
import "../utils/assets/AssetTracker.sol";

contract Fund is IFund, IERC721Receiver, Initializable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using AssetTracker for AssetTracker.Assets;
    using Subscriptions for Subscriptions.SubStuff;
    using TokenLib for Token;

    // constants
    string constant TOKENS_WHITELIST_NAME = "tokens";
    string constant INVESTORS_WHITELIST_NAME = "investors";

    // unique identifier for fund
    address manager;

    Subscriptions.SubStuff public subStuff;

    bool public degenMode; // if true, then ignore declaredTokens and let traders trade whatever token

    // vars the fund needs to know
    IRoboCop public roboCop; // roboCop dedicated to this fund
    FeeParams public feeParams;
    WhitelistService public wlService;
    bytes32 triggerWhitelistHash;
    bytes32 actionWhitelistHash;
    bytes32 declaredTokensWhitelistHash; 
    bytes32 investorsWhitelistHash; 

    // fund state that is modified over time
    AssetTracker.Assets assets;

    bool closed;

    // disable calling initialize() on the implementation contract
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _manager,
        Subscriptions.Constraints memory _constraints,
        FeeParams calldata _feeParams,
        address _wlServiceAddr,
        bytes32 _triggerWhitelistHash,
        bytes32 _actionWhitelistHash,
        address roboCopBeaconAddr,
        address[] calldata _declaredTokenAddrs,
        address botFrontendAddr
    ) external nonReentrant initializer {
        __ReentrancyGuard_init();

        manager = _manager;
        feeParams = _feeParams;
        wlService = WhitelistService(_wlServiceAddr);
        triggerWhitelistHash = _triggerWhitelistHash;
        actionWhitelistHash = _actionWhitelistHash;

        if (_declaredTokenAddrs.length == 0) {
            degenMode = true;
        } else {
            declaredTokensWhitelistHash = wlService.createWhitelist(TOKENS_WHITELIST_NAME);
            for (uint256 i = 0; i < _declaredTokenAddrs.length; i++) {
                wlService.addToWhitelist(declaredTokensWhitelistHash, _declaredTokenAddrs[i]);
            }
        }

        if (_constraints.onlyWhitelistedInvestors) {
            investorsWhitelistHash = wlService.createWhitelist(INVESTORS_WHITELIST_NAME);
        }

        subStuff.setConstraints(_constraints);
        subStuff.setSubscriptionFeeParams(
            _feeParams.subscriberToManagerFeePercentage,
            _feeParams.subscriberToPlatformFeePercentage,
            _feeParams.platformFeeWallet
        );

        roboCop = IRoboCop(address(new BeaconProxy(roboCopBeaconAddr, "")));
        roboCop.initialize(address(this), botFrontendAddr);
    }

    function _onlyDeclaredTokens(Token[] memory tokens) internal view returns (bool) {
        if (degenMode) return true;
        else {
            for (uint256 i = 0; i < tokens.length; i++) {
                if (
                    !wlService.isWhitelisted(
                        declaredTokensWhitelistHash,
                        tokens[i].addr
                    )
                ) {
                    return false;
                }
            }
        }
        return true;
    }

    modifier onlyFundManager() {
        require(manager == msg.sender, "F: onlyFundManager");
        _;
    }

    modifier onlyFundStatus(FundStatus desiredStatus) {
        require(getStatus() == desiredStatus, "F: Wrong State");
        _;
    }

    modifier onlyWhitelistedInvestor() {
        require(
            !subStuff.constraints.onlyWhitelistedInvestors ||
                wlService.isWhitelisted(investorsWhitelistHash, msg.sender), "F: onlyWhitelistedInvestors"
        );
        _;
    }

    function getInputTokens() external pure returns (Token[] memory) {
        Token[] memory tokens = new Token[](1);
        tokens[0] = Token({t: TokenType.NATIVE, addr: Constants.ETH, id: 0});
        return tokens;
    }

    function getOutputTokens() external pure returns (Token[] memory) {
        revert("Undefined");
    }

    function closeFund() external nonReentrant {
        require(!roboCop.hasPendingPosition(), "F: Pending Positions");

        if (getStatus() == FundStatus.CLOSABLE) {
            // anyone can call if closable
            if (subStuff.totalCollateral < subStuff.constraints.minCollateralTotal) {
                // never reached minCollateral, no managementFee
                subStuff.subscriberToManagerFeePercentage = 0;
            }
        } else {
            require(manager == msg.sender, "F: Only Fund Manager");
            // closed prematurely (so that people can withdraw their capital)
            // no managementFee since did not see through lockin
            subStuff.subscriberToManagerFeePercentage = 0;
        }

        _closeFund();
    }

    function _closeFund() internal {
        // TODO: this is potentially broken after the position stuff

        closed = true;
        _redeemRuleOutputs();
        bytes32[] memory activeRuleHashes = roboCop.getRuleHashesByStatus(RuleStatus.ACTIVE);
        bytes32[] memory inactiveRuleHashes = roboCop.getRuleHashesByStatus(RuleStatus.INACTIVE);

        for (uint256 i = 0; i < activeRuleHashes.length; i++) {
            _cancelRule(activeRuleHashes[i]);
        }

        for (uint256 i = 0; i < inactiveRuleHashes.length; i++) {
            _cancelRule(inactiveRuleHashes[i]);
        }

        // TODO: potentially swap back all assets to 1 terminal asset
        // How?

        emit Closed(address(this));
    }

    function _validateAndTakeFees(
        Token[] memory tokens,
        uint256[] memory collaterals,
        uint256[] memory fees
    ) internal {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i].isERC20() || tokens[i].isETH()) {
                require(fees[i] >= ((collaterals[i] * feeParams.managerToPlatformFeePercentage) / 100_00), "F: Not enough fees");
                tokens[i].send(feeParams.platformFeeWallet, fees[i]);
            }
        }
    }

    function takeAction(
        Trigger calldata trigger,
        Action calldata action,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) public nonReentrant onlyFundStatus(FundStatus.DEPLOYED) onlyFundManager {
        return _takeAction(trigger, action, collaterals, fees);
    }

    function takeActionToClosePosition(
        Trigger calldata trigger,
        Action calldata action,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) public nonReentrant onlyFundStatus(FundStatus.DEPLOYED) {
        require(block.timestamp >= subStuff.constraints.lockin, "F: not expired yet"); // fund expired
        require(roboCop.actionClosesPendingPosition(action), "F: no relevant open position"); // but positions are still open that can be closed by this
        _takeAction(trigger, action, collaterals, fees);
        // TODO: how to make sure new action does not spawn another position?
    }

    function _takeAction(
        Trigger calldata trigger,
        Action calldata action,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) internal {
        Trigger[] memory triggers = new Trigger[](1);
        triggers[0] = trigger;
        Action[] memory actions = new Action[](1);
        actions[0] = action;
        bytes32 ruleHash = _createRule(triggers, actions, true, collaterals, fees);
        roboCop.executeRule(ruleHash); // should be immediately executable
        _redeemRuleOutputs();
    }

    function createRule(Trigger[] calldata triggers, Action[] calldata actions, bool activate, uint256[] calldata collaterals,
        uint256[] calldata fees) external
        nonReentrant
        onlyFundStatus(FundStatus.DEPLOYED)
        onlyFundManager
        returns (bytes32) 
    {
        return _createRule(triggers, actions, activate, collaterals, fees);

    }

    function createRules(Trigger[][] calldata triggersArr, Action[][] calldata actionsArr, bool[] calldata activateArr, uint256[][] calldata collateralsArr,
        uint256[][] calldata feesArr) external         nonReentrant
        onlyFundStatus(FundStatus.DEPLOYED)
        onlyFundManager returns (bytes32[] memory) {
            bytes32[] memory ruleHashes = new bytes32[](triggersArr.length); 
            for (uint i = 0; i < triggersArr.length; i++) {
                ruleHashes[i] = _createRule(triggersArr[i], actionsArr[i], activateArr[i], collateralsArr[i], feesArr[i]);
            }
            return ruleHashes; 
        }

    function _createRule(Trigger[] memory triggers, Action[] memory actions, bool activate, uint256[] memory collaterals,
        uint256[] memory fees) internal returns (bytes32 ruleHash) {
        for (uint256 i = 0; i < triggers.length; i++) {
            require(wlService.isWhitelisted(triggerWhitelistHash, triggers[i].callee), "F: !AuthorizedTrigger");
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(wlService.isWhitelisted(actionWhitelistHash, actions[i].callee), "F: !AuthorizedAction");
        }
        for (uint256 i = 0; i < actions.length; i++) {
            require(_onlyDeclaredTokens(actions[i].outputTokens), "F: !AuthorizedToken");
        }
        ruleHash = roboCop.createRule(triggers, actions);

        if (collaterals.length > 0) {
            _addRuleCollateral(ruleHash, collaterals, fees);
        }

        if (activate) {
            roboCop.activateRule(ruleHash);
        }

        return ruleHash; 
    }

    function activateRule(bytes32 ruleHash) external onlyFundStatus(FundStatus.DEPLOYED) onlyFundManager nonReentrant {
        roboCop.activateRule(ruleHash);
    }

    function deactivateRule(bytes32 ruleHash)
        external
        onlyFundStatus(FundStatus.DEPLOYED)
        onlyFundManager
        nonReentrant
    {
        roboCop.deactivateRule(ruleHash);
    }

    function addRuleCollateral(
        bytes32 ruleHash,
        uint256[] calldata collaterals,
        uint256[] calldata fees
    ) external onlyFundStatus(FundStatus.DEPLOYED) onlyFundManager nonReentrant {
        _addRuleCollateral(ruleHash, collaterals, fees);
    }

    function _addRuleCollateral(
        bytes32 ruleHash,
        uint256[] memory collaterals,
        uint256[] memory fees
    ) internal {
        Token[] memory collateralTokens = roboCop.getInputTokens(ruleHash);
        _validateAndTakeFees(collateralTokens, collaterals, fees);
        uint256 ethCollateral = 0;

        for (uint256 i = 0; i < collateralTokens.length; i++) {
            Token memory token = collateralTokens[i];
            uint256 amount = collaterals[i];
            assets.decreaseAsset(token, amount);
            token.approve(address(roboCop), amount);
            if (token.isETH()) {
                ethCollateral = amount;
            }
        }

        // slither-disable-next-line arbitrary-send-eth
        roboCop.addCollateral{value: ethCollateral}(ruleHash, collaterals);
    }

    function reduceRuleCollateral(bytes32 ruleHash, uint256[] calldata collaterals)
        external
        onlyFundStatus(FundStatus.DEPLOYED)
        onlyFundManager
        nonReentrant
    {
        _reduceRuleCollateral(ruleHash, collaterals);
    }

    function _reduceRuleCollateral(bytes32 ruleHash, uint256[] memory collaterals) internal {
        Token[] memory inputTokens = roboCop.getInputTokens(ruleHash);
        roboCop.reduceCollateral(ruleHash, collaterals);

        for (uint256 i = 0; i < inputTokens.length; i++) {
            assets.increaseAsset(inputTokens[i], collaterals[i]);
        }
    }

    function cancelRule(bytes32 ruleHash) external onlyFundStatus(FundStatus.DEPLOYED) onlyFundManager nonReentrant {
        _cancelRule(ruleHash);
    }

    function _cancelRule(bytes32 ruleHash) internal {
        Rule memory rule = roboCop.getRule(ruleHash);
        if (rule.status != RuleStatus.INACTIVE) {
            roboCop.deactivateRule(ruleHash);
        }
        _reduceRuleCollateral(ruleHash, rule.collaterals);
    }

    function redeemRuleOutputs() external onlyFundStatus(FundStatus.DEPLOYED) onlyFundManager nonReentrant {
        _redeemRuleOutputs();
    }

    function _redeemRuleOutputs() internal {
        (Token[] memory outputTokens, uint256[] memory outputs) = roboCop.redeemOutputs();

        for (uint256 i = 0; i < outputTokens.length; i++) {
            assets.increaseAsset(outputTokens[i], outputs[i]);
        }
    }

    function deposit(Token memory collateralToken, uint256 amountSent)
        external
        payable
        onlyFundStatus(FundStatus.RAISING)
        onlyWhitelistedInvestor
    {
        subStuff.deposit(assets, collateralToken, amountSent);
        emit Deposit(msg.sender, collateralToken.addr, amountSent);
    }

    function addInvestorToWhitelist(address[] calldata investors)
        external
        onlyFundManager
        onlyFundStatus(FundStatus.RAISING)
        nonReentrant
    {
        for (uint256 i = 0; i < investors.length; i++) {
            wlService.addToWhitelist(investorsWhitelistHash, investors[i]);
        }
    }

    function getStatus() public view returns (FundStatus) {
        if (closed) {
            return FundStatus.CLOSED;
        } else {
            // not closed yet
            if (block.timestamp < subStuff.constraints.deadline) {
                return FundStatus.RAISING;
            } else {
                // reached raising deadline
                if (subStuff.totalCollateral < subStuff.constraints.minCollateralTotal) {
                    return FundStatus.CLOSABLE;
                } else {
                    // raised enough to deploy
                    if (block.timestamp < subStuff.constraints.lockin) {
                        return FundStatus.DEPLOYED;
                    } else {
                        // lockin exceeded
                        if (!roboCop.hasPendingPosition()) {
                            return FundStatus.CLOSABLE;
                        } else {
                            // positions still open
                            return FundStatus.DEPLOYED;
                        }
                    }
                }
            }
        }
    }

    function withdraw()
        external
        nonReentrant
        returns (Token[] memory tokens, uint256[] memory balances)
    {
        FundStatus status = getStatus();
        if (status == FundStatus.CLOSABLE) {
            revert("!C");
        } else if (status == FundStatus.RAISING) {
            emit Withdraw(msg.sender, Constants.ETH, subStuff.subscriptions[msg.sender].collateralAmount);
            (tokens, balances) = subStuff.withdrawCollateral(assets);
        } else if (status == FundStatus.CLOSED) {
            (tokens, balances) = subStuff.withdrawAssets(assets);
            for (uint256 i = 0; i < tokens.length; i++) {
                emit Withdraw(msg.sender, tokens[i].addr, balances[i]);
            }
        } else if (status == FundStatus.DEPLOYED) {
            revert("D");
        } else {
            revert(Constants.UNREACHABLE_STATE);
        }
    }

    function withdrawManagementFee()
        public
        onlyFundManager
        onlyFundStatus(FundStatus.CLOSED)
        nonReentrant
        returns (Token[] memory, uint256[] memory)
    {
        Token[] memory tokens = new Token[](assets.tokens.length);
        uint256[] memory balances = new uint256[](assets.tokens.length);

        for (uint256 i = 0; i < assets.tokens.length; i++) {
            tokens[i] = assets.tokens[i];
            balances[i] = subStuff.getManagementFeeShare(assets, tokens[i]);
            tokens[i].send(manager, balances[i]);
        }

        return (tokens, balances);
    }

    receive() external payable {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        // we don't need to save any info
        return this.onERC721Received.selector;
    }
}
