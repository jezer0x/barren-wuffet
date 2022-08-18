
/**
 * BEWARE:
 * Token / eth balances checks can only be used once in a chained assert
 * And it has to be the first check. Otherwise they end up ignoring all the checks above them.
 * To work around this, store the expect condition and do checks in separate statements instead of chaining
 * eg. 
 * await ex.to.changeTokenBalance(token, contract, val);
 * await ex.to.changeEtherBalance(contract, val);
 */

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { BigNumber, constants, utils } from "ethers";
import { setupRuleExecutor, makePassingTrigger, makeFailingTrigger, makeSwapAction, createRule } from "./Fixtures"
import { BAD_RULE_HASH, ERC20_DECIMALS, DEFAULT_REWARD, PRICE_TRIGGER_DECIMALS, UNI_PRICE_IN_ETH, ETH_PRICE_IN_UNI, UNI_PRICE_IN_ETH_PARAM, LT, ETH_PRICE_IN_UNI_PARAM, GT } from "./Constants"
import { deployments } from "hardhat";


describe("RuleExecutor", () => {

  async function deployRuleExecutorFixture() {
    await deployments.fixture();
    return await setupRuleExecutor();
  }

  describe("Deployment", () => {
    it("Should set the right owner", async function () {
      const { ruleExecutor, ownerWallet } = await loadFixture(deployRuleExecutorFixture);

      expect(await ruleExecutor.owner()).to.equal(ownerWallet.address);
    });
  });

  describe("Add Rule By Anyone", () => {

    it.skip("Should revert if no trigger is specified", async () => {
    });

    it.skip("Should revert if no action is specified", async () => {
    });

    it("Should revert if trigger doesnt have a callee with validateTrigger", async () => {
      const { ruleExecutor, swapUniSingleAction, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const badTrigger = makePassingTrigger(constants.AddressZero); // passing trigger with bad address
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      whitelistService.disableWhitelist(trigWlHash);
      whitelistService.disableWhitelist(actWlHash);
      await expect(ruleExecutor.connect(ruleMakerWallet).createRule([badTrigger], [executableAction])).to.be.revertedWithoutReason();
    });

    it.skip("Should revert if validateTrigger on trigger does not return true", async () => {
      // Use BadPriceTrigger. I am yet not sure what damage this can do, and what protection we should have for this.      
    });

    it.skip("Should revert if validateTrigger on trigger is not a view fn", async () => {
      // Use BadPriceTrigger. I am yet not sure what damage this can do, and what protection we should have for this.

    });


    it("Should revert if action doesnt have a callee with validate", async () => {
      const { ruleExecutor, priceTrigger, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const badAction = makeSwapAction(constants.AddressZero, testToken1.address);
      whitelistService.disableWhitelist(trigWlHash);
      whitelistService.disableWhitelist(actWlHash);

      await expect(ruleExecutor.connect(ruleMakerWallet).createRule([passingTrigger], [badAction])).to.be.revertedWithoutReason();

    });

    it.skip("Should revert if validate on action does not return true", async () => {

      // KIV This. currently we dont have a situation where the action fails validation.


    });

    it.skip("Should revert if validate on action is not a view fn", async () => {
      // KIV. Need to create a bad action. I am yet not sure what damage this can do, and what protection we should have for this.


    });

    it("Should revert if trigger has not been whitelisted", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      await expect(ruleExecutor.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction])).to.be.revertedWith("Unauthorized Trigger");
    });

    it("Should revert if action has not been whitelisted", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1, whitelistService, trigWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makeFailingTrigger(priceTrigger.address); // pass / fail shouldnt matter here
      whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);

      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      await expect(ruleExecutor.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction])).to.be.revertedWith("Unauthorized Action");
    });

    it("Should emit Created event, and consume ETH reward if Trigger and Action are valid", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makeFailingTrigger(priceTrigger.address); // pass / fail shouldnt matter here
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);
      whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address)

      const reward = utils.parseEther("0.02");
      await expect(ruleExecutor.connect(ruleMakerWallet).createRule(
        [passingTrigger], [executableAction], { value: reward })).to
        .changeEtherBalances(
          [ruleExecutor, ruleMakerWallet],
          [reward, BigNumber.from(0).sub(reward)]
        ).and.to
        .emit(ruleExecutor, "Created")
        .withArgs(anyValue);
    });

    it("creates rule even without reward, and getRule returns the rule if the rule was successfully created", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makeFailingTrigger(priceTrigger.address); // pass / fail shouldnt matter here
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);
      whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address)

      let ruleHash;
      await expect(ruleExecutor.connect(ruleMakerWallet).createRule(
        [passingTrigger], [executableAction])).to
        .changeEtherBalances(
          [ruleExecutor, ruleMakerWallet],
          [0, 0]
        ).and.to
        .emit(ruleExecutor, "Created")
        .withArgs((h: string) => { ruleHash = h; return h; });

      await expect(ruleExecutor.getRule(BAD_RULE_HASH)).to.be.revertedWith("Rule not found");

      expect(await ruleExecutor.getRule(ruleHash)).to.satisfy((data: any) => {
        // console.log(data); 
        return false;
        // TODO need to check if data is right
      });

    });

    it.skip("If trigger, action, constrains, user, block are the same, ruleHash should be the same -> making the second creation fail", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);


      whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);
      whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address)


      var rule1Hash: string;
      // TODO: 
      // This fails because the block isnt the same across these calls.
      // We need to find a way to make both txes part of the same block
      await expect(ruleExecutor.connect(ruleMakerWallet).createRule(
        [passingTrigger], [executableAction])).to.emit(ruleExecutor, "Created")
        .withArgs((_hash: string) => { rule1Hash = _hash; return true; });

      await expect(ruleExecutor.connect(ruleMakerWallet).createRule(
        [passingTrigger], [executableAction])).to.emit(ruleExecutor, "Created")
        .withArgs((_hash2: string) => rule1Hash == _hash2);
    });


    it("Should be able to create multiple unique rules with the same trigger, action, constraints and a different user", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, botWallet, testToken1, ruleSubscriberWallet, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const ruleMakerWallet2 = botWallet;

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);
      whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address)

      var rule1Hash: string;
      await expect(ruleExecutor.connect(ruleMakerWallet).createRule(
        [passingTrigger], [executableAction])).to.emit(ruleExecutor, "Created")
        .withArgs((_hash: string) => { rule1Hash = _hash; return true; });

      await expect(ruleExecutor.connect(ruleMakerWallet2).createRule(
        [passingTrigger], [executableAction])).to.emit(ruleExecutor, "Created")
        .withArgs((_hash2: string) => rule1Hash != _hash2);
    });

  });

  describe("Check Rule", () => {
    it("should return false if the checkTrigger on the rule denoted by ruleHash returns false", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, botWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const failingTrigger = makeFailingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, constants.AddressZero);
      const ruleHash = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [failingTrigger], [tokenSwapAction], ruleMakerWallet);

      expect(await ruleExecutor.connect(botWallet).checkRule(ruleHash)).to.equal(false);

    });

    it.skip("should return false if the checkTrigger is not available on the callee", async () => {
      // WE need to create a Badtrigger for this. 
      // And it's better to test for malicious checkTrigger vs. a non-existent checkTrigger
      // We already check for validateTrigger and revent random addresses from being included      
    });

    it("should return true if the checkTrigger on the callee denoted by ruleHash returns true", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, botWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, constants.AddressZero);
      const ruleHash = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [passingTrigger], [tokenSwapAction], ruleMakerWallet);

      expect(await ruleExecutor.connect(botWallet).checkRule(ruleHash)).to.equal(true);
    });

    it("should return false if one of multiple triggers is invalid", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, botWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const failingTrigger = makeFailingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, constants.AddressZero);
      const ruleHash = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [passingTrigger, failingTrigger], [tokenSwapAction], ruleMakerWallet);

      expect(await ruleExecutor.connect(botWallet).checkRule(ruleHash)).to.equal(false);

    });

    it.skip("should return true if all of multiple triggers are valid", async () => {

    });
  });

  describe("Execute Rule with Failing Trigger", () => {
    it("Should revert if anyone tries to execute the rule, and the trigger fails", async () => {
      // It appears that this rule has to be placed before the deployValidRuleFixture.
      // since it calls the deployRuleExecutorFixture
      // It causes all tests after it to fail, if it is located after tests that use deployValidRuleFixture
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, botWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makeFailingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, constants.AddressZero);
      const ruleHash = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [passingTrigger], [tokenSwapAction], ruleMakerWallet, true);


      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHash)).to.be.rejectedWith("Trigger != Satisfied");

    });
  });

  async function deployValidRuleFixture() {
    const { ruleExecutor, swapUniSingleAction, priceTrigger, ownerWallet, ruleMakerWallet,
      ruleSubscriberWallet, botWallet, testToken1, testToken2, WETH, whitelistService,
      trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

    const ethUniPassingTrigger = {
      op: GT,
      param: ETH_PRICE_IN_UNI_PARAM,
      callee: priceTrigger.address,
      value: ETH_PRICE_IN_UNI.sub(1)
    };

    const uniEthPassingTrigger = {
      op: LT,
      param: UNI_PRICE_IN_ETH_PARAM,
      callee: priceTrigger.address,
      value: UNI_PRICE_IN_ETH.add(1)
    }

    // to get ETH from uniswap, you need to set the output token as WETH.
    const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, constants.AddressZero);
    const ethSwapAction = makeSwapAction(swapUniSingleAction.address, constants.AddressZero, testToken1.address);

    whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);
    whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address)

    const ruleHashEth = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [uniEthPassingTrigger], [ethSwapAction], ruleSubscriberWallet, true);
    const ruleHashToken = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [ethUniPassingTrigger], [tokenSwapAction], ruleSubscriberWallet, true);

    await testToken1.transfer(ruleSubscriberWallet.address, BigNumber.from(200000).mul(ERC20_DECIMALS));
    return { ruleHashEth, ruleHashToken, ruleExecutor, ownerWallet, ruleSubscriberWallet, botWallet, testToken1, testToken2 };

  }

  describe("Add / Reduce Collateral", function () {

    it("should revert if add / reduce collateral is called on a non-existent ruleHash", async () => {
      const { ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      // these error with onlyRuleOwner because the non existent hash doesnt belong to the subscriber
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(BAD_RULE_HASH, 1000)).to.be.revertedWith("onlyRuleOwner");
      await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(BAD_RULE_HASH, 1000)).to.be.revertedWith("onlyRuleOwner");
    });

    it("should revert if > 0 native is not sent to addCollateral for an native action", async () => {
      const { ruleHashEth, ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);

      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, 0)).to.be.revertedWith("amount <= 0");
    });

    it("should revert if > 0 ERC20 isnt sent / approved to addCollateral for an ERC20 rule", async () => {
      const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, 0)).to.be.revertedWith("amount <= 0");
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 6);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, 10)).to.be.revertedWith("ERC20: insufficient allowance");

      const balance = await testToken1.connect(ruleSubscriberWallet).balanceOf(ruleSubscriberWallet.address);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, balance.add(1));

      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, balance.add(1))).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should not allow anyone other than rule owner to add / reduce collateral to a rule", async () => {
      const { ruleHashEth, ruleHashToken, ruleExecutor, testToken1, ruleSubscriberWallet, botWallet } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = utils.parseEther("1");
      await expect(ruleExecutor.connect(botWallet).addCollateral(ruleHashEth, collateralAmount, { value: collateralAmount })).to.be.revertedWith("onlyRuleOwner");

      // this should work
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, collateralAmount, { value: collateralAmount });
      // now that there is some collateral, we confirm  that it cant be removed to a different user.
      await expect(ruleExecutor.connect(botWallet).reduceCollateral(ruleHashEth, collateralAmount)).to.be.revertedWith("onlyRuleOwner");

      // check for tokens as well. 
      await testToken1.connect(botWallet).approve(ruleExecutor.address, collateralAmount);
      await expect(ruleExecutor.connect(botWallet).addCollateral(ruleHashToken, collateralAmount)).to.be.revertedWith("onlyRuleOwner");
      await expect(ruleExecutor.connect(botWallet).reduceCollateral(ruleHashToken, collateralAmount)).to.be.revertedWith("onlyRuleOwner");
    });

    it("should revert if collateral amount does not match msg.value for native actions", async () => {
      const { ruleHashEth, ruleSubscriberWallet, ruleExecutor, botWallet } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, 12, { value: 3 })).to.be.revertedWith("ETH: amount != msg.value");
    });

    [1, 0].forEach((isNative) => {
      const assetType = isNative ? "native" : "erc20";
      it("should not allow removing collateral if no collateral has been added: " + assetType, async () => {
        const { ruleHashEth, ruleHashToken, ruleExecutor, ruleSubscriberWallet } = await loadFixture(deployValidRuleFixture);
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, 12)).to.be.revertedWith("Not enough collateral.");
      });

      it("should receive token and emit CollateralAdded event if addCollateral is called successfully: " + assetType, async () => {
        const { ruleHashEth, ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
        const collateralAmount = BigNumber.from(1).mul(ERC20_DECIMALS); // ETH is also 18 decimals so this works out both ways
        const msgValue = isNative ? collateralAmount : 0;
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        if (!isNative)
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);

        const changeWallets = [ruleSubscriberWallet, ruleExecutor];
        const changeAmounts = [BigNumber.from(0).sub(collateralAmount), collateralAmount];
        const ethChange = isNative ? changeAmounts : [0, 0];
        const tokenChange = !isNative ? changeAmounts : [0, 0];

        const ex = expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHash, collateralAmount, { value: msgValue }));
        await ex.to
          .changeEtherBalances(changeWallets, ethChange).and
          .emit(ruleExecutor, "CollateralAdded").withArgs(ruleHash, collateralAmount);

        await ex.to.changeTokenBalances(testToken1, changeWallets, tokenChange);

        // allows adding collateral multiple times
        const collateralAmount2 = BigNumber.from(1).mul(ERC20_DECIMALS);
        const ethChange2 = isNative ? [BigNumber.from(0).sub(collateralAmount2), collateralAmount2] : [0, 0];
        const tokenChange2 = !isNative ? [BigNumber.from(0).sub(collateralAmount2), collateralAmount2] : [0, 0];

        if (!isNative)
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount.add(collateralAmount2));

        const ex2 = expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHash, collateralAmount2, { value: isNative ? collateralAmount2 : 0 }));
        await ex2.to
          .changeEtherBalances(changeWallets, ethChange2).and
          .emit(ruleExecutor, "CollateralAdded").withArgs(ruleHash, collateralAmount2);
        await ex2.to.changeTokenBalances(testToken1, changeWallets, tokenChange2);
      });

      it("should refund token emit CollateralReduced event if reduceCollateral is called successfully: " + assetType, async () => {
        const { ruleHashEth, ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
        const collateralAmount = BigNumber.from(10).mul(ERC20_DECIMALS);
        const msgValue = isNative ? collateralAmount : 0;
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;

        if (!isNative)
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);

        await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHash, collateralAmount, { value: msgValue });

        const reduceAmount = collateralAmount.sub(1);
        const changeWallets = [ruleSubscriberWallet, ruleExecutor];
        const changeAmounts = [reduceAmount, BigNumber.from(0).sub(reduceAmount)];
        const ethChange = isNative ? changeAmounts : [0, 0];
        const tokenChange = !isNative ? changeAmounts : [0, 0];


        const ex = expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, reduceAmount));
        await ex.to
          .changeEtherBalances(changeWallets, ethChange).and
          .emit(ruleExecutor, "CollateralReduced")
          .withArgs(ruleHash, reduceAmount);

        await ex.to.changeTokenBalances(testToken1, changeWallets, tokenChange);
      });

      it("Should not allow removing more collateral than available:" + assetType, async () => {
        const { ruleHashToken, testToken1, ruleHashEth, ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
        const collateralAmount = BigNumber.from(49).mul(ERC20_DECIMALS);
        const msgValue = isNative ? collateralAmount : 0;
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        if (!isNative)
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);

        await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHash, collateralAmount, { value: msgValue })

        await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, collateralAmount.add(1))).to.be.revertedWith("Not enough collateral.");
        await ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, collateralAmount);
        await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, 1)).to.be.revertedWith("Not enough collateral.");
      });

    });

    // should not allow adding collateral to a cancelled or executed rule
    // this is handled in the rule cancellation section.

    it.skip("should allow adding collateral based on the first action, even if subsequent actions have different collateral requirements", () => {

    });

  });

  describe("Execute Rule", () => {
    it("should revert if anyone tries to execute an unknown rule", async () => {
      const { ruleHashToken, botWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(botWallet).executeRule(BAD_RULE_HASH)).to.be.rejectedWith("Rule not found");
    });

    it.skip("Should revert if anyone tries to execute the rule, and action fails", async () => {
      // Need to create a dummy action and make it fail
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.be.rejectedWith("Action unsuccessful");
    });

    it.skip("placeholder for multiple triggers / actions", async () => { });
    // TODO Merge this and the native rule
    // Check for single and multiple triggers, and single and multiple actions

    it.skip("should not revert if anyone tries to execute a rule with no collateral", async () => {
    });

    // For some insane reason, if the native test is after the erc20 test, 
    // the addCollateral fails in the erc20 test.
    it("Should allow anyone to execute the rule once (native) and get a reward if gas is paid, and the trigger passes", async () => {
      // execute valid rule with collateral by someone else. and get a reward.
      const { ruleHashEth, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateral = utils.parseEther("2");
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, collateral, { value: collateral })).to.emit(ruleExecutor, "CollateralAdded");
      const ex = expect(ruleExecutor.connect(botWallet).executeRule(ruleHashEth));
      await ex.to
        .changeEtherBalances(
          // we dont care about the balance of the swap contracts, 
          // because that's a downstream impact we dont care about here.
          [botWallet, ruleSubscriberWallet, ruleExecutor],
          [DEFAULT_REWARD, 0, collateral.add(DEFAULT_REWARD).mul(-1)],
        ).and.to
        .emit(ruleExecutor, "Executed")
        .withArgs(ruleHashEth, botWallet.address);

      await ex.to.changeTokenBalances(
        testToken1,
        // this should reflect the reward.
        [botWallet, ruleSubscriberWallet, ruleExecutor],
        [0, 0, collateral.mul(ETH_PRICE_IN_UNI).div(PRICE_TRIGGER_DECIMALS)],
      );

      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashEth)).to.be.revertedWith("Rule isn't Activated");
    });

    it("Should allow anyone to execute the rule (token) and get a reward if gas is paid, and all the triggers passes", async () => {
      // execute valid rule with collateral by someone else. and get a reward.
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateral = BigNumber.from(5196).mul(ERC20_DECIMALS);
      await expect(testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateral)).to.not.be.reverted;
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateral)).to.emit(ruleExecutor, "CollateralAdded")
      const ex = expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken));
      await ex.to
        .changeTokenBalances(
          testToken1,
          [botWallet, ruleSubscriberWallet, ruleExecutor],
          [0, 0, collateral.mul(-1)],
        ).and
        .emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      await ex.to.changeEtherBalances(
        // this should reflect the rewarD.
        [botWallet, ruleSubscriberWallet, ruleExecutor],
        [DEFAULT_REWARD, 0, collateral.mul(UNI_PRICE_IN_ETH).div(PRICE_TRIGGER_DECIMALS).sub(DEFAULT_REWARD)],
      );

      // TODO need to implement caller getting paid.
      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("Rule isn't Activated");
    });

    it("Should revert if anyone tries to execute the rule twice", async () => {
      // we get here by calling a valid rule, using up the collateral and call again.
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 11);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, 6);
      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("Rule isn't Activated");

    });

    it("Should not allow adding / removing collateral after a rule is executed", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = BigNumber.from(15).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);
      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHashToken, collateralAmount)).to.be.revertedWith("Can't reduce collateral");
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, 1)).to.be.revertedWith("Can't add collateral");
    });
  });

  describe("Cancel rule", () => {
    it("should not allow anyone other than the rule owner to cancel the rule", async () => {
      const { ruleHashToken, botWallet, ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(botWallet).cancelRule(ruleHashToken)).to.be.revertedWith("onlyRuleOwner");
    });

    it("should not allow executing the rule or adding collateral if the rule was cancelled", async () => {
      const { ruleHashToken, botWallet, ruleSubscriberWallet, testToken1, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashToken)).to.emit(ruleExecutor, "Cancelled")
        .withArgs(ruleHashToken);

      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("Rule isn't Activated");
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 30);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, 30)).to.be.revertedWith("Can't add collateral");

    });

    it("should not allow cancelling rule if it's already executed", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed");
      await expect(ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashToken)).to.be.revertedWith("Can't Cancel Rule");

    });
    [0, 1].forEach(isActive => {
      it("should allow cancelling " + (isActive ? "active" : "inactive") + " rules, and return all added collateral", async () => {
        const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
        const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
        await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
        await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);
        if (!isActive) {
          await ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken);
        } else {
          // we activate the rules in the fixture so we dont need to explicitly activate them here.
          // await ruleExecutor.connect(ruleSubscriberWallet).activateRule(ruleHashToken);
        }

        await expect(ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashToken)).to
          .changeTokenBalances(
            testToken1,
            [ruleSubscriberWallet, ruleExecutor],
            [collateralAmount, BigNumber.from(0).sub(collateralAmount)]
          ).and
          .emit(ruleExecutor, "Cancelled").withArgs(ruleHashToken);
      });
    });

  });

  describe("Activate / Deactivate rule", () => {
    it("Should not allow executing a rule that has been deactivated (after it was active)", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);

      await expect(ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken)).to
        .emit(ruleExecutor, "Deactivated").withArgs(ruleHashToken);
      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("Rule isn't Activated");
    });

    it("Should allow executing a rule that has been activated (after it was deactivated)", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);

      await expect(ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken)).to
        .emit(ruleExecutor, "Deactivated").withArgs(ruleHashToken);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).activateRule(ruleHashToken)).to
        .emit(ruleExecutor, "Activated").withArgs(ruleHashToken);

      // check that the rule got executed correctly.
      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to
        .changeTokenBalances(
          testToken1,
          [botWallet, ruleSubscriberWallet, ruleExecutor],
          [0, 0, BigNumber.from(0).sub(collateralAmount)],
        ).and
        .emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, botWallet.address);
    });


    [0, 1].forEach((isCancelled) => {
      it("Should not allow activating / deactivating a " + (isCancelled ? "cancelled" : "executed") + " rule", async () => {
        const { ruleHashToken, ruleHashEth, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);

        // deactivate the eth rule, so we can try activating it later.
        if (isCancelled) {
          await ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashToken);
          await ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashEth);
          // Eth should not be "activate"-able.
          await ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashEth);
          // Now Eth should not be "activate"-able.
        } else {
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 50);
          await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, 50);
          await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, 50, { value: 50 });
          await ruleExecutor.connect(botWallet).executeRule(ruleHashToken);
          // No point deactivating eth here, because then we wont be able to execute it.
          await ruleExecutor.connect(botWallet).executeRule(ruleHashEth);
        }

        await expect(ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken)).to.be.revertedWith("Can't Deactivate Rule");
        await expect(ruleExecutor.connect(ruleSubscriberWallet).activateRule(ruleHashEth)).to.be.revertedWith("Can't Activate Rule");

      });
    });
  });

  describe("Redeem Balance", () => {

    it("should not allow redeeming balance if the rule is not yet executed", async () => {
      const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken)).to.be.revertedWith("Rule isn't pending redemption");
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken)).to.be.revertedWith("Rule isn't pending redemption");
    });


    it.skip("should result in no token changes if the rule was executed and did not return a token", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);

      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashToken)).to.not.be.rejected;

      const ex = expect(ruleExecutor.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken));
      await ex.to
        .changeTokenBalance(testToken1, ruleExecutor, 0)
        .emit(ruleExecutor, "Redeemed").withArgs(ruleHashToken);
      await ex.to.changeEtherBalance(ruleExecutor.address, 0);

    });

    it("should redeem all the balance only once by the subscriber if the rule was executed and returned native", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = BigNumber.from(500).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);
      await ruleExecutor.connect(botWallet).executeRule(ruleHashToken);
      await expect(ruleExecutor.connect(botWallet).redeemBalance(ruleHashToken)).to.be.revertedWith("onlyRuleOwner");

      const ex = expect(ruleExecutor.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken));
      await ex.to.changeEtherBalance(ruleSubscriberWallet, collateralAmount.mul(UNI_PRICE_IN_ETH).div(PRICE_TRIGGER_DECIMALS)).emit(ruleExecutor, "Redeemed").withArgs(ruleHashToken);

      await ex.to.changeTokenBalance(testToken1, ruleExecutor, 0);

      // can only redeem once.
      await expect(ruleExecutor.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken)).to.be.revertedWith("Rule isn't pending redemption");
    });

    it("should redeem all the balance only once by the subscriber if the rule was executed and returned token", async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = utils.parseEther("2"); // send 2 eth
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, collateralAmount, { value: collateralAmount });
      await ruleExecutor.connect(botWallet).executeRule(ruleHashEth);
      await expect(ruleExecutor.connect(botWallet).redeemBalance(ruleHashEth)).to.be.revertedWith("onlyRuleOwner");

      const ex = expect(ruleExecutor.connect(ruleSubscriberWallet).redeemBalance(ruleHashEth));

      const tokenReceived = collateralAmount.div(UNI_PRICE_IN_ETH).div(PRICE_TRIGGER_DECIMALS);

      await ex.to.changeTokenBalances(testToken1,
        [ruleExecutor, ruleSubscriberWallet],
        [tokenReceived.mul(-1), tokenReceived])
        .emit(ruleExecutor, "Redeemed").withArgs(ruleHashEth);

      await ex.to.changeEtherBalance(ruleExecutor.address, 0);

      // can only redeem once.
      await expect(ruleExecutor.connect(ruleSubscriberWallet).redeemBalance(ruleHashEth)).to.be.revertedWith("Rule isn't pending redemption");
    });

    it.skip("Should redeem balance only from the final action if multiple actions were executed", async () => {

    });

  });

  describe("Change Reward", () => {

    it(`should accummulate the reward provided to the executor, as the reward is increased by different wallets and not be editable after execution`, async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = BigNumber.from(3).mul(ERC20_DECIMALS);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, collateralAmount, { value: collateralAmount });

      await ruleExecutor.connect(ruleSubscriberWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await ruleExecutor.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashEth)).to
        // default reward + the 2 increases above.
        .changeEtherBalance(botWallet, DEFAULT_REWARD.mul(3));

      await expect(ruleExecutor.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD })).to.be.revertedWithoutReason();
      await expect(ruleExecutor.connect(botWallet).withdrawReward(ruleHashEth)).to.be.revertedWith("Reward paid");
    });

    it(`should allow any user to only remove the reward they added`, async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = BigNumber.from(3).mul(ERC20_DECIMALS);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, collateralAmount, { value: collateralAmount });

      await ruleExecutor.connect(ruleSubscriberWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await expect(ruleExecutor.connect(botWallet).withdrawReward(ruleHashEth)).to.revertedWith("0 contribution");

      await ruleExecutor.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await expect(ruleExecutor.connect(botWallet).withdrawReward(ruleHashEth)).to.changeEtherBalances(
        [botWallet, ruleExecutor],
        [DEFAULT_REWARD, DEFAULT_REWARD.mul(-1)]
      );
      await expect(ruleExecutor.connect(botWallet).withdrawReward(ruleHashEth)).to.revertedWith("0 contribution");

      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashEth)).to
        .changeEtherBalance(botWallet, DEFAULT_REWARD.mul(2));
    });

    it(`should allow any user to change the reward if the rule is inactive`, async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = BigNumber.from(3).mul(ERC20_DECIMALS);
      await ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashEth);

      await ruleExecutor.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await expect(ruleExecutor.connect(botWallet).withdrawReward(ruleHashEth)).changeEtherBalance(botWallet, DEFAULT_REWARD);
      // tries to reduce the reward added at the point of rule creation
      await expect(ruleExecutor.connect(ruleSubscriberWallet).withdrawReward(ruleHashEth)).changeEtherBalance(ruleSubscriberWallet, DEFAULT_REWARD);

      await ruleExecutor.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });

      await ruleExecutor.connect(ruleSubscriberWallet).activateRule(ruleHashEth);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, collateralAmount, { value: collateralAmount });

      await expect(ruleExecutor.connect(botWallet).executeRule(ruleHashEth)).to
        .changeEtherBalance(botWallet, DEFAULT_REWARD);

    });

    it(`should not allow anyone to increase the reward if the rule has been cancelled`, async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);

      await ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashEth);

      await expect(ruleExecutor.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD })).to.be.revertedWithoutReason();
      await expect(ruleExecutor.connect(ruleSubscriberWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD })).to.be.revertedWithoutReason();

    });

    it(`should allow users to remove the reward even if the rule has been cancelled`, async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);

      await ruleExecutor.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });

      await ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashEth);

      // we need to allow this, else you cant get the reward out of a cancelled contract.
      await expect(ruleExecutor.connect(ruleSubscriberWallet).withdrawReward(ruleHashEth)).to
        .changeEtherBalance(ruleSubscriberWallet, DEFAULT_REWARD);
      await expect(ruleExecutor.connect(botWallet).withdrawReward(ruleHashEth)).to
        .changeEtherBalance(botWallet, DEFAULT_REWARD);
    });

  });

  describe.skip("Pause Contract", () => {
    it("prevents executing a bunch of functions when paused and re-allows them when unpaused", () => {
      // ideally we should wrap all the pausable functions and add some kind of decorator to rerun the tests after vanilla / paused / unpaused.
      // that's the only way to check that a certain function actually has the whenPaused modifier 
    })
  });
});
