import { ethers } from "hardhat";

async function main() {
  const McFund = await ethers.getContractAt("Fund", "0x4374eecaad0dcaa149cffc160d5a0552b1d092b0");
  await McFund.closeFund();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
