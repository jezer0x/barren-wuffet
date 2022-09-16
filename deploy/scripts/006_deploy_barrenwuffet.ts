import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const whitelistService = await ethers.getContract("WhitelistService");
  const roboCopImplementation = await ethers.getContract("RoboCop");
  const fundImplementation = await ethers.getContract("Fund");
  const trigWlHash = await whitelistService.getWhitelistHash(deployer, "triggers");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");

  await deploy("BarrenWuffet", {
    from: deployer,
    args: [
      {
        platformFeeWallet: deployer,
        subscriberToPlatformFeePercentage: 0,
        managerToPlatformFeePercentage: 0,
        subscriberToManagerFeePercentage: 0, // will be overwritten anyways
      }, // subscriberToPlatformFeePercentage should be 0.69 and managerToPlatformFeePercentage should be 0.42
      trigWlHash,
      actWlHash,
      whitelistService.address,
      roboCopImplementation.address,
      fundImplementation.address,
    ],
    log: true,
  });
};

export default func;
func.tags = ["BarrenWuffet"];
func.dependencies = ["RoboCopImplementation", "FundImplementation", "WhitelistService"];