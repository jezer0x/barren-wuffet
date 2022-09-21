import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { Contract } from "ethers";

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

  await deployPriceTrigger(deploy, deployer, whitelistService, trigWlHash);
  // TODO: Deploy Timestamp Trigger
};

async function deployPriceTrigger(deploy: any, deployer: string, whitelistService: Contract, trigWlHash: any) {
  const priceTrigger = await deploy("PriceTrigger", {
    from: deployer,
    args: [],
    log: true
  });

  if (!(await whitelistService.isWhitelisted(trigWlHash, priceTrigger.address))) {
    await whitelistService.addToWhitelist(trigWlHash, priceTrigger.address);
  }
}

export default func;
func.tags = ["Triggers"];
func.dependencies = ["WhitelistService"];
