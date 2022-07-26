import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("RuleExecutor", function () {
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

  describe("Deployment", function () {    

    it("Should set the right owner", async function () {
      const { ruleExecutor, owner } = await loadFixture(deployRuleExecutorFixture);

      expect(await ruleExecutor.owner()).to.equal(owner.address);
    });
  });

  describe("Add Triggers", function () {
    it("Should revert with the right error if called from another account", async function () {
      const { ruleExecutor, owner, otherAccount } = await loadFixture(
        deployRuleExecutorFixture
      );

      // We use lock.connect() to send a transaction from another account
      await expect(ruleExecutor.connect(otherAccount).addTriggerFeed("", "", "", [""])).to.be.revertedWith(
        "You aren't the owner"
      );
    });

    it("Should add a trigger feed if called by the owner", async function () {
      const { ruleExecutor, owner } = await loadFixture(
        deployRuleExecutorFixture
      );
      
      await ruleExecutor.addTriggerFeed("", "", "", [""]);
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
});
