import { ethers } from "hardhat";
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
  TOKEN_TYPE
} from "../Constants";

async function makeSubConstraints() {
  const latestTime = await time.latest();
  return {
    minCollateralPerSub: BigNumber.from(10).mul(ERC20_DECIMALS),
    maxCollateralPerSub: BigNumber.from(100).mul(ERC20_DECIMALS),
    minCollateralTotal: BigNumber.from(200).mul(ERC20_DECIMALS),
    maxCollateralTotal: BigNumber.from(500).mul(ERC20_DECIMALS),
    deadline: latestTime + 86400,
    lockin: latestTime + 86400 * 10,
    allowedDepositToken: ETH_TOKEN
  };
}

async function main() {
  const BW = await ethers.getContract("BarrenWuffet");

  let tx = await BW.createFund("marlieChungerFund", await makeSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []);
  let McFundAddr = (await tx.wait()).events.find(
    //@ts-ignore
    (x: { event: string }) => x.event === "Created"
  ).args.fundAddr;
  const McFund = await ethers.getContractAt("Fund", McFundAddr);
  await McFund.closeFund();

  tx = await BW.createFund("jerkshireHathawayFund", await makeSubConstraints(), DEFAULT_SUB_TO_MAN_FEE_PCT, []);
  let JhFundAddr = (await tx.wait()).events.find(
    //@ts-ignore
    (x: { event: string }) => x.event === "Created"
  ).args.fundAddr;
  const JhFund = await ethers.getContractAt("Fund", JhFundAddr);

  await JhFund.deposit(ETH_TOKEN, BigNumber.from(11).mul(ERC20_DECIMALS), {
    value: BigNumber.from(11).mul(ERC20_DECIMALS)
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
