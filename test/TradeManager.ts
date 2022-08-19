import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Bytes } from "ethers";
import { deployments, ethers, network } from "hardhat";
import { SubscriptionConstraintsStruct, TradeStructOutput } from "../typechain-types/contracts/trades/TradeManager";
import { BAD_RULE_HASH, DEFAULT_REWARD, ERC20_DECIMALS } from "./Constants";
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
      ownerWallet,
      priceTrigger,
      swapUniSingleAction,
      testToken1,
      testToken2,
      tradeManager,
      traderWallet,
      someOtherWallet,
      tradeSubscriberWallet,
      ruleExecutor,
    } = await deployTradeManagerFixture();
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
      ownerWallet,
      testToken1,
      testToken2,
      tradeManager,
      traderWallet,
      someOtherWallet,
      tradeSubscriberWallet,
      tradeHash,
      ruleExecutor,
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

  describe("Opening a Trade", () => {
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

    // TODO: maybe should if the entire trade/rule chain was proper?
    it("Should set the right manager for the trade", async function () {
      const { tradeHash, tradeManager, traderWallet } = await loadFixture(deployValidTradeFixture);
      const trade: TradeStructOutput = await tradeManager.getTrade(tradeHash);
      expect(trade.manager).to.equal(traderWallet.address);
    });
  });

  describe("Cancelling a Trade", () => {
    it("Should revert if non-owner tries to cancel your trade", async function () {
      const { tradeHash, tradeManager, someOtherWallet } = await loadFixture(deployValidTradeFixture);
      const trade: TradeStructOutput = await tradeManager.getTrade(tradeHash);
      await expect(tradeManager.connect(someOtherWallet).cancelTrade(tradeHash)).to.be.revertedWith("onlyManager");
    });
    it("Should succeed if manager wants to cancel trade", async function () {
      const { tradeHash, tradeManager, traderWallet } = await loadFixture(deployValidTradeFixture);
      await expect(tradeManager.connect(traderWallet).cancelTrade(tradeHash))
        .to.emit(tradeManager, "Cancelled")
        .withArgs(tradeHash);
    });
    it("Should revert if trying to cancel non-existing trade", async function () {
      const { tradeHash, tradeManager, traderWallet } = await loadFixture(deployValidTradeFixture);
      await expect(tradeManager.connect(traderWallet).cancelTrade(BAD_RULE_HASH)).to.be.reverted;
    });
    it("Should revert if manager tries to cancel same trade twice", async function () {
      const { tradeHash, tradeManager, traderWallet } = await loadFixture(deployValidTradeFixture);
      await expect(tradeManager.connect(traderWallet).cancelTrade(tradeHash))
        .to.emit(tradeManager, "Cancelled")
        .withArgs(tradeHash);

      await expect(tradeManager.connect(traderWallet).cancelTrade(tradeHash)).to.be.reverted;
    });
    it.skip("Should revert if manager tries to cancel a trade that is completed", async function () {});
  });

  describe("Subscriber depositing", () => {
    it("Should revert if subscriber deposits wrong asset", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken2 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(15).mul(ERC20_DECIMALS);
      await testToken2.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken2.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);
      await expect(
        tradeManager.connect(tradeSubscriberWallet).deposit(tradeHash, testToken2.address, collateralAmount)
      ).to.be.revertedWith("Wrong Collateral Type");
    });

    it("Should revert if subscriber deposits too little / much at once", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(600).mul(ERC20_DECIMALS);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);

      await expect(
        tradeManager
          .connect(tradeSubscriberWallet)
          .deposit(tradeHash, testToken1.address, BigNumber.from(150).mul(ERC20_DECIMALS))
      ).to.be.revertedWith("Max Collateral for Subscription exceeded");

      await expect(
        tradeManager
          .connect(tradeSubscriberWallet)
          .deposit(tradeHash, testToken1.address, BigNumber.from(5).mul(ERC20_DECIMALS))
      ).to.be.revertedWith("Insufficient Collateral for Subscription");
    });

    it("Should succeed in depositing ERC20 properly", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(100).mul(ERC20_DECIMALS);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);

      await expect(tradeManager.connect(tradeSubscriberWallet).deposit(tradeHash, testToken1.address, collateralAmount))
        .to.emit(tradeManager, "Deposit")
        .withArgs(tradeHash, 0, testToken1.address, collateralAmount);
    });

    it("Should succeed if same acccount subscribes multiple times", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(600).mul(ERC20_DECIMALS);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);

      for (var i = 0; i < 5; i++) {
        await tradeManager
          .connect(tradeSubscriberWallet)
          .deposit(tradeHash, testToken1.address, BigNumber.from(100).mul(ERC20_DECIMALS));
      }
      expect((await tradeManager.getTrade(tradeHash)).subscriptions.length).to.equal(5);
    });

    it("Should activate rule if minCollateral for trade is reached", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken1, ruleExecutor } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(600).mul(ERC20_DECIMALS);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);

      const trade: TradeStructOutput = await tradeManager.getTrade(tradeHash);

      await tradeManager
        .connect(tradeSubscriberWallet)
        .deposit(tradeHash, testToken1.address, BigNumber.from(100).mul(ERC20_DECIMALS));
      await expect(
        tradeManager
          .connect(tradeSubscriberWallet)
          .deposit(tradeHash, testToken1.address, BigNumber.from(100).mul(ERC20_DECIMALS))
      )
        .to.emit(ruleExecutor, "Activated")
        .withArgs(trade.ruleHash);
    });

    it("Should allow multiple subscriptions from multiple people", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(100).mul(ERC20_DECIMALS);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);
      await testToken1.connect(ownerWallet).approve(tradeManager.address, collateralAmount);

      await expect(tradeManager.connect(tradeSubscriberWallet).deposit(tradeHash, testToken1.address, collateralAmount))
        .to.emit(tradeManager, "Deposit")
        .withArgs(tradeHash, 0, testToken1.address, collateralAmount);

      await expect(tradeManager.connect(ownerWallet).deposit(tradeHash, testToken1.address, collateralAmount))
        .to.emit(tradeManager, "Deposit")
        .withArgs(tradeHash, 1, testToken1.address, collateralAmount);
    });

    it("Should revert if deposits take it beyond maxCollateral", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken1 } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(600).mul(ERC20_DECIMALS);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);

      for (var i = 0; i < 5; i++) {
        await tradeManager
          .connect(tradeSubscriberWallet)
          .deposit(tradeHash, testToken1.address, BigNumber.from(100).mul(ERC20_DECIMALS));
      }

      await expect(
        tradeManager
          .connect(tradeSubscriberWallet)
          .deposit(tradeHash, testToken1.address, BigNumber.from(10).mul(ERC20_DECIMALS))
      ).to.be.revertedWith("Max Collateral for Trade exceeded");
    });

    it.skip("Should succeed in depositing ETH properly", async function () {});
  });

  describe("Subscriber withdrawing", () => {
    it("Should revert if non-subscriber is trying to withdraw collateral", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken1, ruleExecutor } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(600).mul(ERC20_DECIMALS);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);

      await tradeManager
        .connect(tradeSubscriberWallet)
        .deposit(tradeHash, testToken1.address, BigNumber.from(100).mul(ERC20_DECIMALS));

      await expect(tradeManager.connect(ownerWallet).withdraw(tradeHash, 0)).to.be.revertedWith(
        "You're not the subscriber!"
      );
    });

    it.skip("Should revert if subscriber tries to withdraw second time", async function () {});
    it.skip("Should succeed if subscriber tries to withdraw if rule is active (ERC20)", async function () {});

    it("Should succeed if subscriber tries to withdraw if rule is inactive (ERC20)", async function () {
      const { ownerWallet, tradeHash, tradeManager, traderWallet, tradeSubscriberWallet, testToken1, ruleExecutor } =
        await loadFixture(deployValidTradeFixture);
      const collateralAmount = BigNumber.from(100).mul(ERC20_DECIMALS);
      await testToken1.connect(ownerWallet).transfer(tradeSubscriberWallet.address, collateralAmount);
      await testToken1.connect(tradeSubscriberWallet).approve(tradeManager.address, collateralAmount);
      await tradeManager.connect(tradeSubscriberWallet).deposit(tradeHash, testToken1.address, collateralAmount);

      await expect(tradeManager.connect(tradeSubscriberWallet).withdraw(tradeHash, 0))
        .to.emit(tradeManager, "Withdraw")
        .withArgs(tradeHash, 0, testToken1.address, collateralAmount);
    });

    it.skip("Should deactivate rule if withdrawal takes it below minCollateral", async function () {});
    it.skip("Should succeed in giving back output after trade is completed", async function () {});
  });
});
