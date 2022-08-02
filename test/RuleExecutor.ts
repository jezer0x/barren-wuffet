import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { RETypes } from '../typechain-types/contracts/RuleExecutor';
import { RuleExecutor as RuleExecutorType } from '../typechain-types/contracts/RuleExecutor';
import { assert } from "console";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { int } from "hardhat/internal/core/params/argumentTypes";


const GT = 0;
const LT = 1;

const ETH_PRICE = 1300;
const UNI_PRICE = 3;
const ETH_UNI_PARAM = ethers.utils.defaultAbiCoder.encode([ "string", "string" ], [ "eth", "uni" ]);
const ETH_UNI_PRICE = (ETH_PRICE/ UNI_PRICE);

const BAD_RULE_HASH = "0x"+"1234".repeat(16);

const PERMISSIVE_CONSTRAINTS: RuleExecutorType.SubscriptionConstraintsStruct = {
  minCollateralPerSub: 0,
  maxCollateralPerSub:100000000,
  minCollateralTotal: 0,
  maxCollateralTotal: 10000000,
}


function makePassingTrigger(triggerContract: string): RETypes.TriggerStruct {
  return {        
    op: GT,          
    param: ETH_UNI_PARAM,
    callee: triggerContract,
    value: Math.round(ETH_UNI_PRICE - 1)
  };  
}

