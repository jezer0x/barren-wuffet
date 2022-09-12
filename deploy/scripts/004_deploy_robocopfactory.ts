import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const roboCopImplementation = await ethers.getContract("RoboCop");

  await deploy("RoboCopFactory", {
    from: deployer,
    args: [roboCopImplementation.address],
    log: true,
  });
};

export default func;
func.tags = ["RoboCopFactory"];
func.dependencies = ["RoboCopImplementation", "TestStubs", "Libraries"];
