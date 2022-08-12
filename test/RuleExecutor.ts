import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TriggerStruct, ActionStruct } from '../typechain-types/contracts/rules/RuleExecutor';
import { assert } from "console";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { int } from "hardhat/internal/core/params/argumentTypes";
import { Contract, Bytes } from "ethers";


const GT = 0;
const LT = 1;

const ETH_PRICE = 1300;
const UNI_PRICE = 3;
const ETH_UNI_PARAM = ethers.utils.defaultAbiCoder.encode(["string", "string"], ["eth", "uni"]);
const ETH_UNI_PRICE = (ETH_PRICE / UNI_PRICE);

const BAD_RULE_HASH = "0x" + "1234".repeat(16);

const DEFAULT_REWARD = 1;

function makePassingTrigger(triggerContract: string): TriggerStruct {
  return {
    op: GT,
    param: ETH_UNI_PARAM,
    callee: triggerContract,
    value: Math.round(ETH_UNI_PRICE - 1)
  };
}

function makeFailingTrigger(triggerContract: string): TriggerStruct {
  return {
    op: GT,
    param: ETH_UNI_PARAM,
    callee: triggerContract,
    value: Math.round(ETH_UNI_PRICE + 1)
  };
}

function makeSwapAction(swapContract: string,
  inputToken: string = ethers.constants.AddressZero,
  outputToken: string = ethers.constants.AddressZero): ActionStruct {
  return {
    callee: swapContract,
    data: "0x0000000000000000000000000000000000000000000000000000000000000000",
    inputToken: inputToken, // eth
    outputToken: outputToken
  };

}

async function createRule(_whitelistService: Contract, trigWlHash: Bytes, actWlHash: Bytes, _ruleExecutor: Contract, triggers: TriggerStruct[],
  actions: ActionStruct[], wallet: SignerWithAddress, activate: boolean = false): Promise<string> {
  triggers.map(t => _whitelistService.addToWhitelist(trigWlHash, t.callee));
  actions.map(a => _whitelistService.addToWhitelist(actWlHash, a.callee));

  // send 1 eth as reward.
  const tx = await _ruleExecutor.connect(wallet).createRule(triggers, actions, { value: DEFAULT_REWARD });
  const receipt2 = await tx.wait();

  const ruleHash = receipt2.events?.find(((x: { event: string; }) => x.event == "Created"))?.args?.ruleHash
  if (activate) {
    const tx2 = await _ruleExecutor.connect(wallet).activateRule(ruleHash);
    await tx2.wait();
  }

  return ruleHash;

}

