import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { BigNumber, constants, Contract, FixedNumber, utils } from "ethers";
import { makeFailingTrigger, makePassingTrigger, setupBarrenWuffet } from "./Fixtures";
import { BAD_FUND_HASH, BAD_TRADE_HASH, ETH_ADDRESS, FUND_STATUS } from "./Constants";
import { depositMaxCollateral, getHashFromEvent } from "./helper";

/**
 * These tests are organized by
 * 1. Contract Deployment, settings
 * 2. Fund actions by status and transitions (FUND CREATION -> RAISING -> DEPLOYED -> <TRADING ACTIONS> -> <CLOSE> -> CLOSED). In each case we test the behaviour of all the functions
 * 3. User stories testing the overall behaviour of the entire system
 **/

const ETH_PRICE_IN_USD = 1300 * 10 ** 8;
const TST1_PRICE_IN_USD = 3 * 10 ** 8;
const ERC20_DECIMALS = BigNumber.from(10).pow(18);

async function makeSubConstraints() {
  const latestTime = await time.latest();
  return {
    minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
    minCollateralTotal: BigNumber.from(200).mul(ERC20_DECIMALS),
    maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
    deadline: latestTime + 86400,
    lockin: latestTime + 86400 * 10,
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

    it("should not allow 2 different users to create funds with the same name", async () => {
      const { barrenWuffet, marlieChungerWallet, fairyLinkWallet } = await loadFixture(deployBarrenWuffetFixture);
      const validConstraints = await makeSubConstraints();
      await barrenWuffet.connect(marlieChungerWallet).createFund("Jerkshire", validConstraints);
      await expect(barrenWuffet.connect(fairyLinkWallet).createFund("Jerkshire", validConstraints))
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
      await expect(
        barrenWuffet.connect(marlieChungerWallet).getInputTokens(BAD_FUND_HASH)
      ).to.be.revertedWithoutReason();

      expect(await barrenWuffet.connect(marlieChungerWallet).getInputTokens(fundHash))
        .to.have.length(1)
        .and.contain(ETH_ADDRESS);
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

      await expect(barrenWuffet.connect(marlieChungerWallet).getOutputTokens(fundHash)).to.be.revertedWith(
        "Undefined: Funds may have multiple output tokens, determined only after it's closed."
      );
    });
  });

  async function raisingFundsFixture() {
    const {
      priceTrigger,
      barrenWuffet,
      roboCop,
      marlieChungerWallet,
      fairyLinkWallet,
      botWallet,
      testToken1,
      fundSubscriberWallet,
      fundSubscriber2Wallet,
      swapETHToTST1Action,
    } = await loadFixture(deployBarrenWuffetFixture);

    const latestTime = await time.latest();
    // marlie chunger managers jerkshire
    const chungerToContract = barrenWuffet.connect(marlieChungerWallet);
    const jerkshireConstraints = {
      minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
      maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
      minCollateralTotal: BigNumber.from(200).mul(ERC20_DECIMALS),
      maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
      deadline: latestTime + 86400,
      lockin: latestTime + 86400 * 10,
      rewardPercentage: 0,
    };

    const jerkshireHash = await getHashFromEvent(
      chungerToContract.createFund("Jerkshire Castaway", jerkshireConstraints),
      "Created",
      barrenWuffet.address,
      "fundHash"
    );

    // fairy link manages crackblock
    const fairyToContract = barrenWuffet.connect(fairyLinkWallet);
    const crackBlockConstraints = {
      minCollateralPerSub: BigNumber.from(0),
      maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
      minCollateralTotal: BigNumber.from(50).mul(ERC20_DECIMALS),
      maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
      deadline: latestTime + 86400,
      lockin: latestTime + 86400 * 10,
      rewardPercentage: 10,
    };

    const crackBlockHash = await getHashFromEvent(
      fairyToContract.createFund("CrackBlock", crackBlockConstraints),
      "Created",
      barrenWuffet.address,
      "fundHash"
    );

    return {
      barrenWuffet,
      priceTrigger,
      roboCop,
      marlieChungerWallet,
      fairyLinkWallet,
      jerkshireHash,
      crackBlockHash,
      jerkshireConstraints,
      crackBlockConstraints,
      chungerToContract,
      fairyToContract,
      botWallet,
      testToken1,
      fundSubscriberWallet,
      fundSubscriber2Wallet,
      swapETHToTST1Action,
    };
  }
  describe("Fund Status: Raising", () => {
    const validDeposit = utils.parseEther("11");
    it("Should allow anyone to deposit native token into a raising fund and emit a Deposit event", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet } = await loadFixture(raisingFundsFixture);
      await expect(
        barrenWuffet
          .connect(fundSubscriberWallet)
          .deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit })
      )
        .to.emit(barrenWuffet, "Deposit")
        .withArgs(jerkshireHash, 0, ETH_ADDRESS, validDeposit);
    });

    it("Should allow the fund manager to deposit native token into their own fund", async () => {
      const { barrenWuffet, jerkshireHash, chungerToContract } = await loadFixture(raisingFundsFixture);
      await expect(chungerToContract.deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit }))
        .to.emit(barrenWuffet, "Deposit")
        .withArgs(jerkshireHash, 0, ETH_ADDRESS, validDeposit);
    });

    it("Should not allow anyone to deposit ERC20 tokens into a raising fund. We only allow native right now", async () => {
      const { barrenWuffet, fundSubscriberWallet, jerkshireHash, testToken1 } = await loadFixture(raisingFundsFixture);
      await expect(
        barrenWuffet.connect(fundSubscriberWallet).deposit(jerkshireHash, testToken1.address, utils.parseEther("11"))
      ).to.be.revertedWithoutReason();
    });

    it("should return fund status as RAISING once the fund is created, deadline has NOT been hit and amount raised is LESS than min amount", async () => {
      const { barrenWuffet, chungerToContract, fairyToContract, jerkshireHash, crackBlockHash, botWallet } =
        await loadFixture(raisingFundsFixture);

      expect(await barrenWuffet.connect(botWallet).getStatus(crackBlockHash)).to.be.equal(FUND_STATUS.RAISING);
      // barren is depositing into their own fund
      await chungerToContract.deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit });
      await fairyToContract.deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit });

      expect(await barrenWuffet.connect(botWallet).getStatus(crackBlockHash)).to.be.equal(FUND_STATUS.RAISING);
    });

    it("Should not allow anyone to deposit less than min subscriber threshold into the fund", async () => {
      const { barrenWuffet, jerkshireHash, jerkshireConstraints, fundSubscriberWallet } = await loadFixture(
        raisingFundsFixture
      );
      const depositAmt = jerkshireConstraints.minCollateralPerSub.sub(utils.parseEther("0.0001"));
      await expect(
        barrenWuffet
          .connect(fundSubscriberWallet)
          .deposit(jerkshireHash, ETH_ADDRESS, depositAmt, { value: depositAmt })
      ).to.be.revertedWith("Insufficient Collateral for Subscription");
    });

    it("Should not allow anyone to deposit more than max subscriber threshold into the fund", async () => {
      const { barrenWuffet, jerkshireHash, jerkshireConstraints, fundSubscriberWallet } = await loadFixture(
        raisingFundsFixture
      );
      const depositAmt = jerkshireConstraints.maxCollateralPerSub.add(utils.parseEther("0.0001"));
      await expect(
        barrenWuffet
          .connect(fundSubscriberWallet)
          .deposit(jerkshireHash, ETH_ADDRESS, depositAmt, { value: depositAmt })
      ).to.be.revertedWith("Max Collateral for Subscription exceeded");
    });

    it("Should allow anyone to deposit more than max subscriber threshold by splitting the deposits into multiple subscriptions", async () => {
      const { barrenWuffet, jerkshireHash, jerkshireConstraints, fundSubscriberWallet } = await loadFixture(
        raisingFundsFixture
      );
      // unclear if this is a feature or a bug, but we want to document the usecase
      // check if multiple smaller deposits, that exceed collateral limit in total, get reverted.
      const depositAmt1 = jerkshireConstraints.maxCollateralPerSub.sub(utils.parseEther("0.1"));
      await expect(
        barrenWuffet
          .connect(fundSubscriberWallet)
          .deposit(jerkshireHash, ETH_ADDRESS, depositAmt1, { value: depositAmt1 })
      )
        .to.emit(barrenWuffet, "Deposit")
        .withArgs(jerkshireHash, 0, ETH_ADDRESS, depositAmt1);

      const depositAmt2 = jerkshireConstraints.minCollateralPerSub;
      await expect(
        barrenWuffet
          .connect(fundSubscriberWallet)
          .deposit(jerkshireHash, ETH_ADDRESS, depositAmt2, { value: depositAmt2 })
      )
        .to.emit(barrenWuffet, "Deposit")
        .withArgs(jerkshireHash, 1, ETH_ADDRESS, depositAmt2);
    });

    it("Should revert if deposit is attempted on a fund where collateral limit is reached", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet } = await loadFixture(raisingFundsFixture);
      // true should succeed, false should error
      const deposits: [BigNumber, boolean, string | number][] = [
        [utils.parseEther("100"), true, 0],
        [utils.parseEther("100"), true, 1],
        [utils.parseEther("100"), true, 2],
        [utils.parseEther("100"), true, 3],
        [utils.parseEther("89"), true, 4],
        [utils.parseEther("12"), false, "Max Collateral for Fund exceeded"],
        [utils.parseEther("11"), true, 5],
        [utils.parseEther("10"), false, "Fund is not raising"],
      ];

      for (const deposit of deposits) {
        const [amt, shouldSucceed, idOrError] = deposit;
        const tx = barrenWuffet.connect(fundSubscriberWallet).deposit(jerkshireHash, ETH_ADDRESS, amt, { value: amt });
        if (shouldSucceed) {
          await expect(tx)
            .to.changeEtherBalance(fundSubscriberWallet, amt.mul(-1))
            .emit(barrenWuffet, "Deposit")
            .withArgs(jerkshireHash, idOrError, ETH_ADDRESS, amt);
        } else {
          await expect(tx).to.be.revertedWith(idOrError.toString());
        }
      }
    });

    it("should allow withdrawing from a fund that's still raising", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet } = await loadFixture(raisingFundsFixture);
      await barrenWuffet
        .connect(fundSubscriberWallet)
        .deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit });
      const subscriptionId = 0;
      await expect(barrenWuffet.connect(fundSubscriberWallet).withdraw(jerkshireHash, subscriptionId))
        .to.changeEtherBalance(fundSubscriberWallet, validDeposit)
        .emit(barrenWuffet, "Withdraw")
        .withArgs(jerkshireHash, subscriptionId, ETH_ADDRESS, validDeposit);
    });

    it("should not allow withdrawing if there have not been any deposits from this user", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet, fundSubscriber2Wallet } = await loadFixture(
        raisingFundsFixture
      );
      await barrenWuffet
        .connect(fundSubscriberWallet)
        .deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit });
      await expect(barrenWuffet.connect(fundSubscriber2Wallet).withdraw(jerkshireHash, 0)).to.be.rejectedWith(
        "You're not the subscriber!"
      );
    });

    it("should allow only the fund manager to close a Raising fund, and the subscriber to withdraw funds", async () => {
      const {
        barrenWuffet,
        marlieChungerWallet,
        jerkshireHash,
        crackBlockHash,
        chungerToContract,
        fairyToContract,
        fundSubscriberWallet,
      } = await loadFixture(raisingFundsFixture);
      // add some funds so we can confirm that even a fund with funds can be closed
      await barrenWuffet
        .connect(fundSubscriberWallet)
        .deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit });
      await expect(fairyToContract.closeFund(jerkshireHash)).to.be.revertedWith(
        "Only the fund manager can close a fund prematurely"
      );
      await expect(chungerToContract.closeFund(jerkshireHash))
        .to.changeEtherBalances([marlieChungerWallet, barrenWuffet.address], [0, 0])
        .emit(barrenWuffet, "Closed")
        .withArgs(jerkshireHash);

      await expect(barrenWuffet.connect(fundSubscriberWallet).withdraw(jerkshireHash, 0))
        .to.changeEtherBalance(fundSubscriberWallet, validDeposit)
        .emit(barrenWuffet, "Withdraw")
        .withArgs(jerkshireHash, 0, ETH_ADDRESS, validDeposit);

      // this is a clean fund
      await expect(chungerToContract.closeFund(crackBlockHash)).to.be.revertedWith(
        "Only the fund manager can close a fund prematurely"
      );
      await expect(fairyToContract.closeFund(crackBlockHash)).to.emit(barrenWuffet, "Closed").withArgs(crackBlockHash);
    });

    it("should not allow creating a rule for a raising fund", async () => {
      const { jerkshireHash, chungerToContract, priceTrigger, testToken1, swapETHToTST1Action } = await loadFixture(
        raisingFundsFixture
      );

      await expect(
        chungerToContract.createRule(
          jerkshireHash,
          [makePassingTrigger(priceTrigger.address, testToken1)],
          [swapETHToTST1Action]
        )
      ).be.revertedWithoutReason();
    });
    it("should revert if rewards withdrawal is attempted on a raising fund", async () => {
      const { barrenWuffet, jerkshireHash, chungerToContract, fundSubscriberWallet } = await loadFixture(
        raisingFundsFixture
      );
      await barrenWuffet
        .connect(fundSubscriberWallet)
        .deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit });
      await expect(chungerToContract.withdrawReward(jerkshireHash)).to.be.revertedWith("Fund not closed");
    });

    it("should return fund status as DEPLOYED once the fund is created, deadline has been hit (min collateral may or maynot be met)", async () => {
      // Min collateral is not playing the role it is supposed to. This behaviour will likely be changed.
      const { barrenWuffet, jerkshireHash, jerkshireConstraints, fundSubscriberWallet } = await loadFixture(
        raisingFundsFixture
      );
      await barrenWuffet
        .connect(fundSubscriberWallet)
        .deposit(jerkshireHash, ETH_ADDRESS, validDeposit, { value: validDeposit });

      await time.increaseTo(jerkshireConstraints.deadline);

      expect(await barrenWuffet.connect(fundSubscriberWallet).getStatus(jerkshireHash)).to.equal(FUND_STATUS.DEPLOYED);
    });

    it("should return fund status as DEPLOYED if max collateral has been raised (deadline may or may not be met)", async () => {
      const { barrenWuffet, jerkshireHash, jerkshireConstraints, fundSubscriberWallet, fundSubscriber2Wallet } =
        await loadFixture(raisingFundsFixture);

      await depositMaxCollateral(
        barrenWuffet.connect(fundSubscriberWallet),
        barrenWuffet.connect(fundSubscriber2Wallet),
        jerkshireHash,
        jerkshireConstraints
      );

      expect(await barrenWuffet.connect(fundSubscriberWallet).getStatus(jerkshireHash)).to.equal(FUND_STATUS.DEPLOYED);
    });
  });

  describe.skip("Fund Actions on a non-existent fund", async () => {
    // we are creating this test here and not earlier because we want to have a
    // fund with deposits, and ensure these actions on a different fund dont
    // interfere with the funds on the existing fund.
    it("should revert if creating rules positions in a non-existent fund", async () => {});

    it("should revert if performing actions on a non-existent fund", async () => {});

    it("should revert if withdrawing rewards from  a non-existent fund", async () => {});

    it("should revert if depositing / withdrawing from  a non-existent fund", async () => {});

    it("should revert on attempting to get status on a non-existent fund", async () => {});

    it("should revert if an unknown fund or closed fund is closed", () => {});
  });

  async function deployedFundsFixture() {
    const vars = await loadFixture(raisingFundsFixture);
    const { barrenWuffet, jerkshireHash, jerkshireConstraints, fundSubscriberWallet, fundSubscriber2Wallet } = vars;

    const deposits = {
      jerkshire: {
        subscription1: jerkshireConstraints.minCollateralPerSub,
        subscription2: jerkshireConstraints.minCollateralPerSub.mul(2),
      },
    };

    // both subscribers have deposits
    await barrenWuffet
      .connect(fundSubscriberWallet)
      .deposit(jerkshireHash, ETH_ADDRESS, deposits.jerkshire.subscription1, {
        value: deposits.jerkshire.subscription1,
      });
    await barrenWuffet
      .connect(fundSubscriber2Wallet)
      .deposit(jerkshireHash, ETH_ADDRESS, deposits.jerkshire.subscription2, {
        value: deposits.jerkshire.subscription2,
      });

    // meet deadine also to be sure that the status is deployed
    await time.increaseTo(jerkshireConstraints.deadline);

    // confirm that the status is deployed
    expect(await barrenWuffet.connect(fundSubscriberWallet).getStatus(jerkshireHash)).to.equal(FUND_STATUS.DEPLOYED);

    // we arent deploying crackblock yet, we can deploy it with the appropriate state as needed.

    return {
      ...vars,
      deposits,
    };
  }

  describe("Fund Status: Deployed", () => {
    function getTotalDeposits(depositObj: { [key: string]: { [key: string]: BigNumber } }, fund: string) {
      return Object.values(depositObj[fund]).reduce((sum, current: BigNumber) => sum.add(current), BigNumber.from(0));
    }

    it("should revert if deposit is attempted on a deployed fund", async () => {
      const { barrenWuffet, jerkshireHash, jerkshireConstraints, fundSubscriberWallet, deposits } = await loadFixture(
        deployedFundsFixture
      );

      const depositAmt = jerkshireConstraints.minCollateralPerSub;

      // confirming this to avoid red herrings
      expect(depositAmt.add(getTotalDeposits(deposits, "jerkshire"))).to.be.lessThanOrEqual(
        jerkshireConstraints.maxCollateralTotal
      );

      await expect(
        barrenWuffet
          .connect(fundSubscriberWallet)
          .deposit(jerkshireHash, ETH_ADDRESS, depositAmt, { value: depositAmt })
      ).to.be.revertedWith("Fund is not raising");
    });

    it("should revert if withdrawal is attempted on a deployed fund", async () => {
      const { barrenWuffet, jerkshireHash, fundSubscriberWallet } = await loadFixture(deployedFundsFixture);

      await expect(barrenWuffet.connect(fundSubscriberWallet).withdraw(jerkshireHash, 0)).to.be.revertedWith(
        "Can't get money back from deployed fund!"
      );
    });

    it("should revert if rewards withdrawal is attempted on a deployed fund", async () => {
      const { chungerToContract, jerkshireHash } = await loadFixture(deployedFundsFixture);

      await expect(chungerToContract.withdrawReward(jerkshireHash)).to.be.revertedWith("Fund not closed");
    });

    describe("xx Manage rules", () => {
      it("Should emit RoboCop event when fund manager creates one or more rules", async () => {
        const { roboCop, chungerToContract, priceTrigger, testToken1, jerkshireHash, swapETHToTST1Action } =
          await loadFixture(deployedFundsFixture);

        await expect(
          chungerToContract.createRule(
            jerkshireHash,
            [makePassingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action]
          )
        )
          .to.emit(roboCop, "Created")
          .withArgs(anyValue);

        await expect(
          chungerToContract.createRule(
            jerkshireHash,
            [makeFailingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action]
          )
        )
          .to.emit(roboCop, "Created")
          .withArgs(anyValue);
      });

      //@ts-ignore
      async function createTwoRules(_fixtureVars) {
        const {
          crackBlockHash,
          roboCop,
          chungerToContract,
          fairyToContract,
          priceTrigger,
          jerkshireHash,
          testToken1,
          swapETHToTST1Action,
        } = _fixtureVars;

        // Why fundHash and not ruleHash? dont know. the event is emitted by roboCop but the field is fundHash.
        // the "fundHash" key isnt part of the abi (only the type is), so this could be an ethers issue.
        const ruleHash = await getHashFromEvent(
          chungerToContract.createRule(
            jerkshireHash,
            [makePassingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action]
          ),
          "Created",
          roboCop.address,
          "fundHash"
        );
        // create the same rule in a different fund to confirm that we dont mix things up.
        const ruleHash2 = await getHashFromEvent(
          fairyToContract.createRule(
            crackBlockHash,
            [makePassingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action]
          ),
          "Created",
          roboCop.address,
          "fundHash"
        );

        expect(ruleHash).to.not.equal(ruleHash2);

        return {
          ruleIndex: 0,
          ruleHash: ruleHash,
        };
      }
      it("Should emit RoboCop events when fund manager creates / activates / deactivates / cancels a rule", async () => {
        const fixtureVars = await loadFixture(deployedFundsFixture);
        const {
          barrenWuffet,
          marlieChungerWallet,
          crackBlockHash,
          roboCop,
          chungerToContract,
          fairyToContract,
          priceTrigger,
          jerkshireHash,
          swapETHToTST1Action,
        } = fixtureVars;

        const { ruleIndex, ruleHash } = await createTwoRules(fixtureVars);

        await expect(chungerToContract.activateRule(jerkshireHash, ruleIndex))
          .to.changeEtherBalances([barrenWuffet, roboCop], [0, 0])
          .emit(roboCop, "Activated")
          .withArgs(ruleHash);

        await expect(chungerToContract.deactivateRule(jerkshireHash, ruleIndex))
          .to.changeEtherBalances([barrenWuffet, roboCop], [0, 0])
          .emit(roboCop, "Deactivated")
          .withArgs(ruleHash);

        await expect(chungerToContract.activateRule(jerkshireHash, ruleIndex))
          .to.changeEtherBalances([barrenWuffet, roboCop], [0, 0])
          .emit(roboCop, "Activated")
          .withArgs(ruleHash);

        await expect(chungerToContract.cancelRule(jerkshireHash, ruleIndex))
          .to.changeEtherBalances([barrenWuffet, roboCop], [0, 0])
          .emit(roboCop, "Deactivated")
          .withArgs(ruleHash);
      });

      it("Should emit RoboCop events and adjust funds from jerkshire when fund manager adds / removes / cancels native collateral for a rule", async () => {
        const fixtureVars = await loadFixture(deployedFundsFixture);
        const { barrenWuffet, marlieChungerWallet, roboCop, chungerToContract, jerkshireHash } = fixtureVars;

        const { ruleIndex, ruleHash } = await createTwoRules(fixtureVars);

        const addAmt = [utils.parseEther("1")];

        await expect(chungerToContract.addRuleCollateral(jerkshireHash, ruleIndex, [ETH_ADDRESS], addAmt))
          .to.changeEtherBalances([barrenWuffet, roboCop, marlieChungerWallet], [addAmt[0].mul(-1), addAmt[0], 0])
          .emit(roboCop, "CollateralAdded")
          .withArgs(ruleHash, addAmt);

        const redAmt = [utils.parseEther("0.6")];
        await expect(chungerToContract.reduceRuleCollateral(jerkshireHash, ruleIndex, redAmt))
          .to.changeEtherBalances([barrenWuffet, roboCop, marlieChungerWallet], [redAmt[0], redAmt[0].mul(-1), 0])
          .emit(roboCop, "CollateralReduced")
          .withArgs(ruleHash, redAmt);
      });
      [0, 1].forEach((isActive) => {
        const activation = isActive ? "active" : "inactive";
        it(`Should return all collateral added when ${activation} rule is cancelled and make it inactive`, async () => {
          const fixtureVars = await loadFixture(deployedFundsFixture);
          const { barrenWuffet, marlieChungerWallet, roboCop, chungerToContract, jerkshireHash } = fixtureVars;

          const { ruleIndex, ruleHash } = await createTwoRules(fixtureVars);

          const collateral = [utils.parseEther("0.6")];
          await chungerToContract.addRuleCollateral(jerkshireHash, ruleIndex, [ETH_ADDRESS], collateral);

          if (isActive) {
            await chungerToContract.activateRule(jerkshireHash, ruleIndex);
          }

          const e = expect(chungerToContract.cancelRule(jerkshireHash, ruleIndex))
            .to.changeEtherBalances(
              [barrenWuffet, roboCop, marlieChungerWallet],
              [collateral[0], collateral[0].mul(-1), 0]
            )
            .emit(roboCop, "CollateralReduced")
            .withArgs(ruleHash, collateral);

          if (isActive) {
            await e.emit(roboCop, "Deactivated").withArgs(ruleHash);
          } else {
            await e;
          }
        });
      });

      it("Should not allow anyone other than the fund manager to manage rules", async () => {
        const {
          barrenWuffet,
          roboCop,
          chungerToContract,
          fairyToContract,
          priceTrigger,
          testToken1,
          jerkshireHash,
          swapETHToTST1Action,
        } = await loadFixture(deployedFundsFixture);

        await expect(
          fairyToContract.createRule(
            jerkshireHash,
            [makePassingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action]
          )
        ).to.be.revertedWithoutReason();

        await chungerToContract.createRule(
          jerkshireHash,
          [makePassingTrigger(priceTrigger.address, testToken1)],
          [swapETHToTST1Action]
        );

        const ruleFns = [
          () => fairyToContract.activateRule(jerkshireHash, 0),
          () => fairyToContract.deactivateRule(jerkshireHash, 0),
          () => fairyToContract.addRuleCollateral(jerkshireHash, 0, [ETH_ADDRESS], [utils.parseEther("1")]),
          () => fairyToContract.reduceRuleCollateral(jerkshireHash, 0, [utils.parseEther("0.6")]),
          () => fairyToContract.cancelRule(jerkshireHash, 0),
        ];

        for (const fn of ruleFns) {
          await expect(fn()).to.be.revertedWithoutReason();
        }
      });

      it.skip("should revert if an unknown rule is accessed", async () => {
        const { chungerToContract, jerkshireHash } = await loadFixture(deployedFundsFixture);
      });
    });

    describe.skip("Take Action", () => {
      it("Should not allow anyone other than the fund manager to take action", async () => {});

      it("should call 'perform' on the action when fund manager calls takeAction", async () => {
        // ideally we use IAction to create a mock action, and then check if perform is called on the mock action.
      });
    });
  });

  describe.skip("Fund status: Closable", () => {
    it("should return fund status as CLOSABLE once the lockin period has exceeded", async () => {});

    // this is when the fund can be closed, and hence wont accept any trades but it hasnt been closed yet.
    // A fund manager can close such a fund, or it will be auto-closed on withdraw
    // All other restrictions apply the same to closable and closed funds (so it makes sense to reuse the tests.)
    it("should revert if withdrawal is attempted on a closable fund", async () => {});

    it("should revert if rewards withdrawal is attempted on a closable fund", async () => {});
  });

  describe.skip("Fund transition: Close Fund", () => {
    it("should allow the fund manager to close a deployed fund (all open positions) and emit a Closed event if the fund is closable", async () => {});

    it("should allow the fund manager to close a deployed fund with open positions that is NOT closable and emit Closed event", async () => {});

    it("should not allow anyone other than the  fund manager to close a closable fund", async () => {
      // this might be made public in the future
    });
  });

  describe.skip("Fund Status: Closed", () => {
    it("should return fund status as CLOSED once the fund has been closed", async () => {});

    it("Should revert if deposit is attempted on a closable / closed fund", async () => {});

    it("should revert if opening positions in a closable / closed fund", async () => {});

    it("should allow withdrawing multiple tokens from a closed fund", async () => {
      // this might change. We plan to auto-convert all tokens to input token so that profit can be calculated accurately.
    });
  });

  describe.skip("Rewards", () => {
    it("should return the correct value of reward to each fund manager, when multiple fund managers have pending rewards", async () => {});

    it("should not allow access to rewards from a fund that the manager doesnt own", async () => {});

    it("should not allow multiple withdrawals of the reward", async () => {});
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
