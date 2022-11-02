import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { getLiveAddresses } from "../live_addresses";

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const liveAddresses: any = getLiveAddresses(await getChainId(), hre.config.networks.hardhat.forking?.enabled);
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  var treasuryAddr;
  var opsAddr;
  if ((await getChainId()) == "31337" && !hre.config.networks.hardhat.forking?.enabled) {
    treasuryAddr = ethers.constants.AddressZero;
    opsAddr = (await ethers.getContract("TestGelatoOps")).address;
  } else {
    treasuryAddr = liveAddresses.gelato.treasury;
    opsAddr = liveAddresses.gelato.ops;
  }

  // note: we will change the owner later, after setting BW addr
  await deploy("BotFrontend", {
    from: deployer,
    args: [treasuryAddr, opsAddr],
    log: true
  });
};

export default func;
func.tags = ["BotFrontend"];
