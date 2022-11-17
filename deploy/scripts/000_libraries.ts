import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;

  const { deployer } = await getNamedAccounts();

  log("> Deploying Libraries");
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
  log("\n");
};

export default func;
func.tags = ["Libraries"];
