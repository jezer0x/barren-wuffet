import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("> Deploying WhitelistService");
  await deploy("WhitelistService", {
    from: deployer,
    args: [],
    log: true
  });
  console.log("\n");
};

export default func;
func.tags = ["WhitelistService"];
