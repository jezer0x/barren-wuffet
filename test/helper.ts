import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract, ContractReceipt, ContractTransaction } from "ethers";

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


export async function getHashFromEvent(fnPromise: Promise<ContractTransaction>, eventName: string, eventAddress: string, eventKey: string) {
    const receipt: ContractReceipt = await tx(fnPromise);

    const events = receipt.events;
    // address isnt in the definition. need to double check why it's being  passed through
    //@ts-ignore
    const hashEvent = events?.find((x: { event: string; address: string }) => x.event == eventName && x.address == eventAddress);
    const args = hashEvent?.args;
    return (typeof args === "object") && args[eventKey];
}

export async function tx(fnPromise: Promise<ContractTransaction>): Promise<ContractReceipt> {
    return (await fnPromise).wait();
}