describe("RuleExecutor", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployRuleExecutorFixture() {
    // Contracts are deployed using the first signer/account by default
    const [ownerWallet, ruleMakerWallet, ruleSubscriberWallet, otherWallet1] = await ethers.getSigners();

    const WhitelistService = await ethers.getContractFactory("WhitelistService");
    const whitelistService = await WhitelistService.deploy();
    await whitelistService.createWhitelist("triggers");
    const trigWlHash = await whitelistService.getWhitelistHash(ownerWallet.address, "triggers");
    await whitelistService.createWhitelist("actions");
    const actWlHash = await whitelistService.getWhitelistHash(ownerWallet.address, "actions");

    const RuleExecutor = await ethers.getContractFactory("RuleExecutor");
    const ruleExecutor = await RuleExecutor.deploy(whitelistService.address, trigWlHash, actWlHash);

    const TestSwapRouter = await ethers.getContractFactory("TestSwapRouter");
    const testSwapRouter = await TestSwapRouter.deploy();

    const TestToken = await ethers.getContractFactory("TestToken");
    const testToken1 = await TestToken.deploy(100000, "Test1", "TST1");
    const testToken2 = await TestToken.deploy(100000, "Test2", "TST2");
    const WETH = await TestToken.deploy(100000, "WETH", "WETH");

    const SwapUniSingleAction = await ethers.getContractFactory("SwapUniSingleAction");

    const swapUniSingleAction = await SwapUniSingleAction.deploy(
      testSwapRouter.address, WETH.address);

    const TestOracle = await ethers.getContractFactory("TestOracle");
    const testOracleEth = await TestOracle.deploy(ETH_PRICE);
    const testOracleUni = await TestOracle.deploy(UNI_PRICE);

    const PriceTrigger = await ethers.getContractFactory("PriceTrigger");
    const priceTrigger = await PriceTrigger.deploy();
    await priceTrigger.addPriceFeed("eth", testOracleEth.address);
    await priceTrigger.addPriceFeed("uni", testOracleUni.address);

    return {
      ruleExecutor, priceTrigger, swapUniSingleAction, testOracleEth, testOracleUni,
      testToken1, testToken2, ownerWallet, ruleMakerWallet, ruleSubscriberWallet, otherWallet1, whitelistService, trigWlHash, actWlHash
    };
  }

  describe("Deployment", () => {

    it("Should set the right owner", async function () {
      const { ruleExecutor, ownerWallet } = await loadFixture(deployRuleExecutorFixture);

      expect(await ruleExecutor.owner()).to.equal(ownerWallet.address);
    });
  });

  describe("Add Rule By Anyone", () => {

    it("Should revert if no trigger is specified", async () => {
    });

    it("Should revert if no action is specified", async () => {
    });

    it("Should revert if trigger doesnt have a callee with validateTrigger", async () => {
      const { ruleExecutor, swapUniSingleAction, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const badTrigger = makePassingTrigger(ethers.constants.AddressZero); // passing trigger with bad address
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);


      whitelistService.disableWhitelist(trigWlHash);
      whitelistService.disableWhitelist(actWlHash);
      await expect(ruleExecutor.connect(ruleMakerWallet).createRule([badTrigger], [executableAction])).to.be.revertedWithoutReason;
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
      const badAction = makeSwapAction(ethers.constants.AddressZero, testToken1.address);
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

      const reward = 20;
      await expect(ruleExecutor.connect(ruleMakerWallet).createRule(
        [passingTrigger], [executableAction], { value: reward })).to.emit(ruleExecutor, "Created")
        .withArgs(anyValue).and
        .changeEtherBalances(
          [ruleExecutor, ruleMakerWallet],
          [reward, -reward]
        );
    });

    it.skip("getRule should return the rule if the rule was successfully created", async () => {

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
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, otherWallet1, testToken1, ruleSubscriberWallet, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const ruleMakerWallet2 = otherWallet1;

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
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, otherWallet1, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makeFailingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, ethers.constants.AddressZero);
      const ruleHash = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [passingTrigger], [tokenSwapAction], ruleMakerWallet);

      expect(await ruleExecutor.connect(otherWallet1).checkRule(ruleHash)).to.equal(false);

    });

    it.skip("should return false if the checkTrigger is not available on the callee", async () => {
      // WE need to create a Badtrigger for this. 
      // And it's better to test for malicious checkTrigger vs. a non-existent checkTrigger
      // We already check for validateTrigger and revent random addresses from being included      
    });

    it("should return true if the checkTrigger on the callee denoted by ruleHash returns true", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, otherWallet1, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, ethers.constants.AddressZero);
      const ruleHash = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [passingTrigger], [tokenSwapAction], ruleMakerWallet);

      expect(await ruleExecutor.connect(otherWallet1).checkRule(ruleHash)).to.equal(true);
    });
  });

  describe("Execute Rule with Failing Trigger", () => {
    it("Should revert if anyone tries to execute the rule, and the trigger fails", async () => {
      // It appears that this rule has to be placed before the deployValidRuleFixture.
      // since it calls the deployRuleExecutorFixture
      // It causes all tests after it to fail, if it is located after tests that use deployValidRuleFixture
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, otherWallet1, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makeFailingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, ethers.constants.AddressZero);
      const ruleHash = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [passingTrigger], [tokenSwapAction], ruleMakerWallet, true);


      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHash)).to.be.rejectedWith("Trigger != Satisfied");

    });
  });

  async function deployValidRuleFixture() {
    const { ruleExecutor, swapUniSingleAction, priceTrigger, ownerWallet, ruleMakerWallet, ruleSubscriberWallet, otherWallet1, testToken1, whitelistService, trigWlHash, actWlHash } = await loadFixture(deployRuleExecutorFixture);

    const passingTrigger = makePassingTrigger(priceTrigger.address);
    const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, ethers.constants.AddressZero);
    const ethSwapAction = makeSwapAction(swapUniSingleAction.address, ethers.constants.AddressZero, testToken1.address);

    whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);
    whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address)

    const ruleHashEth = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [passingTrigger], [ethSwapAction], ruleSubscriberWallet, true);
    const ruleHashToken = await createRule(whitelistService, trigWlHash, actWlHash, ruleExecutor, [passingTrigger], [tokenSwapAction], ruleSubscriberWallet, true);

    await testToken1.transfer(ruleSubscriberWallet.address, 200);
    return { ruleHashEth, ruleHashToken, ruleExecutor, ownerWallet, ruleSubscriberWallet, otherWallet1, testToken1 };

  }

  describe("Add / Reduce Collateral", function () {

    it("should revert if ruleHash doesnt exist", async () => {
      const { ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(BAD_RULE_HASH, 1000)).to.be.revertedWithoutReason;
      await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(BAD_RULE_HASH, 1000)).to.be.revertedWithoutReason;
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

    it("should not allow anyone other than rule owner to add collateral to a rule", async () => {
      const { ruleHashEth, ruleHashToken, ruleExecutor, otherWallet1 } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(otherWallet1).addCollateral(ruleHashEth, 12, { value: 3 })).to.be.revertedWith("onlyRuleOwner");

      await expect(ruleExecutor.connect(otherWallet1).reduceCollateral(ruleHashToken, 12)).to.be.revertedWith("onlyRuleOwner");
    });

    it("should revert if collateral amount does not match msg.value for native actions", async () => {
      const { ruleHashEth, ruleSubscriberWallet, ruleExecutor, otherWallet1 } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, 12, { value: 3 })).to.be.revertedWith("ETH: amount != msg.value");
    });

    [1, 0].forEach((isNative) => {
      const assetType = isNative ? "native" : "erc20";
      it("should not allow removing collateral if no collateral has been added" + assetType, async () => {
        const { ruleHashEth, ruleHashToken, ruleExecutor, ruleSubscriberWallet } = await loadFixture(deployValidRuleFixture);
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, 12)).to.be.revertedWithoutReason;
      });

      it("should receive token and emit CollateralAdded event if addCollateral is called successfully: " + assetType, async () => {
        const { ruleHashEth, ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
        const collateralAmount = 10;
        const msgValue = isNative ? collateralAmount : 0;
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        if (!isNative)
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);

        const changeWallets = [ruleSubscriberWallet, ruleExecutor];
        const changeAmounts = [-collateralAmount, collateralAmount];
        const ethChange = isNative ? changeAmounts : [0, 0];
        const tokenChange = !isNative ? changeAmounts : [0, 0];

        await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHash, collateralAmount, { value: msgValue })).to.emit(ruleExecutor, "CollateralAdded")
          .withArgs(ruleHash, collateralAmount).and
          .changeEtherBalances(changeWallets, ethChange).and
          .changeTokenBalances(testToken1, changeWallets, tokenChange);

        // allows adding collateral multiple times
        const collateralAmount2 = 19;
        const ethChange2 = isNative ? [-collateralAmount2, collateralAmount2] : [0, 0];
        const tokenChange2 = !isNative ? [-collateralAmount2, collateralAmount2] : [0, 0];

        if (!isNative)
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount + collateralAmount2);
        await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHash, collateralAmount2, { value: isNative ? collateralAmount2 : 0 })).to.emit(ruleExecutor, "CollateralAdded")
          .withArgs(ruleHash, collateralAmount2).and
          .changeEtherBalances(changeWallets, ethChange2).and
          .changeTokenBalances(testToken1, changeWallets, tokenChange2);
      });

      it("should refund token emit CollateralReduced event if reduceCollateral is called successfully: " + assetType, async () => {
        const { ruleHashEth, ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
        const collateralAmount = 10;
        const msgValue = isNative ? collateralAmount : 0;
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;

        if (!isNative)
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);

        await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHash, collateralAmount, { value: msgValue });

        const reduceAmount = collateralAmount - 1;
        const changeWallets = [ruleSubscriberWallet, ruleExecutor];
        const changeAmounts = [reduceAmount, -reduceAmount];
        const ethChange = isNative ? changeAmounts : [0, 0];
        const tokenChange = !isNative ? changeAmounts : [0, 0];


        await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, reduceAmount)).to.emit(ruleExecutor, "CollateralReduced")
          .withArgs(ruleHash, reduceAmount).and
          .changeEtherBalances(changeWallets, ethChange).and
          .changeTokenBalances(testToken1, changeWallets, tokenChange);
      });

      it("Should not allow removing more collateral than available:" + assetType, async () => {
        const { ruleHashToken, testToken1, ruleHashEth, ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
        const collateralAmount = 49;
        const msgValue = isNative ? collateralAmount : 0;
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        if (!isNative)
          await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);

        await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHash, collateralAmount, { value: msgValue })

        await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, collateralAmount + 1)).to.be.revertedWithoutReason;
        await ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, collateralAmount);
        await expect(ruleExecutor.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, 1)).to.be.revertedWithoutReason;
      });

    });

    // should not allow adding collateral to a cancelled or executed rule
    // this is handled in the rule cancellation section.

    it.skip("should allow adding collateral based on the first action, even if subsequent actions have different collateral requirements", () => {

    });

  });

  describe("Execute Rule", () => {
    it("should revert if anyone tries to execute an unknown rule", async () => {
      const { ruleHashToken, otherWallet1, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(BAD_RULE_HASH)).to.be.rejectedWith("Rule not found");
    });

    it.skip("Should revert if anyone tries to execute the rule, and action fails", async () => {
      // Need to create a dummy action and make it fail
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.rejectedWith("Action unsuccessful");
    });

    it.skip("placeholder for multiple triggers / actions", async () => { });
    // TODO Merge this and the native rule
    // Check for single and multiple triggers, and single and multiple actions

    it("should revert if anyone tries to execute a rule with no collateral", async () => {
      const { ruleHashToken, ruleHashEth, otherWallet1, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.revertedWithoutReason;
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashEth)).to.be.revertedWithoutReason;
    });

    // For some insane reason, if the native test is after the erc20 test, 
    // the addCollateral fails in the erc20 test.
    it("Should allow anyone to execute the rule once (native) and get a reward if gas is paid, and the trigger passes", async () => {
      // execute valid rule with collateral by someone else. and get a reward.
      const { ruleHashEth, ruleSubscriberWallet, otherWallet1, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      const collateral = 12;
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, collateral, { value: collateral })).to.emit(ruleExecutor, "CollateralAdded");
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashEth)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashEth, otherWallet1.address)
        .and.changeEtherBalances(
          // we dont care about the balance of the swap contracts, 
          // because that's a downstream impact we dont care about here.
          [otherWallet1, ruleSubscriberWallet, ruleExecutor],
          [DEFAULT_REWARD, 0, -(collateral + DEFAULT_REWARD)],
        );

      // TODO need to implement caller getting paid.
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashEth)).to.be.revertedWith("Rule != ACTIVE");
    });

    it("Should allow anyone to execute the rule and get a reward if gas is paid, and all the triggers passes", async () => {
      // execute valid rule with collateral by someone else. and get a reward.
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateral = 12;
      await expect(testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateral)).to.not.be.reverted;
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateral)).to.emit(ruleExecutor, "CollateralAdded")
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, otherWallet1.address)
        .and.changeTokenBalances(
          testToken1,
          [otherWallet1, ruleSubscriberWallet, ruleExecutor],
          [0, 0, -collateral],
        ).and.changeEtherBalances(
          // this should reflect the rewarD.
          [otherWallet1, ruleSubscriberWallet, ruleExecutor],
          [DEFAULT_REWARD, 0, -DEFAULT_REWARD],
        );

      // TODO need to implement caller getting paid.
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.revertedWith("Rule != ACTIVE");
    });

    it("Should revert if anyone tries to execute the rule twice", async () => {
      // we get here by calling a valid rule, using up the collateral and call again.
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 11);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, 6);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, otherWallet1.address);

      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.revertedWith("Rule != ACTIVE");

    });
  });

  describe("Cancel rule", () => {
    it("should not allow anyone other than the rule owner to cancel the rule", async () => {
      const { ruleHashToken, otherWallet1, ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(otherWallet1).cancelRule(ruleHashToken)).to.be.revertedWith("onlyRuleOwner");
    });

    it("should not allow executing the rule or adding collateral if the rule was cancelled", async () => {
      const { ruleHashToken, otherWallet1, ruleSubscriberWallet, testToken1, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashToken)).to.emit(ruleExecutor, "Cancelled")
        .withArgs(ruleHashToken);

      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.revertedWith("Rule != ACTIVE");
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 30);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, 30)).to.be.revertedWith("Can't add collateral");

    });

    it("should not allow cancelling rule if it's already executed", async () => {
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed");
      await expect(ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashToken)).to.be.revertedWith("Can't Cancel Rule");

    });
    [0, 1].forEach(isActive => {
      it("should allow cancelling " + (isActive ? "active" : "inactive") + " rules, and return all added collateral", async () => {
        const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
        const collateralAmount = 30;
        await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
        await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);
        if (!isActive) {
          await ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken);
        } else {
          // we activate the rules in the fixture so we dont need to explicitly activate them here.
          // await ruleExecutor.connect(ruleSubscriberWallet).activateRule(ruleHashToken);
        }

        await expect(ruleExecutor.connect(ruleSubscriberWallet).cancelRule(ruleHashToken)).to
          .emit(ruleExecutor, "Cancelled").withArgs(ruleHashToken).and
          .changeTokenBalances(
            testToken1,
            [ruleSubscriberWallet, ruleExecutor],
            [collateralAmount, -collateralAmount]
          );
      });
    });

  });

  describe("Activate / Deactivate rule", () => {
    it("Should not allow executing a rule that has been deactivated (after it was active)", async () => {
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = 30;
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);

      await expect(ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken)).to
        .emit(ruleExecutor, "Deactivated").withArgs(ruleHashToken);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.revertedWith("Rule != ACTIVE");
    });

    it("Should allow executing a rule that has been activated (after it was deactivated)", async () => {
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = 30;
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      await ruleExecutor.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, collateralAmount);

      await expect(ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken)).to
        .emit(ruleExecutor, "Deactivated").withArgs(ruleHashToken);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).activateRule(ruleHashToken)).to
        .emit(ruleExecutor, "Activated").withArgs(ruleHashToken);

      // check that the rule got executed correctly.
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, otherWallet1.address)
        .and.changeTokenBalances(
          testToken1,
          [otherWallet1, ruleSubscriberWallet, ruleExecutor],
          [0, 0, -collateralAmount],
        );
    });


    [0, 1].forEach((isCancelled) => {
      it("Should not allow activating / deactivating a " + (isCancelled ? "cancelled" : "executed") + " rule", async () => {
        const { ruleHashToken, ruleHashEth, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);

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
          await ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken);
          // No point deactivating eth here, because then we wont be able to execute it.
          await ruleExecutor.connect(otherWallet1).executeRule(ruleHashEth);
        }

        await expect(ruleExecutor.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken)).to.be.revertedWithoutReason;
        await expect(ruleExecutor.connect(ruleSubscriberWallet).activateRule(ruleHashEth)).to.be.revertedWithoutReason;

      });
    });
  });

  describe.skip("Check rule", () => {
    it.skip("should return false if any trigger is invalid", async () => {

    });

    it.skip("should return true if all trigger are valid", async () => {

    });

  });
  describe.skip("Redeem Balance", () => {
    it("should allow redeeming all the collateral provided if the rule is not yet executed", async () => {

    });

    it("should not allow redeeming collateral if no collateral has been provided by the redeemer", async () => {
      // provide collateral by someone else.
    });

    it("should not allow redeeming collateral if the rule was executed and used the collateral", async () => {

    });

    it("should not allow redeeming collateral if the collateral was already redeemed", async () => {

    });



    it("should allow redeeming collateral if the rule returned other assets", async () => {

    });

  });

  describe.skip("Change Reward", () => {
    it("should change the reward provided to the executor, if the reward is changed", async () => {

    });

    it("should not allow increasing the reward of the rule has been executed / is cancelled", async () => {

    });

  });


});
