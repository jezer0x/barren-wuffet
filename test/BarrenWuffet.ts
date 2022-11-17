import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect, use as chai_use, should as chai_should } from "chai";
import { ethers, deployments, getNamedAccounts } from "hardhat";
import { BigNumber, utils } from "ethers";
import { makeFailingTrigger, makePassingTrigger, setupBarrenWuffet, makeDefaultSubConstraints } from "./Fixtures";
import {
  BAD_FUND_HASH,
  ETH_ADDRESS,
  ETH_PRICE_IN_TST1,
  ETH_TOKEN,
  FUND_STATUS,
  PRICE_TRIGGER_DECIMALS,
  PRICE_TRIGGER_TYPE,
  DEFAULT_SUB_TO_MAN_FEE_PCT,
  GT
} from "./Constants";
import {
  depositMaxCollateral,
  getHashFromEvent,
  getAddressFromEvent,
  expectEthersObjDeepEqual,
  erc20,
  whitelistAction
} from "./helper";
import { HardhatRuntimeEnvironment } from "hardhat/types";
// const { deployMockContract } = waffle;
import { FakeContract, smock } from "@defi-wonderland/smock";
import { UniSwapExactInputSingle } from "../typechain-types/contracts/actions/uniswap/UniSwapExactInputSingle";

chai_should(); // if you like should syntax
chai_use(smock.matchers);

const ERC20_DECIMALS = BigNumber.from(10).pow(18);

