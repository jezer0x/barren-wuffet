import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Bytes } from "ethers";
import { deployments, ethers, network } from "hardhat";
import { RuleStructOutput } from "../typechain-types/contracts/rules/RoboCop";
import { SubscriptionConstraintsStruct, TradeStructOutput } from "../typechain-types/contracts/trades/DegenStreet";
import {
  BAD_RULE_HASH,
  DEFAULT_REWARD,
  ERC20_DECIMALS,
  ETH_PRICE_IN_TST1,
  TST1_PRICE_IN_ETH,
  ETH_PRICE_IN_TST1_PARAM,
  TST1_PRICE_IN_ETH_PARAM,
  GT,
} from "./Constants";
import { makePassingTrigger, makeSwapAction, setupDegenStreet } from "./Fixtures";
import { getHashFromEvent } from "./helper";

const MIN_COLLATERAL_PER_SUB = BigNumber.from(10).mul(ERC20_DECIMALS);
const MAX_COLLATERAL_PER_SUB = BigNumber.from(100).mul(ERC20_DECIMALS);
const MIN_COLLATERAL_TOTAL = BigNumber.from(200).mul(ERC20_DECIMALS);
const MAX_COLLATERAL_TOTAL = BigNumber.from(500).mul(ERC20_DECIMALS);

async function makeSubConstraints(): Promise<SubscriptionConstraintsStruct> {
  return {
    minCollateralPerSub: MIN_COLLATERAL_PER_SUB,
    maxCollateralPerSub: MAX_COLLATERAL_PER_SUB,
    minCollateralTotal: MIN_COLLATERAL_TOTAL,
    maxCollateralTotal: MAX_COLLATERAL_TOTAL,
    deadline: (await time.latest()) + 86400,
    lockin: (await time.latest()) + 86400 * 10,
    rewardPercentage: 100,
  };
}

