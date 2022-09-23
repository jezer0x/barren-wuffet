import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config({ path: ".test.env" });

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const robocopImpl = await ethers.getContract("RoboCop");

  await deploy("RoboCopBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [robocopImpl.address],
    log: true
  });

  const roboCopBeacon = await ethers.getContract("RoboCopBeacon");
  await roboCopBeacon.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
};

export default func;
func.tags = ["RoboCopBeacon"];
func.dependencies = ["RoboCop"];
