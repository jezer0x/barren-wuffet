import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });

  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const robocopImpl = await ethers.getContract("RoboCop");

  console.log("> Deploying RoboCopBeacon");
  const rcbDeployResult = await deploy("RoboCopBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [robocopImpl.address],
    log: true
  });

  const roboCopBeacon = await ethers.getContract("RoboCopBeacon");
  if (rcbDeployResult.newlyDeployed) {
    await roboCopBeacon.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
    console.log("Ownership of roboCopBeacon transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    console.log("Can't transfer ownership of roboCopBeacon as owner is ", await roboCopBeacon.owner());
  }
  console.log("\n");
};

export default func;
func.tags = ["RoboCopBeacon"];
func.dependencies = ["RoboCop"];
