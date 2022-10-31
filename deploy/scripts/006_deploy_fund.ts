import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getLibraries } from "../utils";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const { SubLibAddr, AssetTrackerLibAddr, TokenLibAddr } = await getLibraries();

  await deploy("Fund", {
    from: deployer,
    args: [],
    log: true,
    libraries: {
      Subscriptions: SubLibAddr,
      AssetTracker: AssetTrackerLibAddr,
      TokenLib: TokenLibAddr
    }
  });
};

export default func;
func.tags = ["Fund"];
