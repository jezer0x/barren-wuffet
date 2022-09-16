import { Created, OwnershipTransferred, Paused, Unpaused } from "../generated/BarrenWuffet/BarrenWuffet";
import { Fund as FundEntity } from "../generated/schema";
import { Fund as FundTemplate } from "../generated/templates";

export function handleCreated(event: Created): void {
  // create a new Data Source from the Template so Node can index this new clone too
  FundTemplate.create(event.params.fundAddr);

  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = FundEntity.load(event.params.fundAddr);

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!entity) {
    entity = new FundEntity(event.params.fundAddr);
  }

  // Entity fields can be set based on event parameters
  entity.manager = event.params.manager;
  entity.creation_timestamp = event.block.timestamp;
  entity.subscribers = [];
  entity.actions = [];
  entity.rules = [];
  entity.fund_pending_positions = [];
  entity.robocop_pending_positions = [];

  // Entities can be written to the store with `.save()`
  entity.save();

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.actionWhitelistHash(...)
  // - contract.createFund(...)
  // - contract.feeParams(...)
  // - contract.fundImplAddr(...)
  // - contract.owner(...)
  // - contract.paused(...)
  // - contract.roboCopImplAddr(...)
  // - contract.triggerWhitelistHash(...)
  // - contract.wlServiceAddr(...)
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handlePaused(event: Paused): void {}

export function handleUnpaused(event: Unpaused): void {}
