import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import dotenv from "dotenv";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  dotenv.config({ path: (await getChainId()) == "31337" ? ".test.env" : ".env", override: true });
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;

  const { deployer } = await getNamedAccounts();

  const fundImpl = await ethers.getContract("Fund");

  log("> Deploying FundBeacon");
  const fbDeployResult = await deploy("FundBeacon", {
    contract: "UpgradeableBeacon",
    from: deployer,
    args: [fundImpl.address],
    log: true
  });

  const fundBeacon = await ethers.getContract("FundBeacon");
  if ((await fundBeacon.owner()) != process.env.PLATFORM_MULTI_SIG_ADDR) {
    await fundBeacon.transferOwnership(process.env.PLATFORM_MULTI_SIG_ADDR);
    log("Ownership of fundBeacon transferred to ", process.env.PLATFORM_MULTI_SIG_ADDR);
  } else {
    log("Ownership of fundBeacon already with ", await fundBeacon.owner());
  }
  log("\n");
};

export default func;
func.tags = ["FundBeacon"];
func.dependencies = ["Fund"];
