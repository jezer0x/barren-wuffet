import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const fundImpl = await ethers.getContract("Fund");

  console.log("> Deploying FundBeacon");
  const fbDeployResult = await deploy("FundBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [fundImpl.address],
    log: true
  });

  const fundBeacon = await ethers.getContract("FundBeacon");
  if (fbDeployResult.newlyDeployed) {
    await fundBeacon.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
    console.log("Ownership of fundBeacon transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    console.log("Can't transfer ownership of fundBeacon as owner is ", await fundBeacon.owner());
  }
  console.log("\n");
};

export default func;
func.tags = ["FundBeacon"];
func.dependencies = ["Fund"];
