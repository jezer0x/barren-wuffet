import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("> Deploying WhitelistService");
  await deploy("WhitelistService", {
    from: deployer,
    args: [],
    log: true
  });
  log("\n");
};

export default func;
func.tags = ["WhitelistService"];
