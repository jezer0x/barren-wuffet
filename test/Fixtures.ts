import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { TriggerStruct, ActionStruct, RoboCop } from "../typechain-types/contracts/rules/RoboCop";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, Bytes, BigNumber, utils } from "ethers";
import {
  GT,
  ERC20_DECIMALS,
  TST1_PRICE_IN_ETH,
  DEFAULT_REWARD,
  ETH_PRICE_IN_USD,
  PRICE_TRIGGER_DECIMALS,
  TST1_PRICE_IN_USD,
  ETH_PRICE_IN_TST1,
  ETH_ADDRESS,
  PRICE_TRIGGER_TYPE,
  LT,
} from "./Constants";
import { getHashFromEvent, tx } from "./helper";
import { expect } from "chai";

// for caching
var G_TEST_TOKEN_1: Contract;
var G_TEST_TOKEN_2: Contract;
var G_WETH: Contract;
export async function setupTestTokens() {
  if (G_TEST_TOKEN_1 == undefined) {
    const TestToken = await ethers.getContractFactory("TestToken");
    G_TEST_TOKEN_1 = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "Test1", "TST1");
    G_TEST_TOKEN_2 = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "Test2", "TST2");
    G_WETH = await TestToken.deploy(BigNumber.from("1000000").mul(ERC20_DECIMALS), "WETH", "WETH");
  }

  const testToken1 = G_TEST_TOKEN_1;
  const testToken2 = G_TEST_TOKEN_2;
  const WETH = G_WETH;

  return { testToken1, testToken2, WETH };
}

export function makePassingTrigger(triggerContract: string, testToken1: Contract): TriggerStruct {
  return {
    createTimeParams: utils.defaultAbiCoder.encode(
      ["address", "address", "uint8", "uint256"],
      [testToken1.address, ETH_ADDRESS, GT, TST1_PRICE_IN_ETH.sub(1)]
    ),
    triggerType: PRICE_TRIGGER_TYPE,
    callee: triggerContract,
  };
}

export function makeFailingTrigger(triggerContract: string, testToken1: Contract): TriggerStruct {

  return {
    createTimeParams: utils.defaultAbiCoder.encode(
      ["address", "address", "uint8", "uint256"],
      [testToken1.address, ETH_ADDRESS, GT, TST1_PRICE_IN_ETH.add(1)]
    ),
    triggerType: PRICE_TRIGGER_TYPE,
    callee: triggerContract,
  };
}

export function makeSwapAction(
  swapContract: string,
  inputTokens: [string] = [ETH_ADDRESS],
  outputTokens: [string] = [ETH_ADDRESS]
): ActionStruct {
  return {
    callee: swapContract,
    data: "0x0000000000000000000000000000000000000000000000000000000000000000",
    inputTokens: inputTokens, // eth
    outputTokens: outputTokens,
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
  const { testToken1 } = await setupTestTokens();
  const { priceTrigger } = await setupPriceTrigger();
  const { testOracleTst1, testOracleEth } = await deployTestOracle();
  await priceTrigger.addPriceFeed(ETH_ADDRESS, testOracleEth.address);
  await priceTrigger.addPriceFeed(testToken1.address, testOracleTst1.address);

  return { priceTrigger, testOracleEth, testOracleTst1, ownerWallet, otherWallet, testToken1 };
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

  const { testToken1, testToken2, WETH } = await setupTestTokens();
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

export async function setupSwapActions(priceTrigger: Contract, swapUniSingleAction: Contract, testToken1: Contract) {
  const passingETHtoTST1SwapPriceTrigger = {
    createTimeParams: utils.defaultAbiCoder.encode(
      ["address", "address", "uint8", "uint256"],
      [ETH_ADDRESS, testToken1.address, GT, ETH_PRICE_IN_TST1.sub(1)]
    ),
    triggerType: PRICE_TRIGGER_TYPE,
    callee: priceTrigger.address,
  };

  const passingTST1toETHSwapPriceTrigger = {
    createTimeParams: utils.defaultAbiCoder.encode(
      ["address", "address", "uint8", "uint256"],
      [testToken1.address, ETH_ADDRESS, GT, TST1_PRICE_IN_ETH.sub(1)]
    ),
    triggerType: PRICE_TRIGGER_TYPE,
    callee: priceTrigger.address,
  };

  const swapTST1ToETHAction = makeSwapAction(swapUniSingleAction.address, [testToken1.address], [ETH_ADDRESS]);
  const swapETHToTST1Action = makeSwapAction(swapUniSingleAction.address, [ETH_ADDRESS], [testToken1.address]);

  return {
    passingETHtoTST1SwapPriceTrigger,
    passingTST1toETHSwapPriceTrigger,
    swapETHToTST1Action,
    swapTST1ToETHAction,
  };
}
//@ts-ignore
export async function setupSwapTrades(
  priceTrigger: Contract,
  swapUniSingleAction: Contract,
  testToken1: Contract,
  //@ts-ignore
  constraints,
  degenStreet: Contract,
  traderWallet: SignerWithAddress
) {
  const {
    passingETHtoTST1SwapPriceTrigger,
    passingTST1toETHSwapPriceTrigger,
    swapETHToTST1Action,
    swapTST1ToETHAction,
  } = await setupSwapActions(priceTrigger, swapUniSingleAction, testToken1);

  const tx = await degenStreet
    .connect(traderWallet)
    .createTrade([passingTST1toETHSwapPriceTrigger], [swapTST1ToETHAction], constraints, { value: DEFAULT_REWARD });

  const tradeTST1forETHHash: Bytes = await getHashFromEvent(tx, "Created", degenStreet.address, "tradeHash");

  const tx2 = await degenStreet
    .connect(traderWallet)
    .createTrade([passingETHtoTST1SwapPriceTrigger], [swapETHToTST1Action], constraints, { value: DEFAULT_REWARD });

  const tradeETHforTST1Hash: Bytes = await getHashFromEvent(tx2, "Created", degenStreet.address, "tradeHash");

  return {
    tradeETHforTST1Hash,
    tradeTST1forETHHash,
  };
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
  } = await setupRoboCop();

  const barrenWuffet = await ethers.getContract("BarrenWuffet");
  const latestBlock = await time.latest();
  const {
    passingETHtoTST1SwapPriceTrigger,
    passingTST1toETHSwapPriceTrigger,
    swapETHToTST1Action,
    swapTST1ToETHAction,
  } = await setupSwapActions(priceTrigger, swapUniSingleAction, testToken1);

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
    barrenWuffet,
    passingETHtoTST1SwapPriceTrigger,
    passingTST1toETHSwapPriceTrigger,
    swapETHToTST1Action,
    swapTST1ToETHAction,
  };
}
