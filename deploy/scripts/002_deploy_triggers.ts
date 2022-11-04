import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { Contract } from "ethers";
import { addToWhitelist } from "../utils";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });

  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const whitelistService = await ethers.getContract("WhitelistService");
  let trigWlHash = await whitelistService.getWhitelistHash(deployer, "triggers");

  console.log("> Deploying Triggers ");

  if (!(await whitelistService.whitelistExists(trigWlHash))) {
    await whitelistService.createWhitelist("triggers");
    console.log("triggers whitelist created as ", whitelistService.address, "::", trigWlHash);
  } else {
    console.log("triggers whitelist already exists as ", whitelistService.address, "::", trigWlHash);
  }

  await deployPriceTrigger(deploy, deployer, whitelistService, trigWlHash);
  await deployTimestampTrigger(deploy, deployer, whitelistService, trigWlHash);

  if ((await whitelistService.getWhitelistOwner(trigWlHash)) == deployer) {
    await whitelistService.transferWhitelistOwnership(trigWlHash, process.env.PLATFORM_MULTI_SIG_ADDR);
    console.log(trigWlHash, " ownership transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    console.error("The trigger Whitelist is already owned by ", await whitelistService.getWhitelistOwner(trigWlHash));
  }

  console.log("\n");
};

async function deployPriceTrigger(deploy: any, deployer: string, whitelistService: Contract, trigWlHash: any) {
  await deploy("PriceTrigger", {
    from: deployer,
    args: [],
    log: true
  });

  const priceTrigger = await ethers.getContract("PriceTrigger");
  console.log(priceTrigger.address);
  if ((await priceTrigger.owner()) == deployer) {
    await priceTrigger.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
    console.log("Ownership of PriceTrigger transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    console.log("Can't transfer ownership of PriceTrigger as owner is ", await priceTrigger.owner());
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
