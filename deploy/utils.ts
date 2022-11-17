import { ethers } from "hardhat";
import { Contract } from "ethers";

export async function getLibraries() {
  const SubLibAddr = (await ethers.getContract("Subscriptions")).address;
  const AssetTrackerLibAddr = (await ethers.getContract("AssetTracker")).address;
  const TokenLibAddr = (await ethers.getContract("TokenLib")).address;

  return { SubLibAddr, AssetTrackerLibAddr, TokenLibAddr };
}

export async function addToWhitelist(deployer: string, whitelistService: Contract, wlHash: any, addr: any, logFn: any) {
  if (!(await whitelistService.isWhitelisted(wlHash, addr))) {
    if ((await whitelistService.getWhitelistOwner(wlHash)) == deployer) {
      await whitelistService.addToWhitelist(wlHash, addr);
      logFn(`${addr} added to whitelist ${whitelistService.address}::${wlHash}`);
    } else {
      console.warn(
        `${addr} not added to whitelist ${whitelistService.address}::${wlHash} because you're not the owner!
        Please ensure owner updates whitelist manually`
      );
    }
  } else {
    logFn("Already whitelisted!");
  }
}
