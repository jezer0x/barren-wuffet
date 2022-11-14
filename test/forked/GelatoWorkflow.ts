import { ethers, getNamedAccounts } from "hardhat";
import { impersonateAccount, time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber, utils, Signer, FixedNumber } from "ethers";
import {
  GT,
  ERC20_DECIMALS,
  DEFAULT_SUB_TO_MAN_FEE_PCT,
  ETH_TOKEN,
  TOKEN_TYPE,
  TIMESTAMP_TRIGGER_TYPE,
  ETH_ADDRESS
} from "../Constants";
import { getAddressFromEvent, getHashFromEvent } from "../helper";
import { getProtocolAddresses } from "../../deploy/protocol_addresses";
import { IERC20Metadata__factory, IOps__factory, IUniswapV2Router02__factory } from "../../typechain-types";
import { Address } from "hardhat-deploy/types";
import { TokenStruct } from "../../typechain-types/contracts/utils/subscriptions/Subscriptions";
import { ActionStruct } from "../../typechain-types/contracts/actions/IAction";
import { makeDefaultSubConstraints } from "../Fixtures";

async function calculateMinOutPerInForSwap(
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  minAmountOfOutPerIn: Number
): Promise<BigNumber> {
  var tokenInDecimals =
    tokenIn == ETH_TOKEN
      ? 18
      : await new Contract(await tokenIn.addr, IERC20Metadata__factory.abi, ethers.provider).decimals();
  var tokenOutDecimals =
    tokenOut == ETH_TOKEN
      ? 18
      : await new Contract(await tokenOut.addr, IERC20Metadata__factory.abi, ethers.provider).decimals();
  IERC20Metadata__factory;
  return BigNumber.from(
    FixedNumber.from(minAmountOfOutPerIn.toFixed(18)) // toFixed(18) to catch case of FixedNumber.from(1.0/1100) failing
      .mulUnsafe(FixedNumber.from(BigNumber.from(10).pow(tokenOutDecimals + 18 - tokenInDecimals))) // I don't know why mulUnsafe!
      .toString()
      .split(".")[0] // BigNumber can't take decimal...
  );
}

function createPath(tokenIn: TokenStruct, tokenOut: TokenStruct, WETHAddr: Address) {
  return [tokenIn == ETH_TOKEN ? WETHAddr : tokenIn.addr, tokenOut == ETH_TOKEN ? WETHAddr : tokenOut.addr];
}

// Will only work for single hops (i.e. path.length == 2)
function createSushiSwapAction(
  callee: Address,
  tokenIn: TokenStruct,
  tokenOut: TokenStruct,
  minAmountOfOutPerIn: BigNumber,
  WETHAddr: Address
): ActionStruct {
  return {
    callee: callee,
    data: ethers.utils.defaultAbiCoder.encode(
      ["address[]", "uint256"],
      [createPath(tokenIn, tokenOut, WETHAddr), minAmountOfOutPerIn]
    ),
    inputTokens: [tokenIn],
    outputTokens: [tokenOut]
  };
}

async function main() {
  const { deployer } = await getNamedAccounts();
  const protocolAddresses: any = await getProtocolAddresses("31337", true);
  const BW = await ethers.getContract("BarrenWuffet");

  const dai_contract = new Contract(protocolAddresses.tokens.DAI, IERC20Metadata__factory.abi, ethers.provider);
  const DAI_TOKEN = { t: TOKEN_TYPE.ERC20, addr: protocolAddresses.tokens.DAI, id: BigNumber.from(0) };

  const McFundAddr = await getAddressFromEvent(
    BW.createFund("marlieChungerFund", await makeDefaultSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []),
    "Created",
    BW.address,
    1
  );

  const McFund = await ethers.getContractAt("Fund", McFundAddr);
  const McFundRoboCop = await ethers.getContractAt("RoboCop", await McFund.roboCop());
  await McFund.deposit(ETH_TOKEN, BigNumber.from(21).mul(ERC20_DECIMALS), {
    value: BigNumber.from(11).mul(ERC20_DECIMALS)
  });

  // increase to beyond deadline so we can start taking actions
  await time.increaseTo((await time.latest()) + 86400);

  const trueTrigger = {
    createTimeParams: utils.defaultAbiCoder.encode(["uint8", "uint256"], [GT, (await time.latest()) - 1]),
    triggerType: TIMESTAMP_TRIGGER_TYPE,
    callee: (await ethers.getContract("TimestampTrigger")).address
  };

  const sushiSwapExactXForY = await ethers.getContract("SushiSwapExactXForY");

  // Case 1: Sell ETH for DAI
  const ruleHash = await getHashFromEvent(
    McFund.createRule(
      [trueTrigger],
      [
        createSushiSwapAction(
          sushiSwapExactXForY.address,
          ETH_TOKEN,
          DAI_TOKEN,
          await calculateMinOutPerInForSwap(ETH_TOKEN, DAI_TOKEN, 1100),
          protocolAddresses.tokens.WETH
        )
      ]
    ),
    "Created",
    McFundRoboCop,
    "ruleHash"
  );

  await McFund.addRuleCollateral(ruleHash, [BigNumber.from(2).mul(ERC20_DECIMALS)], [BigNumber.from(0)]); // 0 fees set in deploy
  await McFund.activateRule(ruleHash);

  // botFrontend must fund the treasury, else bot won't exec
  const botFrontend = await ethers.getContract("BotFrontend");
  await botFrontend.deposit(ethers.utils.parseEther("0.1"), { value: ethers.utils.parseEther("0.1") });

  const [canExec, execData] = await botFrontend.checker(McFundRoboCop.address, ruleHash);

  if (!canExec) {
    throw "Something went wrong! canExec was false";
  }

  const gelatoOps = new Contract(protocolAddresses.gelato.ops, IOps__factory.abi, ethers.provider);

  // impersonate gelato bot and do the bot's work
  const gelatoBotAddr = await gelatoOps.gelato();
  await impersonateAccount(gelatoBotAddr);
  const gelatoBot = await ethers.getSigner(gelatoBotAddr);

  await gelatoOps.connect(gelatoBot).exec(
    botFrontend.address,
    botFrontend.address,
    execData,
    {
      modules: [0],
      args: [
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            botFrontend.address,
            botFrontend.interface.encodeFunctionData("checker(address,bytes32)", [McFundRoboCop.address, ruleHash])
          ]
        )
      ]
    },
    ethers.utils.parseEther("0.01"),
    ETH_ADDRESS,
    true,
    true
  );

  await McFund.redeemRuleOutputs();

  var balance_dai = await dai_contract.balanceOf(McFundAddr);
  console.log("DAI balance after selling 2 ETH:", balance_dai.toString());
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
