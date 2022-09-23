import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config({ path: ".test.env" });

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const fundImpl = await ethers.getContract("Fund");

  await deploy("FundBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [fundImpl.address],
    log: true
  });

  const fundBeacon = await ethers.getContract("FundBeacon");
  await fundBeacon.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
};

export default func;
func.tags = ["FundBeacon"];
func.dependencies = ["Fund"];
