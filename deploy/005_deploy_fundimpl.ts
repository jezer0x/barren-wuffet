import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const AssetTrackerLib = await deploy("AssetTracker", { from: deployer, args: [], log: true });

  const SubLib = await deploy("Subscriptions", {
    from: deployer,
    args: [],
    log: true,
    libraries: {
      AssetTracker: AssetTrackerLib.address,
    },
  });

  await deploy("Fund", {
    from: deployer,
    args: [],
    log: true,
    libraries: {
      Subscriptions: SubLib.address,
      AssetTracker: AssetTrackerLib.address,
    },
  });
};

export default func;
func.tags = ["FundImplementation"];
