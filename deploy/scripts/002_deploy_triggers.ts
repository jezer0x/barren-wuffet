import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { addToWhitelist } from "../utils";
import dotenv from "dotenv";
dotenv.config({ path: ".test.env" });

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const whitelistService = await ethers.getContract("WhitelistService");
  let trigWlHash = await whitelistService.getWhitelistHash(deployer, "triggers");
  console.log("trigWlHash", trigWlHash);
  try {
    await whitelistService.createWhitelist("triggers");
  } catch {
    // loose test for "that that whitelist was already created"
  }

  await deployPriceTrigger(deploy, deployer, whitelistService, trigWlHash);
  await deployTimestampTrigger(deploy, deployer, whitelistService, trigWlHash);

  if ((await whitelistService.getWhitelistOwner(trigWlHash)) == deployer) {
    await whitelistService.transferWhitelistOwnership(trigWlHash, process.env.PLATFORM_MULTI_SIG_ADDR);
  } // else this was already handed over?
};

async function deployPriceTrigger(deploy: any, deployer: string, whitelistService: Contract, trigWlHash: any) {
  await deploy("PriceTrigger", {
    from: deployer,
    args: [],
    log: true
  });

  const priceTrigger = await ethers.getContract("PriceTrigger");
  if ((await priceTrigger.owner()) == deployer) {
    await priceTrigger.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
  }

  await addToWhitelist(deployer, whitelistService, trigWlHash, priceTrigger.address);
}

async function deployTimestampTrigger(deploy: any, deployer: string, whitelistService: Contract, trigWlHash: any) {
  const tsTrigger = await deploy("TimestampTrigger", {
    from: deployer,
    args: [],
    log: true
  });

  await addToWhitelist(deployer, whitelistService, trigWlHash, tsTrigger.address);
}

export default func;
func.tags = ["Triggers"];
func.dependencies = ["WhitelistService"];
