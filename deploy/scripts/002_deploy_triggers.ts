import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const whitelistService = await ethers.getContract("WhitelistService");
  let trigWlHash = await whitelistService.getWhitelistHash(deployer, "triggers");
  try {
    await whitelistService.createWhitelist("triggers");
  } catch {
    // loose test for "that that whitelist was already created"
  }

  const priceTrigger = await deploy("PriceTrigger", {
    from: deployer,
    args: [],
    log: true
  });

  await whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);

  // TODO: Deploy Timestamp Trigger
};

export default func;
func.tags = ["Triggers"];
func.dependencies = ["WhitelistService"];
