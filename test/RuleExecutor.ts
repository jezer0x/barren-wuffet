import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { RuleExecutor as REType } from '../typechain-types/contracts/RuleExecutor';


function createRuleHash(trigger: REType.TriggerStruct, action: REType.ActionStruct) {
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
    ["uint", "bytes", "uint", "string", "bytes", "address", "uint"],
    [trigger.op, trigger.param, trigger.value, action.action, action.data, action.fromToken, action.minTokenAmount]));
}

const LT = 0;
const GT = 1;
const ETH_PRICE = 100;
const UNI_PRICE = 10;

describe("RuleExecutor", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployRuleExecutorFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const RuleExecutor = await ethers.getContractFactory("RuleExecutor");
    const ruleExecutor = await RuleExecutor.deploy();

    const TestOracle = await ethers.getContractFactory("TestOracle");
    const testOracleEth = await TestOracle.deploy(ETH_PRICE);
    const testOracleUni = await TestOracle.deploy(UNI_PRICE);
    return { ruleExecutor, testOracleEth, testOracleUni, owner, otherAccount };
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
    const validTrigger: REType.TriggerStruct = {
      op: 1,
      // TODO trigger requires 2 assets. this doesnt fit here.
      param: ethers.utils.defaultAbiCoder.encode([ "string", "string" ], [ "eth", "uni" ]),
      value: 1000
    }

    it("Should not allow adding a rule, where the trigger is not a whitelisted item", async () =>{
      const { ruleExecutor, otherAccount } = await loadFixture(
        deployRuleExecutorFixture
      );            
      
      const trigger: REType.TriggerStruct = {
        op: 0,
        param: ethers.utils.defaultAbiCoder.encode([ "string", "string" ], [ "0x0", "0x0" ]),
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

      await expect(ruleExecutor.connect(otherAccount).addRule(trigger, action)).to.be.revertedWith(
        "unauthorized trigger"
      );      

    });
    it("Should not allow adding a rule, with a valid trigger where the action is not a whitelisted item", async () =>{
      const { ruleExecutor, owner, otherAccount } = await loadFixture(
        deployRuleExecutorFixture
      );
      
      // Add trigger feeds with valid wallets.
      await ruleExecutor.addTriggerFeed("eth", ethers.Wallet.createRandom().address, "0x616d4bcd", []);
      await ruleExecutor.addTriggerFeed("uni", ethers.Wallet.createRandom().address, "0x616d4bcd", []);      

      const action: REType.ActionStruct = {
        action: "backflip",
        data: "0x000000000000000000000000000000000000000000000000000000000000acde",
        fromToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979",
        minTokenAmount: 1,
        // this field indicates the total collateral attributed to this action.
        // we shouldnt be passing this here.
        totalCollateralAmount: 0, 
        toToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979"
      };

      await expect(ruleExecutor.connect(otherAccount).addRule(validTrigger, action)).to.be.revertedWith(
        "Action not supported"
      );
    });

    it("Should allow adding a rule, for all whitelisted triggers and actions", async () =>{
      const { ruleExecutor, otherAccount } = await loadFixture(
        deployRuleExecutorFixture
      );

      await ruleExecutor.addTriggerFeed("eth", ethers.Wallet.createRandom().address, "0x616d4bcd", []); 
      await ruleExecutor.addTriggerFeed("uni", ethers.Wallet.createRandom().address, "0x616d4bcd", []);          
      

      await ruleExecutor.connect(otherAccount).addRule(validTrigger, {
        action: "swapUni",
        data: "0x000000000000000000000000000000000000000000000000000000000000acde",
        fromToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979",
        minTokenAmount: 1,
        // this field indicates the total collateral attributed to this action.
        // we shouldnt be passing this here.
        totalCollateralAmount: 0, 
        toToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979"
      });
      
      await ruleExecutor.connect(otherAccount).addRule(validTrigger, {
        action: "swapSushi",
        data: "0x000000000000000000000000000000000000000000000000000000000000acde",
        fromToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979",
        minTokenAmount: 1,
        // this field indicates the total collateral attributed to this action.
        // we shouldnt be passing this here.
        totalCollateralAmount: 0, 
        toToken: "0xc0ffee254729296a45a3885639AC7E10F9d54979"
      });

    });

  });
});