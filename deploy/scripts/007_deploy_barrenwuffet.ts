import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const whitelistService = await ethers.getContract("WhitelistService");
  const roboCopBeacon = await ethers.getContract("RoboCopBeacon");
  const fundBeacon = await ethers.getContract("FundBeacon");
  const botFrontend = await ethers.getContract("BotFrontend");
  const trigWlHash = await whitelistService.getWhitelistHash(deployer, "triggers");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");

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

  if (bwDeployResult.newlyDeployed) {
    const bw = await ethers.getContract("BarrenWuffet");
    await bw.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);

    try {
      await botFrontend.setBarrenWuffetAddr(bw.address);
    } catch {
      console.warn(
        `new BW ${bw.address} not set in BotFrontend because you're not the owner!
        Please ensure new BW is set manually in BotFrontend!`
      );
    }
  }

  if ((await botFrontend.owner()) != process.env.PLATFORM_MULTI_SIG_ADDR) {
    try {
      await botFrontend.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
    } catch {
      console.warn(`BotFrontend owner could not be set to multiSigAddr! Please set manually!`);
    }
  }
};

export default func;
func.tags = ["BarrenWuffet"];
func.dependencies = ["RoboCopBeacon", "FundBeacon", "WhitelistService", "BotFrontend"];
