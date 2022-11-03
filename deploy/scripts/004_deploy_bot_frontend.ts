import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { getProtocolAddresses } from "../protocol_addresses";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const protocolAddresses: any = await getProtocolAddresses(
    await getChainId(),
    hre.config.networks.hardhat.forking?.enabled
  );
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  var treasuryAddr = protocolAddresses.gelato.treasury;
  var opsAddr = protocolAddresses.gelato.ops;

  // note: we will change the owner later, after setting BW addr
  await deploy("BotFrontend", {
    from: deployer,
    args: [treasuryAddr, opsAddr],
    log: true
  });
};

export default func;
func.tags = ["BotFrontend"];
