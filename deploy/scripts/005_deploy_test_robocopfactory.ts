import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const roboCopImplementation = await ethers.getContract("RoboCop");

  if ((await getChainId()) == "31337" && !hre.config.networks.hardhat.forking?.enabled) {
    console.log("> Deploying RoboCopFactory");
    const botFrontend = await ethers.getContract("BotFrontend");
    await deploy("RoboCopFactory", {
      from: deployer,
      args: [roboCopImplementation.address, botFrontend.address],
      log: true
    });
    console.log("\n");
  }
};

export default func;
func.tags = ["RoboCopFactory"];
func.dependencies = ["RoboCop", "Libraries", "BotFrontend"];
