import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { TriggerStruct, ActionStruct, RoboCop } from "../typechain-types/contracts/rules/RoboCop";
import { Fund } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, Bytes, BigNumber, utils } from "ethers";
import {
  GT,
  ERC20_DECIMALS,
  TST1_PRICE_IN_ETH,
  DEFAULT_INCENTIVE,
  ETH_PRICE_IN_USD,
  PRICE_TRIGGER_DECIMALS,
  TST1_PRICE_IN_USD,
  ETH_PRICE_IN_TST1,
  ETH_ADDRESS,
  PRICE_TRIGGER_TYPE,
  LT,
  TOKEN_TYPE,
} from "./Constants";
import { getAddressFromEvent, getHashFromEvent, tx } from "./helper";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export async function setupTestTokens() {
  return {
    testToken1: await ethers.getContract("TestToken1"),
    testToken2: await ethers.getContract("TestToken2"),
    WETH: await ethers.getContract("WETH"),
  };
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
    inputTokens: inputTokens.map((addr) => ({
      t: addr === ETH_ADDRESS ? TOKEN_TYPE.NATIVE : TOKEN_TYPE.ERC20,
      addr: addr,
    })), // eth
    outputTokens: outputTokens.map((addr) => ({
      t: addr === ETH_ADDRESS ? TOKEN_TYPE.NATIVE : TOKEN_TYPE.ERC20,
      addr: addr,
    })),
  };
}

async function makeSubConstraints() {
  const latestTime = await time.latest();
  return {
    minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
    minCollateralTotal: BigNumber.from(200).mul(ERC20_DECIMALS),
    maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
    deadline: latestTime + 86400,
    lockin: latestTime + 86400 * 10,
    subscriberToManagerFeePercentage: 100,
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

  const p = _roboCop.connect(wallet).createRule(triggers, actions, { value: DEFAULT_INCENTIVE });
  // send 1 eth as incentive.
  const ruleHash = getHashFromEvent(
    _roboCop.connect(wallet).createRule(triggers, actions, { value: DEFAULT_INCENTIVE }),
    "Created",
    _roboCop,
    "ruleHash"
  );

  if (activate) {
    await tx(_roboCop.connect(wallet).activateRule(ruleHash));
  }

  return ruleHash;
}

async function deployTestOracle() {
  return {
    testOracleEth: await ethers.getContract("TestOracleEth"),
    testOracleTst1: await ethers.getContract("TestOracleTst1"),
  };
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

  const testSwapRouter = await ethers.getContract("TestSwapRouter");

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

export async function setupRoboCop(hre: HardhatRuntimeEnvironment) {
  const { testToken1, testToken2, WETH } = await setupTestTokens();
  const { testOracleEth, testOracleTst1, priceTrigger } = await setupEthToTst1PriceTrigger();
  const swapUniSingleAction = await setupSwapUniSingleAction(testToken1, WETH);
  const { whitelistService, trigWlHash, actWlHash } = await getWhitelistService();

  const { ruleMaker, ruleSubscriber, bot, deployer } = await hre.getNamedAccounts();
  const ruleMakerWallet = await ethers.getSigner(ruleMaker);
  const ruleSubscriberWallet = await ethers.getSigner(ruleSubscriber);
  const botWallet = await ethers.getSigner(bot);
  const deployerWallet = await ethers.getSigner(deployer);

  const roboCopFactoryDeployer = await ethers.getContract("RoboCopFactory", deployer);
  const roboCopAddr = await getAddressFromEvent(
    roboCopFactoryDeployer.createRoboCop(),
    "Created",
    roboCopFactoryDeployer.address
  );

  const roboCop = await ethers.getContractAt("RoboCop", roboCopAddr);

  return {
    roboCop,
    priceTrigger,
    swapUniSingleAction,
    testOracleEth,
    testOracleTst1,
    testToken1,
    testToken2,
    WETH,
    deployerWallet,
    whitelistService,
    trigWlHash,
    actWlHash,
    ruleMakerWallet,
    ruleSubscriberWallet,
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
    .createTrade([passingTST1toETHSwapPriceTrigger], [swapTST1ToETHAction], constraints, { value: DEFAULT_INCENTIVE });

  const tradeTST1forETHHash: Bytes = await getHashFromEvent(tx, "Created", degenStreet, "tradeHash");

  const tx2 = await degenStreet
    .connect(traderWallet)
    .createTrade([passingETHtoTST1SwapPriceTrigger], [swapETHToTST1Action], constraints, { value: DEFAULT_INCENTIVE });

  const tradeETHforTST1Hash: Bytes = await getHashFromEvent(tx2, "Created", degenStreet, "tradeHash");

  return {
    tradeETHforTST1Hash,
    tradeTST1forETHHash,
  };
}

export async function setupBarrenWuffet({ getNamedAccounts, ethers }: HardhatRuntimeEnvironment) {
  // these wallets maybe reused to create trader / rule executor.
  // which shouldnt be a problem
  // Contracts are deployed using the first signer/account by default
  // const [ownerWallet, marlieChungerWallet, fairyLinkWallet, fundSubscriberWallet, fundSubscriber2Wallet, botWallet] =

  const { ownerWallet, marlieChunger, fairyLink } = await getNamedAccounts();

  const { testToken1, testToken2, WETH } = await setupTestTokens();
  const { testOracleEth, testOracleTst1, priceTrigger } = await setupEthToTst1PriceTrigger();
  const swapUniSingleAction = await setupSwapUniSingleAction(testToken1, WETH);
  const { whitelistService, trigWlHash, actWlHash } = await getWhitelistService();

  const barrenWuffet = await ethers.getContract("BarrenWuffet");
  const barrenWuffetMarlie = await ethers.getContract("BarrenWuffet", marlieChunger);

  const {
    passingETHtoTST1SwapPriceTrigger,
    passingTST1toETHSwapPriceTrigger,
    swapETHToTST1Action,
    swapTST1ToETHAction,
  } = await setupSwapActions(priceTrigger, swapUniSingleAction, testToken1);

  const marlieChungerFundAddr = await getAddressFromEvent(
    barrenWuffetMarlie.createFund("marlieChungerFund", await makeSubConstraints(), []),
    "Created",
    barrenWuffetMarlie.address
  );
  const marlieChungerFund: Fund = await ethers.getContractAt("Fund", marlieChungerFundAddr);

  const barrenWuffetFairy = await ethers.getContract("BarrenWuffet", fairyLink);
  const fairyLinkFundAddr = await getAddressFromEvent(
    barrenWuffetFairy.createFund("fairyLinkFund", await makeSubConstraints(), []),
    "Created",
    barrenWuffetFairy.address
  );
  const fairyLinkFund: Fund = await ethers.getContractAt("Fund", fairyLinkFundAddr);

  return {
    ownerWallet,
    priceTrigger,
    swapUniSingleAction,
    testOracleEth,
    testOracleTst1,
    testToken1,
    testToken2,
    WETH,
    marlieChungerFund,
    fairyLinkFund,
    whitelistService,
    trigWlHash,
    actWlHash,
    barrenWuffet,
    barrenWuffetMarlie,
    barrenWuffetFairy,
    passingETHtoTST1SwapPriceTrigger,
    passingTST1toETHSwapPriceTrigger,
    swapETHToTST1Action,
    swapTST1ToETHAction,
  };
}
