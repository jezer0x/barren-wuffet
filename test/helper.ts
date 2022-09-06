import { expect } from "chai";
import { BigNumber, Contract, ContractReceipt, ContractTransaction } from "ethers";
import { ETH_TOKEN, TOKEN_TYPE } from "./Constants";

export async function getAddressFromEvent(
  fnPromise: Promise<ContractTransaction>,
  eventName: string,
  eventAddress: string,
  position: Number = 0
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
  return event.args[position];
}

export async function getHashFromEvent(
  fnPromise: Promise<ContractTransaction>,
  eventName: string,
  parseContract: Contract,
  eventKey: string
) {
  const receipt: ContractReceipt = await tx(fnPromise);

  const events = receipt.events;
  const parseFn = (x: any) => parseContract?.interface.parseLog(x) || { ...x, name: x.event };

  const parsedEvents = events?.filter((x: { address: string }) => x.address == parseContract.address)?.map(parseFn);

  // Address is definitely part of the event object. Not sure why typescript wont recognize it.
  // Need the check to disambiguate same-name events from multiple objects
  //@ts-ignore
  const hashEvent = parsedEvents?.find(
    //@ts-ignore
    (x: { name: string }) => x.name == eventName
  );

  const args = hashEvent?.args;
  return typeof args === "object" && args[eventKey];
}

export async function tx(fnPromise: Promise<ContractTransaction>): Promise<ContractReceipt> {
  return (await fnPromise).wait();
}

export function erc20(addr: string) {
  return {
    t: TOKEN_TYPE.ERC20,
    addr,
  };
}

export async function depositMaxCollateral(
  subscriber1Conn: Contract,
  subscriber2Conn: Contract,
  constraints: { maxCollateralTotal: any; maxCollateralPerSub: any; minCollateralPerSub: any }
) {
  const maxC = constraints.maxCollateralTotal;
  const depositAmt = constraints.maxCollateralPerSub;

  let d = BigNumber.from(depositAmt);
  let subscriberConns = [subscriber1Conn, subscriber2Conn];
  let i = 0;
  for (; d.lte(maxC); d = d.add(depositAmt)) {
    // alternate deposits, so both subscribers have deposits.
    await subscriberConns[i++ % 2].deposit(ETH_TOKEN, depositAmt, { value: depositAmt });
  }

  if (d.lt(maxC)) {
    const remDeposit = maxC.sub(d);
    if (remDeposit.lt(constraints.minCollateralPerSub)) {
      expect.fail(`Cant hit max collateral. Stuck at ${d.toString()} Pls fix this test`);
    }
    await subscriberConns[i++ % 2].deposit(ETH_TOKEN, remDeposit, { value: remDeposit });
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
