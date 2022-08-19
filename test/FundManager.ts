import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { BigNumber } from "ethers";
import {
  setupFundManager,
  makePassingTrigger,
  makeFailingTrigger,
  makeSwapAction,
  createRule,
  expectEthersObjDeepEqual,
} from "./Fixtures";

const ETH_PRICE_IN_USD = 1300 * 10 ** 8;
const UNI_PRICE_IN_USD = 3 * 10 ** 8;
const ERC20_DECIMALS = BigNumber.from(10).pow(18);

describe("FundManager", () => {
  async function deployFundManagerFixture() {
    await deployments.fixture();
    return await setupFundManager();
  }

  describe("Deployment", () => {
    it("Should set the right owner", async function () {
      const { fundManager, ownerWallet } = await loadFixture(deployFundManagerFixture);

      expect(await fundManager.owner()).to.equal(ownerWallet.address);
    });
  });

  describe.skip("Create fund", () => { });

  describe.skip("Open and close positions", () => { });

  describe.skip("Deposit", () => { });

  describe.skip("Withdraw", () => { });

  describe.skip("Take Action", () => { });

  describe.skip("Status changes", () => { });

  describe.skip("User Stories", () => {
    it("allows creating a fund with profit, lockin and min size", async () => {
      /**
       * Opens call for USD$300,000 fund.
       * 30 Days to fill or 300K, whichever comes first.
       * Minimum cheque size of $30,000.
       * 2% of final fund size is profit.
       * Minimum 6 months lock, ie LPs cannot withdraw money before.
       */
    });

    it("allows fund manager to create a TWAP swap trade", async () => {
      /*
             TWAP 10ETH every 5 mins every 1 hour to USDC. If price drops below 1200USD/ eth, stop swaps. 
             If the price goes back up, continue.
             We can do this by create time delay triggers every 5 mins.
            */
    });
    it("allows fund manager to create a short twap trade", async () => {
      /**
       * Fund manager opens a short on Cap finance by depositing ETH.
       * Trigger price is 1500 USD. 120 eth worth of short.
       * Twap in 1 hr. every 5 mins, sell 10ETH if price is within -/+5% range of 1500USD
       * Stop loss at 1600USD. TWAP out eth every 30sec.
       * Buy eth at 1000USd. TWAP every 5mins, in 30mins. Price range doesnt matter.
       */
    });

    it("allows investing in dopex", () => {
      /**
       * Deposit 1000USDC into Dopex ETH short contracts
       * Buy 1 eth 1kUSD call at 10USD.
       * Collect interest rate until contract expires.*
       */
    });
  });
});
