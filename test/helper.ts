import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants, Contract, ContractReceipt, ContractTransaction } from "ethers";
import { ETH_ADDRESS } from "./Constants";

export async function testPauseAuthorization(
  contract: Contract,
  ownerWallet: SignerWithAddress,
  otherWallet: SignerWithAddress
) {
  const ownerCon = contract.connect(ownerWallet);
  const otherCon = contract.connect(otherWallet);

  await expect(otherCon.pause()).to.be.revertedWith("Ownable: caller is not the owner");
  await expect(ownerCon.pause()).to.emit(contract, "Paused");
  await expect(otherCon.unpause()).to.be.revertedWith("Ownable: caller is not the owner");
  await expect(ownerCon.unpause()).to.emit(contract, "Unpaused");
}

export async function testPauseFunctionality(connectedContract: Contract, fnSuite: (() => Promise<any>)[]) {
  await connectedContract.pause();

  // we want to execute these sequentially incase some depend on others
  for (const f of fnSuite) {
    await expect(f()).to.be.revertedWith("Pausable: paused");
  }

  await connectedContract.unpause();

  for (const f of fnSuite) {
    await expect(f()).to.not.be.reverted;
  }
}

export async function getAddressFromEvent(
  fnPromise: Promise<ContractTransaction>,
  eventName: string,
  eventAddress: string
) {
  const receipt: ContractReceipt = await tx(fnPromise);
  // Address is definitely part of the event object. Not sure why typescript wont recognize it.
  // Need the check to disambiguate same-name events from multiple objects
  //@ts-ignore
  const event = receipt?.events.find(
    //@ts-ignore
    (x: { event: string; address: string }) => x.event === eventName && x.address == eventAddress
  );

  //@ts-ignore
  const [addr] = event.args;

  return addr;
}

export async function getHashFromEvent(
  fnPromise: Promise<ContractTransaction>,
  eventName: string,
  eventAddress: string,
  eventKey: string
) {
  const receipt: ContractReceipt = await tx(fnPromise);

  const events = receipt.events;

  // Address is definitely part of the event object. Not sure why typescript wont recognize it.
  // Need the check to disambiguate same-name events from multiple objects
  //@ts-ignore
  const hashEvent = events?.find(
    //@ts-ignore
    (x: { event: string; address: string }) => x.event == eventName && x.address == eventAddress
  );
  const args = hashEvent?.args;
  return typeof args === "object" && args[eventKey];
}

export async function tx(fnPromise: Promise<ContractTransaction>): Promise<ContractReceipt> {
  return (await fnPromise).wait();
}

export async function depositMaxCollateral(
  subscriber1Conn: Contract,
  subscriber2Conn: Contract,
  fundHash: string,
  constraints: { maxCollateralTotal: any; maxCollateralPerSub: any; minCollateralPerSub: any }
) {
  const maxC = constraints.maxCollateralTotal;
  const depositAmt = constraints.maxCollateralPerSub;

  let d = BigNumber.from(depositAmt);
  let subscriberConns = [subscriber1Conn, subscriber2Conn];
  let i = 0;
  for (; d.lte(maxC); d = d.add(depositAmt)) {
    // alternate deposits, so both subscribers have deposits.
    await subscriberConns[i++ % 2].deposit(fundHash, ETH_ADDRESS, depositAmt, { value: depositAmt });
  }

  if (d.lt(maxC)) {
    const remDeposit = maxC.sub(d);
    if (remDeposit.lt(constraints.minCollateralPerSub)) {
      expect.fail(`Cant hit max collateral. Stuck at ${d.toString()} Pls fix this test`);
    }
    await subscriberConns[i++ % 2].deposit(fundHash, ETH_ADDRESS, remDeposit, { value: remDeposit });
  }
}

export function expectEthersObjDeepEqual(_expectedResult: Array<any> & object, _actualResult: Array<any> & object) {
  Object.entries(_expectedResult).map(([k, v]) => {
    // @ts-ignore
    const actualObj: any = _actualResult[k];

    if (v !== null && typeof v === "object") {
      if (Object.keys(actualObj).length === actualObj.length) {
        // a normal array
        v.map((_vItem: any, _i: number) => expectEthersObjDeepEqual(_vItem, actualObj[_i]));
        return;
      } else if (Object.keys(actualObj).length === actualObj.length * 2) {
        // ethers object-array hybrid
        expectEthersObjDeepEqual(v, actualObj);
        return;
      }
    }
    expect(actualObj).to.be.deep.equal(v);
  });
}