describe("BarrenWuffet", () => {
  const deployBarrenWuffetFixture = deployments.createFixture(async hre => {
    await deployments.fixture(["BarrenWuffet"]);
    return await setupBarrenWuffet(hre);
  });

  describe("Fund FundStatus: Uninitialized", () => {
    it("should allow anyone to create a fund and emit Created event with the fund hash", async () => {
      const { barrenWuffetMarlie } = await deployBarrenWuffetFixture();
      const validConstraints = await makeDefaultSubConstraints();
      await expect(barrenWuffetMarlie.createFund("Fund1", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []))
        .to.emit(barrenWuffetMarlie, "Created")
        .withArgs(anyValue, anyValue, "Fund1");
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

    it("should allow if the same user creates 2 funds with the same name", async () => {
      const { barrenWuffetMarlie } = await deployBarrenWuffetFixture();
      const validConstraints = await makeDefaultSubConstraints();
      await barrenWuffetMarlie.createFund("Fund1", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []);
      await expect(barrenWuffetMarlie.createFund("Fund1", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []))
        .to.emit(barrenWuffetMarlie, "Created")
        .withArgs(anyValue, anyValue, "Fund1");
    });

    it("should allow the same user to create 2 funds with different names", async () => {
      const { barrenWuffetMarlie } = await deployBarrenWuffetFixture();
      const validConstraints = await makeDefaultSubConstraints();
      await barrenWuffetMarlie.createFund("Jerkshire", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []);
      await expect(barrenWuffetMarlie.createFund("Clerkshire", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []))
        .to.emit(barrenWuffetMarlie, "Created")
        .withArgs(anyValue, anyValue, "Clerkshire");
    });

    it("should allow 2 different users to create funds with the same name", async () => {
      const { barrenWuffet, barrenWuffetMarlie, barrenWuffetFairy } = await deployBarrenWuffetFixture();
      const validConstraints = await makeDefaultSubConstraints();
      await barrenWuffetMarlie.createFund("Jerkshire", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []);
      await expect(barrenWuffetFairy.createFund("Jerkshire", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []))
        .to.emit(barrenWuffet, "Created")
        .withArgs(anyValue, anyValue, "Jerkshire");
    });
  });

  describe("Input and Output Token Settings", () => {
    it("Should return eth as the input token for any fund", async () => {
      // we only support ETH as the input token for now.
      // As this functionality is extended, this test needs to expand
      const { barrenWuffet, barrenWuffetMarlie } = await deployBarrenWuffetFixture();
      const { marlieChunger } = await getNamedAccounts();
      const validConstraints = await makeDefaultSubConstraints();
      let fundAddr;
      await expect(barrenWuffetMarlie.createFund("Jerkshire", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []))
        .to.emit(barrenWuffet, "Created")
        .withArgs(
          anyValue,
          (addr: string) => {
            fundAddr = addr;
            return true;
          },
          "Jerkshire"
        );

      //@ts-ignore
      const jerkshireFund = await ethers.getContractAt("Fund", fundAddr, marlieChunger);
      expectEthersObjDeepEqual([ETH_TOKEN], await jerkshireFund.getInputTokens());
    });

    it("Should revert on getOutputToken", async () => {
      // This functionality can potentially support converting all tokens into a single token
      // before it's returned to the user.
      // This is as yet unimplemented, so the function should revert.

      const { barrenWuffet, barrenWuffetMarlie } = await deployBarrenWuffetFixture();
      const validConstraints = await makeDefaultSubConstraints();
      const { marlieChunger } = await getNamedAccounts();
      let fundAddr;
      await expect(barrenWuffetMarlie.createFund("Jerkshire", validConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []))
        .to.emit(barrenWuffet, "Created")
        .withArgs(
          anyValue,
          (addr: string) => {
            fundAddr = addr;
            return true;
          },
          "Jerkshire"
        );

      //@ts-ignore
      const jerkshireFund = await ethers.getContractAt("Fund", fundAddr, marlieChunger);
      await expect(jerkshireFund.getOutputTokens()).to.be.revertedWith("Undefined");
    });
  });

  async function setupRaisingFunds(hre: HardhatRuntimeEnvironment) {
    const {
      priceTrigger,
      testToken1,
      barrenWuffet,
      barrenWuffetMarlie,
      barrenWuffetFairy,
      swapETHToTST1Action
    } = await setupBarrenWuffet(hre);

    const latestTime = await time.latest();

    const jerkshireConstraints = {
      minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
      maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
      minCollateralTotal: BigNumber.from(200).mul(ERC20_DECIMALS),
      maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
      deadline: latestTime + 86400,
      lockin: latestTime + 86400 * 10,
      allowedDepositToken: ETH_TOKEN,
      onlyWhitelistedInvestors: false
    };

    const jerkshireAddr = await getAddressFromEvent(
      barrenWuffetMarlie.createFund("Jerkshire Castaway", jerkshireConstraints, DEFAULT_SUB_TO_MAN_FEE_PCT, []),
      "Created",
      barrenWuffet.address,
      1
    );
    const { fundSubscriber, fundSubscriber2, fairyLink, marlieChunger, bot } = await getNamedAccounts();

    const jerkshireFund = {
      x: await ethers.getContractAt("Fund", jerkshireAddr),
      marlieChunger: await ethers.getContractAt("Fund", jerkshireAddr, marlieChunger),
      subscriber: await ethers.getContractAt("Fund", jerkshireAddr, fundSubscriber),
      subscriber2: await ethers.getContractAt("Fund", jerkshireAddr, fundSubscriber2),
      bot: await ethers.getContractAt("Fund", jerkshireAddr, bot),
      fairyLink: await ethers.getContractAt("Fund", jerkshireAddr, fairyLink)
    };

    const crackBlockConstraints = {
      minCollateralPerSub: BigNumber.from(0),
      maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
      minCollateralTotal: BigNumber.from(50).mul(ERC20_DECIMALS),
      maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
      deadline: latestTime + 86400,
      lockin: latestTime + 86400 * 10,
      allowedDepositToken: ETH_TOKEN
    };

    const crackBlockAddr = await getAddressFromEvent(
      barrenWuffetFairy.createFund("CrackBlock", crackBlockConstraints, 10, []),
      "Created",
      barrenWuffetFairy.address,
      1
    );
    const crackBlockFund = {
      x: await ethers.getContractAt("Fund", crackBlockAddr),
      fairyLink: await ethers.getContractAt("Fund", crackBlockAddr, fairyLink),
      subscriber: await ethers.getContractAt("Fund", crackBlockAddr, fundSubscriber),
      subscriber2: await ethers.getContractAt("Fund", crackBlockAddr, fundSubscriber2),
      bot: await ethers.getContractAt("Fund", crackBlockAddr, bot),
      marlieChunger: await ethers.getContractAt("Fund", crackBlockAddr, marlieChunger)
    };

    return {
      barrenWuffet,
      priceTrigger,
      jerkshireFund,
      crackBlockFund,
      jerkshireConstraints,
      crackBlockConstraints,
      testToken1,
      swapETHToTST1Action
    };
  }

  const raisingFundsFixture = deployments.createFixture(async hre => {
    await deployments.fixture(["BarrenWuffet"]);
    return await setupRaisingFunds(hre);
  });

  describe("Fund FundStatus: Raising", () => {
    const validDeposit = utils.parseEther("11");
    it("Should allow anyone to deposit native token into a raising fund and emit a Deposit event", async () => {
      const { jerkshireFund } = await raisingFundsFixture();
      const { fundSubscriber } = await getNamedAccounts();
      await expect(jerkshireFund.subscriber.deposit(ETH_TOKEN, validDeposit, { value: validDeposit }))
        .to.emit(jerkshireFund.x, "Deposit")
        .withArgs(fundSubscriber, ETH_ADDRESS, validDeposit);
    });

    it("Should allow the fund manager to deposit native token into their own fund", async () => {
      const { jerkshireFund } = await raisingFundsFixture();
      const { marlieChunger } = await getNamedAccounts();
      await expect(jerkshireFund.marlieChunger.deposit(ETH_TOKEN, validDeposit, { value: validDeposit }))
        .to.emit(jerkshireFund.x, "Deposit")
        .withArgs(marlieChunger, ETH_ADDRESS, validDeposit);
    });

    it("Should not allow anyone to deposit ERC20 tokens into a raising fund. We only allow native right now", async () => {
      const { jerkshireFund, testToken1 } = await raisingFundsFixture();
      await expect(
        jerkshireFund.subscriber.deposit(erc20(testToken1.address), utils.parseEther("11"))
      ).to.be.revertedWithoutReason();
    });

    it("should return fund status as RAISING once the fund is created, deadline has NOT been hit and amount raised is LESS than min amount", async () => {
      const { jerkshireFund, crackBlockFund } = await raisingFundsFixture();

      expect(await crackBlockFund.bot.getStatus()).to.be.equal(FUND_STATUS.RAISING);
      // barren is depositing into their own fund
      await jerkshireFund.marlieChunger.deposit(ETH_TOKEN, validDeposit, { value: validDeposit });
      await jerkshireFund.fairyLink.deposit(ETH_TOKEN, validDeposit, { value: validDeposit });

      expect(await crackBlockFund.bot.getStatus()).to.be.equal(FUND_STATUS.RAISING);
    });

    it("Should not allow anyone to deposit less than min subscriber threshold into the fund", async () => {
      const { jerkshireFund, jerkshireConstraints } = await raisingFundsFixture();
      const depositAmt = jerkshireConstraints.minCollateralPerSub.sub(utils.parseEther("0.0001"));
      await expect(jerkshireFund.subscriber.deposit(ETH_TOKEN, depositAmt, { value: depositAmt })).to.be.revertedWith(
        "< minCollateralPerSub"
      );
    });

    it("Should not allow anyone to deposit more than max subscriber threshold into the fund", async () => {
      const { jerkshireFund, jerkshireConstraints } = await raisingFundsFixture();
      const depositAmt = jerkshireConstraints.maxCollateralPerSub.add(utils.parseEther("0.0001"));
      await expect(jerkshireFund.subscriber.deposit(ETH_TOKEN, depositAmt, { value: depositAmt })).to.be.revertedWith(
        "> maxCollateralPerSub"
      );
    });

    it("Should not allow anyone to deposit more than max subscriber threshold by splitting the deposits into multiple subscriptions", async () => {
      const { jerkshireFund, jerkshireConstraints } = await raisingFundsFixture();
      // unclear if this is a feature or a bug, but we want to document the usecase
      // check if multiple smaller deposits, that exceed collateral limit in total, get reverted.
      const depositAmt1 = jerkshireConstraints.maxCollateralPerSub.sub(utils.parseEther("0.1"));
      const { fundSubscriber } = await getNamedAccounts();
      await expect(jerkshireFund.subscriber.deposit(ETH_TOKEN, depositAmt1, { value: depositAmt1 }))
        .to.emit(jerkshireFund.x, "Deposit")
        .withArgs(fundSubscriber, ETH_ADDRESS, depositAmt1);

      const depositAmt2 = jerkshireConstraints.minCollateralPerSub;
      await expect(jerkshireFund.subscriber.deposit(ETH_TOKEN, depositAmt2, { value: depositAmt2 })).to.revertedWith(
        "> maxCollateralPerSub"
      );
    });

    it("Should revert if deposit is attempted on a fund where collateral limit is reached", async () => {
      const { jerkshireFund } = await raisingFundsFixture();
      // true should succeed, false should error
      const deposits: [BigNumber, boolean, string | number][] = [
        [utils.parseEther("100"), true, 0],
        [utils.parseEther("100"), true, 1],
        [utils.parseEther("100"), true, 2],
        [utils.parseEther("100"), true, 3],
        [utils.parseEther("89"), true, 4],
        [utils.parseEther("12"), false, "> maxColalteralTotal"],
        [utils.parseEther("11"), true, 5]
      ];
      const { fundSubscriber } = await getNamedAccounts();

      for (const deposit of deposits) {
        const [amt, shouldSucceed, idOrError] = deposit;
        const tx = jerkshireFund.subscriber.deposit(ETH_TOKEN, amt, { value: amt });
        if (shouldSucceed) {
          await expect(tx)
            .to.changeEtherBalance(fundSubscriber, amt.mul(-1))
            .emit(jerkshireFund.x, "Deposit")
            .withArgs(fundSubscriber, ETH_ADDRESS, amt);
        } else {
          await expect(tx).to.be.revertedWith(idOrError.toString());
        }
      }
    });

    it("should allow withdrawing from a fund that's still raising", async () => {
      const { jerkshireFund } = await raisingFundsFixture();
      await jerkshireFund.subscriber.deposit(ETH_TOKEN, validDeposit, { value: validDeposit });
      const subscriptionId = 0;
      const { fundSubscriber } = await getNamedAccounts();
      await expect(jerkshireFund.subscriber.withdraw())
        .to.changeEtherBalance(fundSubscriber, validDeposit)
        .emit(jerkshireFund.x, "Withdraw")
        .withArgs(fundSubscriber, ETH_ADDRESS, validDeposit);
    });

    it("should not allow withdrawing if there have not been any deposits from this user", async () => {
      const { jerkshireFund } = await raisingFundsFixture();
      await jerkshireFund.subscriber.deposit(ETH_TOKEN, validDeposit, { value: validDeposit });
      await expect(jerkshireFund.subscriber2.withdraw()).to.be.rejectedWith("F: !ActiveSubscriber");
    });

    it("should allow only the fund manager to close a Raising fund, and the subscriber to withdraw funds", async () => {
      const { barrenWuffet, jerkshireFund, crackBlockFund } = await raisingFundsFixture();
      // add some funds so we can confirm that even a fund with funds can be closed
      await jerkshireFund.subscriber.deposit(ETH_TOKEN, validDeposit, { value: validDeposit });
      await expect(jerkshireFund.fairyLink.closeFund()).to.be.revertedWith("F: Only Fund Manager");
      const { fundSubscriber, marlieChunger } = await getNamedAccounts();
      await expect(jerkshireFund.marlieChunger.closeFund())
        .to.changeEtherBalances([marlieChunger, barrenWuffet], [0, 0])
        .emit(jerkshireFund.x, "Closed");

      await expect(jerkshireFund.subscriber.withdraw())
        .to.changeEtherBalance(fundSubscriber, validDeposit)
        .emit(jerkshireFund.x, "Withdraw")
        .withArgs(fundSubscriber, ETH_ADDRESS, validDeposit);

      // this is a clean fund
      await expect(crackBlockFund.marlieChunger.closeFund()).to.be.revertedWith("F: Only Fund Manager");
      await expect(crackBlockFund.fairyLink.closeFund()).to.emit(crackBlockFund.fairyLink, "Closed");
    });

    it("should not allow creating a rule for a raising fund", async () => {
      const { jerkshireFund, priceTrigger, testToken1, swapETHToTST1Action } = await raisingFundsFixture();

      await expect(
        jerkshireFund.marlieChunger.createRule(
          [makePassingTrigger(priceTrigger.address, testToken1)],
          [swapETHToTST1Action],
          false,
          [],
          []
        )
      ).be.revertedWith("F: Wrong State");
    });
    it("should revert if ManagementFee withdrawal is attempted on a raising fund", async () => {
      const { jerkshireFund } = await raisingFundsFixture();
      await jerkshireFund.subscriber.deposit(ETH_TOKEN, validDeposit, { value: validDeposit });
      await expect(jerkshireFund.marlieChunger.withdrawManagementFee()).to.be.revertedWith("F: Wrong State");
    });

    it.skip("should return fund status as DEPLOYED once the fund is created, deadline has been hit (min collateral has to be met)", async () => {
      // Min collateral is not playing the role it is supposed to. This behaviour will likely be changed.
      // TODO: buggy (was minCollateral may not be met)
      const { jerkshireFund, jerkshireConstraints } = await raisingFundsFixture();
      await jerkshireFund.subscriber.deposit(ETH_TOKEN, validDeposit, { value: validDeposit });

      await time.increaseTo(jerkshireConstraints.deadline);

      expect(await jerkshireFund.subscriber.getStatus()).to.equal(FUND_STATUS.DEPLOYED);
    });

    it.skip("should return fund status as DEPLOYED if max collateral has been raised and deadline is met", async () => {
      // TODO: buggy (was deadline may not be hit)
      const { jerkshireFund, jerkshireConstraints } = await raisingFundsFixture();

      await depositMaxCollateral(jerkshireFund.subscriber, jerkshireFund.subscriber2, jerkshireConstraints);

      expect(await jerkshireFund.subscriber.getStatus()).to.equal(FUND_STATUS.DEPLOYED);
    });

    it.skip("If deadline passed but minCollateral is not reached, can't deploy", async () => {});

    it.skip("If raised between minCollateralTotal and maxCollateralTotal, can't deploy until deadline", async () => {});

    it.skip("should give subscriberToPlatformFeePercentage to platformFeeWallet", async () => {});
  });

  describe.skip("Fund Actions on a non-existent fund", async () => {
    // we are creating this test here and not earlier because we want to have a
    // fund with deposits, and ensure these actions on a different fund dont
    // interfere with the funds on the existing fund.
    it("should revert if creating rules positions in a non-existent fund", async () => {});

    it("should revert if performing actions on a non-existent fund", async () => {});

    it("should revert if withdrawing ManagementFee from  a non-existent fund", async () => {});

    it("should revert if depositing / withdrawing from  a non-existent fund", async () => {});

    it("should revert on attempting to get status on a non-existent fund", async () => {});

    it("should revert if an unknown fund or closed fund is closed", () => {});
  });

  async function setupDeployedFunds(hre: HardhatRuntimeEnvironment) {
    const vars = await setupRaisingFunds(hre);
    const { jerkshireFund, jerkshireConstraints } = vars;

    const deposits = {
      jerkshire: {
        subscription1: jerkshireConstraints.maxCollateralPerSub,
        subscription2: jerkshireConstraints.maxCollateralPerSub
      }
    };

    // both subscribers have deposits
    await jerkshireFund.subscriber.deposit(ETH_TOKEN, deposits.jerkshire.subscription1, {
      value: deposits.jerkshire.subscription1
    });
    await jerkshireFund.subscriber2.deposit(ETH_TOKEN, deposits.jerkshire.subscription2, {
      value: deposits.jerkshire.subscription2
    });

    // meet deadine also to be sure that the status is deployed
    await time.increaseTo(jerkshireConstraints.deadline);

    // confirm that the status is deployed
    expect(await jerkshireFund.subscriber.getStatus()).to.equal(FUND_STATUS.DEPLOYED);

    // we arent deploying crackblock yet, we can deploy it with the appropriate state as needed.

    return {
      ...vars,
      deposits
    };
  }

  const deployedFundsFixture = deployments.createFixture(async hre => {
    await deployments.fixture();
    return await setupDeployedFunds(hre);
  });

  describe("Fund FundStatus: Deployed", () => {
    function getTotalDeposits(depositObj: { [key: string]: { [key: string]: BigNumber } }, fund: string) {
      return Object.values(depositObj[fund]).reduce((sum, current: BigNumber) => sum.add(current), BigNumber.from(0));
    }

    it.skip("Should revert if trigger has not been whitelisted", async () => {});

    it.skip("Should revert if action has not been whitelisted", async () => {});

    it("should revert if deposit is attempted on a deployed fund", async () => {
      const { jerkshireFund, jerkshireConstraints, deposits } = await deployedFundsFixture();

      const depositAmt = jerkshireConstraints.minCollateralPerSub;

      // confirming this to avoid red herrings
      expect(depositAmt.add(getTotalDeposits(deposits, "jerkshire"))).to.be.lessThanOrEqual(
        jerkshireConstraints.maxCollateralTotal
      );

      await expect(jerkshireFund.subscriber.deposit(ETH_TOKEN, depositAmt, { value: depositAmt })).to.be.revertedWith(
        "F: Wrong State"
      );
    });

    it("should revert if withdrawal is attempted on a deployed fund", async () => {
      const { jerkshireFund } = await deployedFundsFixture();

      await expect(jerkshireFund.subscriber.withdraw()).to.be.revertedWith("D");
    });

    it("should revert if ManagementFee withdrawal is attempted on a deployed fund", async () => {
      const { jerkshireFund } = await deployedFundsFixture();

      await expect(jerkshireFund.marlieChunger.withdrawManagementFee()).to.be.revertedWith("F: Wrong State");
    });

    describe("Manage rules", () => {
      it("Should emit RoboCop event when fund manager creates one or more rules", async () => {
        const { priceTrigger, testToken1, jerkshireFund, swapETHToTST1Action } = await deployedFundsFixture();

        const roboCopAddr = await jerkshireFund.marlieChunger.roboCop();
        const roboCopInst = await ethers.getContractAt("RoboCop", roboCopAddr);

        await expect(
          jerkshireFund.marlieChunger.createRule(
            [makePassingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action],
            false,
            [],
            []
          )
        )
          .to.emit(roboCopInst, "Created")
          .withArgs(anyValue);

        await expect(
          jerkshireFund.marlieChunger.createRule(
            [makeFailingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action],
            false,
            [],
            []
          )
        )
          .to.emit(roboCopInst, "Created")
          .withArgs(anyValue);
      });

      //@ts-ignore
      async function createOneRule(_fixtureVars) {
        const { crackBlockFund, priceTrigger, jerkshireFund, testToken1, swapETHToTST1Action } = _fixtureVars;

        const roboCopAddr1 = await jerkshireFund.marlieChunger.roboCop();
        const roboCopInst1 = await ethers.getContractAt("RoboCop", roboCopAddr1);
        // Why fundHash and not ruleHash? dont know. the event is emitted by roboCop but the field is fundHash.
        // the "fundHash" key isnt part of the abi (only the type is), so this could be an ethers issue.
        const ruleHash = await getHashFromEvent(
          jerkshireFund.marlieChunger.createRule(
            [makePassingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action],
            false,
            [],
            []
          ),
          "Created",
          roboCopInst1,
          "ruleHash"
        );

        return {
          ruleHash: ruleHash,
          rcInstance: roboCopInst1
        };
      }

      it("Should emit RoboCop events when fund manager creates / activates / deactivates / cancels a rule", async () => {
        const fixtureVars = await deployedFundsFixture();
        const { barrenWuffet, jerkshireFund } = fixtureVars;

        const { ruleHash, rcInstance } = await createOneRule(fixtureVars);

        await expect(jerkshireFund.marlieChunger.activateRule(ruleHash))
          .to.changeEtherBalances([jerkshireFund.x, rcInstance], [0, 0])
          .emit(rcInstance, "Activated")
          .withArgs(ruleHash);

        await expect(jerkshireFund.marlieChunger.deactivateRule(ruleHash))
          .to.changeEtherBalances([barrenWuffet, rcInstance], [0, 0])
          .emit(rcInstance, "Deactivated")
          .withArgs(ruleHash);

        await expect(jerkshireFund.marlieChunger.activateRule(ruleHash))
          .to.changeEtherBalances([barrenWuffet, rcInstance], [0, 0])
          .emit(rcInstance, "Activated")
          .withArgs(ruleHash);

        await expect(jerkshireFund.marlieChunger.cancelRule(ruleHash))
          .to.changeEtherBalances([barrenWuffet, rcInstance], [0, 0])
          .emit(rcInstance, "Deactivated")
          .withArgs(ruleHash);
      });

      it("Should emit RoboCop events and adjust funds from jerkshire when fund manager adds / removes / cancels native collateral for a rule", async () => {
        const fixtureVars = await deployedFundsFixture();
        const { jerkshireFund } = fixtureVars;
        const { marlieChunger } = await getNamedAccounts();

        const { ruleHash, rcInstance } = await createOneRule(fixtureVars);

        const addAmt = [utils.parseEther("1")];

        await expect(jerkshireFund.marlieChunger.addRuleCollateral(ruleHash, addAmt, [0]))
          .to.changeEtherBalances([jerkshireFund.x, rcInstance, marlieChunger], [addAmt[0].mul(-1), addAmt[0], 0])
          .emit(rcInstance, "CollateralAdded")
          .withArgs(ruleHash, addAmt);

        const redAmt = [utils.parseEther("0.6")];
        await expect(jerkshireFund.marlieChunger.reduceRuleCollateral(ruleHash, redAmt))
          .to.changeEtherBalances([jerkshireFund.x, rcInstance, marlieChunger], [redAmt[0], redAmt[0].mul(-1), 0])
          .emit(rcInstance, "CollateralReduced")
          .withArgs(ruleHash, redAmt);
      });
      [0, 1].forEach(isActive => {
        const activation = isActive ? "active" : "inactive";
        it(`Should return all collateral added when ${activation} rule is cancelled and make it inactive`, async () => {
          const fixtureVars = await deployedFundsFixture();
          const { marlieChunger } = await getNamedAccounts();
          const { jerkshireFund } = fixtureVars;

          const { ruleHash, rcInstance } = await createOneRule(fixtureVars);

          const collateral = [utils.parseEther("0.6")];
          await jerkshireFund.marlieChunger.addRuleCollateral(ruleHash, collateral, [0]);

          if (isActive) {
            await jerkshireFund.marlieChunger.activateRule(ruleHash);
          }

          const e = expect(jerkshireFund.marlieChunger.cancelRule(ruleHash))
            .to.changeEtherBalances(
              [jerkshireFund.x, rcInstance, marlieChunger],
              [collateral[0], collateral[0].mul(-1), 0]
            )
            .emit(rcInstance, "CollateralReduced")
            .withArgs(ruleHash, collateral);

          if (isActive) {
            await e.emit(rcInstance, "Deactivated").withArgs(ruleHash);
          } else {
            await e;
          }
        });
      });

      it("Should not allow anyone other than the fund manager to manage rules", async () => {
        const fixtureVars = await deployedFundsFixture();
        const { priceTrigger, testToken1, jerkshireFund, swapETHToTST1Action } = fixtureVars;

        const { ruleHash, rcInstance } = await createOneRule(fixtureVars);

        await expect(
          jerkshireFund.fairyLink.createRule(
            [makePassingTrigger(priceTrigger.address, testToken1)],
            [swapETHToTST1Action],
            false,
            [],
            []
          )
        ).to.be.revertedWith("F: onlyFundManager");

        const ruleFns = [
          () => jerkshireFund.fairyLink.activateRule(ruleHash),
          () => jerkshireFund.fairyLink.deactivateRule(ruleHash),
          () => jerkshireFund.fairyLink.addRuleCollateral(ruleHash, [utils.parseEther("1")], [0]),
          () => jerkshireFund.fairyLink.reduceRuleCollateral(ruleHash, [utils.parseEther("0.6")]),
          () => jerkshireFund.fairyLink.cancelRule(ruleHash)
        ];

        for (const fn of ruleFns) {
          await expect(fn()).to.be.revertedWith("F: onlyFundManager");
        }
      });

      it.skip("should revert if an unknown rule is accessed", async () => {});
    });

    describe("Take Action", () => {
      it("Should not allow anyone other than the fund manager to take action", async () => {
        const { jerkshireFund, swapETHToTST1Action, priceTrigger, testToken1 } = await deployedFundsFixture();
        const etherToSwap = utils.parseEther("0.3");
        // trigger should not matter
        const passingTrigger = makePassingTrigger(priceTrigger.address, testToken1);

        // TODO param.fees missing
        await expect(
          jerkshireFund.fairyLink.takeAction(passingTrigger, swapETHToTST1Action, [etherToSwap], [0])
        ).to.be.revertedWith("F: onlyFundManager");
      });

      it("should call 'perform' on the action when fund manager calls takeAction", async () => {
        // ideally we use IAction to create a mock action, and then check if perform is called on the mock action.
        const { jerkshireFund, swapETHToTST1Action, testToken1, priceTrigger } = await deployedFundsFixture();

        const etherToSwap = utils.parseEther("0.3");

        const mockUniSwapExactInputSingle: FakeContract<UniSwapExactInputSingle> = await smock.fake(
          "UniSwapExactInputSingle"
        );

        const mockSwapETHToTST1Action = {
          ...swapETHToTST1Action,
          callee: mockUniSwapExactInputSingle.address
        };

        await whitelistAction(mockSwapETHToTST1Action.callee);

        const passingTrigger = {
          createTimeParams: utils.defaultAbiCoder.encode(
            ["address", "address", "uint8", "uint256"],
            [ETH_ADDRESS, testToken1.address, GT, ETH_PRICE_IN_TST1.sub(1)]
          ),
          triggerType: PRICE_TRIGGER_TYPE,
          callee: priceTrigger.address
        };

        // @ts-ignore
        mockUniSwapExactInputSingle.perform.returns(([action, params]) => {
          // hack to check if it's called with the right params
          // i am not able to figure out how to use calledWith at the end to check for these complex objects

          // @ts-ignore
          expectEthersObjDeepEqual(mockSwapETHToTST1Action, action);
          // @ts-ignore
          expectEthersObjDeepEqual(runTimeParams, params);
          return {
            tokenOutputs: [etherToSwap],
            // i dont know how to specify an empty position so we ll return an empty one
            position: {
              id: BAD_FUND_HASH,
              actionConstraints: [],
              nextActions: []
            }
          };
        });

        const ex = expect(
          jerkshireFund.marlieChunger.takeAction(passingTrigger, mockSwapETHToTST1Action, [etherToSwap], [0])
        );

        await ex.to.not.be.reverted;

        expect(mockUniSwapExactInputSingle.perform).to.have.been.calledOnce.delegatedFrom(
          jerkshireFund.marlieChunger.address
        );
      });

      it("should swap ether for tokens via takeAction if swap contract is called", async () => {
        // ideally we use IAction to create a mock action, and then check if perform is called on the mock action.
        const { jerkshireFund, swapETHToTST1Action, testToken1, priceTrigger } = await deployedFundsFixture();
        const { marlieChunger } = await getNamedAccounts();
        const etherToSwap = utils.parseEther("0.3");
        const tokenToReceive = etherToSwap.mul(ETH_PRICE_IN_TST1).div(PRICE_TRIGGER_DECIMALS);

        const passingTrigger = {
          createTimeParams: utils.defaultAbiCoder.encode(
            ["address", "address", "uint8", "uint256"],
            [ETH_ADDRESS, testToken1.address, GT, ETH_PRICE_IN_TST1.sub(1)]
          ),
          triggerType: PRICE_TRIGGER_TYPE,
          callee: priceTrigger.address
        };

        const ex = expect(
          jerkshireFund.marlieChunger.takeAction(passingTrigger, swapETHToTST1Action, [etherToSwap], [0])
        );
        await ex.to.changeEtherBalances([jerkshireFund.x, marlieChunger], [etherToSwap.mul(-1), 0]);
        await ex.to.changeTokenBalances(testToken1, [jerkshireFund.x, marlieChunger], [tokenToReceive, 0]);
      });
    });

    it.skip("should give managerToPlatformFeePercentage to platformFeeWallet when taking actions or adding collateral", async () => {});
  });

  describe.skip("Fund status: Closable", () => {
    it("should return fund status as CLOSABLE once the lockin period has exceeded", async () => {});

    // this is when the fund can be closed, and hence wont accept any trades but it hasnt been closed yet.
    // A fund manager can close such a fund, or it will be auto-closed on withdraw
    // All other restrictions apply the same to closable and closed funds (so it makes sense to reuse the tests.)
    it("should revert if withdrawal is attempted on a closable fund", async () => {});

    it("should revert if ManagementFee withdrawal is attempted on a closable fund", async () => {});
  });

  // TODO: Need to fix the phrasing of these tests
  describe.skip("Fund transition: Close Fund", () => {
    it("should allow the fund manager to close a deployed fund (all open positions) and emit a Closed event if the fund is closable", async () => {});

    it("should allow the fund manager to close a deployed fund without open positions that is NOT closable and emit Closed event", async () => {});

    it("should not allow anyone to close fund if there is one or more open position");

    it("should allow anyone to close a closable fund ", async () => {});
  });

  describe.skip("Fund FundStatus: Closed", () => {
    it("should return fund status as CLOSED once the fund has been closed", async () => {});

    it("Should revert if deposit is attempted on a closable / closed fund", async () => {});

    it("should revert if opening positions in a closable / closed fund", async () => {});

    it("should allow withdrawing multiple tokens from a closed fund", async () => {
      // this might change. We plan to auto-convert all tokens to input token so that profit can be calculated accurately.
    });
  });

  describe.skip("ManagementFee", () => {
    it("should return the correct value of ManagementFee to each fund manager, when multiple fund managers have pending ManagementFee", async () => {});

    it("should not allow access to ManagementFee from a fund that the manager doesnt own", async () => {});

    it("should not allow multiple withdrawals of the ManagementFee", async () => {});

    it.skip("If can't reach minCollateral, no ManagementFee for trader", async () => {});
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
