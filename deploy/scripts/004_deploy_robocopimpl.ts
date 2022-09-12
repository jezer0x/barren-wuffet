import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getLibraries } from "../utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const { TokenLibAddr } = await getLibraries();

  await deploy("RoboCop", {
    from: deployer,
    args: [],
    log: true,
    libraries: { TokenLib: TokenLibAddr },
  });
};

export default func;
func.tags = ["RoboCopImplementation"];
func.dependencies = ["TestStubs", "Triggers", "Actions"];
