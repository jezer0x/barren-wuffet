import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { BigNumber, constants, utils } from "ethers";
import {
  setupFundManager,
  makePassingTrigger,
  makeFailingTrigger,
  makeSwapAction,
  createRule,
  expectEthersObjDeepEqual,
} from "./Fixtures";
import { SubscriptionConstraintsStruct } from "../typechain-types/contracts/funds/FundManager";
import { BAD_FUND_HASH, FUND_STATUS } from "./Constants";
import { getHashFromEvent } from "./helper";

/** 
 * These tests are organized by
 * 1. Contract Deployment, settings 
 * 2. Fund actions by status and transitions (FUND CREATION -> RAISING -> DEPLOYED -> <TRADING ACTIONS> -> <CLOSE> -> CLOSED). In each case we test the behaviour of all the functions
 * 3. User stories testing the overall behaviour of the entire system
 **/

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

  describe("Fund Status: Uninitialized", () => {
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

  describe("Input and Output Token Settings", () => {
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

  async function deployFundsFixture() {
    const { fundManager, fundCreatorWallet, fundCreator2Wallet, botWallet } = await loadFixture(deployFundManagerFixture);
    const validConstraints = await makeSubConstraints();

    // barren wuffet managers jerkshire
    const barrenToContract = fundManager.connect(fundCreatorWallet);
    const jerkshireHash = await getHashFromEvent(barrenToContract.createFund("Jerkshire Castaway", validConstraints), "Created", fundManager.address, "fundHash");

    // fairy link manages crackblock
    const fairyToContract = fundManager.connect(fundCreator2Wallet);
    const crackBlockHash = await getHashFromEvent(fairyToContract.createFund("CrackBlock", validConstraints), "Created", fundManager.address, "fundHash");

    return {
      fundManager, fundCreatorWallet, fundCreator2Wallet, jerkshireHash, crackBlockHash, barrenToContract, fairyToContract, botWallet
    };
  }
  describe.skip("Fund Status: Raising", () => {
    it("should return fund status as RAISING once the fund is created, deadline has NOT been hit and amount raised is LESS than min amount", async () => {
      const { fundManager, barrenToContract, fairyToContract, jerkshireHash, crackBlockHash, botWallet } = await loadFixture(deployFundsFixture);

      (await fundManager.connect(botWallet).getStatus(crackBlockHash)).is.equal(FUND_STATUS.RAISING);
      // barren is depositing into their own fund
      barrenToContract.deposit(jerkshireHash, ethers.constants.AddressZero, utils.parseEther("11"));
      fairyToContract.deposit(jerkshireHash, ethers.constants.AddressZero, utils.parseEther("188"));

      (await fundManager.connect(botWallet).getStatus(crackBlockHash)).is.equal(FUND_STATUS.RAISING);

    });

    it("Should allow anyone to deposit collateral token into a raising fund and emit a Deposit event", async () => { });

    it("Should revert if deposit is attempted on a fund where collateral limit is reached", async () => { });

    it("Should allow the fund manager to deposit into their own fund", async () => { });

    it("should allow withdrawing from a fund that's still raising", async () => {

    });

    it("should not allow withdrawing if there have not been any deposits from this user", async () => {

    });

    it("should allow only the fund manager to close a Raising fund", async () => {

    });

    it("should revert if rewards withdrawal is attempted on a raising fund", async () => {

    });

  });

  describe.skip("Fund Actions on a non-existent fund", async () => {
    // we are creating this function here and not earlier because we want to have a fund with deposits, and ensure these actions on a different fund dont interfere with the funds on the existing fund.
    it("should revert if opening / closing positions in a non-existent fund", async () => {

    });

    it("should revert if performing actions on a non-existent fund", async () => {

    });

    it("should revert if withdrawing rewards from  a non-existent fund", async () => {

    });

    it("should revert if depositing / withdrawing from  a non-existent fund", async () => {

    });

    it("should revert on attempting to get status on a non-existent fund", async () => {
    });

    it("should revert if an unknown fund or closed fund is closed", () => {

    });

  })

  describe.skip("Fund Status: Deployed", () => {
    it("should return fund status as DEPLOYED once the fund is created, deadline has been hit (min collateral may or maynot be met)", async () => {
      // Min collateral is not playing the role it is supposed to. This behaviour will likely be changed.
    });

    it("should return fund status as DEPLOYED if max collateral has been raised (deadline may or may not be met)", async () => {

    });

    it("should revert if deposit / withdrawal is attempted on a deployed fund", async () => {

    });

    it("should revert if rewards withdrawal is attempted on a deployed fund", async () => {

    });


    describe.skip("Open and close positions", () => {

      it("Should not allow anyone other than the fund manager to open and  close positons", async () => {

      });

      it("should revert if a position is opened on an unknown trade hash", async () => { });

      it("should transfer assets to trade manager when opening a positon", async () => {

      });

      it("should revert if attempting to close an already closed position", async () => { });

    });

    describe.skip("Take Action", () => {
      it("Should not allow anyone other than the fund manager to take action", async () => {

      });

      it("should call 'perform' on the action when fund manager calls takeAction", async () => {
        // ideally we use IAction to create a mock action, and then check if perform is called on the mock action.

      })
    });
  });

  describe.skip("Fund status: Closable", () => {
    it("should return fund status as CLOSABLE once the lockin period has exceeded", async () => {

    });

    // this is when the fund can be closed, and hence wont accept any trades but it hasnt been closed yet.
    // A fund manager can close such a fund, or it will be auto-closed on withdraw
    // All other restrictions apply the same to closable and closed funds (so it makes sense to reuse the tests.)        
    it("should revert if withdrawal is attempted on a closable fund", async () => {

    });

    it("should revert if rewards withdrawal is attempted on a closable fund", async () => {

    });

  });

  describe.skip("Fund transition: Close Fund", () => {
    it("should allow the fund manager to close a deployed fund (all open positions) and emit a Closed event if the fund is closable", async () => { });

    it("should allow the fund manager to close a deployed fund with open positions that is NOT closable and emit Closed event", async () => { });

    it("should not allow anyone other than the fund manager to close a closable fund", async () => {
      // this might be made public in the future
    });

  });

  describe.skip("Fund Status: Closed", () => {
    it("should return fund status as CLOSED once the fund has been closed", async () => {

    });

    it("Should revert if deposit is attempted on a closable / closed fund", async () => { });

    it("should revert if opening positions in a closable / closed fund", async () => {

    });

    it("should allow withdrawing multiple tokens from a closed fund", async () => {
      // this might change. We plan to auto-convert all tokens to input token so that profit can be calculated accurately.

    });

  })


  describe.skip("Rewards", () => {
    it("should return the correct value of reward to each fund manager, when multiple fund managers have pending rewards", async () => { });

    it("should not allow access to rewards from a fund that the manager doesnt own", async () => { });

    it("should not allow multiple withdrawals of the reward", async () => { });
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
