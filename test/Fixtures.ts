import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { TriggerStruct, ActionStruct, RoboCop } from "../typechain-types/contracts/rules/RoboCop";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, Bytes, BigNumber } from "ethers";
import {
  GT,
  ERC20_DECIMALS,
  TST1_PRICE_IN_ETH,
  TST1_PRICE_IN_ETH_PARAM,
  DEFAULT_REWARD,
  ETH_PRICE_IN_USD,
  PRICE_TRIGGER_DECIMALS,
  TST1_PRICE_IN_USD,
  ETH_PRICE_IN_TST1,
  ETH_PRICE_IN_TST1_PARAM,
} from "./Constants";
import { getHashFromEvent, tx } from "./helper";
import { expect } from "chai";

export async function deployTestTokens() {
  const TestToken = await ethers.getContractFactory("TestToken");
  const testToken1 = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "Test1", "TST1");
  const testToken2 = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "Test2", "TST2");
  const WETH = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "WETH", "WETH");
  return { testToken1, testToken2, WETH };
}

export function makePassingTrigger(triggerContract: string): TriggerStruct {
  return {
    op: GT,
    param: TST1_PRICE_IN_ETH_PARAM,
    callee: triggerContract,
    value: TST1_PRICE_IN_ETH.sub(1),
  };
}

export function makeFailingTrigger(triggerContract: string): TriggerStruct {
  return {
    op: GT,
    param: TST1_PRICE_IN_ETH_PARAM,
    callee: triggerContract,
    value: TST1_PRICE_IN_ETH.add(1),
  };
}

export function makeSwapAction(
  swapContract: string,
  inputToken: string = ethers.constants.AddressZero,
  outputToken: string = ethers.constants.AddressZero
): ActionStruct {
  return {
    callee: swapContract,
    data: "0x0000000000000000000000000000000000000000000000000000000000000000",
    inputToken: inputToken, // eth
    outputToken: outputToken,
  };
}

export async function createRule(
  _whitelistService: Contract,
  trigWlHash: Bytes,
  actWlHash: Bytes,
  _roboCop: Contract,
  triggers: TriggerStruct[],
  actions: ActionStruct[],
  wallet: SignerWithAddress,
  activate: boolean = false
): Promise<string> {
  triggers.map((t) => _whitelistService.addToWhitelist(trigWlHash, t.callee));
  actions.map((a) => _whitelistService.addToWhitelist(actWlHash, a.callee));

  const p = _roboCop.connect(wallet).createRule(triggers, actions, { value: DEFAULT_REWARD });
  // send 1 eth as reward.
  const ruleHash = getHashFromEvent(
    _roboCop.connect(wallet).createRule(triggers, actions, { value: DEFAULT_REWARD }),
    "Created",
    _roboCop.address,
    "ruleHash"
  );

  if (activate) {
    await tx(_roboCop.connect(wallet).activateRule(ruleHash));
  }

  return ruleHash;
}

export function expectEthersObjDeepEqual(_expectedResult: Array<any> & object, _actualResult: Array<any> & object) {
  Object.entries(_expectedResult).map(([k, v]) => {
    // @ts-ignore
    const actualObj: any = _actualResult[k];

    if (v !== null && typeof v === "object") {
      if (Object.keys(actualObj).length === actualObj.length) {
        // a normal array
        v.map((_vItem: any, _i: number) => expectEthersObjDeepEqual(_vItem, actualObj[_i]));
        return;
      } else if (Object.keys(actualObj).length === actualObj.length * 2) {
        // ethers object-array hybrid
        expectEthersObjDeepEqual(v, actualObj);
        return;
      }
    }
    expect(actualObj).to.be.deep.equal(v);
  });
}

async function deployTestOracle() {
  const [ownerWallet] = await ethers.getSigners();

  const TestOracle = await ethers.getContractFactory("TestOracle");
  const testOracleEth = await TestOracle.deploy(ETH_PRICE_IN_USD);
  const testOracleTst1 = await TestOracle.deploy(TST1_PRICE_IN_USD);
  return { testOracleEth, testOracleTst1, ownerWallet };
}

export async function setupPriceTrigger() {
  const [ownerWallet] = await ethers.getSigners();
  const priceTrigger = await ethers.getContract("PriceTrigger");
  return { priceTrigger, ownerWallet };
}

export async function setupEthToTst1PriceTrigger() {
  const [ownerWallet, otherWallet] = await ethers.getSigners();

  const { priceTrigger } = await setupPriceTrigger();
  const { testOracleTst1, testOracleEth } = await deployTestOracle();
  await priceTrigger.addPriceFeed("eth", testOracleEth.address);
  await priceTrigger.addPriceFeed("tst1", testOracleTst1.address);

  return { priceTrigger, testOracleEth, testOracleTst1, ownerWallet, otherWallet };
}

