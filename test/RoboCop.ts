/**
 * BEWARE:
 * Token / eth balances checks can only be used once in a chained assert
 * And it has to be the first check. Otherwise they end up ignoring all the checks above them.
 * To work around this, store the expect condition and do checks in separate statements instead of chaining
 * eg.
 * await ex.to.changeTokenBalance(token, contract, val);
 * await ex.to.changeEtherBalance(contract, val);
 */

import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, network, deployments } from "hardhat";
import { BigNumber, constants, utils } from "ethers";
import { setupRoboCop, makePassingTrigger, makeFailingTrigger, makeSwapAction, createRule } from "./Fixtures";
import { expectEthersObjDeepEqual } from "./helper";
import {
  BAD_RULE_HASH,
  ERC20_DECIMALS,
  DEFAULT_REWARD,
  PRICE_TRIGGER_DECIMALS,
  TST1_PRICE_IN_ETH,
  ETH_PRICE_IN_TST1,
  LT,
  GT,
  ETH_ADDRESS,
  PRICE_TRIGGER_TYPE,
} from "./Constants";
import { RuleStructOutput } from "../typechain-types/contracts/rules/RoboCop";
import { HardhatRuntimeEnvironment } from "hardhat/types";

describe("RoboCop", () => {
  const deployRoboCopFixture = deployments.createFixture(async (hre, options) => {
    await deployments.fixture(["RoboCopFactory"]);
    return await setupRoboCop(hre);
  });

  describe("Add Rule By Anyone", () => {
    it("Should revert if no trigger is specified", async () => {
      const { roboCop, swapUniSingleAction, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } =
        await deployRoboCopFixture();
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);
      await whitelistService.disableWhitelist(trigWlHash);
      await whitelistService.disableWhitelist(actWlHash);
      await expect(roboCop.connect(ruleMakerWallet).createRule([], [executableAction])).to.be.revertedWithoutReason();
    });

    it("Should revert if trigger doesnt have a callee with validateTrigger", async () => {
      const { roboCop, swapUniSingleAction, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } =
        await deployRoboCopFixture();

      const badTrigger = await makePassingTrigger(constants.AddressZero, testToken1); // passing trigger with bad address
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);

      await whitelistService.disableWhitelist(trigWlHash);
      await whitelistService.disableWhitelist(actWlHash);
      await expect(
        roboCop.connect(ruleMakerWallet).createRule([badTrigger], [executableAction])
      ).to.be.revertedWithoutReason();
    });

    it("Should revert if validateTrigger on trigger does not return true", async () => {
      const { roboCop, swapUniSingleAction, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } =
        await deployRoboCopFixture();

      const BadPriceTrigger = await ethers.getContractFactory("BadPriceTrigger");
      const badPriceTrigger = await BadPriceTrigger.deploy();

      const badTrigger = makePassingTrigger(badPriceTrigger.address, testToken1);
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);

      await whitelistService.disableWhitelist(trigWlHash);
      await whitelistService.disableWhitelist(actWlHash);
      await expect(roboCop.connect(ruleMakerWallet).createRule([badTrigger], [executableAction])).to.be.revertedWith(
        "Invalid Trigger"
      );
    });

    // We dont need to check that validate is a view fn. solidity enforces that
    // if the interface is used.

    it("Should revert if no action is specified", async () => {
      const {
        roboCop,
        swapUniSingleAction,
        priceTrigger,
        ruleMakerWallet,
        testToken1,
        whitelistService,
        trigWlHash,
        actWlHash,
      } = await deployRoboCopFixture();
      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      await whitelistService.disableWhitelist(trigWlHash);
      await whitelistService.disableWhitelist(actWlHash);
      await expect(roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [])).to.be.revertedWithoutReason();
    });

    it("Should revert if action doesnt have a callee with validate", async () => {
      const { roboCop, priceTrigger, ruleMakerWallet, testToken1, whitelistService, trigWlHash, actWlHash } =
        await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const badAction = makeSwapAction(constants.AddressZero, [testToken1.address]);
      await whitelistService.disableWhitelist(trigWlHash);
      await whitelistService.disableWhitelist(actWlHash);

      await expect(
        roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [badAction])
      ).to.be.revertedWithoutReason();
    });

    it.skip("Should revert if validate on action does not return true", async () => {
      // KIV This. currently we dont have a situation where the action fails validation.
    });

    // We dont need to check that validate is a view fn. solidity enforces that
    // if the interface is used.

    it("Should revert if trigger has not been whitelisted", async () => {
      const { roboCop, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1, whitelistService, trigWlHash } =
        await deployRoboCopFixture();
      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      await whitelistService.removeFromWhitelist(trigWlHash, priceTrigger.address);
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);

      await expect(
        roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction])
      ).to.be.revertedWith("Unauthorized Trigger");
    });

    it("Should revert if action has not been whitelisted", async () => {
      const { roboCop, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1, whitelistService, actWlHash } =
        await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1); // pass / fail shouldnt matter here
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);
      await whitelistService.removeFromWhitelist(actWlHash, swapUniSingleAction.address);

      await expect(
        roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction])
      ).to.be.revertedWith("Unauthorized Action");
    });

    it("Should emit Created event, and consume ETH reward if Trigger and Action are valid", async () => {
      const {
        roboCop,
        swapUniSingleAction,
        priceTrigger,
        ruleMakerWallet,
        testToken1,
        whitelistService,
        trigWlHash,
        actWlHash,
      } = await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1); // pass / fail shouldnt matter here
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);

      const reward = utils.parseEther("0.02");
      await expect(roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction], { value: reward }))
        .to.changeEtherBalances([roboCop, ruleMakerWallet], [reward, BigNumber.from(0).sub(reward)])
        .and.to.emit(roboCop, "Created")
        .withArgs(anyValue);
    });

    it("creates rule without reward", async () => {
      const { roboCop, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await deployRoboCopFixture();

      const failingTrigger = makePassingTrigger(priceTrigger.address, testToken1); // pass / fail shouldnt matter here
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);
      await expect(roboCop.connect(ruleMakerWallet).createRule([failingTrigger], [executableAction])).to.emit(
        roboCop,
        "Created"
      );
    });

    it.skip("If trigger, action, user, block are the same, ruleHash should be the same -> making the second creation fail", async () => {
      const { roboCop, swapUniSingleAction, priceTrigger, ruleMakerWallet, ruleSubscriberWallet, testToken1 } =
        await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);

      var rule1Hash: string;

      await network.provider.send("evm_setAutomine", [false]);
      const tx1 = await roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction]);
      const tx2 = await roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction]);
      // different user, so this 3rd rule should work
      const tx3 = await roboCop.connect(ruleSubscriberWallet).createRule([passingTrigger], [executableAction]);
      await network.provider.send("evm_mine", []);
      await network.provider.send("evm_setAutomine", [true]);

      try {
        await tx1.wait();
      } catch {
        expect.fail();
      }

      try {
        await tx2.wait();
        // cant figure how to confirm whether the error is a duplicate rule error.
        // this will suffice for now.
        expect.fail();
      } catch (err) {
        /* pass */
      }

      try {
        await tx3.wait();
      } catch (err) {
        // this acts as a control to ensure the error wasnt due to the evm_mine stuff
        expect.fail();
      }
    });

    it("Should be able to create multiple unique rules with the same trigger, action, constraints and a different user", async () => {
      const {
        roboCop,
        swapUniSingleAction,
        priceTrigger,
        ruleMakerWallet,
        botWallet,
        testToken1,
        ruleSubscriberWallet,
        whitelistService,
        trigWlHash,
        actWlHash,
      } = await deployRoboCopFixture();

      const ruleMakerWallet2 = botWallet;

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const executableAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address]);

      var rule1Hash: string;
      await expect(roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction]))
        .to.emit(roboCop, "Created")
        .withArgs((_hash: string) => {
          rule1Hash = _hash;
          return true;
        });

      await expect(roboCop.connect(ruleMakerWallet2).createRule([passingTrigger], [executableAction]))
        .to.emit(roboCop, "Created")
        .withArgs((_hash2: string) => rule1Hash != _hash2);
    });
  });

  describe("Check Rule", () => {
    it("should return false if the checkTrigger on the rule denoted by ruleHash returns false", async () => {
      const {
        roboCop,
        swapUniSingleAction,
        priceTrigger,
        ruleMakerWallet,
        botWallet,
        testToken1,
        whitelistService,
        trigWlHash,
        actWlHash,
      } = await deployRoboCopFixture();

      const failingTrigger = makeFailingTrigger(priceTrigger.address, testToken1);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address], [ETH_ADDRESS]);
      const ruleHash = await createRule(
        whitelistService,
        trigWlHash,
        actWlHash,
        roboCop,
        [failingTrigger],
        [tokenSwapAction],
        ruleMakerWallet
      );

      expect(await roboCop.connect(botWallet).checkRule(ruleHash)).to.equal(false);
    });

    it.skip("should return false if the checkTrigger is not available on the callee", async () => {
      // WE need to create a Badtrigger for this.
      // And it's better to test for malicious checkTrigger vs. a non-existent checkTrigger
      // We already check for validateTrigger and revent random addresses from being included
    });

    it("should return true if the checkTrigger on the callee denoted by ruleHash returns true", async () => {
      const {
        roboCop,
        swapUniSingleAction,
        priceTrigger,
        ruleMakerWallet,
        botWallet,
        testToken1,
        whitelistService,
        trigWlHash,
        actWlHash,
      } = await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address], [ETH_ADDRESS]);
      const ruleHash = await createRule(
        whitelistService,
        trigWlHash,
        actWlHash,
        roboCop,
        [passingTrigger],
        [tokenSwapAction],
        ruleMakerWallet
      );

      expect(await roboCop.connect(botWallet).checkRule(ruleHash)).to.equal(true);
    });

    it("should return false if one of multiple triggers is invalid", async () => {
      const {
        roboCop,
        swapUniSingleAction,
        priceTrigger,
        ruleMakerWallet,
        botWallet,
        testToken1,
        whitelistService,
        trigWlHash,
        actWlHash,
      } = await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const failingTrigger = makeFailingTrigger(priceTrigger.address, testToken1);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address], [ETH_ADDRESS]);
      const ruleHash = await createRule(
        whitelistService,
        trigWlHash,
        actWlHash,
        roboCop,
        [passingTrigger, failingTrigger],
        [tokenSwapAction],
        ruleMakerWallet
      );

      expect(await roboCop.connect(botWallet).checkRule(ruleHash)).to.equal(false);
    });

    it.skip("should return true if all of multiple triggers are valid", async () => {});
  });

  describe("Execute Rule with Failing Trigger", () => {
    it("Should revert if anyone tries to execute the rule, and the trigger fails", async () => {
      // It appears that this rule has to be placed before the deployValidRuleFixture.
      // since it calls the deployRoboCopFixture
      // It causes all tests after it to fail, if it is located after tests that use deployValidRuleFixture
      const {
        roboCop,
        swapUniSingleAction,
        ruleMakerWallet,
        botWallet,
        priceTrigger,
        testToken1,
        whitelistService,
        trigWlHash,
        actWlHash,
      } = await deployRoboCopFixture();

      const passingTrigger = makeFailingTrigger(priceTrigger.address, testToken1);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address], [ETH_ADDRESS]);
      const ruleHash = await createRule(
        whitelistService,
        trigWlHash,
        actWlHash,
        roboCop,
        [passingTrigger],
        [tokenSwapAction],
        ruleMakerWallet,
        true
      );

      await expect(roboCop.connect(botWallet).executeRule(ruleHash)).to.be.rejectedWith("Trigger != Satisfied");
    });
  });

  const deployValidRuleFixture = deployments.createFixture(async (hre, options) => {
    await deployments.fixture(["RoboCopFactory"]);
    return await setupValidRuleFixture(hre);
  });

  async function setupValidRuleFixture(hre: HardhatRuntimeEnvironment) {
    const {
      roboCop,
      swapUniSingleAction,
      priceTrigger,
      deployerWallet,
      testToken1,
      testToken2,
      whitelistService,
      trigWlHash,
      actWlHash,
    } = await setupRoboCop(hre);

    const { ruleMaker, ruleSubscriber, bot } = await hre.getNamedAccounts();
    const ruleMakerWallet = await ethers.getSigner(ruleMaker);
    const ruleSubscriberWallet = await ethers.getSigner(ruleSubscriber);
    const botWallet = await ethers.getSigner(bot);

    const ethTst1PassingTrigger = {
      createTimeParams: utils.defaultAbiCoder.encode(
        ["address", "address", "uint8", "uint256"], // TODO: Ops is not present in typechain
        [ETH_ADDRESS, testToken1.address, GT, ETH_PRICE_IN_TST1.sub(1)]
      ),
      triggerType: PRICE_TRIGGER_TYPE,
      callee: priceTrigger.address,
    };

    const tst1EthPassingTrigger = {
      createTimeParams: utils.defaultAbiCoder.encode(
        ["address", "address", "uint8", "uint256"], // TODO: Ops is not present in typechain
        [testToken1.address, ETH_ADDRESS, LT, ETH_PRICE_IN_TST1.add(1)]
      ),
      triggerType: PRICE_TRIGGER_TYPE,
      callee: priceTrigger.address,
    };

    // to get ETH from uniswap, you need to set the output token as WETH.
    const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address], [ETH_ADDRESS]);
    const ethSwapAction = makeSwapAction(swapUniSingleAction.address, [ETH_ADDRESS], [testToken1.address]);
    const ruleHashEth = await createRule(
      whitelistService,
      trigWlHash,
      actWlHash,
      roboCop,
      [ethTst1PassingTrigger],
      [ethSwapAction],
      ruleSubscriberWallet,
      true
    );
    const ruleHashToken = await createRule(
      whitelistService,
      trigWlHash,
      actWlHash,
      roboCop,
      [tst1EthPassingTrigger],
      [tokenSwapAction],
      ruleSubscriberWallet,
      true
    );

    await testToken1.transfer(ruleSubscriberWallet.address, BigNumber.from(200000).mul(ERC20_DECIMALS));
    return {
      ruleHashEth,
      ruleHashToken,
      roboCop,
      deployerWallet,
      ruleMakerWallet,
      ruleSubscriberWallet,
      botWallet,
      testToken1,
      testToken2,
      swapUniSingleAction,
      priceTrigger,
      ethTst1PassingTrigger,
      tst1EthPassingTrigger,
      tokenSwapAction,
      ethSwapAction,
    };
  }

  describe("Add / Reduce Collateral", function () {
    it("should revert if add / reduce collateral is called on a non-existent ruleHash", async () => {
      const { ruleSubscriberWallet, roboCop } = await deployValidRuleFixture();
      // these error with onlyRuleOwner because the non existent hash doesnt belong to the subscriber
      await expect(roboCop.connect(ruleSubscriberWallet).addCollateral(BAD_RULE_HASH, [1000])).to.be.revertedWith(
        "onlyRuleOwner"
      );
      await expect(roboCop.connect(ruleSubscriberWallet).reduceCollateral(BAD_RULE_HASH, [1000])).to.be.revertedWith(
        "onlyRuleOwner"
      );
    });

    it("should revert if > 0 native is not sent to addCollateral for an native action", async () => {
      const { ruleHashEth, ruleSubscriberWallet, roboCop } = await deployValidRuleFixture();

      await expect(roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, [0])).to.be.revertedWith(
        "amount <= 0"
      );
    });

    it("should revert if > 0 ERC20 isnt sent / approved to addCollateral for an ERC20 rule", async () => {
      const { ruleHashToken, ruleSubscriberWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      await expect(roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [0])).to.be.revertedWith(
        "amount <= 0"
      );
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, 6);
      await expect(roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [10])).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );

      const balance = await testToken1.connect(ruleSubscriberWallet).balanceOf(ruleSubscriberWallet.address);
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, balance.add(1));

      await expect(
        roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [balance.add(1)])
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should not allow anyone other than rule owner to add / reduce collateral to a rule", async () => {
      const { ruleHashEth, ruleHashToken, roboCop, testToken1, ruleSubscriberWallet, botWallet } =
        await deployValidRuleFixture();
      const collateralAmount = utils.parseEther("1");
      await expect(
        roboCop.connect(botWallet).addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount })
      ).to.be.revertedWith("onlyRuleOwner");

      // this should work
      await roboCop
        .connect(ruleSubscriberWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });
      // now that there is some collateral, we confirm  that it cant be removed to a different user.
      await expect(roboCop.connect(botWallet).reduceCollateral(ruleHashEth, [collateralAmount])).to.be.revertedWith(
        "onlyRuleOwner"
      );

      // check for tokens as well.
      await testToken1.connect(botWallet).approve(roboCop.address, collateralAmount);
      await expect(roboCop.connect(botWallet).addCollateral(ruleHashToken, [collateralAmount])).to.be.revertedWith(
        "onlyRuleOwner"
      );
      await expect(roboCop.connect(botWallet).reduceCollateral(ruleHashToken, [collateralAmount])).to.be.revertedWith(
        "onlyRuleOwner"
      );
    });

    it("should revert if collateral amount does not match msg.value for native actions", async () => {
      const { ruleHashEth, ruleSubscriberWallet, roboCop, botWallet } = await deployValidRuleFixture();
      await expect(
        roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, [12], { value: 3 })
      ).to.be.revertedWith("ETH: amount != msg.value");
    });

    [1, 0].forEach((isNative) => {
      const assetType = isNative ? "native" : "erc20";
      it("should not allow removing collateral if no collateral has been added: " + assetType, async () => {
        const { ruleHashEth, ruleHashToken, roboCop, ruleSubscriberWallet } = await deployValidRuleFixture();
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        await expect(roboCop.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, [12])).to.be.revertedWith(
          "Not enough collateral."
        );
      });

      it(
        "should receive token and emit CollateralAdded event if addCollateral is called successfully: " + assetType,
        async () => {
          const { ruleHashEth, ruleHashToken, ruleSubscriberWallet, roboCop, testToken1 } =
            await deployValidRuleFixture();
          const collateralAmount = BigNumber.from(1).mul(ERC20_DECIMALS); // ETH is also 18 decimals so this works out both ways
          const msgValue = isNative ? collateralAmount : 0;
          const ruleHash = isNative ? ruleHashEth : ruleHashToken;
          if (!isNative) await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);

          const changeWallets = [ruleSubscriberWallet, roboCop];
          const changeAmounts = [BigNumber.from(0).sub(collateralAmount), collateralAmount];
          const ethChange = isNative ? changeAmounts : [0, 0];
          const tokenChange = !isNative ? changeAmounts : [0, 0];

          const ex = expect(
            roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHash, [collateralAmount], { value: msgValue })
          );
          await ex.to
            .changeEtherBalances(changeWallets, ethChange)
            .and.emit(roboCop, "CollateralAdded")
            .withArgs(ruleHash, [collateralAmount]);

          await ex.to.changeTokenBalances(testToken1, changeWallets, tokenChange);

          // allows adding collateral multiple times
          const collateralAmount2 = BigNumber.from(1).mul(ERC20_DECIMALS);
          const ethChange2 = isNative ? [BigNumber.from(0).sub(collateralAmount2), collateralAmount2] : [0, 0];
          const tokenChange2 = !isNative ? [BigNumber.from(0).sub(collateralAmount2), collateralAmount2] : [0, 0];

          if (!isNative)
            await testToken1
              .connect(ruleSubscriberWallet)
              .approve(roboCop.address, collateralAmount.add(collateralAmount2));

          const ex2 = expect(
            roboCop
              .connect(ruleSubscriberWallet)
              .addCollateral(ruleHash, [collateralAmount2], { value: isNative ? collateralAmount2 : 0 })
          );
          await ex2.to
            .changeEtherBalances(changeWallets, ethChange2)
            .and.emit(roboCop, "CollateralAdded")
            .withArgs(ruleHash, [collateralAmount2]);
          await ex2.to.changeTokenBalances(testToken1, changeWallets, tokenChange2);
        }
      );

      it(
        "should refund token emit CollateralReduced event if reduceCollateral is called successfully: " + assetType,
        async () => {
          const { ruleHashEth, ruleHashToken, ruleSubscriberWallet, roboCop, testToken1 } =
            await deployValidRuleFixture();
          const collateralAmount = BigNumber.from(10).mul(ERC20_DECIMALS);
          const msgValue = isNative ? collateralAmount : 0;
          const ruleHash = isNative ? ruleHashEth : ruleHashToken;

          if (!isNative) await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);

          await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHash, [collateralAmount], { value: msgValue });

          const reduceAmount = collateralAmount.sub(1);
          const changeWallets = [ruleSubscriberWallet, roboCop];
          const changeAmounts = [reduceAmount, BigNumber.from(0).sub(reduceAmount)];
          const ethChange = isNative ? changeAmounts : [0, 0];
          const tokenChange = !isNative ? changeAmounts : [0, 0];

          const ex = expect(roboCop.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, [reduceAmount]));
          await ex.to
            .changeEtherBalances(changeWallets, ethChange)
            .and.emit(roboCop, "CollateralReduced")
            .withArgs(ruleHash, [reduceAmount]);

          await ex.to.changeTokenBalances(testToken1, changeWallets, tokenChange);
        }
      );

      it("Should not allow removing more collateral than available:" + assetType, async () => {
        const { ruleHashToken, testToken1, ruleHashEth, ruleSubscriberWallet, roboCop } =
          await deployValidRuleFixture();
        const collateralAmount = BigNumber.from(49).mul(ERC20_DECIMALS);
        const msgValue = isNative ? collateralAmount : 0;
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        if (!isNative) await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);

        await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHash, [collateralAmount], { value: msgValue });

        await expect(
          roboCop.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, [collateralAmount.add(1)])
        ).to.be.revertedWith("Not enough collateral.");
        await roboCop.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, [collateralAmount]);
        await expect(roboCop.connect(ruleSubscriberWallet).reduceCollateral(ruleHash, [1])).to.be.revertedWith(
          "Not enough collateral."
        );
      });
    });

    // should not allow adding collateral to a cancelled or executed rule
    // this is handled in the rule cancellation section.

    it.skip("should allow adding collateral based on the first action, even if subsequent actions have different collateral requirements", () => {});
  });

  describe("Execute Rule", () => {
    it("should revert if anyone tries to execute an unknown rule", async () => {
      const { ruleHashToken, botWallet, roboCop } = await deployValidRuleFixture();
      await expect(roboCop.connect(botWallet).executeRule(BAD_RULE_HASH)).to.be.rejectedWith("Rule not found");
    });

    it.skip("Should revert if anyone tries to execute the rule, and action fails", async () => {
      // Need to create a dummy action and make it fail
      const { ruleHashToken, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.be.rejectedWith("Action unsuccessful");
    });

    it.skip("placeholder for multiple triggers / actions", async () => {});
    // TODO Merge this and the native rule
    // Check for single and multiple triggers, and single and multiple actions

    it.skip("should not revert if anyone tries to execute a rule with no collateral", async () => {});

    // For some insane reason, if the native test is after the erc20 test,
    // the addCollateral fails in the erc20 test.
    it("Should allow anyone to execute the rule once (native) and get a reward if gas is paid, and the trigger passes", async () => {
      // execute valid rule with collateral by someone else. and get a reward.
      const { ruleHashEth, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateral = utils.parseEther("2");
      await expect(
        roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashEth, [collateral], { value: collateral })
      ).to.emit(roboCop, "CollateralAdded");
      const ex = expect(roboCop.connect(botWallet).executeRule(ruleHashEth));
      await ex.to
        .changeEtherBalances(
          // we dont care about the balance of the swap contracts,
          // because that's a downstream impact we dont care about here.
          [botWallet, ruleSubscriberWallet, roboCop],
          [DEFAULT_REWARD, 0, collateral.add(DEFAULT_REWARD).mul(-1)]
        )
        .and.to.emit(roboCop, "Executed")
        .withArgs(ruleHashEth, botWallet.address);

      await ex.to.changeTokenBalances(
        testToken1,
        // this should reflect the reward.
        [botWallet, ruleSubscriberWallet, roboCop],
        [0, 0, collateral.mul(ETH_PRICE_IN_TST1).div(PRICE_TRIGGER_DECIMALS)]
      );

      await expect(roboCop.connect(botWallet).executeRule(ruleHashEth)).to.be.revertedWith("Rule isn't Activated");
    });

    it("Should allow anyone to execute the rule (token) and get a reward if gas is paid, and all the triggers passes", async () => {
      // execute valid rule with collateral by someone else. and get a reward.
      const { ruleHashToken, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateral = BigNumber.from(5196).mul(ERC20_DECIMALS);
      await expect(testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateral)).to.not.be.reverted;
      await expect(roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [collateral])).to.emit(
        roboCop,
        "CollateralAdded"
      );
      const ex = expect(roboCop.connect(botWallet).executeRule(ruleHashToken));
      await ex.to
        .changeTokenBalances(testToken1, [botWallet, ruleSubscriberWallet, roboCop], [0, 0, collateral.mul(-1)])
        .and.emit(roboCop, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      await ex.to.changeEtherBalances(
        // this should reflect the rewarD.
        [botWallet, ruleSubscriberWallet, roboCop],
        [DEFAULT_REWARD, 0, collateral.mul(TST1_PRICE_IN_ETH).div(PRICE_TRIGGER_DECIMALS).sub(DEFAULT_REWARD)]
      );

      // TODO need to implement caller getting paid.
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("Rule isn't Activated");
    });

    it("Should revert if anyone tries to execute the rule twice", async () => {
      // we get here by calling a valid rule, using up the collateral and call again.
      const { ruleHashToken, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, 11);
      await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [6]);
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken))
        .to.emit(roboCop, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("Rule isn't Activated");
    });

    it("Should not allow adding / removing collateral after a rule is executed", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(15).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [collateralAmount]);
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken))
        .to.emit(roboCop, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      await expect(
        roboCop.connect(ruleSubscriberWallet).reduceCollateral(ruleHashToken, [collateralAmount])
      ).to.be.revertedWith("Can't reduce collateral");
      await expect(roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [1])).to.be.revertedWith(
        "Can't add collateral"
      );
    });
  });

  describe("Activate / Deactivate rule", () => {
    it("Should not allow executing a rule that has been deactivated (after it was active)", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [collateralAmount]);

      await expect(roboCop.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken))
        .to.emit(roboCop, "Deactivated")
        .withArgs(ruleHashToken);
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("Rule isn't Activated");
    });

    it("Should allow executing a rule that has been activated (after it was deactivated)", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [collateralAmount]);

      await expect(roboCop.connect(ruleSubscriberWallet).deactivateRule(ruleHashToken))
        .to.emit(roboCop, "Deactivated")
        .withArgs(ruleHashToken);
      await expect(roboCop.connect(ruleSubscriberWallet).activateRule(ruleHashToken))
        .to.emit(roboCop, "Activated")
        .withArgs(ruleHashToken);

      // check that the rule got executed correctly.
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken))
        .to.changeTokenBalances(
          testToken1,
          [botWallet, ruleSubscriberWallet, roboCop],
          [0, 0, BigNumber.from(0).sub(collateralAmount)]
        )
        .and.emit(roboCop, "Executed")
        .withArgs(ruleHashToken, botWallet.address);
    });
  });

  describe("Redeem Balance", () => {
    it("should not allow redeeming balance if the rule is not yet executed", async () => {
      const { ruleHashToken, ruleSubscriberWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      await expect(roboCop.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken)).to.be.revertedWith(
        "Rule isn't pending redemption"
      );
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [collateralAmount]);
      await expect(roboCop.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken)).to.be.revertedWith(
        "Rule isn't pending redemption"
      );
    });

    it.skip("should result in no token changes if the rule was executed and did not return a token", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [collateralAmount]);

      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.not.be.rejected;

      const ex = expect(roboCop.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken));
      await ex.to.changeTokenBalance(testToken1, roboCop, 0).emit(roboCop, "Redeemed").withArgs(ruleHashToken);
      await ex.to.changeEtherBalance(roboCop.address, 0);
    });

    it("should redeem all the balance only once by the subscriber if the rule was executed and returned native", async () => {
      const { ruleHashToken, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(500).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleSubscriberWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleSubscriberWallet).addCollateral(ruleHashToken, [collateralAmount]);
      await roboCop.connect(botWallet).executeRule(ruleHashToken);
      await expect(roboCop.connect(botWallet).redeemBalance(ruleHashToken)).to.be.revertedWith("onlyRuleOwner");

      const ex = expect(roboCop.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken));
      await ex.to
        .changeEtherBalance(ruleSubscriberWallet, collateralAmount.mul(TST1_PRICE_IN_ETH).div(PRICE_TRIGGER_DECIMALS))
        .emit(roboCop, "Redeemed")
        .withArgs(ruleHashToken);

      await ex.to.changeTokenBalance(testToken1, roboCop, 0);

      // can only redeem once.
      await expect(roboCop.connect(ruleSubscriberWallet).redeemBalance(ruleHashToken)).to.be.revertedWith(
        "Rule isn't pending redemption"
      );
    });

    it("should redeem all the balance only once by the subscriber if the rule was executed and returned token", async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = utils.parseEther("2"); // send 2 eth
      await roboCop
        .connect(ruleSubscriberWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });
      await roboCop.connect(botWallet).executeRule(ruleHashEth);
      await expect(roboCop.connect(botWallet).redeemBalance(ruleHashEth)).to.be.revertedWith("onlyRuleOwner");

      const ex = expect(roboCop.connect(ruleSubscriberWallet).redeemBalance(ruleHashEth));

      const tokenReceived = collateralAmount.mul(ETH_PRICE_IN_TST1).div(PRICE_TRIGGER_DECIMALS);

      await ex.to
        .changeTokenBalances(testToken1, [roboCop, ruleSubscriberWallet], [tokenReceived.mul(-1), tokenReceived])
        .emit(roboCop, "Redeemed")
        .withArgs(ruleHashEth);

      await ex.to.changeEtherBalance(roboCop.address, 0);

      // can only redeem once.
      await expect(roboCop.connect(ruleSubscriberWallet).redeemBalance(ruleHashEth)).to.be.revertedWith(
        "Rule isn't pending redemption"
      );
    });

    it.skip("Should redeem balance only from the final action if multiple actions were executed", async () => {});
  });

  describe("Change Reward", () => {
    it(`should accummulate the reward provided to the executor, as the reward is increased by different wallets and not be editable after execution`, async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, roboCop } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(3).mul(ERC20_DECIMALS);
      await roboCop
        .connect(ruleSubscriberWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });

      await roboCop.connect(ruleSubscriberWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await roboCop.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await expect(roboCop.connect(botWallet).executeRule(ruleHashEth))
        .to // default reward + the 2 increases above.
        .changeEtherBalance(botWallet, DEFAULT_REWARD.mul(3));

      await expect(
        roboCop.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD })
      ).to.be.revertedWithoutReason();
      await expect(roboCop.connect(botWallet).withdrawReward(ruleHashEth)).to.be.revertedWith("Reward paid");
    });

    it(`should allow any user to only remove the reward they added`, async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, roboCop } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(3).mul(ERC20_DECIMALS);
      await roboCop
        .connect(ruleSubscriberWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });

      await roboCop.connect(ruleSubscriberWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await expect(roboCop.connect(botWallet).withdrawReward(ruleHashEth)).to.revertedWith("0 contribution");

      await roboCop.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await expect(roboCop.connect(botWallet).withdrawReward(ruleHashEth)).to.changeEtherBalances(
        [botWallet, roboCop],
        [DEFAULT_REWARD, DEFAULT_REWARD.mul(-1)]
      );
      await expect(roboCop.connect(botWallet).withdrawReward(ruleHashEth)).to.revertedWith("0 contribution");

      await expect(roboCop.connect(botWallet).executeRule(ruleHashEth)).to.changeEtherBalance(
        botWallet,
        DEFAULT_REWARD.mul(2)
      );
    });

    it(`should allow any user to change the reward if the rule is inactive`, async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, roboCop } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(3).mul(ERC20_DECIMALS);
      await roboCop.connect(ruleSubscriberWallet).deactivateRule(ruleHashEth);

      await roboCop.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });
      await expect(roboCop.connect(botWallet).withdrawReward(ruleHashEth)).changeEtherBalance(
        botWallet,
        DEFAULT_REWARD
      );
      // tries to reduce the reward added at the point of rule creation
      await expect(roboCop.connect(ruleSubscriberWallet).withdrawReward(ruleHashEth)).changeEtherBalance(
        ruleSubscriberWallet,
        DEFAULT_REWARD
      );

      await roboCop.connect(botWallet).increaseReward(ruleHashEth, { value: DEFAULT_REWARD });

      await roboCop.connect(ruleSubscriberWallet).activateRule(ruleHashEth);
      await roboCop
        .connect(ruleSubscriberWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });

      await expect(roboCop.connect(botWallet).executeRule(ruleHashEth)).to.changeEtherBalance(
        botWallet,
        DEFAULT_REWARD
      );
    });
  });

  describe("Get Rule", () => {
    it("revert getRule if rule doesnt exist", async () => {
      const { roboCop } = await deployValidRuleFixture();
      await expect(roboCop.getRule(BAD_RULE_HASH)).to.be.revertedWith("Rule not found");
    });

    it("getRule returns the rule with all details and collateral amount", async () => {
      const { ruleHashEth, ruleSubscriberWallet, botWallet, roboCop, ethTst1PassingTrigger, ethSwapAction } =
        await deployValidRuleFixture();

      const collateralAmount = BigNumber.from(3).mul(ERC20_DECIMALS);

      await roboCop
        .connect(ruleSubscriberWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });

      await roboCop.connect(botWallet).executeRule(ruleHashEth);

      // The return value is a nested object contain both array and object representations
      // We need a nested compar
      const expectedRule: Partial<RuleStructOutput> = {
        owner: ruleSubscriberWallet.address,
        collaterals: [collateralAmount],
        // @ts-ignore
        triggers: [ethTst1PassingTrigger],
        // @ts-ignore
        actions: [ethSwapAction],
        status: 2,
        outputs: [collateralAmount.mul(ETH_PRICE_IN_TST1).div(PRICE_TRIGGER_DECIMALS)],
        reward: DEFAULT_REWARD,
      };

      const actualRule = await roboCop.getRule(ruleHashEth);
      // @ts-ignore
      expectEthersObjDeepEqual(expectedRule, actualRule);
    });
  });
});
