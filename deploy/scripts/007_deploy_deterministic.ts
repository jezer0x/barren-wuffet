import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { BytesLike } from "ethers";

// takes about 1 min, can consider speeding up by referring to: https://github.com/0age/create2crunch
const hasLeadingZeros = (address = '0x0000', zeros = 4) => {
    for (let i = 2; i <= zeros + 1; i += 1) {
      if (address.charAt(i) !== '0') return false;
    }
    return true;
};

const getSaltForVanityAddress = (factoryAddress: string, initCode: BytesLike) => {
    let initCodeHash = ethers.utils.keccak256(initCode);
    let salt = 0;
    let vanityAddress = '';
    let saltHash;
    while (!hasLeadingZeros(vanityAddress)) {
      salt += 1;
      saltHash = ethers.utils.keccak256(ethers.utils.hexlify(salt));
      vanityAddress = ethers.utils.getCreate2Address(
        factoryAddress,
        saltHash,
        initCodeHash,
      );
    }
    return saltHash;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
  
    const { deployer } = await getNamedAccounts();
  
    const Sample = await ethers.getContractFactory('PriceTrigger');
    const { data: initCode } = Sample.getDeployTransaction(); // assumes no constructor args

    const result = await deploy("DeterministicDeployFactory", {
        from: deployer,
        args: [],
        log: true,
      });
    const factoryAddress = result.receipt?.contractAddress;
    const saltHash = getSaltForVanityAddress(factoryAddress as string, initCode as BytesLike);

    const factory = await ethers.getContract("DeterministicDeployFactory");
    const res = await factory.deploy(initCode, saltHash);
    const res2 = await res.wait();
    for (let i = 0; i < res2.events.length; i++) {
        if (res2.events[i].event == "Deploy") {
            console.log("Determinstic address deployed at: ", res2.events[i].data);
            break;
        }
    }
};

export default func;
func.tags = ["Deterministic"];