import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const TokenLib = await deploy("TokenLib", { from: deployer, args: [], log: true });
  const AssetTrackerLib = await deploy("AssetTracker", {
    from: deployer,
    args: [],
    log: true,
    libraries: { TokenLib: TokenLib.address }
  });

  await deploy("Subscriptions", {
    from: deployer,
    args: [],
    log: true,
    libraries: {
      AssetTracker: AssetTrackerLib.address,
      TokenLib: TokenLib.address
    }
  });
};

export default func;
func.tags = ["Libraries"];
