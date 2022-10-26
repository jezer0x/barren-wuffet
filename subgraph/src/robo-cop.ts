import { Position, Rule, Action, Trigger, Token } from "../generated/schema";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Activated as ActivatedEvent,
  CollateralAdded as CollateralAddedEvent,
  CollateralReduced as CollateralReducedEvent,
  Created as CreatedEvent,
  Deactivated as DeactivatedEvent,
  Executed as ExecutedEvent,
  Initialized as InitializedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  PositionCreated as PositionCreatedEvent,
  PositionsClosed as PositionsClosedEvent,
  Redeemed as RedeemedEvent,
  RoboCop as RoboCopContract,
  RoboCop__getRuleResultValue0ActionsInputTokensStruct,
  RoboCop__getRuleResultValue0ActionsOutputTokensStruct
} from "../generated/templates/RoboCop/RoboCop";

export function handleActivated(event: ActivatedEvent): void {
  let rule = Rule.load(event.params.ruleHash.toHexString());
  if (!rule) {
    throw Error;
  }
  let ts_arr = rule.activation_timestamps;
  ts_arr.push(event.block.timestamp);
  rule.activation_timestamps = ts_arr;
  rule.save();
}

export function handleCollateralAdded(event: CollateralAddedEvent): void {
  let roboCop = RoboCopContract.bind(event.address);
  let rule = new Rule(event.params.ruleHash.toHexString());
  rule.collaterals = roboCop.getRule(event.params.ruleHash).collaterals;
  rule.save();
}

export function handleCollateralReduced(event: CollateralReducedEvent): void {
  let roboCop = RoboCopContract.bind(event.address);
  let rule = new Rule(event.params.ruleHash.toHexString());
  rule.collaterals = roboCop.getRule(event.params.ruleHash).collaterals;
  rule.save();
}

// Wtf? Graph doesn't let me use `any` or union of the 2 types...
function getTokenId1(token: RoboCop__getRuleResultValue0ActionsOutputTokensStruct): string {
  return token.addr.toHexString() + "-" + token.t.toString() + "-" + token.id.toString();
}

function getTokenId2(token: RoboCop__getRuleResultValue0ActionsInputTokensStruct): string {
  return token.addr.toHexString() + "-" + token.t.toString() + "-" + token.id.toString();
}

export function handleCreated(event: CreatedEvent): void {
  let fund = RoboCopContract.bind(event.address).owner();
  let rule_entity = new Rule(event.params.ruleHash.toHexString());
  let rule = RoboCopContract.bind(event.address).getRule(event.params.ruleHash);
  rule_entity.creation_timestamp = event.block.timestamp;
  rule_entity.activation_timestamps = [];
  rule_entity.deactivation_timestamps = [];
  rule_entity.collaterals = [];
  rule_entity.outputs = [];
  rule_entity.incentive = BigInt.zero();
  rule_entity.fund = fund.toHexString();

  rule_entity.save();

  let actions = rule.actions;
  for (var i = 0; i < actions.length; i++) {
    let action = new Action(
      event.transaction.hash.toHex() + "-" + event.logIndex.toString() + "-action-" + i.toString()
    );
    action.callee = actions[i].callee;
    action.data = actions[i].data;
    action.rule = event.params.ruleHash.toHexString();

    action.save();

    for (var j = 0; j < actions[i].inputTokens.length; j++) {
      let token = Token.load(getTokenId2(actions[i].inputTokens[j]));
      if (!token) {
        token = new Token(getTokenId2(actions[i].inputTokens[j]));
        token.address = actions[i].inputTokens[j].addr;
        token.type = BigInt.fromI32(actions[i].inputTokens[j].t);
        token.nft_id = actions[i].inputTokens[j].id;
        token.input_of = [];
        token.output_of = [];
      } else {
        token.input_of = token.input_of.concat([action.id]);
      }
      token.save();
    }

    for (var k = 0; k < actions[i].outputTokens.length; k++) {
      let token = Token.load(getTokenId1(actions[i].outputTokens[k]));
      if (!token) {
        token = new Token(getTokenId1(actions[i].outputTokens[k]));
        token.address = actions[i].outputTokens[k].addr;
        token.type = BigInt.fromI32(actions[i].outputTokens[k].t);
        token.nft_id = actions[i].outputTokens[k].id;
        token.input_of = [];
        token.output_of = [];
      } else {
        token.output_of = token.output_of.concat([action.id]);
      }
      token.save();
    }
  }

  let triggers = rule.triggers;
  for (var m = 0; m < triggers.length; m++) {
    let trigger = new Trigger(
      event.transaction.hash.toHex() + "-" + event.logIndex.toString() + "-trigger-" + m.toString()
    );
    trigger.callee = triggers[m].callee;
    trigger.type = BigInt.fromI32(triggers[m].triggerType);
    trigger.create_time_params = triggers[m].createTimeParams;
    trigger.rule = event.params.ruleHash.toHexString();
    trigger.save();
  }
}

export function handleDeactivated(event: DeactivatedEvent): void {
  let rule = Rule.load(event.params.ruleHash.toHexString());
  if (!rule) {
    throw Error;
  }
  let ts_arr = rule.deactivation_timestamps;
  ts_arr.push(event.block.timestamp);
  rule.deactivation_timestamps = ts_arr;
  rule.save();
}

export function handleExecuted(event: ExecutedEvent): void {
  let rule = new Rule(event.params.ruleHash.toHexString());
  rule.execution_timestamp = event.block.timestamp;
  rule.outputs = RoboCopContract.bind(event.address).getRule(event.params.ruleHash).outputs;
  rule.save();
}

export function handleInitialized(event: InitializedEvent): void {}

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {}

export function handlePositionCreated(event: PositionCreatedEvent): void {
  let fund = RoboCopContract.bind(event.address).owner();
  let position = new Position(event.params.positionHash.toHexString());
  position.next_actions = event.params.nextActions;
  position.fund = fund.toHexString();
  position.creation_timestamp = event.block.timestamp;
  position.save();
}

export function handlePositionsClosed(event: PositionsClosedEvent): void {
  var i: i32;
  for (i = 0; i < event.params.positionHashesClosed.length; i++) {
    let position = new Position(event.params.positionHashesClosed[i].toHexString());
    position.closed_timestamp = event.block.timestamp;
    position.save();
  }
}

export function handleRedeemed(event: RedeemedEvent): void {
  let rule = new Rule(event.params.ruleHash.toHexString());
  rule.redemption_timestamp = event.block.timestamp;
  rule.save();
}
