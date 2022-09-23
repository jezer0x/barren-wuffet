import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env" });
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const fundImpl = await ethers.getContract("Fund");

  const fbDeployResult = await deploy("FundBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [fundImpl.address],
    log: true
  });

  if (fbDeployResult.newlyDeployed) {
    const fundBeacon = await ethers.getContract("FundBeacon");
    await fundBeacon.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
  }
};

export default func;
func.tags = ["FundBeacon"];
func.dependencies = ["Fund"];
