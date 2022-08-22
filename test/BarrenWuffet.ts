import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { BigNumber, constants, utils } from "ethers";
import {
  setupBarrenWuffet,
  makePassingTrigger,
  makeFailingTrigger,
  makeSwapAction,
  createRule,
  expectEthersObjDeepEqual,
} from "./Fixtures";
import { SubscriptionConstraintsStruct } from "../typechain-types/contracts/funds/BarrenWuffet";
import { BAD_FUND_HASH, FUND_STATUS } from "./Constants";
import { getHashFromEvent } from "./helper";
import { isBytes } from "ethers/lib/utils";

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

describe("BarrenWuffet", () => {
  async function deployBarrenWuffetFixture() {
    await deployments.fixture();
    return await setupBarrenWuffet();
  }

  describe("Deployment", () => {
    it("Should set the right owner", async function () {
      const { barrenWuffet, ownerWallet } = await loadFixture(deployBarrenWuffetFixture);

      expect(await barrenWuffet.owner()).to.equal(ownerWallet.address);
    });
  });

  describe("Fund Status: Uninitialized", () => {
    it("should allow anyone to create a fund and emit Created event with the fund hash", async () => {
      const { barrenWuffet, marlieChungerWallet } = await loadFixture(deployBarrenWuffetFixture);
      const validConstraints = await makeSubConstraints();
      await expect(barrenWuffet.connect(marlieChungerWallet).createFund("Fund1", validConstraints))
        .to.emit(barrenWuffet, "Created")
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
      const { barrenWuffet, marlieChungerWallet } = await loadFixture(deployBarrenWuffetFixture);
      const validConstraints = await makeSubConstraints();
      await barrenWuffet.connect(marlieChungerWallet).createFund("Fund1", validConstraints);
      await expect(barrenWuffet.connect(marlieChungerWallet).createFund("Fund1", validConstraints)).to.be.revertedWith(
        "Fund already exists!"
      );
    });

    it("should allow the same user to create 2 funds with different names", async () => {
      const { barrenWuffet, marlieChungerWallet } = await loadFixture(deployBarrenWuffetFixture);
      const validConstraints = await makeSubConstraints();
      await barrenWuffet.connect(marlieChungerWallet).createFund("Jerkshire", validConstraints);
      await expect(barrenWuffet.connect(marlieChungerWallet).createFund("Clerkshire", validConstraints))
        .to.emit(barrenWuffet, "Created")
        .withArgs(anyValue);
    });

    it("should allow 2 different users to create funds with the same name", async () => {
      const { barrenWuffet, marlieChungerWallet, fairyLinkWallet } = await loadFixture(deployBarrenWuffetFixture);
      const validConstraints = await makeSubConstraints();
      await barrenWuffet.connect(marlieChungerWallet).createFund("Jerkshire", validConstraints);
      await expect(barrenWuffet.connect(marlieChungerWallet).createFund("Jerkshire", validConstraints))
        .to.emit(barrenWuffet, "Created")
        .withArgs(anyValue);
    });
  });

  describe("Input and Output Token Settings", () => {
    it("Should return eth as the input token for any fund", async () => {
      // we only support ETH as the input token for now.
      // As this functionality is extended, this test needs to expand
      const { barrenWuffet, marlieChungerWallet } = await loadFixture(deployBarrenWuffetFixture);
      const validConstraints = await makeSubConstraints();
      let fundHash;
      await expect(barrenWuffet.connect(marlieChungerWallet).createFund("Jerkshire", validConstraints))
        .to.emit(barrenWuffet, "Created")
        .withArgs((hash: string) => {
          fundHash = hash;
          return true;
        });
      await expect(barrenWuffet.connect(marlieChungerWallet).getInputToken(BAD_FUND_HASH)).to.be.revertedWithoutReason();

      expect(await barrenWuffet.connect(marlieChungerWallet).getInputToken(fundHash)).to.be.equal(constants.AddressZero);
    });

    it("Should revert on getOutputToken", async () => {
      // This functionality can potentially support converting all tokens into a single token
      // before it's returned to the user.
      // This is as yet unimplemented, so the function should revert.

      const { barrenWuffet, marlieChungerWallet } = await loadFixture(deployBarrenWuffetFixture);
      const validConstraints = await makeSubConstraints();
      let fundHash;
      await expect(barrenWuffet.connect(marlieChungerWallet).createFund("Jerkshire", validConstraints))
        .to.emit(barrenWuffet, "Created")
        .withArgs((hash: string) => {
          fundHash = hash;
          return true;
        });

      await expect(barrenWuffet.connect(marlieChungerWallet).getOutputToken(fundHash)).to.be.revertedWith(
        "Undefined: Funds may have multiple output tokens, determined only after it's closed."
      );
    });
  });

  async function deployFundsFixture() {
    const { barrenWuffet, marlieChungerWallet, fairyLinkWallet, botWallet, testToken1, fundSubscriberWallet, fundSubscriber2Wallet } = await loadFixture(deployBarrenWuffetFixture);
    const validConstraints = await makeSubConstraints();

    // marlie chunger managers jerkshire
    const chungerToContract = barrenWuffet.connect(marlieChungerWallet);
    const jerkshireHash = await getHashFromEvent(chungerToContract.createFund("Jerkshire Castaway", validConstraints), "Created", barrenWuffet.address, "fundHash");

    // fairy link manages crackblock
    const fairyToContract = barrenWuffet.connect(fairyLinkWallet);
    const crackBlockHash = await getHashFromEvent(fairyToContract.createFund("CrackBlock", validConstraints), "Created", barrenWuffet.address, "fundHash");

    return {
      barrenWuffet, marlieChungerWallet, fairyLinkWallet, jerkshireHash, crackBlockHash, chungerToContract, fairyToContract, botWallet,
      testToken1, fundSubscriberWallet, fundSubscriber2Wallet
    };
  }
  describe("xx Fund Status: Raising", () => {
    it("Should allow anyone to deposit native token into a raising fund and emit a Deposit event", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet } = await loadFixture(deployFundsFixture);
      const depositAmt = utils.parseEther("11");
      await expect(barrenWuffet.connect(fundSubscriberWallet).deposit(
        jerkshireHash, constants.AddressZero, depositAmt,
        { value: depositAmt })).to.emit(barrenWuffet, "Deposit").withArgs(
          jerkshireHash, 0, constants.AddressZero, depositAmt
        );
    });

    it("Should allow the fund manager to deposit native token into their own fund", async () => {
      const { barrenWuffet, jerkshireHash, chungerToContract } = await loadFixture(deployFundsFixture);
      const depositAmt = utils.parseEther("11");
      await expect(chungerToContract.deposit(
        jerkshireHash, constants.AddressZero, depositAmt,
        { value: depositAmt })).to.emit(barrenWuffet, "Deposit").withArgs(
          jerkshireHash, 0, constants.AddressZero, depositAmt
        );
    });

    it("Should not allow anyone to deposit ERC20 tokens into a raising fund. We only allow native right now", async () => {
      const { barrenWuffet, fundSubscriberWallet, jerkshireHash, testToken1 } = await loadFixture(deployFundsFixture);
      await expect(barrenWuffet.connect(fundSubscriberWallet).deposit(jerkshireHash, testToken1.address, utils.parseEther("11"))).to.be.revertedWithoutReason();
    });

    it("should return fund status as RAISING once the fund is created, deadline has NOT been hit and amount raised is LESS than min amount", async () => {
      const { barrenWuffet, chungerToContract, fairyToContract, jerkshireHash, crackBlockHash, botWallet } = await loadFixture(deployFundsFixture);

      expect(await barrenWuffet.connect(botWallet).getStatus(crackBlockHash)).to.be.equal(FUND_STATUS.RAISING);
      // barren is depositing into their own fund
      const depositAmt = utils.parseEther("11");
      await chungerToContract.deposit(jerkshireHash, ethers.constants.AddressZero, depositAmt, { value: depositAmt });
      await fairyToContract.deposit(jerkshireHash, ethers.constants.AddressZero, depositAmt, { value: depositAmt });

      expect(await barrenWuffet.connect(botWallet).getStatus(crackBlockHash)).to.be.equal(FUND_STATUS.RAISING);

    });

    it("Should not allow anyone to deposit less than min subscriber threshold into the fund", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet } = await loadFixture(deployFundsFixture);
      const depositAmt = utils.parseEther("9.99");
      await expect(barrenWuffet.connect(fundSubscriberWallet).deposit(
        jerkshireHash, constants.AddressZero, depositAmt,
        { value: depositAmt })).to.be.revertedWith("Insufficient Collateral for Subscription");
    });

    it("Should not allow anyone to deposit more than max subscriber threshold into the fund", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet } = await loadFixture(deployFundsFixture);
      const depositAmt = utils.parseEther("100.01");
      await expect(barrenWuffet.connect(fundSubscriberWallet).deposit(
        jerkshireHash, constants.AddressZero, depositAmt,
        { value: depositAmt })).to.be.revertedWith("Max Collateral for Subscription exceeded");

    });

    it("Should revert if deposit is attempted on a fund where collateral limit is reached", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet } = await loadFixture(deployFundsFixture);
      // true should succeed, false should error
      const deposits = [
        [utils.parseEther("100"), true, 0],
        [utils.parseEther("100"), true, 1],
        [utils.parseEther("100"), true, 2],
        [utils.parseEther("100"), true, 3],
        [utils.parseEther("89"), true, 4],
        [utils.parseEther("12"), false, "Max Collateral for Fund exceeded"],
        [utils.parseEther("11"), true, 5],
        [utils.parseEther("10"), false, "Fund is not raising"]];

      for (const deposit of deposits) {
        const [amt, shouldSucceed, idOrError] = deposit;
        const tx = barrenWuffet.connect(fundSubscriberWallet).deposit(
          jerkshireHash, constants.AddressZero, amt,
          { value: amt });
        if (shouldSucceed) {
          await expect(tx).to.emit(barrenWuffet, "Deposit").withArgs(
            jerkshireHash, idOrError, constants.AddressZero, amt
          )
        } else {
          await expect(tx).to.be.revertedWith(idOrError.toString());
        }
      }
    });

    it("should allow withdrawing from a fund that's still raising", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet, fundSubscriber2Wallet } = await loadFixture(deployFundsFixture);
      const depositAmt = utils.parseEther("11");
      await barrenWuffet.connect(fundSubscriberWallet).deposit(
        jerkshireHash, constants.AddressZero, depositAmt,
        { value: depositAmt });
      const subscriptionId = 0; // how do i get this?
      expect(await barrenWuffet.connect(fundSubscriberWallet).withdraw(
        jerkshireHash, subscriptionId)).to.emit(
          barrenWuffet, "Withdraw"
        ).withArgs(jerkshireHash, subscriptionId, constants.AddressZero, depositAmt);

    });

    it("should not allow withdrawing if there have not been any deposits from this user", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet, fundSubscriber2Wallet } = await loadFixture(deployFundsFixture);
      const depositAmt = utils.parseEther("11");
      await barrenWuffet.connect(fundSubscriberWallet).deposit(
        jerkshireHash, constants.AddressZero, depositAmt,
        { value: depositAmt });
      await expect(barrenWuffet.connect(fundSubscriber2Wallet).withdraw(
        jerkshireHash, 0)).to.be.rejectedWith("You're not the subscriber!");
    });

    it("should allow only the fund manager to close a Raising fund", async () => {
      const { barrenWuffet, jerkshireHash, crackBlockHash, chungerToContract, fairyToContract, fundSubscriberWallet } = await loadFixture(deployFundsFixture);
      const depositAmt = utils.parseEther("11");
      // add some funds so we can confirm that even a fund with funds can be closed
      // TODO what happens to the funds here?
      await barrenWuffet.connect(fundSubscriberWallet).deposit(
        jerkshireHash, constants.AddressZero, depositAmt,
        { value: depositAmt });
      expect(await fairyToContract.closeFund(jerkshireHash)).to.be.revertedWithoutReason();
      expect(await chungerToContract.closeFund(jerkshireHash)).to.emit(barrenWuffet, "Closed").withArgs(jerkshireHash);

      // this is a clean fund
      expect(await chungerToContract.closeFund(crackBlockHash)).to.be.revertedWithoutReason();
      expect(await fairyToContract.closeFund(crackBlockHash)).to.emit(barrenWuffet, "Closed").withArgs(crackBlockHash);
    });

    it.skip("should revert if rewards withdrawal is attempted on a raising fund", async () => {

    });
  });

  describe.skip("Fund Actions on a non-existent fund", async () => {
    // we are creating this function here and not earlier because we want to have a fund with deposits, and ensure these actions on a different fund dont interfere with the funds on the existing fund.
    it("should revert if opening / closing positions in a non-existent fund", async () => { });

    it("should revert if performing actions on a non-existent fund", async () => { });

    it("should revert if withdrawing rewards from  a non-existent fund", async () => { });

    it("should revert if depositing / withdrawing from  a non-existent fund", async () => { });

    it("should revert on attempting to get status on a non-existent fund", async () => { });

    it("should revert if an unknown fund or closed fund is closed", () => { });
  });

  describe.skip("Fund Status: Deployed", () => {
    it("should return fund status as DEPLOYED once the fund is created, deadline has been hit (min collateral may or maynot be met)", async () => {
      // Min collateral is not playing the role it is supposed to. This behaviour will likely be changed.
    });

    it("should return fund status as DEPLOYED if max collateral has been raised (deadline may or may not be met)", async () => { });

    it("should revert if deposit / withdrawal is attempted on a deployed fund", async () => { });

    it("should revert if rewards withdrawal is attempted on a deployed fund", async () => { });

    describe.skip("Open and close positions", () => {
      it("Should not allow anyone other than the fund manager to open and  close positons", async () => { });

      it("should revert if a position is opened on an unknown trade hash", async () => { });

      it("should transfer assets to trade manager when opening a positon", async () => { });

      it("should revert if attempting to close an already closed position", async () => { });
    });

    describe.skip("Take Action", () => {
      it("Should not allow anyone other than the fund manager to take action", async () => { });

      it("should call 'perform' on the action when fund manager calls takeAction", async () => {
        // ideally we use IAction to create a mock action, and then check if perform is called on the mock action.
      });
    });
  });

  describe.skip("Fund status: Closable", () => {
    it("should return fund status as CLOSABLE once the lockin period has exceeded", async () => { });

    // this is when the fund can be closed, and hence wont accept any trades but it hasnt been closed yet.
    // A fund manager can close such a fund, or it will be auto-closed on withdraw
    // All other restrictions apply the same to closable and closed funds (so it makes sense to reuse the tests.)
    it("should revert if withdrawal is attempted on a closable fund", async () => { });

    it("should revert if rewards withdrawal is attempted on a closable fund", async () => { });
  });

  describe.skip("Fund transition: Close Fund", () => {
    it("should allow the fund manager to close a deployed fund (all open positions) and emit a Closed event if the fund is closable", async () => { });

    it("should allow the fund manager to close a deployed fund with open positions that is NOT closable and emit Closed event", async () => { });

    it("should not allow anyone other than the fund manager to close a closable fund", async () => {
      // this might be made public in the future
    });
  });

  describe.skip("Fund Status: Closed", () => {
    it("should return fund status as CLOSED once the fund has been closed", async () => { });

    it("Should revert if deposit is attempted on a closable / closed fund", async () => { });

    it("should revert if opening positions in a closable / closed fund", async () => { });

    it("should allow withdrawing multiple tokens from a closed fund", async () => {
      // this might change. We plan to auto-convert all tokens to input token so that profit can be calculated accurately.
    });
  });

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
