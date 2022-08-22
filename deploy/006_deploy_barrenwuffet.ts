import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const DegenStreet = await (await ethers.getContract("DegenStreet")).address;

  await deploy("BarrenWuffet", {
    from: deployer,
    args: [DegenStreet],
    log: true,
  });
};

export default func;
func.tags = ["BarrenWuffet"];
func.dependencies = ["DegenStreet"];
