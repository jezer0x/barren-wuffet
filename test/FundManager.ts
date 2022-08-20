import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { BigNumber, constants } from "ethers";
import {
  setupFundManager,
  makePassingTrigger,
  makeFailingTrigger,
  makeSwapAction,
  createRule,
  expectEthersObjDeepEqual,
} from "./Fixtures";
import { SubscriptionConstraintsStruct } from "../typechain-types/contracts/funds/FundManager";
import { BAD_FUND_HASH } from "./Constants";

const ETH_PRICE_IN_USD = 1300 * 10 ** 8;
const TST1_PRICE_IN_USD = 3 * 10 ** 8;
const ERC20_DECIMALS = BigNumber.from(10).pow(18);

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

  describe("Create fund", () => {
    it("should allow anyone to create a fund and emit Created event with the fund hash", async () => {
      const { fundManager, fundCreatorWallet } = await loadFixture(deployFundManagerFixture);
      const validConstraints = await makeSubConstraints();
      await expect(fundManager.connect(fundCreatorWallet).createFund("Fund1", validConstraints))
        .to.emit(fundManager, "Created")
        .withArgs(anyValue);
    });

    it.skip("Should revert if a fund is created with inconsistent subscription constraints", async () => {
      // We will test Utils separately. We want to check here if Utils was called
      /**
        const contractFactory = await this.env.ethers.getContractFactory("Example", {
          libraries: {
            ExampleLib: "0x...",
          },
        });
       */
    });

    it("should revert if the same user creates 2 funds with the same name", async () => {
      const { fundManager, fundCreatorWallet } = await loadFixture(deployFundManagerFixture);
      const validConstraints = await makeSubConstraints();
      await fundManager.connect(fundCreatorWallet).createFund("Fund1", validConstraints);
      await expect(fundManager.connect(fundCreatorWallet).createFund("Fund1", validConstraints)).to.be.revertedWith(
        "Fund already exists!"
      );
    });

    it("should allow the same user to create 2 funds with different names", async () => {
      const { fundManager, fundCreatorWallet } = await loadFixture(deployFundManagerFixture);
      const validConstraints = await makeSubConstraints();
      await fundManager.connect(fundCreatorWallet).createFund("Fund1", validConstraints);
      await expect(fundManager.connect(fundCreatorWallet).createFund("Fund2", validConstraints))
        .to.emit(fundManager, "Created")
        .withArgs(anyValue);
    });

    it("should allow 2 different users to create funds with the same name", async () => {
      const { fundManager, fundCreatorWallet, fundCreator2Wallet } = await loadFixture(deployFundManagerFixture);
      const validConstraints = await makeSubConstraints();
      await fundManager.connect(fundCreatorWallet).createFund("Fund1", validConstraints);
      await expect(fundManager.connect(fundCreator2Wallet).createFund("Fund1", validConstraints))
        .to.emit(fundManager, "Created")
        .withArgs(anyValue);
    });
  });

  describe("xx Input and Output Tokens", () => {
    it("Should return eth as the input token for any fund", async () => {
      // we only support ETH as the input token for now.
      // As this functionality is extended, this test needs to expand
      const { fundManager, fundCreatorWallet } = await loadFixture(deployFundManagerFixture);
      const validConstraints = await makeSubConstraints();
      let fundHash;
      await expect(fundManager.connect(fundCreatorWallet).createFund("Fund1", validConstraints))
        .to.emit(fundManager, "Created")
        .withArgs((hash: string) => {
          fundHash = hash;
          return true;
        });
      await expect(fundManager.connect(fundCreatorWallet).getInputToken(BAD_FUND_HASH)).to.be.revertedWithoutReason();

      expect(await fundManager.connect(fundCreatorWallet).getInputToken(fundHash)).to.be.equal(constants.AddressZero);
    });

    it("Should revert on getOutputToken", async () => {
      // This functionality can potentially support converting all tokens into a single token
      // before it's returned to the user.
      // This is as yet unimplemented, so the function should revert.

      const { fundManager, fundCreatorWallet } = await loadFixture(deployFundManagerFixture);
      const validConstraints = await makeSubConstraints();
      let fundHash;
      await expect(fundManager.connect(fundCreatorWallet).createFund("Fund1", validConstraints))
        .to.emit(fundManager, "Created")
        .withArgs((hash: string) => {
          fundHash = hash;
          return true;
        });

      await expect(fundManager.connect(fundCreatorWallet).getOutputToken(fundHash)).to.be.revertedWith(
        "Undefined: Funds may have multiple output tokens, determined only after it's closed."
      );
    });
  });

  describe.skip("Open and close positions", () => {});

  describe.skip("Deposit", () => {});

  describe.skip("Withdraw", () => {});

  describe.skip("Take Action", () => {});

  describe.skip("Status changes", () => {});

  describe.skip("Close fund", () => {
    it("should revert if an unknown fund or closed fund is closed", () => {});

    it("should close all open positions and emit a closed event if the fund is closed", () => {});
  });

  describe.skip("Rewards", () => {
    it("should return the correct value of reward to the fund manager", async () => {});

    it("should not allow access to rewards of a different fund manager", async () => {});

    it("should not allow multiple withdrawals of the reward", async () => {});

    it("revert if withdrawal is attempted on a fund that has not been closed", async () => {});
  });

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
