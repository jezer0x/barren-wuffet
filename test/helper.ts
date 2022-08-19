import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";

export async function testPauseAuthorization(contract: Contract, ownerWallet: SignerWithAddress, otherWallet: SignerWithAddress) {
    const ownerCon = contract.connect(ownerWallet);
    const otherCon = contract.connect(otherWallet);

    await expect(otherCon.pause()).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(ownerCon.pause()).to.emit(contract, "Paused");
    await expect(otherCon.unpause()).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(ownerCon.unpause()).to.emit(contract, "Unpaused");
}

export async function testPauseFunctionality(connectedContract: Contract, fnSuite: () => Promise<any>[]) {
    await connectedContract.pause();

    const promisesPre = fnSuite();
    await Promise.all(promisesPre.map(p => expect(p).to.be.revertedWith("Pausable: paused")));

    await connectedContract.unpause();

    const promisesPost = fnSuite();
    await Promise.all(promisesPost.map(p => expect(p).to.not.be.reverted));
}