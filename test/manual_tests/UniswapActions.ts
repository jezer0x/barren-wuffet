import { ethers, getNamedAccounts } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
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
  DEFAULT_SUB_TO_MAN_FEE_PCT,
  ETH_TOKEN,
  LT,
  TOKEN_TYPE,
  TIMESTAMP_TRIGGER_TYPE
} from "../Constants";
import { getAddressFromEvent } from "../helper";
import { abi as FACTORY_ABI } from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import { abi as POOL_ABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";

async function makeSubConstraints() {
  const latestTime = await time.latest();
  return {
    minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
    minCollateralTotal: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
    deadline: latestTime + 86400,
    lockin: latestTime + 86400 * 10,
    allowedDepositToken: ETH_TOKEN
  };
}

async function main() {
  const BW = await ethers.getContract("BarrenWuffet");
  const McFundAddr = await getAddressFromEvent(
    BW.createFund("marlieChungerFund", await makeSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []),
    "Created",
    BW.address,
    1
  );

  const McFund = await ethers.getContractAt("Fund", McFundAddr);

  await McFund.deposit(ETH_TOKEN, BigNumber.from(11).mul(ERC20_DECIMALS), {
    value: BigNumber.from(11).mul(ERC20_DECIMALS)
  });

  // increase to beyond deadline so we can start taking actions
  await time.increaseTo((await time.latest()) + 86400);
  const erc20abifrag = [
    {
      constant: true,
      inputs: [
        {
          name: "_owner",
          type: "address"
        }
      ],
      name: "balanceOf",
      outputs: [
        {
          name: "balance",
          type: "uint256"
        }
      ],
      payable: false,
      type: "function"
    }
  ];

  const usdc_contract = new Contract("0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", erc20abifrag, ethers.provider);
  const dai_contract = new Contract("0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", erc20abifrag, ethers.provider);
  const USDC_TOKEN = { t: TOKEN_TYPE.ERC20, addr: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", id: BigNumber.from(0) };
  const DAI_TOKEN = { t: TOKEN_TYPE.ERC20, addr: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", id: BigNumber.from(0) };

  let balance_usdc = await usdc_contract.balanceOf(McFundAddr);

  const trueTrigger = {
    createTimeParams: utils.defaultAbiCoder.encode(["uint8", "uint256"], [GT, (await time.latest()) - 1]),
    triggerType: TIMESTAMP_TRIGGER_TYPE,
    callee: (await ethers.getContract("TimestampTrigger")).address
  };

  const swapUniAction = await ethers.getContract("SwapUniSingleAction");

  await McFund.takeAction(
    trueTrigger,
    {
      callee: swapUniAction.address,
      data: "0x0000000000000000000000000000000000000000000000000000000000000000",
      inputTokens: [ETH_TOKEN], // eth
      outputTokens: [USDC_TOKEN] // swapping for USDC
    },
    [BigNumber.from(1).mul(ERC20_DECIMALS)],
    [BigNumber.from(0)] // 0 fees set in deploy
  );

  balance_usdc = await usdc_contract.balanceOf(McFundAddr);
  console.log(balance_usdc.toString());

  await McFund.takeAction(
    trueTrigger,
    {
      callee: swapUniAction.address,
      data: "0x0000000000000000000000000000000000000000000000000000000000000000",
      inputTokens: [ETH_TOKEN], // eth
      outputTokens: [DAI_TOKEN] // swapping for USDC
    },
    [BigNumber.from(1).mul(ERC20_DECIMALS)],
    [BigNumber.from(0)] // 0 fees set in deploy
  );

  let balance_dai = await dai_contract.balanceOf(McFundAddr);
  const mintLPAction = await ethers.getContract("MintLiquidityPositionUni");
  let LP_NFT = { t: TOKEN_TYPE.ERC721, addr: await mintLPAction.nonfungiblePositionManager(), id: BigNumber.from(0) };

  const poolFactory = new Contract(FACTORY_ABI, "0x1F98431c8aD98523631AE4a59f267346ea31F984");
  console.log(await poolFactory.getPool(DAI_TOKEN.addr, USDC_TOKEN.addr, 500));

  console.log(balance_dai, balance_usdc);
  await McFund.takeAction(
    trueTrigger,
    {
      callee: (await ethers.getContract("MintLiquidityPositionUni")).address,
      data: "0x0000000000000000000000000000000000000000000000000000000000000000",
      inputTokens: [DAI_TOKEN, USDC_TOKEN],
      outputTokens: [DAI_TOKEN, USDC_TOKEN, LP_NFT]
    },
    [balance_dai, balance_usdc],
    [BigNumber.from(0), BigNumber.from(0)] // 0 fees set in deploy
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
