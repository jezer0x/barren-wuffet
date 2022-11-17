import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;

  const { deployer } = await getNamedAccounts();

  const whitelistService = await ethers.getContract("WhitelistService");
  const roboCopBeacon = await ethers.getContract("RoboCopBeacon");
  const fundBeacon = await ethers.getContract("FundBeacon");
  const botFrontend = await ethers.getContract("BotFrontend");
  const trigWlHash = await whitelistService.getWhitelistHash(deployer, "triggers");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");

  log("> Deploying Barren Wuffet");
  const bwDeployResult = await deploy("BarrenWuffet", {
    from: deployer,
    args: [
      {
        platformFeeWallet: process.env.PLATFORM_MULTI_SIG_ADDR,
        subscriberToPlatformFeePercentage: 0,
        managerToPlatformFeePercentage: 0,
        subscriberToManagerFeePercentage: 0 // will be overwritten anyways
      }, // subscriberToPlatformFeePercentage should be 0.69 and managerToPlatformFeePercentage should be 0.42
      trigWlHash,
      actWlHash,
      whitelistService.address,
      roboCopBeacon.address,
      fundBeacon.address,
      botFrontend.address
    ],
    log: true
  });

  const bw = await ethers.getContract("BarrenWuffet");

  if ((await bw.owner()) != process.env.PLATFORM_MULTI_SIG_ADDR) {
    await bw.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
    log("Ownership of BarrenWuffet transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    log("Owner of BarrentWuffet is already platform Multisig");
  }

  if ((await botFrontend.barrenWuffetAddr()) != bw.address) {
    try {
      await botFrontend.setBarrenWuffet(bw.address);
    } catch {
      console.warn(
        `new BW ${bw.address} not set in BotFrontend.
        Please ensure new BW is set manually in BotFrontend!`
      );
    }
  }

  if ((await botFrontend.owner()) != process.env.PLATFORM_MULTI_SIG_ADDR) {
    try {
      await botFrontend.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
      log("Ownership of BotFrontend transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
    } catch {
      log("Can't transfer ownership of BotFrontend as owner is ", await botFrontend.owner());
    }
  } else {
    log("Owner of BotFrontend is already platform Multisig");
  }
  log("\n");
};

export default func;
func.tags = ["BarrenWuffet"];
func.dependencies = ["RoboCopBeacon", "FundBeacon", "WhitelistService", "BotFrontend"];
