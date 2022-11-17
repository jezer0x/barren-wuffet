import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });

  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;

  const { deployer } = await getNamedAccounts();

  const robocopImpl = await ethers.getContract("RoboCop");

  log("> Deploying RoboCopBeacon");
  const rcbDeployResult = await deploy("RoboCopBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [robocopImpl.address],
    log: true
  });

  const roboCopBeacon = await ethers.getContract("RoboCopBeacon");
  if ((await roboCopBeacon.owner()) != process.env.PLATFORM_MULTI_SIG_ADDR) {
    await roboCopBeacon.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
    log("Ownership of roboCopBeacon transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    log("Ownership of roboCopBeacon already with ", await roboCopBeacon.owner());
  }
  log("\n");
};

export default func;
func.tags = ["RoboCopBeacon"];
func.dependencies = ["RoboCop"];
