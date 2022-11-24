import { expect } from "chai";
import { BigNumber, Contract, ContractReceipt, ContractTransaction, FixedNumber } from "ethers";
import { ETH_TOKEN, GT, LT, TIMESTAMP_TRIGGER_TYPE, TOKEN_TYPE } from "./Constants";
import { config, ethers, getNamedAccounts } from "hardhat";
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

export async function getArgsFromEvent(
  fnPromise: Promise<ContractTransaction>,
  eventName: string,
  parseContract: Contract
) {
  const receipt: ContractReceipt = await tx(fnPromise);

  const events = receipt.events;
  const parseFn = (x: any) => parseContract?.interface.parseLog(x) || { ...x, name: x.event };

  const parsedEvents = events?.filter((x: { address: string }) => x.address == parseContract.address)?.map(parseFn);

  // Address is definitely part of the event object. Not sure why typescript wont recognize it.
  // Need the check to disambiguate same-name events from multiple objects
  //@ts-ignore
  const targetEvent = parsedEvents?.find(
    //@ts-ignore
    (x: { name: string }) => x.name == eventName
  );

  return targetEvent?.args;
}

export async function getHashFromEvent(
  fnPromise: Promise<ContractTransaction>,
  eventName: string,
  parseContract: Contract,
  eventKey: string
) {
  const args = await getArgsFromEvent(fnPromise, eventName, parseContract);
  //@ts-ignore
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
  const feePercentage = (await fund.feeParams()).managerToPlatformFeePercentage / 100.0;

  return collaterals.map(c => multiplyNumberWithBigNumber(feePercentage, c));
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
        createTimestampTrigger(timestampTriggerAddr, GT, startTime + i * gapBetweenIntervals),
        createTimestampTrigger(timestampTriggerAddr, LT, startTime + i * gapBetweenIntervals + tolerance)
      ])
    );
  }

  return triggersSet;
}

export interface TwapRange {
  startTime: number;
  numIntervals: number;
  gapBetweenIntervals: number;
}

export function percentOf(amount: BigNumber, basisPoints: BigNumber): BigNumber {
  return amount.mul(basisPoints).div(100);
}

/**
 * 
 * @param fundContract 
 * @param totalCollaterals: total number of assets to be used in the action
 * @param action 
 * @param twapRange: 
 * { 
 * startTime; block.timestamp where the first rule should be executed
 * numIntervals: How many transactions do you want
 *  gapBetweenIntervals: In seconds
 * @param timestampTriggerAddr
 * @param tolerance: specifying a window within which a tx may pass. Needed for inherent uncertainty of when a block is mined. 
 * @param additionalTriggers: more triggers to be included for each tx
 * 
 * Example Usage: 
 *         await createTwapOnChain(
          McFund,
          [ethers.utils.parseEther("20")],
          createSushiSwapAction(
            sushiSwapExactXForY.address,
            ETH_TOKEN,
            DAI_TOKEN,
            await encodeMinBPerA(ETH_TOKEN, DAI_TOKEN, daiPerETH * DEFAULT_SLIPPAGE),
            protocolAddresses.tokens.WETH
          ),
          { startTime: await time.latest(),
            numIntervals: 120 
            gapBetweenIntervals: 10 
          }
          (await ethers.getContract("TimestampTrigger")).address
        );
 */
export async function createTwapOnChain(
  fundContract: Contract,
  totalCollaterals: BigNumber[],
  action: ActionStruct,
  twapRange: TwapRange,
  timestampTriggerAddr: string,
  tolerance: number = 13,
  additionalTriggers: TriggerStruct[] = []
) {
  const { startTime, numIntervals, gapBetweenIntervals } = twapRange;
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

  const managerToPlatformFeePercentage = BigNumber.from(
    (await fundContract.feeParams()).managerToPlatformFeePercentage
  );
  const numTriggers = triggersSet.length;
  const platformFees = collateralsPerInterval.map(collateral => percentOf(collateral, managerToPlatformFeePercentage));

  await fundContract.createRules(
    triggersSet,
    Array(numTriggers).fill([action]),
    Array(numTriggers).fill(true),
    Array(numTriggers).fill(collateralsPerInterval),
    Array(numTriggers).fill(platformFees)
  );
}

export function createTimestampTrigger(timestampTriggerAddr: string, operator: number, target: number) {
  return {
    createTimeParams: ethers.utils.defaultAbiCoder.encode(["uint8", "uint256"], [operator, target]),
    triggerType: TIMESTAMP_TRIGGER_TYPE,
    callee: timestampTriggerAddr
  };
}

export function isForked(): boolean {
  if (config.networks.hardhat.forking?.enabled) {
    return true;
  } else {
    return false;
  }
}

export function getActionFromBytes(actionAsBytes: any) {
  return ethers.utils.defaultAbiCoder.decode(
    ["(address,bytes,(uint8,address,uint256)[],(uint8,address,uint256)[])"], // signature of an Action struct
    actionAsBytes
  )[0];
}
