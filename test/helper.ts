import { expect } from "chai";
import { BigNumber, Contract, ContractReceipt, ContractTransaction, FixedNumber } from "ethers";
import { ETH_TOKEN, GT, LT, TIMESTAMP_TRIGGER_TYPE, TOKEN_TYPE } from "./Constants";
import { ethers, getNamedAccounts } from "hardhat";
import { ActionStruct } from "../typechain-types/contracts/actions/IAction";
import { TriggerStruct } from "../typechain-types/contracts/triggers/ITrigger";
import { LibDataTypes } from "../typechain-types/contracts/testing/TestGelatoOps";

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
    id: BigNumber.from(0)
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

export async function whitelistAction(actionAddr: string) {
  const { deployer } = await getNamedAccounts();
  const whitelistService = await ethers.getContract("WhitelistService");
  const actWlHash = await whitelistService.getWhitelistHash(deployer, "actions");
  await whitelistService.addToWhitelist(actWlHash, actionAddr);
}

export async function getFees(fund: Contract, collaterals: Array<BigNumber>) {
  let fees = [];
  const feePercentage = (await fund.feeParams()).managerToPlatformFeePercentage / 100.0;

  for (var i = 0; i < collaterals.length; i++) {
    fees.push(multiplyNumberWithBigNumber(feePercentage, collaterals[i]));
  }
  return fees;
}

export function multiplyNumberWithBigNumber(a: Number, b: BigNumber) {
  return BigNumber.from(
    FixedNumber.from(a.toFixed(18)) // toFixed(18) to catch case of FixedNumber.from(1.0/1100) failing
      .mulUnsafe(FixedNumber.from(b)) // I don't know why mulUnsafe!
      .toString()
      .split(".")[0] // BigNumber can't take decimal...
  );
}

export function createTwapTriggerSet(
  startTime: number,
  numIntervals: number,
  gapBetweenIntervals: number,
  timestampTriggerAddr: string,
  tolerance: number = 13,
  additionalTriggers: TriggerStruct[] = []
) {
  var triggersSet = [];

  for (var i = 0; i < numIntervals; i++) {
    triggersSet.push(
      additionalTriggers.concat([
        createTimestampTrigger(timestampTriggerAddr, GT, startTime + i * gapBetweenIntervals - 1),
        createTimestampTrigger(timestampTriggerAddr, LT, startTime + i * gapBetweenIntervals + tolerance)
      ])
    );
  }

  return triggersSet;
}

export async function createTwapOnChain(
  fundContract: Contract,
  totalCollaterals: BigNumber[],
  action: ActionStruct,
  startTime: number,
  numIntervals: number,
  gapBetweenIntervals: number,
  timestampTriggerAddr: string,
  tolerance: number = 13,
  additionalTriggers: TriggerStruct[] = []
) {
  const triggersSet = createTwapTriggerSet(
    startTime,
    numIntervals,
    gapBetweenIntervals,
    timestampTriggerAddr,
    tolerance,
    additionalTriggers
  );
  const collateralsPerInterval = totalCollaterals.map(collateral => {
    return collateral.div(numIntervals);
  });

  var actionsSet = [];
  var activatesSet = [];
  var collateralsSet = [];
  var feesSet = [];

  for (var i = 0; i < triggersSet.length; i++) {
    actionsSet.push(action);
    activatesSet.push(true);
    collateralsSet.push(collateralsPerInterval);
    feesSet.push(getFees(fundContract, collateralsPerInterval));
  }

  await fundContract.createRules(triggersSet, actionsSet, activatesSet, collateralsSet, feesSet);
}

export function createTimestampTrigger(timestampTriggerAddr: string, operator: number, target: number) {
  return {
    createTimeParams: ethers.utils.defaultAbiCoder.encode(["uint8", "uint256"], [operator, target]),
    triggerType: TIMESTAMP_TRIGGER_TYPE,
    callee: timestampTriggerAddr
  };
}
