import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const RoboCop = await (await ethers.getContract("RoboCop")).address;

  await deploy("BarrenWuffet", {
    from: deployer,
    args: [RoboCop],
    log: true,
  });
};

export default func;
func.tags = ["BarrenWuffet"];
func.dependencies = ["DegenStreet"];