describe("DegenStreet", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployDegenStreetFixture() {
    await deployments.fixture();
    return setupDegenStreet();
  }

  async function deployValidTradeFixture() {
    const {
      ownerWallet,
      priceTrigger,
      swapUniSingleAction,
      testToken1,
      testToken2,
      degenStreet,
      traderWallet,
      someOtherWallet,
      tradeSubscriberWallet,
      roboCop,
      botWallet,
    } = await deployDegenStreetFixture();

    const ETHtoTST1SwapPriceTrigger = {
      op: GT,
      param: ETH_PRICE_IN_TST1_PARAM,
      callee: priceTrigger.address,
      value: ETH_PRICE_IN_TST1.sub(1),
    };

    const TST1toETHSwapPriceTrigger = {
      op: GT,
      param: TST1_PRICE_IN_ETH_PARAM,
      callee: priceTrigger.address,
      value: TST1_PRICE_IN_ETH.sub(1),
    };

    const swapTST1ToETHAction = makeSwapAction(
      swapUniSingleAction.address,
      testToken1.address,
      ethers.constants.AddressZero
    );

    const swapETHToTST1Action = makeSwapAction(
      swapUniSingleAction.address,
      ethers.constants.AddressZero,
      testToken1.address
    );

    const properContraints = await makeSubConstraints();

    const tx = await degenStreet
      .connect(traderWallet)
      .createTrade([TST1toETHSwapPriceTrigger], [swapTST1ToETHAction], properContraints, { value: DEFAULT_REWARD });

    const tradeTST1forETHHash: Bytes = await getHashFromEvent(tx, "Created", degenStreet.address, "tradeHash");

    const tx2 = await degenStreet
      .connect(traderWallet)
      .createTrade([ETHtoTST1SwapPriceTrigger], [swapETHToTST1Action], properContraints, { value: DEFAULT_REWARD });

    const tradeETHforTST1Hash: Bytes = await getHashFromEvent(tx2, "Created", degenStreet.address, "tradeHash");

    return {
      ownerWallet,
      testToken1,
      testToken2,
      degenStreet,
      traderWallet,
      someOtherWallet,
      tradeSubscriberWallet,
      tradeTST1forETHHash,
      tradeETHforTST1Hash,
      roboCop,
      botWallet,
    };
  }

  describe("Deployment", () => {
    it("Should set the right owner", async function () {
      const { degenStreet, ownerWallet } = await loadFixture(deployDegenStreetFixture);
      expect(await degenStreet.owner()).to.equal(ownerWallet.address);
    });
  });

  describe.skip("Admin functions", () => {
    it("Should be able to X if owner", async function () {});
    it("Should not be able to X if not owner", async function () {});
  });

  describe("Opening a Trade", () => {
    it("Should emit the Created event properly", async function () {
      const { priceTrigger, swapUniSingleAction, testToken1, degenStreet, traderWallet } = await loadFixture(
        deployDegenStreetFixture
      );
      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(
        swapUniSingleAction.address,
        testToken1.address,
        ethers.constants.AddressZero
      );
      const properContraints = await makeSubConstraints();

      await expect(
        await degenStreet
          .connect(traderWallet)
          .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD })
      ).to.emit(degenStreet, "Created");
    });

    it("Should revert if tries to open duplicate trades in same block", async function () {
      const { priceTrigger, swapUniSingleAction, testToken1, degenStreet, traderWallet } = await loadFixture(
        deployDegenStreetFixture
      );
      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(
        swapUniSingleAction.address,
        testToken1.address,
        ethers.constants.AddressZero
      );
      const properContraints = await makeSubConstraints();

      await network.provider.send("evm_setAutomine", [false]);
      const tx1 = await await degenStreet
        .connect(traderWallet)
        .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD });
      const tx2 = await degenStreet
        .connect(traderWallet)
        .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD });
      await network.provider.send("evm_mine", []);
      await network.provider.send("evm_setAutomine", [true]);

      var tx1Success: Boolean = false;
      var tx2Success: Boolean = false;
      try {
        await tx1.wait();
        tx1Success = true;
      } catch {}

      try {
        await tx2.wait();
        tx2Success = true;
      } catch {}

      expect(tx1Success).to.not.equal(tx2Success);
    });

    it("Should succeed if tries to open duplicate trade in a different block", async function () {
      const { priceTrigger, swapUniSingleAction, testToken1, degenStreet, traderWallet } = await loadFixture(
        deployDegenStreetFixture
      );
      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(
        swapUniSingleAction.address,
        testToken1.address,
        ethers.constants.AddressZero
      );
      const properContraints = await makeSubConstraints();

      await expect(
        await degenStreet
          .connect(traderWallet)
          .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD })
      ).to.emit(degenStreet, "Created");

      await expect(
        await degenStreet
          .connect(traderWallet)
          .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD })
      ).to.emit(degenStreet, "Created");
    });

    // TODO: maybe should check if the entire trade/rule chain was proper?
    it("Should set the right manager for the trade", async function () {
      const { tradeTST1forETHHash, degenStreet, traderWallet } = await loadFixture(deployValidTradeFixture);
      const trade: TradeStructOutput = await degenStreet.getTrade(tradeTST1forETHHash);
      expect(trade.manager).to.equal(traderWallet.address);
    });
  });

  describe("Cancelling a Trade", () => {
    it("Should revert if non-owner tries to cancel your trade", async function () {
      const { tradeTST1forETHHash, degenStreet, someOtherWallet } = await loadFixture(deployValidTradeFixture);
      const trade: TradeStructOutput = await degenStreet.getTrade(tradeTST1forETHHash);
      await expect(degenStreet.connect(someOtherWallet).cancelTrade(tradeTST1forETHHash)).to.be.revertedWith(
        "onlyManager"
      );
    });
    it("Should succeed if manager wants to cancel trade", async function () {
      const { tradeTST1forETHHash, degenStreet, traderWallet } = await loadFixture(deployValidTradeFixture);
      await expect(degenStreet.connect(traderWallet).cancelTrade(tradeTST1forETHHash))
        .to.emit(degenStreet, "Cancelled")
        .withArgs(tradeTST1forETHHash);
    });
    it("Should revert if trying to cancel non-existing trade", async function () {
      const { tradeTST1forETHHash, degenStreet, traderWallet } = await loadFixture(deployValidTradeFixture);
      await expect(degenStreet.connect(traderWallet).cancelTrade(BAD_RULE_HASH)).to.be.reverted;
    });
    it("Should revert if manager tries to cancel same trade twice", async function () {
      const { tradeTST1forETHHash, degenStreet, traderWallet } = await loadFixture(deployValidTradeFixture);
      await expect(degenStreet.connect(traderWallet).cancelTrade(tradeTST1forETHHash))
        .to.emit(degenStreet, "Cancelled")
        .withArgs(tradeTST1forETHHash);

      await expect(degenStreet.connect(traderWallet).cancelTrade(tradeTST1forETHHash)).to.be.reverted;
    });

    it("Should revert if manager tries to cancel a trade that is completed", async function () {
      const {
        ownerWallet,
        tradeTST1forETHHash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        botWallet,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      const times = MIN_COLLATERAL_TOTAL.div(collateralAmount);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount.mul(times));
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount.mul(times));

      const trade: TradeStructOutput = await degenStreet.getTrade(tradeTST1forETHHash);

      for (var i = 0; i < times.toNumber() - 1; i++) {
        await degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);
      }

      await expect(
        degenStreet.connect(tradeSubscriberWallet).deposit(tradeTST1forETHHash, testToken1.address, collateralAmount)
      )
        .to.emit(roboCop, "Activated")
        .withArgs(trade.ruleHash);

      // now a bot will snipe this, making it an EXECUTED rule
      await expect(roboCop.connect(botWallet).executeRule(trade.ruleHash)).to.emit(roboCop, "Executed");
      await expect(degenStreet.connect(traderWallet).cancelTrade(tradeTST1forETHHash)).to.be.revertedWith(
        "Can't Cancel Trade"
      );
    });
  });

  describe("Subscriber depositing", () => {
    it("Should revert if subscriber deposits wrong asset", async function () {
      const { ownerWallet, tradeTST1forETHHash, degenStreet, traderWallet, tradeSubscriberWallet, testToken2 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = MIN_COLLATERAL_PER_SUB.add(1);
      await testToken2.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken2.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount);
      await expect(
        degenStreet.connect(tradeSubscriberWallet).deposit(tradeTST1forETHHash, testToken2.address, collateralAmount)
      ).to.be.revertedWith("Wrong Collateral Type");
    });

    it("Should revert if subscriber deposits too little / much at once", async function () {
      const { ownerWallet, tradeTST1forETHHash, degenStreet, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB.add(1);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount);

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, MAX_COLLATERAL_PER_SUB.add(1))
      ).to.be.revertedWith("Max Collateral for Subscription exceeded");

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, MIN_COLLATERAL_PER_SUB.sub(1))
      ).to.be.revertedWith("Insufficient Collateral for Subscription");
    });

    it("Should succeed in depositing ERC20 properly", async function () {
      // anything between MIN_COLLATERAL_PER_SUB and MAX_COLLATERAL_PER_SUB should work (inclusive)
      const { ownerWallet, tradeTST1forETHHash, degenStreet, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, MAX_COLLATERAL_TOTAL);
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, MAX_COLLATERAL_TOTAL);

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, MIN_COLLATERAL_PER_SUB)
      )
        .to.emit(degenStreet, "Deposit")
        .withArgs(tradeTST1forETHHash, 0, testToken1.address, MIN_COLLATERAL_PER_SUB);

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, MAX_COLLATERAL_PER_SUB)
      )
        .to.emit(degenStreet, "Deposit")
        .withArgs(tradeTST1forETHHash, 1, testToken1.address, MAX_COLLATERAL_PER_SUB);

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, MIN_COLLATERAL_PER_SUB.add(MAX_COLLATERAL_PER_SUB).div(2))
      )
        .to.emit(degenStreet, "Deposit")
        .withArgs(
          tradeTST1forETHHash,
          2,
          testToken1.address,
          MIN_COLLATERAL_PER_SUB.add(MAX_COLLATERAL_PER_SUB).div(2)
        );
    });

    it("Should succeed if same acccount subscribes multiple times", async function () {
      const { ownerWallet, tradeTST1forETHHash, degenStreet, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_TOTAL;
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, MAX_COLLATERAL_TOTAL);
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, MAX_COLLATERAL_TOTAL);

      for (var i = 0; i < MAX_COLLATERAL_TOTAL.div(MAX_COLLATERAL_PER_SUB).toNumber(); i++) {
        await degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, MAX_COLLATERAL_PER_SUB);
      }
      expect((await degenStreet.getTrade(tradeTST1forETHHash)).subscriptions.length).to.equal(
        MAX_COLLATERAL_TOTAL.div(MAX_COLLATERAL_PER_SUB).toNumber()
      );
    });

    it("Should activate rule if minCollateral for trade is reached", async function () {
      const {
        ownerWallet,
        tradeTST1forETHHash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      const times = MIN_COLLATERAL_TOTAL.div(collateralAmount);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount.mul(times));
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount.mul(times));

      const trade: TradeStructOutput = await degenStreet.getTrade(tradeTST1forETHHash);

      for (var i = 0; i < times.toNumber() - 1; i++) {
        await degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);
      }

      await expect(
        degenStreet.connect(tradeSubscriberWallet).deposit(tradeTST1forETHHash, testToken1.address, collateralAmount)
      )
        .to.emit(roboCop, "Activated")
        .withArgs(trade.ruleHash);
    });

    it("Should allow multiple subscriptions from multiple people", async function () {
      // here tradeSubscriberWaller and ownerWallet are both subscribing to the same trade
      const { ownerWallet, tradeTST1forETHHash, degenStreet, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount);
      await testToken1.connect(ownerWallet).approve(degenStreet.address, collateralAmount);

      await expect(
        degenStreet.connect(tradeSubscriberWallet).deposit(tradeTST1forETHHash, testToken1.address, collateralAmount)
      )
        .to.emit(degenStreet, "Deposit")
        .withArgs(tradeTST1forETHHash, 0, testToken1.address, collateralAmount);

      await expect(degenStreet.connect(ownerWallet).deposit(tradeTST1forETHHash, testToken1.address, collateralAmount))
        .to.emit(degenStreet, "Deposit")
        .withArgs(tradeTST1forETHHash, 1, testToken1.address, collateralAmount);
    });

    it("Should revert if deposits take it beyond maxCollateralTotal", async function () {
      const { ownerWallet, tradeTST1forETHHash, degenStreet, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      const times = MAX_COLLATERAL_TOTAL.div(MAX_COLLATERAL_PER_SUB);
      await testToken1
        .connect(ownerWallet)
        .transfer(tradeSubscriberWallet.address, collateralAmount.mul(times).add(MIN_COLLATERAL_PER_SUB));
      await testToken1
        .connect(tradeSubscriberWallet)
        .approve(degenStreet.address, collateralAmount.mul(times).add(MIN_COLLATERAL_PER_SUB));

      for (var i = 0; i < times.toNumber(); i++) {
        await degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);
      }

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, MIN_COLLATERAL_PER_SUB)
      ).to.be.revertedWith("Max Collateral for Trade exceeded");
    });

    it("Should succeed in depositing ETH properly", async function () {
      // anything between MIN_COLLATERAL_PER_SUB and MAX_COLLATERAL_PER_SUB should work (inclusive)
      const { ownerWallet, tradeETHforTST1Hash, degenStreet, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeETHforTST1Hash, ethers.constants.AddressZero, MIN_COLLATERAL_PER_SUB, {
            value: MIN_COLLATERAL_PER_SUB,
          })
      )
        .to.emit(degenStreet, "Deposit")
        .withArgs(tradeETHforTST1Hash, 0, ethers.constants.AddressZero, MIN_COLLATERAL_PER_SUB);

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeETHforTST1Hash, ethers.constants.AddressZero, MAX_COLLATERAL_PER_SUB, {
            value: MAX_COLLATERAL_PER_SUB,
          })
      )
        .to.emit(degenStreet, "Deposit")
        .withArgs(tradeETHforTST1Hash, 1, ethers.constants.AddressZero, MAX_COLLATERAL_PER_SUB);

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(
            tradeETHforTST1Hash,
            ethers.constants.AddressZero,
            MIN_COLLATERAL_PER_SUB.add(MAX_COLLATERAL_PER_SUB).div(2),
            { value: MIN_COLLATERAL_PER_SUB.add(MAX_COLLATERAL_PER_SUB).div(2) }
          )
      )
        .to.emit(degenStreet, "Deposit")
        .withArgs(
          tradeETHforTST1Hash,
          2,
          ethers.constants.AddressZero,
          MIN_COLLATERAL_PER_SUB.add(MAX_COLLATERAL_PER_SUB).div(2)
        );
    });
  });

  describe("Subscriber withdrawing", () => {
    it("Should revert if non-subscriber is trying to withdraw collateral", async function () {
      const {
        ownerWallet,
        tradeTST1forETHHash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount);

      await degenStreet
        .connect(tradeSubscriberWallet)
        .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);

      await expect(degenStreet.connect(ownerWallet).withdraw(tradeTST1forETHHash, 0)).to.be.revertedWith(
        "You're not the subscriber!"
      );
    });

    it("Should succeed if subscriber tries to withdraw if rule is active (ERC20)", async function () {
      const {
        ownerWallet,
        tradeTST1forETHHash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount.mul(2));
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount.mul(2));

      await degenStreet
        .connect(tradeSubscriberWallet)
        .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);

      await expect(
        degenStreet.connect(tradeSubscriberWallet).deposit(tradeTST1forETHHash, testToken1.address, collateralAmount)
      )
        .to.emit(roboCop, "Activated")
        .withArgs((await degenStreet.getTrade(tradeTST1forETHHash)).ruleHash);

      await expect(degenStreet.connect(tradeSubscriberWallet).withdraw(tradeTST1forETHHash, 0))
        .to.emit(degenStreet, "Withdraw")
        .withArgs(tradeTST1forETHHash, 0, testToken1.address, collateralAmount);
    });

    it("Should succeed if subscriber tries to withdraw if rule is inactive (ERC20), but a second time will revert", async function () {
      const {
        ownerWallet,
        tradeTST1forETHHash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount);
      await degenStreet
        .connect(tradeSubscriberWallet)
        .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);

      await expect(degenStreet.connect(tradeSubscriberWallet).withdraw(tradeTST1forETHHash, 0))
        .to.emit(degenStreet, "Withdraw")
        .withArgs(tradeTST1forETHHash, 0, testToken1.address, collateralAmount);

      await expect(degenStreet.connect(tradeSubscriberWallet).withdraw(tradeTST1forETHHash, 0)).to.be.revertedWith(
        "This subscription is not active!"
      );
    });

    it("Should succeed if subscriber tries to withdraw from a cancelled trade", async function () {
      const {
        ownerWallet,
        tradeTST1forETHHash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount);
      await degenStreet
        .connect(tradeSubscriberWallet)
        .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);

      await expect(degenStreet.connect(traderWallet).cancelTrade(tradeTST1forETHHash))
        .to.emit(degenStreet, "Cancelled")
        .withArgs(tradeTST1forETHHash);

      await expect(degenStreet.connect(tradeSubscriberWallet).withdraw(tradeTST1forETHHash, 0))
        .to.emit(degenStreet, "Withdraw")
        .withArgs(tradeTST1forETHHash, 0, testToken1.address, collateralAmount);
    });

    it("Should deactivate rule if withdrawal takes it below minCollateral", async function () {
      const {
        ownerWallet,
        tradeTST1forETHHash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      const times = MIN_COLLATERAL_TOTAL.div(collateralAmount);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount.mul(times));
      await testToken1.connect(tradeSubscriberWallet).approve(degenStreet.address, collateralAmount.mul(times));

      const trade: TradeStructOutput = await degenStreet.getTrade(tradeTST1forETHHash);

      for (var i = 0; i < times.toNumber() - 1; i++) {
        await degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);
      }
      await expect(
        degenStreet.connect(tradeSubscriberWallet).deposit(tradeTST1forETHHash, testToken1.address, collateralAmount)
      )
        .to.emit(roboCop, "Activated")
        .withArgs(trade.ruleHash);

      await expect(degenStreet.connect(tradeSubscriberWallet).withdraw(tradeTST1forETHHash, 0))
        .to.emit(degenStreet, "Withdraw")
        .withArgs(tradeTST1forETHHash, 0, testToken1.address, collateralAmount)
        .to.emit(roboCop, "Deactivated")
        .withArgs(trade.ruleHash);
    });

    it("Should succeed in giving back output after trade is completed (get back ETH)", async function () {
      const {
        ownerWallet,
        tradeTST1forETHHash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        botWallet,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      const times = MIN_COLLATERAL_TOTAL.div(collateralAmount);
      await testToken1
        .connect(ownerWallet)
        .transfer(tradeSubscriberWallet.address, collateralAmount.mul(times).add(MIN_COLLATERAL_PER_SUB));
      await testToken1
        .connect(tradeSubscriberWallet)
        .approve(degenStreet.address, collateralAmount.mul(times).add(MIN_COLLATERAL_PER_SUB));

      for (var i = 0; i < times.toNumber() - 1; i++) {
        await degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeTST1forETHHash, testToken1.address, collateralAmount);
      }

      await expect(
        degenStreet.connect(tradeSubscriberWallet).deposit(tradeTST1forETHHash, testToken1.address, collateralAmount)
      ).to.emit(roboCop, "Activated");

      // throw in another trade with a separate amount to see if ratio of reward output is fine
      await degenStreet
        .connect(tradeSubscriberWallet)
        .deposit(tradeTST1forETHHash, testToken1.address, MIN_COLLATERAL_PER_SUB);

      const trade: TradeStructOutput = await degenStreet.getTrade(tradeTST1forETHHash);

      // now a bot will snipe this, making it an EXECUTED rule
      await expect(roboCop.connect(botWallet).executeRule(trade.ruleHash)).to.emit(roboCop, "Executed");

      const rule: RuleStructOutput = await roboCop.getRule(trade.ruleHash);

      await degenStreet.redeemOutputFromRule(tradeTST1forETHHash);

      for (var i = 0; i < times.toNumber() + 1; i++) {
        var prev_balance = await ethers.provider.getBalance(trade.subscriptions[i].subscriber);
        var expected_output = trade.subscriptions[i].collateralAmount
          .mul(rule.outputAmount)
          .div(rule.totalCollateralAmount);
        await expect(degenStreet.connect(tradeSubscriberWallet).withdraw(tradeTST1forETHHash, i))
          .to.emit(degenStreet, "Withdraw")
          .withArgs(tradeTST1forETHHash, i, ethers.constants.AddressZero, expected_output);
        var post_balance = await ethers.provider.getBalance(trade.subscriptions[i].subscriber);

        // TODO: won't be equal because gas fees
        //await expect(post_balance.sub(prev_balance)).to.equal(expected_output);
      }
    });

    it("Should succeed in giving back output after trade is completed (get back ERC20)", async function () {
      const {
        ownerWallet,
        tradeETHforTST1Hash,
        degenStreet,
        traderWallet,
        tradeSubscriberWallet,
        testToken1,
        botWallet,
        roboCop,
      } = await loadFixture(deployValidTradeFixture);
      const collateralAmount = MAX_COLLATERAL_PER_SUB;
      const times = MIN_COLLATERAL_TOTAL.div(collateralAmount);

      for (var i = 0; i < times.toNumber() - 1; i++) {
        await degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeETHforTST1Hash, ethers.constants.AddressZero, collateralAmount, { value: collateralAmount });
      }

      await expect(
        degenStreet
          .connect(tradeSubscriberWallet)
          .deposit(tradeETHforTST1Hash, ethers.constants.AddressZero, collateralAmount, { value: collateralAmount })
      ).to.emit(roboCop, "Activated");

      // throw in another trade with a separate amount to see if ratio of reward output is fine
      await degenStreet
        .connect(tradeSubscriberWallet)
        .deposit(tradeETHforTST1Hash, ethers.constants.AddressZero, MIN_COLLATERAL_PER_SUB, {
          value: MIN_COLLATERAL_PER_SUB,
        });

      const trade: TradeStructOutput = await degenStreet.getTrade(tradeETHforTST1Hash);

      // now a bot will snipe this, making it an EXECUTED rule
      await expect(roboCop.connect(botWallet).executeRule(trade.ruleHash)).to.emit(roboCop, "Executed");

      const rule: RuleStructOutput = await roboCop.getRule(trade.ruleHash);

      await degenStreet.redeemOutputFromRule(tradeETHforTST1Hash);

      for (var i = 0; i < times.toNumber() + 1; i++) {
        var expected_output = trade.subscriptions[i].collateralAmount
          .mul(rule.outputAmount)
          .div(rule.totalCollateralAmount);

        await expect(degenStreet.connect(tradeSubscriberWallet).withdraw(tradeETHforTST1Hash, i))
          .to.emit(degenStreet, "Withdraw")
          .withArgs(tradeETHforTST1Hash, i, testToken1.address, expected_output);
      }
    });
  });
});