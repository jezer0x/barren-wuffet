import { ethers } from "hardhat";

export async function getLibraries() {
  const SubLibAddr = (await ethers.getContract("Subscriptions")).address;
  const AssetTrackerLibAddr = (await ethers.getContract("AssetTracker")).address;
  const TokenLibAddr = (await ethers.getContract("TokenLib")).address;

  return { SubLibAddr, AssetTrackerLibAddr, TokenLibAddr };
}
