import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { getProtocolAddresses } from "../protocol_addresses";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const protocolAddresses: any = await getProtocolAddresses(await getChainId());
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  var treasuryAddr = protocolAddresses.gelato.treasury;
  var opsAddr = protocolAddresses.gelato.ops;

  log("> Deploying BotFrontend");
  // note: we will change the owner later, after setting BW addr
  await deploy("BotFrontend", {
    from: deployer,
    args: [treasuryAddr, opsAddr],
    log: true
  });
  log("\n");
};

export default func;
func.tags = ["BotFrontend"];