export async function setupSwapUniSingleAction(testToken: Contract, WETH: Contract) {
  const [ownerWallet, ruleMakerWallet, ruleSubscriberWallet, botWallet, ethFundWallet] = await ethers.getSigners();

  const TestSwapRouter = await ethers.getContractFactory("TestSwapRouter");
  const testSwapRouter = await TestSwapRouter.deploy(WETH.address);

  // this lets us do 500 swaps of 2 eth each
  await testToken.transfer(
    testSwapRouter.address,
    ETH_PRICE_IN_TST1.mul(1000).mul(ERC20_DECIMALS).div(PRICE_TRIGGER_DECIMALS)
  );

  await ethFundWallet.sendTransaction({
    to: testSwapRouter.address,
    value: ethers.utils.parseEther("100"), // send 100 ether
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

  return { whitelistService, trigWlHash, actWlHash };
}

export async function setupRoboCop() {
  // Contracts are deployed using the first signer/account by default
  const [ownerWallet, ruleMakerWallet, ruleSubscriberWallet, botWallet, ethFundWallet] = await ethers.getSigners();

  const { testToken1, testToken2, WETH } = await deployTestTokens();
  const { testOracleEth, testOracleTst1, priceTrigger } = await setupEthToTst1PriceTrigger();

  const swapUniSingleAction = await setupSwapUniSingleAction(testToken1, WETH);

  const { whitelistService, trigWlHash, actWlHash } = await getWhitelistService();

  const roboCop = await ethers.getContract("RoboCop");
  return {
    roboCop,
    priceTrigger,
    swapUniSingleAction,
    testOracleEth,
    testOracleTst1,
    testToken1,
    testToken2,
    WETH,
    ownerWallet,
    ruleMakerWallet,
    ruleSubscriberWallet,
    botWallet,
    whitelistService,
    trigWlHash,
    actWlHash,
  };
}
export async function setupDegenStreet() {
  const [ownerWallet, traderWallet, tradeSubscriberWallet, someOtherWallet] = await ethers.getSigners();

  const {
    roboCop,
    priceTrigger,
    swapUniSingleAction,
    testOracleEth,
    testOracleTst1,
    testToken1,
    testToken2,
    whitelistService,
    trigWlHash,
    actWlHash,
    botWallet,
  } = await setupRoboCop();
  const degenStreet = await ethers.getContract("DegenStreet");

  return {
    roboCop,
    priceTrigger,
    swapUniSingleAction,
    testOracleEth,
    testOracleTst1,
    testToken1,
    testToken2,
    ownerWallet,
    traderWallet,
    tradeSubscriberWallet,
    someOtherWallet,
    whitelistService,
    trigWlHash,
    actWlHash,
    degenStreet,
    botWallet,
  };
}

//@ts-ignore
export async function setupSwapTrades(priceTrigger, swapUniSingleAction, testToken1,
  //@ts-ignore
  constraints, degenStreet, traderWallet) {

  const ETHtoTST1SwapPriceTrigger = {
    op: GT,
    param: ETH_PRICE_IN_TST1_PARAM,
    callee: priceTrigger.address,
    value: ETH_PRICE_IN_TST1.sub(1),
  };

  const TST1toETHSwapPriceTrigger = {
    op: GT,
    param: TST1_PRICE_IN_ETH_PARAM,
    callee: priceTrigger.address,
    value: TST1_PRICE_IN_ETH.sub(1),
  };

  const swapTST1ToETHAction = makeSwapAction(
    swapUniSingleAction.address,
    testToken1.address,
    ethers.constants.AddressZero
  );

  const swapETHToTST1Action = makeSwapAction(
    swapUniSingleAction.address,
    ethers.constants.AddressZero,
    testToken1.address
  );

  const tx = await degenStreet
    .connect(traderWallet)
    .createTrade([TST1toETHSwapPriceTrigger], [swapTST1ToETHAction], constraints, { value: DEFAULT_REWARD });

  const tradeTST1forETHHash: Bytes = await getHashFromEvent(tx, "Created", degenStreet.address, "tradeHash");

  const tx2 = await degenStreet
    .connect(traderWallet)
    .createTrade([ETHtoTST1SwapPriceTrigger], [swapETHToTST1Action], constraints, { value: DEFAULT_REWARD });

  const tradeETHforTST1Hash: Bytes = await getHashFromEvent(tx2, "Created", degenStreet.address, "tradeHash");

  return {
    tradeETHforTST1Hash,
    tradeTST1forETHHash
  }
}

export async function setupBarrenWuffet() {
  // these wallets maybe reused to create trader / rule executor.
  // which shouldnt be a problem
  const [ownerWallet, marlieChungerWallet, fairyLinkWallet, fundSubscriberWallet, fundSubscriber2Wallet, botWallet] =
    await ethers.getSigners();

  const {
    roboCop,
    priceTrigger,
    swapUniSingleAction,
    testOracleEth,
    testOracleTst1,
    testToken1,
    testToken2,
    whitelistService,
    trigWlHash,
    actWlHash,
    degenStreet,
  } = await setupDegenStreet();

  const barrenWuffet = await ethers.getContract("BarrenWuffet");
  const latestBlock = await time.latest();
  const {
    tradeTST1forETHHash,
    tradeETHforTST1Hash,
  } = await setupSwapTrades(
    priceTrigger, swapUniSingleAction, testToken1, {
    minCollateralPerSub: BigNumber.from(0),
    maxCollateralPerSub: BigNumber.from(1000).mul(ERC20_DECIMALS),
    minCollateralTotal: BigNumber.from(0),
    maxCollateralTotal: BigNumber.from(1000).mul(ERC20_DECIMALS),
    deadline: latestBlock + 60,
    lockin: latestBlock + 61,
    rewardPercentage: 10,
  },
    degenStreet, marlieChungerWallet
  )

  return {
    ownerWallet,
    roboCop,
    priceTrigger,
    swapUniSingleAction,
    testOracleEth,
    testOracleTst1,
    testToken1,
    testToken2,
    marlieChungerWallet,
    fairyLinkWallet,
    fundSubscriberWallet,
    fundSubscriber2Wallet,
    botWallet,
    whitelistService,
    trigWlHash,
    actWlHash,
    degenStreet,
    barrenWuffet,
    tradeTST1forETHHash,
    tradeETHforTST1Hash
  };
}
