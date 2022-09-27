import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });

  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const robocopImpl = await ethers.getContract("RoboCop");

  const rcbDeployResult = await deploy("RoboCopBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [robocopImpl.address],
    log: true
  });

  if (rcbDeployResult.newlyDeployed) {
    const roboCopBeacon = await ethers.getContract("RoboCopBeacon");
    await roboCopBeacon.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
  }
};

export default func;
func.tags = ["RoboCopBeacon"];
func.dependencies = ["RoboCop"];
