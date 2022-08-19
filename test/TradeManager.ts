import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Bytes } from "ethers";
import { deployments, ethers, network } from "hardhat";
import { SubscriptionConstraintsStruct, TradeStructOutput } from "../typechain-types/contracts/trades/TradeManager";
import { DEFAULT_REWARD, ERC20_DECIMALS } from "./Constants";
import { makePassingTrigger, makeSwapAction, setupTradeManager } from "./Fixtures";

async function makeSubConstraints(): Promise<SubscriptionConstraintsStruct> {
  return {
    minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
    minCollateralTotal: BigNumber.from(200).mul(ERC20_DECIMALS),
    maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
    deadline: (await time.latest()) + 86400,
    lockin: (await time.latest()) + 86400 * 10,
    rewardPercentage: 100,
  };
}

describe("TradeManager", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployTradeManagerFixture() {
    await deployments.fixture();
    return setupTradeManager();
  }

  async function deployValidTradeFixture() {
    const {
      priceTrigger,
      swapUniSingleAction,
      testToken1,
      tradeManager,
      traderWallet,
      someOtherWallet,
      tradeSubscriberWallet,
    } = await loadFixture(deployTradeManagerFixture);
    const passingTrigger = makePassingTrigger(priceTrigger.address);
    const executableAction = makeSwapAction(
      swapUniSingleAction.address,
      testToken1.address,
      ethers.constants.AddressZero
    );
    const properContraints = await makeSubConstraints();

    const tx = await tradeManager
      .connect(traderWallet)
      .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD });
    const receipt = await tx.wait();
    const tradeHash: Bytes = receipt.events?.find(
      (x: { event: string; address: string }) => x.event == "Created" && x.address == tradeManager.address
    )?.args?.tradeHash;
    return {
      testToken1,
      tradeManager,
      traderWallet,
      someOtherWallet,
      tradeSubscriberWallet,
      tradeHash,
    };
  }

  describe("Deployment", () => {
    it("Should set the right owner", async function () {
      const { tradeManager, ownerWallet } = await loadFixture(deployTradeManagerFixture);
      expect(await tradeManager.owner()).to.equal(ownerWallet.address);
    });
  });

  describe.skip("Admin functions", () => {
    it("Should be able to X if owner", async function () {});
    it("Should not be able to X if not owner", async function () {});
  });

  describe("Anyone can open a trade", () => {
    it("Should emit the Created event properly", async function () {
      const { priceTrigger, swapUniSingleAction, testToken1, tradeManager, traderWallet } = await loadFixture(
        deployTradeManagerFixture
      );
      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(
        swapUniSingleAction.address,
        testToken1.address,
        ethers.constants.AddressZero
      );
      const properContraints = await makeSubConstraints();

      await expect(
        await tradeManager
          .connect(traderWallet)
          .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD })
      ).to.emit(tradeManager, "Created");
    });

    // TODO: maybe should if the entire trade/rule chain was proper?
    it("Should set the right manager for the trade", async function () {
      const { tradeHash, tradeManager, traderWallet } = await loadFixture(deployValidTradeFixture);
      const trade: TradeStructOutput = await tradeManager.getTrade(tradeHash);
      expect(trade.manager).to.equal(traderWallet.address);
    });

    it("Should revert if tries to open duplicate trades in same block", async function () {
      const { priceTrigger, swapUniSingleAction, testToken1, tradeManager, traderWallet } = await loadFixture(
        deployTradeManagerFixture
      );
      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(
        swapUniSingleAction.address,
        testToken1.address,
        ethers.constants.AddressZero
      );
      const properContraints = await makeSubConstraints();

      await network.provider.send("evm_setAutomine", [false]);
      const tx1 = await await tradeManager
        .connect(traderWallet)
        .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD });
      const tx2 = await tradeManager
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
      const { priceTrigger, swapUniSingleAction, testToken1, tradeManager, traderWallet } = await loadFixture(
        deployTradeManagerFixture
      );
      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(
        swapUniSingleAction.address,
        testToken1.address,
        ethers.constants.AddressZero
      );
      const properContraints = await makeSubConstraints();

      await expect(
        await tradeManager
          .connect(traderWallet)
          .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD })
      ).to.emit(tradeManager, "Created");

      await expect(
        await tradeManager
          .connect(traderWallet)
          .createTrade([passingTrigger], [executableAction], properContraints, { value: DEFAULT_REWARD })
      ).to.emit(tradeManager, "Created");
    });
  });

  describe.skip("Cancelling a Trade", () => {
    it("Should revert if non-owner tries to cancel your trade", async function () {});
    it("Should succeed if manager wants to cancel trade", async function () {});
    it("Should revert if trying to cancel non-existing trade", async function () {});
    it("Should revert if manager tries to cancel same trade twice", async function () {});
  });

  describe.skip("Subscriber depositing", () => {
    it("Should revert if subscriber deposits wrong asset", async function () {});
    it("Should revert if subscriber deposits too much at once", async function () {});
    it("Should revert if subscriber deposits too little at once", async function () {});
    it("Should revert if deposits take it beyond maxCollateral", async function () {});
    it("Should succeed in depositing ETH properly", async function () {});
    it("Should succeed in depositing ERC20 properly", async function () {});
    it("Should succeed if same acccount subscribes multiple times", async function () {});
    it("Should allow multiple subscriptions from multiple people", async function () {});
    it("Should activate rule if minCollateral for trade is reached", async function () {});
  });

  describe.skip("Subscriber withdrawing", () => {
    it("Should revert if non-subscriber is trying to withdraw collateral", async function () {});
    it("Should revert if subscriber tries to withdraw second time", async function () {});
    it("Should succeed if subscriber tries to withdraw if rule is inactive", async function () {});
    it("Should succeed id subscriber tries to withdtaw if rule is active", async function () {});
    it("Should deactivate rule if withdrawal takes it below minCollateral", async function () {});
    it("Should succeed in giving back output after trade is completed", async function () {});
  });
});
