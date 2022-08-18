import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployments } from "hardhat";
import { setupTradeManager } from "./Fixtures";

describe.skip("TradeManager", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployTradeManagerFixture() {
    await deployments.fixture(); 
    return setupTradeManager(); 
  }

  describe("Deployment", () => {
    it("Should set the right owner", async function () {
      const { tradeManager, ownerWallet } = await loadFixture(deployTradeManagerFixture);
      expect(await tradeManager.owner()).to.equal(ownerWallet.address);
    });
  });

  describe.skip("Admin functions", () => {
    it("Owner should be able to X", async function () {});
    it("Others should not be able to X", async function () {});
  });


  describe.skip("Anyone can open a trade", () =>  {
    it("Bad constraints.*TotalCollateral should revert", async function () {});
    it("Bad constraints.*CollateralPerSub should revert", async function () {});
    it("Should emit the Created event properly", async function () {});
    it("Should set the right manager for the trade", async function () {});
    it("Trader can't open duplicate trade in the same block", async function () {}); 
    it("Trader can open duplicate trade in different block", async function () {}); 
  }); 

    describe.skip("Cancelling a Trade", () =>  {
    it("Someone else can't cancel your trade", async function () {});
    it("Manager can cancel trade, emits Cancelled", async function () {});
    it("Trying to cancel a non-existing trade", async function () {});
    it("Manager can't cancel same trade twice", async function () {});
  }); 

  describe.skip("Subscriber depositing", () =>  {
    it("Depositing wrong asset", async function () {});
    it("Depositing too much in a single Sub", async function () {});
    it("Depositing too little in a single Sub", async function () {});
    it("Depositing beyond maxCollateral", async function () {});
    it("Depositing ETH properly, should emit Deposit", async function () {});
    it("Depositing ERC20 properly, should emit Deposit", async function () {});
    it("Multiple subscriptions from same person allowed", async function () {});
    it("Multiple subscriptions from different people allowed", async function () {});
    it("Hitting minCollateral activates rule", async function () {});
  }); 

  describe.skip("Subscriber withdrawing", () =>  {
    it("Withdraw someone else's asset should fail", async function () {});
    it("Withdraw twice should fail", async function () {});
    it("Withdraw before rule is active should give back collateral, should emit withdraw", async function () {});
    it("Withdraw after rule is active should give back collateral", async function () {});
    it("Withdraw after rule is active and totalCollateral falls below min should rule.deactivate", async function () {});
    it("Withdraw after rule is active and totalCollateral falls below min should rule.deactivate", async function () {});
    it("Withdraw after rule.executed should give back output", async function () {});  
  }); 

  // describe.skip("Anyone can open a trade", () =>  {
  //   it("", async function () {});
  //   it("", async function () {});
  // }); 
});
