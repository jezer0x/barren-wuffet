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
import { setupRoboCop, makePassingTrigger, makeFailingTrigger, makeSwapAction, createRuleInRoboCop } from "./Fixtures";
import { expectEthersObjDeepEqual } from "./helper";
import {
  BAD_RULE_HASH,
  ERC20_DECIMALS,
  PRICE_TRIGGER_DECIMALS,
  TST1_PRICE_IN_ETH,
  ETH_PRICE_IN_TST1,
  LT,
  GT,
  ETH_ADDRESS,
  PRICE_TRIGGER_TYPE
} from "./Constants";
import { RuleStructOutput } from "../typechain-types/contracts/rules/RoboCop";
import { HardhatRuntimeEnvironment } from "hardhat/types";

describe("RoboCop", () => {
  const deployRoboCopFixture = deployments.createFixture(async (hre, options) => {
    await deployments.fixture(["BarrenWuffet", "RoboCopFactory"]);
    return await setupRoboCop(hre);
  });

  describe("Add Rule By Owner", () => {
    it("Should not revert if no trigger is specified", async () => {
      //empty triggerArray just means executable anytime!
      const { roboCop, uniSwapExactInputSingle, ruleMakerWallet, testToken1 } = await deployRoboCopFixture();
      const executableAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address);
      await expect(roboCop.connect(ruleMakerWallet).createRule([], [executableAction])).to.emit(roboCop, "Created");
    });

    it("Should revert if trigger doesnt have a callee with validateTrigger", async () => {
      const { roboCop, uniSwapExactInputSingle, ruleMakerWallet, testToken1 } = await deployRoboCopFixture();

      const badTrigger = await makePassingTrigger(constants.AddressZero, testToken1); // passing trigger with bad address
      const executableAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address);

      await expect(
        roboCop.connect(ruleMakerWallet).createRule([badTrigger], [executableAction])
      ).to.be.revertedWithoutReason();
    });

    it("Should revert if validateTrigger on trigger does not return true", async () => {
      const { roboCop, uniSwapExactInputSingle, ruleMakerWallet, testToken1 } = await deployRoboCopFixture();

      const BadPriceTrigger = await ethers.getContractFactory("BadPriceTrigger");
      const badPriceTrigger = await BadPriceTrigger.deploy();

      const badTrigger = makePassingTrigger(badPriceTrigger.address, testToken1);
      const executableAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address);

      await expect(roboCop.connect(ruleMakerWallet).createRule([badTrigger], [executableAction])).to.be.revertedWith(
        "RC: Invalid Trigger"
      );
    });

    // We dont need to check that validate is a view fn. solidity enforces that
    // if the interface is used.

    it("Should revert if no action is specified", async () => {
      const {
        roboCop,
        uniSwapExactInputSingle,
        priceTrigger,
        ruleMakerWallet,
        testToken1
      } = await deployRoboCopFixture();
      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      await expect(roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [])).to.be.revertedWithoutReason();
    });

    it("Should revert if action doesnt have a callee with validate", async () => {
      const { roboCop, priceTrigger, ruleMakerWallet, testToken1 } = await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const badAction = makeSwapAction(constants.AddressZero, testToken1.address);

      await expect(
        roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [badAction])
      ).to.be.revertedWithoutReason();
    });

    it.skip("Should revert if validate on action does not return true", async () => {
      // KIV This. currently we dont have a situation where the action fails validation.
    });

    // We dont need to check that validate is a view fn. solidity enforces that
    // if the interface is used.

    it("Should emit Created event", async () => {
      const {
        roboCop,
        uniSwapExactInputSingle,
        priceTrigger,
        ruleMakerWallet,
        testToken1
      } = await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1); // pass / fail shouldnt matter here
      const executableAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address);

      await expect(roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction]))
        .to.emit(roboCop, "Created")
        .withArgs(anyValue);
    });

    it("If trigger, action, user, block are the same, ruleHash should be the same -> making the second creation fail", async () => {
      const {
        roboCop,
        uniSwapExactInputSingle,
        priceTrigger,
        ruleMakerWallet,
        testToken1
      } = await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const executableAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address);

      var rule1Hash: string;

      await network.provider.send("evm_setAutomine", [false]);
      const tx1 = await roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction]);
      const tx2 = await roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction]);

      await network.provider.send("evm_mine", []);
      await network.provider.send("evm_setAutomine", [true]);
      // different block time, so this 3rd rule should work
      await expect(roboCop.connect(ruleMakerWallet).createRule([passingTrigger], [executableAction])).to.emit(
        roboCop,
        "Created"
      );

      try {
        await tx1.wait();
      } catch {
        expect.fail();
      }

      const trace = await network.provider.send("debug_traceTransaction", [tx2.hash]);

      expect(trace.failed).to.be.equal(true);

      const functionSelector = utils.id("Error(string)").substring(2, 10);
      const data = utils.defaultAbiCoder.encode(["string"], ["Duplicate Rule"]).substring(2);
      expect(trace.returnValue).to.be.equal(functionSelector + data);
    });

    it("Should fail to create rule by nonOwner", async () => {
      const {
        roboCop,
        uniSwapExactInputSingle,
        priceTrigger,
        botWallet,
        testToken1,
        ruleMakerWallet
      } = await deployRoboCopFixture();

      const ruleMakerWallet2 = botWallet;

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const executableAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address);

      await expect(
        roboCop.connect(ruleMakerWallet2).createRule([passingTrigger], [executableAction])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Check Rule", () => {
    it("should return false if the checkTrigger on the rule denoted by ruleHash returns false", async () => {
      const {
        roboCop,
        uniSwapExactInputSingle,
        priceTrigger,
        ruleMakerWallet,
        botWallet,
        testToken1
      } = await deployRoboCopFixture();

      const failingTrigger = makeFailingTrigger(priceTrigger.address, testToken1);
      const tokenSwapAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address, ETH_ADDRESS);
      const ruleHash = await createRuleInRoboCop(roboCop, [failingTrigger], [tokenSwapAction], ruleMakerWallet);

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
        uniSwapExactInputSingle,
        priceTrigger,
        ruleMakerWallet,
        botWallet,
        testToken1
      } = await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const tokenSwapAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address, ETH_ADDRESS);
      const ruleHash = await createRuleInRoboCop(roboCop, [passingTrigger], [tokenSwapAction], ruleMakerWallet);

      expect(await roboCop.connect(botWallet).checkRule(ruleHash)).to.equal(true);
    });

    it("should return false if one of multiple triggers is invalid", async () => {
      const {
        roboCop,
        uniSwapExactInputSingle,
        priceTrigger,
        ruleMakerWallet,
        botWallet,
        testToken1
      } = await deployRoboCopFixture();

      const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);
      const failingTrigger = makeFailingTrigger(priceTrigger.address, testToken1);
      const tokenSwapAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address, ETH_ADDRESS);
      const ruleHash = await createRuleInRoboCop(
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
        uniSwapExactInputSingle,
        ruleMakerWallet,
        botWallet,
        priceTrigger,
        testToken1
      } = await deployRoboCopFixture();

      const passingTrigger = makeFailingTrigger(priceTrigger.address, testToken1);
      const tokenSwapAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address, ETH_ADDRESS);
      const ruleHash = await createRuleInRoboCop(roboCop, [passingTrigger], [tokenSwapAction], ruleMakerWallet, true);

      await expect(roboCop.connect(botWallet).executeRule(ruleHash)).to.be.rejectedWith("RC: Trigger not satisfied");
    });
  });

  const deployValidRuleFixture = deployments.createFixture(async (hre, options) => {
    await deployments.fixture(["BarrenWuffet", "RoboCopFactory"]);
    return await setupValidRuleFixture(hre);
  });

  async function setupValidRuleFixture(hre: HardhatRuntimeEnvironment) {
    const {
      roboCop,
      uniSwapExactInputSingle,
      priceTrigger,
      deployerWallet,
      testToken1,
      testToken2
    } = await setupRoboCop(hre);

    const { ruleMaker, bot } = await hre.getNamedAccounts();
    const ruleMakerWallet = await ethers.getSigner(ruleMaker);
    const botWallet = await ethers.getSigner(bot);

    const ethTst1PassingTrigger = {
      createTimeParams: utils.defaultAbiCoder.encode(
        ["address", "address", "uint8", "uint256"], // TODO: Ops is not present in typechain
        [ETH_ADDRESS, testToken1.address, GT, ETH_PRICE_IN_TST1.sub(1)]
      ),
      triggerType: PRICE_TRIGGER_TYPE,
      callee: priceTrigger.address
    };

    const tst1EthPassingTrigger = {
      createTimeParams: utils.defaultAbiCoder.encode(
        ["address", "address", "uint8", "uint256"], // TODO: Ops is not present in typechain
        [testToken1.address, ETH_ADDRESS, LT, ETH_PRICE_IN_TST1.add(1)]
      ),
      triggerType: PRICE_TRIGGER_TYPE,
      callee: priceTrigger.address
    };

    // to get ETH from uniswap, you need to set the output token as WETH.
    const tokenSwapAction = makeSwapAction(uniSwapExactInputSingle.address, testToken1.address, ETH_ADDRESS);
    const ethSwapAction = makeSwapAction(uniSwapExactInputSingle.address, ETH_ADDRESS, testToken1.address);
    const ruleHashEth = await createRuleInRoboCop(
      roboCop,
      [ethTst1PassingTrigger],
      [ethSwapAction],
      ruleMakerWallet,
      true
    );
    const ruleHashToken = await createRuleInRoboCop(
      roboCop,
      [tst1EthPassingTrigger],
      [tokenSwapAction],
      ruleMakerWallet,
      true
    );

    await testToken1.transfer(ruleMakerWallet.address, BigNumber.from(200000).mul(ERC20_DECIMALS));
    return {
      ruleHashEth,
      ruleHashToken,
      roboCop,
      deployerWallet,
      ruleMakerWallet,
      botWallet,
      testToken1,
      testToken2,
      uniSwapExactInputSingle,
      priceTrigger,
      ethTst1PassingTrigger,
      tst1EthPassingTrigger,
      tokenSwapAction,
      ethSwapAction
    };
  }

  describe("Add / Reduce Collateral", function() {
    it("should revert if add / reduce collateral is called on a non-existent ruleHash", async () => {
      const { ruleMakerWallet, roboCop } = await deployValidRuleFixture();
      await expect(roboCop.connect(ruleMakerWallet).addCollateral(BAD_RULE_HASH, [1000])).to.be.revertedWith(
        "EnumerableMap: nonexistent key"
      );
      await expect(roboCop.connect(ruleMakerWallet).reduceCollateral(BAD_RULE_HASH, [1000])).to.be.revertedWith(
        "EnumerableMap: nonexistent key"
      );
    });

    it("should revert if > 0 native is not sent to addCollateral for an native action", async () => {
      const { ruleHashEth, ruleMakerWallet, roboCop } = await deployValidRuleFixture();

      await expect(roboCop.connect(ruleMakerWallet).addCollateral(ruleHashEth, [0])).to.be.revertedWith(
        "RC: amount <= 0"
      );
    });

    it("should revert if > 0 ERC20 isnt sent / approved to addCollateral for an ERC20 rule", async () => {
      const { ruleHashToken, ruleMakerWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      await expect(roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [0])).to.be.revertedWith(
        "RC: amount <= 0"
      );
      await testToken1.connect(ruleMakerWallet).approve(roboCop.address, 6);
      await expect(roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [10])).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );

      const balance = await testToken1.connect(ruleMakerWallet).balanceOf(ruleMakerWallet.address);
      await testToken1.connect(ruleMakerWallet).approve(roboCop.address, balance.add(1));

      await expect(roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [balance.add(1)])).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("should not allow anyone other than rule owner to add / reduce collateral to a rule", async () => {
      const {
        ruleHashEth,
        ruleHashToken,
        roboCop,
        testToken1,
        ruleMakerWallet,
        botWallet
      } = await deployValidRuleFixture();
      const collateralAmount = utils.parseEther("1");
      await expect(
        roboCop.connect(botWallet).addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount })
      ).to.be.revertedWith("Ownable: caller is not the owner");

      // this should work
      await roboCop
        .connect(ruleMakerWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });
      // now that there is some collateral, we confirm  that it cant be removed to a different user.
      await expect(roboCop.connect(botWallet).reduceCollateral(ruleHashEth, [collateralAmount])).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );

      // check for tokens as well.
      await testToken1.connect(botWallet).approve(roboCop.address, collateralAmount);
      await expect(roboCop.connect(botWallet).addCollateral(ruleHashToken, [collateralAmount])).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(roboCop.connect(botWallet).reduceCollateral(ruleHashToken, [collateralAmount])).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should revert if collateral amount does not match msg.value for native actions", async () => {
      const { ruleHashEth, ruleMakerWallet, roboCop, botWallet } = await deployValidRuleFixture();
      await expect(roboCop.connect(ruleMakerWallet).addCollateral(ruleHashEth, [12], { value: 3 })).to.be.revertedWith(
        "RC: amount != msg.value"
      );
    });

    [1, 0].forEach(isNative => {
      const assetType = isNative ? "native" : "erc20";
      it("should not allow removing collateral if no collateral has been added: " + assetType, async () => {
        const { ruleHashEth, ruleHashToken, roboCop, ruleMakerWallet } = await deployValidRuleFixture();
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        await expect(roboCop.connect(ruleMakerWallet).reduceCollateral(ruleHash, [12])).to.be.revertedWith(
          "RC: Not enough collateral."
        );
      });

      it(
        "should receive token and emit CollateralAdded event if addCollateral is called successfully: " + assetType,
        async () => {
          const { ruleHashEth, ruleHashToken, ruleMakerWallet, roboCop, testToken1 } = await deployValidRuleFixture();
          const collateralAmount = BigNumber.from(1).mul(ERC20_DECIMALS); // ETH is also 18 decimals so this works out both ways
          const msgValue = isNative ? collateralAmount : 0;
          const ruleHash = isNative ? ruleHashEth : ruleHashToken;
          if (!isNative) await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);

          const changeWallets = [ruleMakerWallet, roboCop];
          const changeAmounts = [BigNumber.from(0).sub(collateralAmount), collateralAmount];
          const ethChange = isNative ? changeAmounts : [0, 0];
          const tokenChange = !isNative ? changeAmounts : [0, 0];

          const ex = expect(
            roboCop.connect(ruleMakerWallet).addCollateral(ruleHash, [collateralAmount], { value: msgValue })
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
            await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount.add(collateralAmount2));

          const ex2 = expect(
            roboCop
              .connect(ruleMakerWallet)
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
          const { ruleHashEth, ruleHashToken, ruleMakerWallet, roboCop, testToken1 } = await deployValidRuleFixture();
          const collateralAmount = BigNumber.from(10).mul(ERC20_DECIMALS);
          const msgValue = isNative ? collateralAmount : 0;
          const ruleHash = isNative ? ruleHashEth : ruleHashToken;

          if (!isNative) await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);

          await roboCop.connect(ruleMakerWallet).addCollateral(ruleHash, [collateralAmount], { value: msgValue });

          const reduceAmount = collateralAmount.sub(1);
          const changeWallets = [ruleMakerWallet, roboCop];
          const changeAmounts = [reduceAmount, BigNumber.from(0).sub(reduceAmount)];
          const ethChange = isNative ? changeAmounts : [0, 0];
          const tokenChange = !isNative ? changeAmounts : [0, 0];

          const ex = expect(roboCop.connect(ruleMakerWallet).reduceCollateral(ruleHash, [reduceAmount]));
          await ex.to
            .changeEtherBalances(changeWallets, ethChange)
            .and.emit(roboCop, "CollateralReduced")
            .withArgs(ruleHash, [reduceAmount]);

          await ex.to.changeTokenBalances(testToken1, changeWallets, tokenChange);
        }
      );

      it("Should not allow removing more collateral than available:" + assetType, async () => {
        const { ruleHashToken, testToken1, ruleHashEth, ruleMakerWallet, roboCop } = await deployValidRuleFixture();
        const collateralAmount = BigNumber.from(49).mul(ERC20_DECIMALS);
        const msgValue = isNative ? collateralAmount : 0;
        const ruleHash = isNative ? ruleHashEth : ruleHashToken;
        if (!isNative) await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);

        await roboCop.connect(ruleMakerWallet).addCollateral(ruleHash, [collateralAmount], { value: msgValue });

        await expect(
          roboCop.connect(ruleMakerWallet).reduceCollateral(ruleHash, [collateralAmount.add(1)])
        ).to.be.revertedWith("RC: Not enough collateral.");
        await roboCop.connect(ruleMakerWallet).reduceCollateral(ruleHash, [collateralAmount]);
        await expect(roboCop.connect(ruleMakerWallet).reduceCollateral(ruleHash, [1])).to.be.revertedWith(
          "RC: Not enough collateral."
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
      await expect(roboCop.connect(botWallet).executeRule(BAD_RULE_HASH)).to.be.rejectedWith(
        "EnumerableMap: nonexistent key"
      );
    });

    it.skip("Should revert if anyone tries to execute the rule, and action fails", async () => {
      // Need to create a dummy action and make it fail
      const { ruleHashToken, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.be.rejectedWith("Action unsuccessful");
    });

    it.skip("placeholder for multiple triggers / actions", async () => {});
    // TODO Merge this and the native rule
    // Check for single and multiple triggers, and single and multiple actions

    it.skip("should not revert if anyone tries to execute a rule with no collateral", async () => {});

    // For some insane reason, if the native test is after the erc20 test,
    // the addCollateral fails in the erc20 test.
    it("Should allow anyone to execute the rule once (native), and the trigger passes", async () => {
      // execute valid rule with collateral by someone else
      const { ruleHashEth, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateral = utils.parseEther("2");
      await expect(
        roboCop.connect(ruleMakerWallet).addCollateral(ruleHashEth, [collateral], { value: collateral })
      ).to.emit(roboCop, "CollateralAdded");
      const ex = expect(roboCop.connect(botWallet).executeRule(ruleHashEth));
      await ex.to.emit(roboCop, "Executed").withArgs(ruleHashEth, botWallet.address);

      await ex.to.changeTokenBalances(
        testToken1,
        // this should reflect the incentive.
        [botWallet, ruleMakerWallet, roboCop],
        [0, 0, collateral.mul(ETH_PRICE_IN_TST1).div(PRICE_TRIGGER_DECIMALS)]
      );

      await expect(roboCop.connect(botWallet).executeRule(ruleHashEth)).to.be.revertedWith("RC: !Activated");
    });

    it("Should allow anyone to execute the rule (token), and all the triggers passes", async () => {
      // execute valid rule with collateral by someone else
      const { ruleHashToken, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateral = BigNumber.from(5196).mul(ERC20_DECIMALS);
      await expect(testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateral)).to.not.be.reverted;
      await expect(roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [collateral])).to.emit(
        roboCop,
        "CollateralAdded"
      );
      const ex = expect(roboCop.connect(botWallet).executeRule(ruleHashToken));
      await ex.to
        .changeTokenBalances(testToken1, [botWallet, ruleMakerWallet, roboCop], [0, 0, collateral.mul(-1)])
        .and.emit(roboCop, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      // TODO need to implement caller getting paid.
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("RC: !Activated");
    });

    it("Should revert if anyone tries to execute the rule twice", async () => {
      // we get here by calling a valid rule, using up the collateral and call again.
      const { ruleHashToken, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      await testToken1.connect(ruleMakerWallet).approve(roboCop.address, 11);
      await roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [6]);
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken))
        .to.emit(roboCop, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("RC: !Activated");
    });

    it("Should not allow adding / removing collateral after a rule is executed", async () => {
      const { ruleHashToken, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(15).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [collateralAmount]);
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken))
        .to.emit(roboCop, "Executed")
        .withArgs(ruleHashToken, botWallet.address);

      await expect(
        roboCop.connect(ruleMakerWallet).reduceCollateral(ruleHashToken, [collateralAmount])
      ).to.be.revertedWith("RC: Can't reduce collateral");
      await expect(roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [1])).to.be.revertedWith(
        "RC: Can't add collateral"
      );
    });
  });

  describe("Activate / Deactivate rule", () => {
    it("Should not allow executing a rule that has been deactivated (after it was active)", async () => {
      const { ruleHashToken, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [collateralAmount]);

      await expect(roboCop.connect(ruleMakerWallet).deactivateRule(ruleHashToken))
        .to.emit(roboCop, "Deactivated")
        .withArgs(ruleHashToken);
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.be.revertedWith("RC: !Activated");
    });

    it("Should allow executing a rule that has been activated (after it was deactivated)", async () => {
      const { ruleHashToken, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [collateralAmount]);

      await expect(roboCop.connect(ruleMakerWallet).deactivateRule(ruleHashToken))
        .to.emit(roboCop, "Deactivated")
        .withArgs(ruleHashToken);
      await expect(roboCop.connect(ruleMakerWallet).activateRule(ruleHashToken))
        .to.emit(roboCop, "Activated")
        .withArgs(ruleHashToken);

      // check that the rule got executed correctly.
      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken))
        .to.changeTokenBalances(
          testToken1,
          [botWallet, ruleMakerWallet, roboCop],
          [0, 0, BigNumber.from(0).sub(collateralAmount)]
        )
        .and.emit(roboCop, "Executed")
        .withArgs(ruleHashToken, botWallet.address);
    });
  });

  describe("Redeem Balance", () => {
    it("should not allow redeeming balance if the rule is not yet executed", async () => {
      // TODO: does not make sense anymore since interface changed
      // const { ruleHashToken, ruleMakerWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      // await expect(roboCop.connect(ruleMakerWallet).redeemBalance(ruleHashToken)).to.be.revertedWith(
      //   "Rule isn't pending redemption"
      // );
      // const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      // await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);
      // await roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [collateralAmount]);
      // await expect(roboCop.connect(ruleMakerWallet).redeemBalance(ruleHashToken)).to.be.revertedWith(
      //   "Rule isn't pending redemption"
      // );
    });

    it.skip("should result in no token changes if the rule was executed and did not return a token", async () => {
      const { ruleHashToken, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(30).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [collateralAmount]);

      await expect(roboCop.connect(botWallet).executeRule(ruleHashToken)).to.not.be.rejected;

      const ex = expect(roboCop.connect(ruleMakerWallet).redeemOutputs());
      await ex.to
        .changeTokenBalance(testToken1, roboCop, 0)
        .emit(roboCop, "Redeemed")
        .withArgs(ruleHashToken);
      await ex.to.changeEtherBalance(roboCop.address, 0);
    });

    it("should redeem all the balance only once by the subscriber if the rule was executed and returned native", async () => {
      const { ruleHashToken, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = BigNumber.from(500).mul(ERC20_DECIMALS);
      await testToken1.connect(ruleMakerWallet).approve(roboCop.address, collateralAmount);
      await roboCop.connect(ruleMakerWallet).addCollateral(ruleHashToken, [collateralAmount]);
      await roboCop.connect(botWallet).executeRule(ruleHashToken);
      await expect(roboCop.connect(botWallet).redeemOutputs()).to.be.revertedWith("Ownable: caller is not the owner");

      const ex = expect(roboCop.connect(ruleMakerWallet).redeemOutputs());
      await ex.to
        .changeEtherBalance(ruleMakerWallet, collateralAmount.mul(TST1_PRICE_IN_ETH).div(PRICE_TRIGGER_DECIMALS))
        .emit(roboCop, "Redeemed")
        .withArgs(ruleHashToken);

      await ex.to.changeTokenBalance(testToken1, roboCop, 0);

      // TODO: following test does not make sense after change in interface
      // // can only redeem once.
      // await expect(roboCop.connect(ruleMakerWallet).redeemOutputs(ruleHashToken)).to.be.revertedWith(
      //   "Rule isn't pending redemption"
      // );
    });

    it("should redeem all the balance only once by the subscriber if the rule was executed and returned token", async () => {
      const { ruleHashEth, ruleMakerWallet, botWallet, roboCop, testToken1 } = await deployValidRuleFixture();
      const collateralAmount = utils.parseEther("2"); // send 2 eth
      await roboCop
        .connect(ruleMakerWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });
      await roboCop.connect(botWallet).executeRule(ruleHashEth);
      await expect(roboCop.connect(botWallet).redeemOutputs()).to.be.revertedWith("Ownable: caller is not the owner");

      const ex = expect(roboCop.connect(ruleMakerWallet).redeemOutputs());

      const tokenReceived = collateralAmount.mul(ETH_PRICE_IN_TST1).div(PRICE_TRIGGER_DECIMALS);

      await ex.to
        .changeTokenBalances(testToken1, [roboCop, ruleMakerWallet], [tokenReceived.mul(-1), tokenReceived])
        .emit(roboCop, "Redeemed")
        .withArgs(ruleHashEth);

      await ex.to.changeEtherBalance(roboCop.address, 0);
    });

    it.skip("Should redeem balance only from the final action if multiple actions were executed", async () => {});
  });

  describe("Get Rule", () => {
    it("revert getRule if rule doesnt exist", async () => {
      const { roboCop } = await deployValidRuleFixture();
      await expect(roboCop.getRule(BAD_RULE_HASH)).to.be.revertedWith("EnumerableMap: nonexistent key");
    });

    it("getRule returns the rule with all details and collateral amount", async () => {
      const {
        ruleHashEth,
        ruleMakerWallet,
        botWallet,
        roboCop,
        ethTst1PassingTrigger,
        ethSwapAction
      } = await deployValidRuleFixture();

      const collateralAmount = BigNumber.from(3).mul(ERC20_DECIMALS);

      await roboCop
        .connect(ruleMakerWallet)
        .addCollateral(ruleHashEth, [collateralAmount], { value: collateralAmount });

      await roboCop.connect(botWallet).executeRule(ruleHashEth);

      // The return value is a nested object contain both array and object representations
      // We need a nested compar
      const expectedRule: Partial<RuleStructOutput> = {
        // @ts-ignore
        triggers: [ethTst1PassingTrigger],
        // @ts-ignore
        actions: [ethSwapAction],
        collaterals: [collateralAmount],
        status: 2,
        outputs: [collateralAmount.mul(ETH_PRICE_IN_TST1).div(PRICE_TRIGGER_DECIMALS)]
      };

      const actualRule = await roboCop.getRule(ruleHashEth);
      // @ts-ignore
      expectEthersObjDeepEqual(expectedRule, actualRule);
    });
  });

  describe.skip("onlyOwner tests", () => {});
});
