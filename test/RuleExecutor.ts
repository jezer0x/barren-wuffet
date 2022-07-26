import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { RuleExecutor as REType } from '../typechain-types/contracts/RuleExecutor.pseudo.sol/RuleExecutor';


describe("RuleExecutor", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployRuleExecutorFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const RuleExecutor = await ethers.getContractFactory("RuleExecutor");
    const ruleExecutor = await RuleExecutor.deploy();

    return { ruleExecutor, owner, otherAccount };
  }

  describe("Deployment", () => {    

    it("Should set the right owner", async function () {
      const { ruleExecutor, owner } = await loadFixture(deployRuleExecutorFixture);

      expect(await ruleExecutor.owner()).to.equal(owner.address);
    });
  });

  describe("Add Triggers", () => {
    it("Should revert with the right error if called from another account", async () => {
      const { ruleExecutor, owner, otherAccount } = await loadFixture(
        deployRuleExecutorFixture
      );

      // We use lock.connect() to send a transaction from another account
      await expect(ruleExecutor.connect(otherAccount).addTriggerFeed("eth", "0xc0ffee254729296a45a3885639AC7E10F9d54979", "0x616d4bcd", [])).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should add a trigger feed if called by the owner", async () => {
      const { ruleExecutor, owner } = await loadFixture(
        deployRuleExecutorFixture
      );
      
      await ruleExecutor.addTriggerFeed("eth", "0xc0ffee254729296a45a3885639AC7E10F9d54979", "0x616d4bcd", []);
    });
  });

  describe("Add Rule", function() {
    it("Should not allow adding a rule, where the trigger is not a whitelisted item", async () =>{
      const { ruleExecutor, owner, otherAccount } = await loadFixture(
        deployRuleExecutorFixture
      );            
      
      const trigger: REType.TriggerStruct = {
        op: 2,
        param: "0x000000000000000000000000000000000000000000000000000000000000acde",
        value: 1000
      }

      const action: REType.ActionStruct = {
        action: "backflip",
        data: "0x000000000000000000000000000000000000000000000000000000000000acde",
        fromToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979",
        minTokenAmount: 1,
        totalCollateralAmount: 1,
        toToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979"
      };

      await ruleExecutor.connect(otherAccount).addRule(trigger, action);

    });
    it("Should not allow adding a rule, where the action is not a whitelisted item", async () =>{
      const { ruleExecutor, owner, otherAccount } = await loadFixture(
        deployRuleExecutorFixture
      );            
      
      const trigger: REType.TriggerStruct = {
        op: 1,
        param: "0x000000000000000000000000000000000000000000000000000000000000acde",
        value: 1000
      }

      const action: REType.ActionStruct = {
        action: "backflip",
        data: "0x000000000000000000000000000000000000000000000000000000000000acde",
        fromToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979",
        minTokenAmount: 1,
        totalCollateralAmount: 1,
        toToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979"
      };

      await ruleExecutor.connect(otherAccount).addRule(trigger, action);


    });

    it("Should allow adding a rule, for all whitelisted triggers", async () =>{
      const { ruleExecutor, owner, otherAccount } = await loadFixture(
        deployRuleExecutorFixture
      );

      const trigger: REType.TriggerStruct = {
        op: 1,
        param: "0x000000000000000000000000000000000000000000000000000000000000acde",
        value: 1000
      }

      const action: REType.ActionStruct = {
        action: "swapUni",
        data: "0x000000000000000000000000000000000000000000000000000000000000acde",
        fromToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979",
        minTokenAmount: 1,
        totalCollateralAmount: 1,
        toToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979"
      };

      await ruleExecutor.connect(otherAccount).addRule(trigger, action);

    });

  });



    // describe("Events", function () {
    //   it("Should emit an event on withdrawals", async function () {
    //     const { lock, unlockTime, lockedAmount } = await loadFixture(
    //       deployOneYearLockFixture
    //     );

    //     await time.increaseTo(unlockTime);

    //     await expect(lock.withdraw())
    //       .to.emit(lock, "Withdrawal")
    //       .withArgs(lockedAmount, anyValue); // We accept any value as `when` arg
    //   });
    // });

    // describe("Transfers", function () {
    //   it("Should transfer the funds to the owner", async function () {
    //     const { lock, unlockTime, lockedAmount, owner } = await loadFixture(
    //       deployOneYearLockFixture
    //     );

    //     await time.increaseTo(unlockTime);

    //     await expect(lock.withdraw()).to.changeEtherBalances(
    //       [owner, lock],
    //       [lockedAmount, -lockedAmount]
    //     );
    //   });
    // });  
});
