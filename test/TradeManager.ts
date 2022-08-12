import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TriggerStruct, ActionStruct } from '../typechain-types/contracts/RuleExecutor';
import { assert } from "console";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { int } from "hardhat/internal/core/params/argumentTypes";
import { Contract } from "ethers";


const GT = 0;
const LT = 1;

const ETH_PRICE = 1300;
const UNI_PRICE = 3;
const ETH_UNI_PARAM = ethers.utils.defaultAbiCoder.encode(["string", "string"], ["eth", "uni"]);
const ETH_UNI_PRICE = (ETH_PRICE / UNI_PRICE);

const BAD_RULE_HASH = "0x" + "1234".repeat(16);

function makePassingTrigger(triggerContract: string): TriggerStruct {
  return {
    op: GT,
    param: ETH_UNI_PARAM,
    callee: triggerContract,
    value: Math.round(ETH_UNI_PRICE - 1)
  };
}

function makeSwapAction(swapContract: string,
  fromToken: string = ethers.constants.AddressZero,
  toToken: string = ethers.constants.AddressZero): ActionStruct {
  return {
    callee: swapContract,
    data: "0x0000000000000000000000000000000000000000000000000000000000000000",
    fromToken: fromToken, // eth
    toToken: toToken
  };
}

async function createRule(_ruleExecutor: Contract, triggers: TriggerStruct[],
  actions: ActionStruct[], wallet: SignerWithAddress, activate: boolean = false): Promise<string> {
  triggers.map(t => _ruleExecutor.addTriggerToWhitelist(t.callee));
  actions.map(a => _ruleExecutor.addActionToWhitelist(a.callee));

  const tx = await _ruleExecutor.connect(wallet).createRule(triggers, actions);
  const receipt2 = await tx.wait();

  const ruleHash = receipt2.events?.find(((x: { event: string; }) => x.event == "Created"))?.args?.ruleHash
  if (activate) {
    const tx2 = await _ruleExecutor.connect(wallet).activateRule(ruleHash);
    await tx2.wait();
  }
  return ruleHash;
}

describe("TradeManager", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployRuleExecutorFixture() {
    // Contracts are deployed using the first signer/account by default
    const [ownerWallet, traderWallet, tradeSubscriberWallet, someOtherWallet] = await ethers.getSigners();

    const RuleExecutor = await ethers.getContractFactory("RuleExecutor");
    const ruleExecutor = await RuleExecutor.deploy();

    const TestSwapRouter = await ethers.getContractFactory("TestSwapRouter");
    const testSwapRouter = await TestSwapRouter.deploy();

    const TestToken = await ethers.getContractFactory("TestToken");
    const testToken1 = await TestToken.deploy(100000, "Test1", "TST1");
    const testToken2 = await TestToken.deploy(100000, "Test2", "TST2");
    const WETH = await TestToken.deploy(100000, "WETH", "WETH");

    const SwapUniSingleAction = await ethers.getContractFactory("SwapUniSingleAction");

    const swapUniSingleAction = await SwapUniSingleAction.deploy(
      testSwapRouter.address, WETH.address);

    const TestOracle = await ethers.getContractFactory("TestOracle");
    const testOracleEth = await TestOracle.deploy(ETH_PRICE);
    const testOracleUni = await TestOracle.deploy(UNI_PRICE);

    const PriceTrigger = await ethers.getContractFactory("PriceTrigger");
    const priceTrigger = await PriceTrigger.deploy();
    await priceTrigger.addPriceFeed("eth", testOracleEth.address);
    await priceTrigger.addPriceFeed("uni", testOracleUni.address);

    const TradeManager = await ethers.getContractFactory("FundManager");
    const tradeManager = await TradeManager.deploy(ruleExecutor.address); 

    return {
      tradeManager, ruleExecutor, priceTrigger, swapUniSingleAction, testOracleEth, testOracleUni,
      testToken1, testToken2, ownerWallet, traderWallet, tradeSubscriberWallet, someOtherWallet
    };
  }

  describe("Deployment", () => {
    it("Should set the right owner", async function () {
      const { tradeManager, ownerWallet } = await loadFixture(deployRuleExecutorFixture);
      expect(await tradeManager.owner()).to.equal(ownerWallet.address);
    });
  });

  describe("Admin functions", () => {
    it("Owner should be able to X", async function () {});
    it("Others should not be able to X", async function () {});
  });


  describe("Anyone can open a trade", () =>  {
    it("Bad constraints.*TotalCollateral should revert", async function () {});
    it("Bad constraints.*CollateralPerSub should revert", async function () {});
    it("Should emit the Created event properly", async function () {});
    it("Should set the right manager for the trade", async function () {});
    it("Trader can't open duplicate trade in the same block", async function () {}); 
    it("Trader can open duplicate trade in different block", async function () {}); 
  }); 

    describe("Cancelling a Trade", () =>  {
    it("Someone else can't cancel your trade", async function () {});
    it("Manager can cancel trade, emits Cancelled", async function () {});
    it("Trying to cancel a non-existing trade", async function () {});
    it("Manager can't cancel same trade twice", async function () {});
  }); 

  describe("Subscriber depositing", () =>  {
    it("Depositing wrong asset", async function () {});
    it("Depositing too much in a single Sub", async function () {});
    it("Depositing too little in a single Sub", async function () {});
    it("Depositing beyond maxCollateral", async function () {});
    it("Depositing ETH properly, should emit Deposit", async function () {});
    it("Depositing ERC20 properly, should emit Deposit", async function () {});
    it("Multiple subscriptions from same person allowed", async function () {});
    it("Multiple subscriptions from different people allowed", async function () {});
    it("Hitting minCollateral activates rule", async function () {});
  }); 

  describe("Subscriber withdrawing", () =>  {
    it("Withdraw someone else's asset should fail", async function () {});
    it("Withdraw twice should fail", async function () {});
    it("Withdraw before rule is active should give back collateral, should emit withdraw", async function () {});
    it("Withdraw after rule is active should give back collateral", async function () {});
    it("Withdraw after rule is active and totalCollateral falls below min should rule.deactivate", async function () {});
    it("Withdraw after rule is active and totalCollateral falls below min should rule.deactivate", async function () {});
    it("Withdraw after rule.executed should give back output", async function () {});  
  }); 

  // describe("Anyone can open a trade", () =>  {
  //   it("", async function () {});
  //   it("", async function () {});
  // }); 
});