function makeFailingTrigger(triggerContract: string): RETypes.TriggerStruct {
  return {        
    op: GT,
    param: ETH_UNI_PARAM,
    callee: triggerContract,
    value: Math.round(ETH_UNI_PRICE + 1)
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

async function createRule(_ruleExecutor: RuleExecutorType, trigger: RETypes.TriggerStruct, 
  action: RETypes.ActionStruct, constraints: RuleExecutorType.SubscriptionConstraintsStruct, 
  wallet: SignerWithAddress): Promise<string> {    
  _ruleExecutor.addTriggerToWhitelist(trigger.callee);
  _ruleExecutor.addActionToWhitelist(action.callee);
  
  const tx2 = await _ruleExecutor.connect(wallet).addRule(trigger, action, constraints);
  const receipt2 = await tx2.wait();
  return receipt2.events?.find((x => x.event == "RuleCreated"))?.args?.ruleHash;

}

describe("RuleExecutor", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployRuleExecutorFixture() {
    // Contracts are deployed using the first signer/account by default
    const [ownerWallet, ruleMakerWallet, ruleSubscriberWallet, otherWallet1 ] = await ethers.getSigners();    

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
      testToken1, testToken2, ownerWallet, ruleMakerWallet, ruleSubscriberWallet, otherWallet1 };
  }

  describe("Deployment", () => {    

    it("Should set the right owner", async function () {
      const { ruleExecutor, ownerWallet } = await loadFixture(deployRuleExecutorFixture);

      expect(await ruleExecutor.owner()).to.equal(ownerWallet.address);
    });
  });

  describe("Add Rule By Anyone", () => {    

    it("Should revert if trigger doesnt have a callee with validateTrigger", async () => {
      const { ruleExecutor, swapUniSingleAction, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const badTrigger = makePassingTrigger(ethers.constants.AddressZero); // passing trigger with bad address
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      ruleExecutor.disableTriggerWhitelist();
      ruleExecutor.disableActionWhitelist();
      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(badTrigger, executableAction, PERMISSIVE_CONSTRAINTS)).to.be.revertedWithoutReason();
    });

    it("Should revert if validateTrigger on trigger does not return true", async () => {
      // Use BadPriceTrigger. I am yet not sure what damage this can do, and what protection we should have for this.      
    });

    it.skip("Should revert if validateTrigger on trigger is not a view fn", async () => {
      // Use BadPriceTrigger. I am yet not sure what damage this can do, and what protection we should have for this.

    });

    
    it("Should revert if action doesnt have a callee with validateAction", async () => {
      const { ruleExecutor, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const badAction = makeSwapAction(ethers.constants.AddressZero, testToken1.address);
      ruleExecutor.disableTriggerWhitelist();
      ruleExecutor.disableActionWhitelist();

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(passingTrigger, badAction, PERMISSIVE_CONSTRAINTS)).to.be.revertedWithoutReason();

    });

    it.skip("Should revert if validateAction on action does not return true", async () => {
      
      // KIV This. currently we dont have a situation where the action fails validation.


    });

    it.skip("Should revert if validateAction on action is not a view fn", async () => {
      // KIV. Need to create a bad action. I am yet not sure what damage this can do, and what protection we should have for this.


    });

    it("Should revert if trigger has not been whitelisted", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(passingTrigger, executableAction, PERMISSIVE_CONSTRAINTS)).to.be.revertedWith("Unauthorized trigger");
    });

    it("Should revert if action has not been whitelisted", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makeFailingTrigger(priceTrigger.address); // pass / fail shouldnt matter here
      ruleExecutor.addTriggerToWhitelist(priceTrigger.address);

      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(passingTrigger, executableAction, PERMISSIVE_CONSTRAINTS)).to.be.revertedWith("Unauthorized action");
    });

    it("Should emit RuleCreated event if Trigger and Action are valid", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makeFailingTrigger(priceTrigger.address); // pass / fail shouldnt matter here
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      ruleExecutor.addTriggerToWhitelist(priceTrigger.address);
      ruleExecutor.addActionToWhitelist(swapUniSingleAction.address);

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(
        passingTrigger, executableAction, PERMISSIVE_CONSTRAINTS)).to.emit(ruleExecutor, "RuleCreated")        
          .withArgs(anyValue);
    });

    it("If trigger, action, constrains, user, block are the same, ruleHash should be the same", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, testToken1 } = await loadFixture(deployRuleExecutorFixture);

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      ruleExecutor.addTriggerToWhitelist(priceTrigger.address);
      ruleExecutor.addActionToWhitelist(swapUniSingleAction.address);

      var rule1Hash: string;
      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(
        passingTrigger, executableAction, PERMISSIVE_CONSTRAINTS)).to.emit(ruleExecutor, "RuleCreated")
          .withArgs((_hash: string) => { rule1Hash = _hash; return true; });

      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(
            passingTrigger, executableAction, PERMISSIVE_CONSTRAINTS)).to.emit(ruleExecutor, "RuleCreated")
              .withArgs((_hash2: string) => rule1Hash == _hash2);
    });
    

    it("Should be able to create multiple unique rules with the same trigger, action, constraints and a different user", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, otherWallet1, testToken1, ruleSubscriberWallet } = await loadFixture(deployRuleExecutorFixture);

      const ruleMakerWallet2 = otherWallet1;

      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const executableAction = makeSwapAction(swapUniSingleAction.address, testToken1.address);

      ruleExecutor.addTriggerToWhitelist(priceTrigger.address);
      ruleExecutor.addActionToWhitelist(swapUniSingleAction.address);

      var rule1Hash: string;
      await expect(ruleExecutor.connect(ruleMakerWallet).addRule(
        passingTrigger, executableAction, PERMISSIVE_CONSTRAINTS)).to.emit(ruleExecutor, "RuleCreated")        
          .withArgs((_hash: string) => { rule1Hash = _hash; return true; });

      await expect(ruleExecutor.connect(ruleMakerWallet2).addRule(
            passingTrigger, executableAction, PERMISSIVE_CONSTRAINTS)).to.emit(ruleExecutor, "RuleCreated")
              .withArgs((_hash2: string) => rule1Hash != _hash2);
    });
        
  });
  
  describe("Check Rule", () => {
    it("should return false if the checkTrigger on the rule denoted by ruleHash returns false", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, otherWallet1, testToken1 } = await loadFixture(deployRuleExecutorFixture);
      
      const passingTrigger = makeFailingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, ethers.constants.AddressZero);
      const ruleHash = await createRule(ruleExecutor, passingTrigger, tokenSwapAction, PERMISSIVE_CONSTRAINTS, ruleMakerWallet);
            
      expect(await ruleExecutor.connect(otherWallet1).checkRule(ruleHash)).to.equal(false);
      
    });

    it.skip("should return false if the checkTrigger is not available on the callee", async () => {      
      // WE need to create a Badtrigger for this. 
      // And it's better to test for malicious checkTrigger vs. a non-existent checkTrigger
      // We already check for validateTrigger and revent random addresses from being included      
    });

    it("should return true if the checkTrigger on the callee denoted by ruleHash returns true", async () => {
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, otherWallet1, testToken1 } = await loadFixture(deployRuleExecutorFixture);
      
      const passingTrigger = makePassingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, ethers.constants.AddressZero);
      const ruleHash = await createRule(ruleExecutor, passingTrigger, tokenSwapAction, PERMISSIVE_CONSTRAINTS, ruleMakerWallet);
    
      expect(await ruleExecutor.connect(otherWallet1).checkRule(ruleHash)).to.equal(true);
    });    
  });

  describe("Execute Rule with Failing Trigger", () => {
    it("Should revert if anyone tries to execute the rule, and the trigger fails", async () => {
      // It appears that this rule has to be placed before the deployValidRuleFixture.
      // since it calls the deployRuleExecutorFixture
      // It causes all tests after it to fail, if it is located after tests that use deployValidRuleFixture
      const { ruleExecutor, swapUniSingleAction, priceTrigger, ruleMakerWallet, otherWallet1, testToken1 } = await loadFixture(deployRuleExecutorFixture);
      
      const passingTrigger = makeFailingTrigger(priceTrigger.address);
      const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, ethers.constants.AddressZero);
      const ruleHash = await createRule(ruleExecutor, passingTrigger, tokenSwapAction, PERMISSIVE_CONSTRAINTS, ruleMakerWallet);
            
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHash)).to.be.rejectedWith("Trigger not satisfied");

    });
  });

  async function deployValidRuleFixture() {
    const { ruleExecutor, swapUniSingleAction, priceTrigger, ownerWallet, ruleMakerWallet, ruleSubscriberWallet, otherWallet1, testToken1 } = await loadFixture(deployRuleExecutorFixture);

    const passingTrigger = makePassingTrigger(priceTrigger.address);
    const tokenSwapAction = makeSwapAction(swapUniSingleAction.address, testToken1.address, ethers.constants.AddressZero);
    const ethSwapAction = makeSwapAction(swapUniSingleAction.address, ethers.constants.AddressZero, testToken1.address);

    ruleExecutor.addTriggerToWhitelist(priceTrigger.address);
    ruleExecutor.addActionToWhitelist(swapUniSingleAction.address);

    const constraints = {
      minCollateralPerSub: 10,
      maxCollateralPerSub: 50,
      minCollateralTotal: 12,
      maxCollateralTotal: 90,
    }

    const ruleHashEth = await createRule(ruleExecutor, passingTrigger, ethSwapAction, constraints, ruleMakerWallet);
    const ruleHashToken = await createRule(ruleExecutor, passingTrigger, tokenSwapAction, constraints, ruleMakerWallet);
    
    await testToken1.transfer(ruleSubscriberWallet.address, 200);    
    return { ruleHashEth, ruleHashToken, ruleExecutor, ownerWallet, ruleSubscriberWallet, otherWallet1, testToken1 };

  }

  describe("Subscribe to Rule", function() {      

    it("should revert if ruleHash doesnt exist", async  () => { 
      const { ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);
      await expect(ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(BAD_RULE_HASH,  ethers.constants.AddressZero, 1000)).to.be.revertedWithoutReason;
    });

    it("should not allow subscribing to a rule, if collateral is provided in the wrong token", async  () => {
      const { ruleHashEth, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      
      await expect(ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashEth, testToken1.address, 12)).to.be.revertedWith("Wrong Collateral Type");
      
    });

    it("should not allow subscribing to a rule, if atleast min collateral is not specified (ERC20)", async  () => {
      const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      
      await expect(ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 9)).to.be.revertedWith("Insufficient Collateral for Subscription");

    });

    it("should not allow subscribing to a rule, if atleast min collateral is not provided (native)", async  () => {
      const { ruleHashEth, ruleSubscriberWallet, ruleExecutor } = await loadFixture(deployValidRuleFixture);                
      await expect(ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashEth, ethers.constants.AddressZero, 9, { value: 9 })).to.be.revertedWith("Insufficient Collateral for Subscription");
      
    });

    it("should not allow subscribing to a rule, if more than max collateral is provided", async  () => {
      const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      
      await expect(ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 51)).to.be.revertedWith("Max Collateral for Subscription exceeded");
            
    });    

    it("should not allow subscribing to a rule, if ERC20 collateral could not be transferred", async  () => {
      const { ruleHashToken, ruleExecutor, otherWallet1, testToken1 } = await loadFixture(deployValidRuleFixture);    
      // not approved
      await expect(ruleExecutor.connect(otherWallet1).subscribeToRule(ruleHashToken, testToken1.address, 45)).to.be.revertedWithoutReason;
      await testToken1.connect(otherWallet1).approve(ruleExecutor.address, 45);
      // no balance
      await expect(ruleExecutor.connect(otherWallet1).subscribeToRule(ruleHashToken, testToken1.address, 45)).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });
    
    
    it("should allow subscribing to rule created by anyone, if collateral is provided is provided in the correct range (ERC20)", async  () => {
      // Subscribed event is created
      // correct collateral amount is transferred
      const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = 49;
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      
      await expect(ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, collateralAmount)).to.emit(ruleExecutor, "Subscribed")
        .withArgs(ruleHashToken, 0).and.changeTokenBalances(testToken1, 
          [ruleSubscriberWallet, ruleExecutor],
          [-collateralAmount, collateralAmount]);
      
    });

    it("should allow subscribing to rule created by anyone, if collateral is provided is provided in the correct range (native)", async  () => {
      // Subscribed event is created
      // collateral is transferred
      const { ruleHashEth, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      const collateralAmount = 10;
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, collateralAmount);
      
      await expect(ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashEth, ethers.constants.AddressZero, collateralAmount, {value: collateralAmount})).to.emit(ruleExecutor, "Subscribed")
        .withArgs(ruleHashEth, 0).and.changeEtherBalances( 
          [ruleSubscriberWallet, ruleExecutor],
          [-collateralAmount, collateralAmount]);
    });

    // Min total collateral is evaluated at the point of execution not while subscribing. So the test is in the ruleExecutor

    it("should not allow subscribing to a rule, if it would make total collateral across subscriptions is more than max collateral", async  () => {
      const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, otherWallet1, testToken1 } = await loadFixture(deployValidRuleFixture);
      const subscriberWallet2 = otherWallet1;
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 45);
      await testToken1.connect(subscriberWallet2).approve(ruleExecutor.address, 46);
      await ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 45);
      await expect(ruleExecutor.connect(subscriberWallet2).subscribeToRule(ruleHashToken, testToken1.address, 46)).to.be.revertedWith("Max Collateral for Rule exceeded");

    });

    it("Should allow the same person to subscribe to the rule multiple times.", async () => {
      // Collateral is different, so it will just execute twice.
      const { ruleHashToken, ruleSubscriberWallet, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 90);
      await ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 45);
      await ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 45);      
    });

  });  

  describe("Execute Rule", () => {
    it("should revert if anyone tries to execute an unknown rule", async  () => {
      const { ruleHashToken, otherWallet1, ruleExecutor } = await loadFixture(deployValidRuleFixture);      
      console.log(ruleHashToken);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(BAD_RULE_HASH)).to.be.rejectedWith("Rule not found!");
    });

    it("should revert if anyone tries to execute the rule, and min total collateral hasnt been added", async  () => {
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      // NO subscribers
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.rejectedWith("Not enough collateral for executing");
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 11);
      await ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 11);
      // 1 subscriber but min collateral not met.
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.rejectedWith("Not enough collateral for executing");
    });    

    it.skip("Should revert if anyone tries to execute the rule, and action fails", async () => {
      // Need to create a dummy action and make it fail
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);      
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.rejectedWith("Action unsuccessful");
    });    

    it("Should allow anyone to execute the rule and get a reward if gas is paid, and the trigger passes", async () => {
      // execute valid rule with collateral by someone else. and get a reward.
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 12);
      await ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 12);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, otherWallet1);
      
      // TODO check that that the swap actually happened      
      // And that the collateral was used up
      // TODO need to implement caller getting paid.    
      // TODO check that the caller didnt get any ETH taken out more than the gas fee.  
    });

    it("Should revert if anyone tries to execute the rule twice without topping up collateral", async () => {
      // we get here by calling a valid rule, using up the collateral and call again.
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 11);
      await ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 6);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, otherWallet1);
      
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.be.revertedWith("Not enough collateral for executing");
          
    });

    it("Should allow a rule to be executed twice if the collateral has been topped up to min threshold", async () => {    
      const { ruleHashToken, ruleSubscriberWallet, otherWallet1, ruleExecutor, testToken1 } = await loadFixture(deployValidRuleFixture);      
      await testToken1.connect(ruleSubscriberWallet).approve(ruleExecutor.address, 25);
      await ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 12);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, otherWallet1);

      await ruleExecutor.connect(ruleSubscriberWallet).subscribeToRule(ruleHashToken, testToken1.address, 13);
      await expect(ruleExecutor.connect(otherWallet1).executeRule(ruleHashToken)).to.emit(ruleExecutor, "Executed")
        .withArgs(ruleHashToken, otherWallet1);
          
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
