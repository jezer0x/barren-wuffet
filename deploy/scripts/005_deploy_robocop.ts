import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getLibraries } from "../utils";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;

  const { deployer } = await getNamedAccounts();

  const { TokenLibAddr } = await getLibraries();

  log("> Deploying RoboCop Implementation");
  await deploy("RoboCop", {
    from: deployer,
    args: [],
    log: true,
    libraries: { TokenLib: TokenLibAddr }
  });
  log("\n");
};

export default func;
func.tags = ["RoboCop"];
func.dependencies = ["Triggers", "Actions"];
