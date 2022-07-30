import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { RETypes } from '../typechain-types/contracts/RuleExecutor';
import { RuleExecutor as RuleExecutorType } from '../typechain-types/contracts/RuleExecutor';


const LT = 0;
const GT = 1;
const ETH_PRICE = 100;
const UNI_PRICE = 10;
const ETH_UNI_PARAM = ethers.utils.defaultAbiCoder.encode([ "string", "string" ], [ "eth", "uni" ]);
const ETH_UNI_PRICE = (ETH_PRICE/ UNI_PRICE);

function makePassingTrigger(priceTriggerContract: string): RETypes.TriggerStruct {
  return {        
    op: GT,          
    param: ETH_UNI_PARAM,
    callee: priceTriggerContract,
    value: (ETH_UNI_PRICE - 1)
  };
}

function makeFailingTrigger(triggerContract: string): RETypes.TriggerStruct {
  return {        
    op: GT,          
    param: ETH_UNI_PARAM,
    callee: triggerContract,
    value: (ETH_UNI_PRICE - 1)
  };
}

function makeSwapAction(swapContract: string, 
  fromToken: string = ethers.constants.AddressZero, 
  toToken: string = ethers.constants.AddressZero): RETypes.ActionStruct {
  return {      
    callee: swapContract,
    data: "0x0000000000000000000000000000000000000000000000000000000000000000",
    fromToken: fromToken, // eth
    toToken: toToken
  };
  
}

