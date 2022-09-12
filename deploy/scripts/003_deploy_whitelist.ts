import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("WhitelistService", {
    from: deployer,
    args: [],
    log: true,
  });

  const whitelistService = await ethers.getContract("WhitelistService");
  await whitelistService.createWhitelist("triggers");
  const trigWlHash = await whitelistService.getWhitelistHash(deployer, "triggers");
  const priceTrigger = await ethers.getContract("PriceTrigger");
  await whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);

  await whitelistService.createWhitelist("actions");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");
  const swapUniSingleAction = await ethers.getContract("SwapUniSingleAction");
  await whitelistService.addToWhitelist(actWlHash, swapUniSingleAction.address);
};
export default func;
func.tags = ["WhitelistService"];
func.dependencies = ["Triggers", "Actions"];
