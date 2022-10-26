import { BigInt } from "@graphprotocol/graph-ts";
import {
  Created,
  OwnershipTransferred,
  Paused,
  Unpaused,
  ManagerMetadata
} from "../generated/BarrenWuffet/BarrenWuffet";
import { Fund as FundEntity, Manager, SubConstraints } from "../generated/schema";
import { Fund as FundTemplate } from "../generated/templates";
import { Fund as FundContract } from "../generated/templates/Fund/Fund";

export function handleCreated(event: Created): void {
  // create a new Data Source from the Template so Node can index this new clone too
  FundTemplate.create(event.params.fundAddr);

  let fund = new FundEntity(event.params.fundAddr);
  let subStuff = FundContract.bind(event.params.fundAddr).subStuff();

  let manager = Manager.load(event.params.manager);
  if (!manager) {
    // has not set metadata yet
    manager = new Manager(event.params.manager);
    manager.save();
  }

  fund.name = event.params.fundName;
  fund.manager = event.params.manager;
  fund.creation_timestamp = event.block.timestamp;
  fund.total_collateral_raised = BigInt.zero();
  fund.manager_fee_percentage = BigInt.zero();
  fund.manager_fee_percentage = subStuff.getSubscriberToManagerFeePercentage();
  fund.save();

  let constraint_entity = new SubConstraints(event.params.fundAddr.toHexString() + "-constraints");
  let constraints = subStuff.getConstraints();
  constraint_entity.fund = event.params.fundAddr;
  constraint_entity.deadline = constraints.deadline;
  constraint_entity.lockin = constraints.lockin;
  constraint_entity.maxCollateralPerSub = constraints.maxCollateralPerSub;
  constraint_entity.minCollateralPerSub = constraints.minCollateralPerSub;
  constraint_entity.maxCollateralTotal = constraints.maxCollateralTotal;
  constraint_entity.minCollateralTotal = constraints.minCollateralTotal;
  constraint_entity.save();
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handlePaused(event: Paused): void {}

export function handleUnpaused(event: Unpaused): void {}

export function handleManagerMetadata(event: ManagerMetadata): void {
  let manager = new Manager(event.params.walletAddr);
  manager.aboutText = event.params.aboutText;
  manager.strategyText = event.params.strategyText;
  manager.chatroomInvite = event.params.chatroomInvite;
  manager.customLink = event.params.customLink;
  manager.socialHandle = event.params.socialHandle;
  manager.save();
}