describe("RuleExecutor", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployRuleExecutorFixture() {
    // Contracts are deployed using the first signer/account by default
    const [ownerWallet, ruleMakerWallet, ruleSubscriberWallet] = await ethers.getSigners();    

    const RuleExecutor = await ethers.getContractFactory("RuleExecutor");
    const ruleExecutor = await RuleExecutor.deploy();

    const SwapUniSingleAction = await ethers.getContractFactory("SwapUniSingleAction");
    const swapUniSingleAction = await SwapUniSingleAction.deploy();
    
    const TestOracle = await ethers.getContractFactory("TestOracle");
    const testOracleEth = await TestOracle.deploy(ETH_PRICE);
    const testOracleUni = await TestOracle.deploy(UNI_PRICE);

    const PriceTrigger = await ethers.getContractFactory("PriceTrigger");
    const priceTrigger = await PriceTrigger.deploy();
    await priceTrigger.addPriceFeed("eth", testOracleEth.address);
    await priceTrigger.addPriceFeed("uni", testOracleUni.address);


    const TestToken = await ethers.getContractFactory("TestToken");
    const testToken1 = await TestToken.deploy(100000, "Test1", "TST1");
    const testToken2 = await TestToken.deploy(100000, "Test2", "TST2");
    
    return { ruleExecutor,  priceTrigger, swapUniSingleAction, testOracleEth, testOracleUni, 
      testToken1, testToken2, ownerWallet, ruleMakerWallet, ruleSubscriberWallet };
  }

  describe("Deployment", () => {    

    it("Should set the right owner", async function () {
      const { ruleExecutor, ownerWallet } = await loadFixture(deployRuleExecutorFixture);

      expect(await ruleExecutor.owner()).to.equal(ownerWallet.address);
    });
  });

  describe("Add Rule By Anyone", () => {
    
    
    const permissiveConstraints: RuleExecutorType.SubscriptionConstraintsStruct = {
      minCollateralPerSub: 0,
      maxCollateralTotal: 10000000,
    }

    it("Should revert if trigger doesnt have a callee with validateTrigger", async () => {
      const { ruleExecutor, swapUniSingleAction, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const badTrigger = makePassingTrigger(ethers.constants.AddressZero); // passing trigger with bad address
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      ruleExecutor.disableTriggerWhitelist();
      ruleExecutor.disableActionWhitelist();
      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(badTrigger, executableAction, permissiveConstraints)).to.be.revertedWithoutReason();
    });

    it("Should revert if validateTrigger on trigger does not return true", async () => {
      // Use BadPriceTrigger. I am yet not sure what damage this can do, and what protection we should have for this.      
    });

    it.skip("Should revert if validateTrigger on trigger is not a view fn", async () => {
      // Use BadPriceTrigger. I am yet not sure what damage this can do, and what protection we should have for this.

    });

    
    it("Should revert if action doesnt have a callee with validateAction", async () => {
      const { ruleExecutor, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address); // passing trigger with bad address
      const badAction = makeSwapAction(ethers.constants.AddressZero, testToken1.address);
      ruleExecutor.disableTriggerWhitelist();
      ruleExecutor.disableActionWhitelist();

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(passingTrigger, badAction, permissiveConstraints)).to.be.revertedWithoutReason();

    });

    it.skip("Should revert if validateAction on action does not return true", async () => {
      
      // KIV This. currently we dont have a situation where the action fails validation.


    });

    it.skip("Should revert if validateAction on action is not a view fn", async () => {
      // KIV. Need to create a bad action. I am yet not sure what damage this can do, and what protection we should have for this.


    });

    it("Should revert if trigger has not been whitelisted", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address); // passing trigger with bad address
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(passingTrigger, executableAction, permissiveConstraints)).to.be.revertedWith("Unauthorized trigger");
    });

    it("Should revert if action has not been whitelisted", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address); // passing trigger with bad address
      ruleExecutor.addTriggerToWhitelist(priceTrigger.address);

      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(passingTrigger, executableAction, permissiveConstraints)).to.be.revertedWith("Unauthorized action");
    });

    it("Should emit RuleCreated event if Trigger and Action are valid", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address); // passing trigger with bad address
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);
      const rule = {
        trigger: passingTrigger,
        action: executableAction,
        status: 2,
        outputAmount: 0
      }
      ruleExecutor.addTriggerToWhitelist(priceTrigger.address);
      ruleExecutor.addActionToWhitelist(swapUniSingleAction.address);

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(
        passingTrigger, executableAction, permissiveConstraints)).to.emit(ruleExecutor, "RuleCreated")        
          .withArgs(anyValue, (_rule: []) => {
            console.log(_rule);
          }); // We accept any value as `when` arg

    });
    
  });

  describe.skip("Subscribe to Rule", function() {  
    it("should not allow subscribing to a rule, if insufficient collateral is provided", async  () => {

    });
    
    it("should allow subscribing to rule created by anyone, if exact or excess collateral is provided", async  () => {
      // Subscribed event is created
      // collateral is transferred

    });

  });

  describe.skip("Check Rule", () => {
    it("should return true if the checkTrigger on the callee denoted by ruleHash returns true", async () => {

    });

    it("should return false if the checkTrigger on the callee denoted by ruleHash returns false", async () => {

    });

    it("should return false if the checkTrigger is not available on the callee", async () => {

    });

  });

  describe.skip("Execute Rule", () => {
    it("Should revert if anyone tries to execute the rule, and the trigger is invalid", async () => {

    });

    it("Should allow anyone to execute the rule and get a reward if gas is paid, and the trigger is valid", async () => {
      // execute valid rule with collateral by someone else. and get a reward.      

    });

    it("Should revert if anyone tries to execute the rule, and the collateral isnt sufficient", async () => {
      // we get here by calling a valid rule, using up the collateral and call again.
      

    });
  });

  describe.skip("Redeem Balance", () => {
    it("should allow redeeming all the collateral provided if the rule is not yet executed", async () => {

    });

    it("should not allow redeeming collateral if no collateral has been provided by the redeemer", async () => {
      // provide collateral by someone else.
    });

    it("should not allow redeeming collateral if the rule was executed and used the collateral", async () => {

    });

    it("should allow redeeming collateral if the rule returned other assets", async () => {

    });

  });
    
});
