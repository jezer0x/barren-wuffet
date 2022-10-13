import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { ETH_TOKEN, ERC20_DECIMALS } from "../Constants";

async function main() {
  const McFund = await ethers.getContractAt("Fund", "0xec4cfde48eadca2bc63e94bb437bbeace1371bf3");
  await McFund.deposit(ETH_TOKEN, BigNumber.from(11).mul(ERC20_DECIMALS), {
    value: BigNumber.from(11).mul(ERC20_DECIMALS)
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
