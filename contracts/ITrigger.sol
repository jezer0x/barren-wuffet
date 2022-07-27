pragma solidity ^0.8.9;
import "./RETypes.sol"; 

interface ITrigger {
    function checkTrigger(RETypes.Trigger memory trigger) external returns (bool, uint);
    function validateTrigger(RETypes.Trigger memory trigger) external view; 
}
