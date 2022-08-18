import { ethers } from "hardhat";
import { TriggerStruct, ActionStruct, RuleExecutor } from '../typechain-types/contracts/rules/RuleExecutor';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, Bytes, BigNumber } from "ethers";
import {GT, ERC20_DECIMALS, UNI_PRICE_IN_ETH, UNI_PRICE_IN_ETH_PARAM, DEFAULT_REWARD, ETH_PRICE_IN_USD, PRICE_TRIGGER_DECIMALS, UNI_PRICE_IN_USD }  from "./Constants"; 

export async function deployTestTokens() {
    const TestToken = await ethers.getContractFactory("TestToken");
    const testToken1 = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "Test1", "TST1");
    const testToken2 = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "Test2", "TST2");
    const WETH = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "WETH", "WETH");
    return {testToken1, testToken2, WETH} ; 
}

export function makePassingTrigger(triggerContract: string): TriggerStruct {
    return {
      op: GT,
      param: UNI_PRICE_IN_ETH_PARAM,
      callee: triggerContract,
      value: UNI_PRICE_IN_ETH.sub(1)
    };
  }
  
  export function makeFailingTrigger(triggerContract: string): TriggerStruct {
    return {
      op: GT,
      param: UNI_PRICE_IN_ETH_PARAM,
      callee: triggerContract,
      value: UNI_PRICE_IN_ETH.add(1)
    };
  }
  
  export function makeSwapAction(swapContract: string,
    inputToken: string = ethers.constants.AddressZero,
    outputToken: string = ethers.constants.AddressZero): ActionStruct {
    return {
      callee: swapContract,
      data: "0x0000000000000000000000000000000000000000000000000000000000000000",
      inputToken: inputToken, // eth
      outputToken: outputToken
    };
  
  }
  
  export async function createRule(_whitelistService: Contract, trigWlHash: Bytes, actWlHash: Bytes, _ruleExecutor: Contract, triggers: TriggerStruct[],
    actions: ActionStruct[], wallet: SignerWithAddress, activate: boolean = false): Promise<string> {
    triggers.map(t => _whitelistService.addToWhitelist(trigWlHash, t.callee));
    actions.map(a => _whitelistService.addToWhitelist(actWlHash, a.callee));
  
    // send 1 eth as reward.
    const tx = await _ruleExecutor.connect(wallet).createRule(triggers, actions, { value: DEFAULT_REWARD });
    const receipt2 = await tx.wait();
  
    const ruleHash = receipt2.events?.find(((x: { event: string; }) => x.event == "Created"))?.args?.ruleHash
    if (activate) {
      const tx2 = await _ruleExecutor.connect(wallet).activateRule(ruleHash);
      await tx2.wait();
    }
  
    return ruleHash;
  
  }

  async function deployTestOracle() {
    const [ownerWallet ] = await ethers.getSigners();

    const TestOracle = await ethers.getContractFactory("TestOracle");
    const testOracleEth = await TestOracle.deploy(ETH_PRICE_IN_USD);
    const testOracleUni = await TestOracle.deploy(UNI_PRICE_IN_USD);
    return {testOracleEth, testOracleUni, ownerWallet }; 
  }

  export async function setupPriceTrigger() {
    const [ownerWallet] = await ethers.getSigners();
    const priceTrigger = await ethers.getContract("PriceTrigger")
    return { priceTrigger, ownerWallet };
  }

  export async function setupEthUniPriceTrigger() {
    const [ownerWallet, otherWallet] = await ethers.getSigners();

    const { priceTrigger } = await setupPriceTrigger();
    const { testOracleUni, testOracleEth } = await deployTestOracle(); 
    await priceTrigger.addPriceFeed("eth", testOracleEth.address);
    await priceTrigger.addPriceFeed("uni", testOracleUni.address);

    return { priceTrigger, testOracleEth, testOracleUni, ownerWallet, otherWallet};
  }

  export async function setupSwapUniSingleAction(testToken: Contract, WETH: Contract) {
    const [ownerWallet, ruleMakerWallet, ruleSubscriberWallet, botWallet, ethFundWallet] = await ethers.getSigners();

    const TestSwapRouter = await ethers.getContractFactory("TestSwapRouter");
    const testSwapRouter = await TestSwapRouter.deploy(WETH.address);

    // this lets us do 10 swaps
    await testToken.transfer(testSwapRouter.address, UNI_PRICE_IN_ETH.div(PRICE_TRIGGER_DECIMALS).mul(10).mul(ERC20_DECIMALS));

    await ethFundWallet.sendTransaction({
      to: testSwapRouter.address,
      value: ethers.utils.parseEther('100'), // send 100 ether
    });

    const swapUniSingleAction = await ethers.getContract("SwapUniSingleAction");
    swapUniSingleAction.changeContractAddresses(testSwapRouter.address, WETH.address); 

    return swapUniSingleAction; 
  }

  export async function getWhitelistService() {
    const [ownerWallet] = await ethers.getSigners();

    // WhitelistService deployment already creates trigWlHash and actWlHash
    // TODO: is that the right approach?
    const whitelistService = await ethers.getContract("WhitelistService");
    const trigWlHash = await whitelistService.getWhitelistHash(ownerWallet.address, "triggers");
    const actWlHash = await whitelistService.getWhitelistHash(ownerWallet.address, "actions");

    return {whitelistService, trigWlHash, actWlHash}; 
    }


  export async function setupRuleExecutor() {
    // Contracts are deployed using the first signer/account by default
    const [ownerWallet, ruleMakerWallet, ruleSubscriberWallet, botWallet, ethFundWallet] = await ethers.getSigners();

    const { testToken1, testToken2, WETH } = await deployTestTokens(); 
    const { testOracleEth, testOracleUni, priceTrigger } = await setupEthUniPriceTrigger();

    const swapUniSingleAction = await setupSwapUniSingleAction(testToken1, WETH); 

    const {whitelistService, trigWlHash, actWlHash} = await getWhitelistService(); 

    const ruleExecutor = await ethers.getContract("RuleExecutor"); 
    

    return {
      ruleExecutor, priceTrigger, swapUniSingleAction, testOracleEth, testOracleUni,
      testToken1, testToken2, WETH, ownerWallet, ruleMakerWallet, ruleSubscriberWallet,
      botWallet, whitelistService, trigWlHash, actWlHash
    };
  }
