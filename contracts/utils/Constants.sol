// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library Constants {
    address constant ETH = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
    address constant USD = address(0);
    string constant TOKEN_TYPE_NOT_RECOGNIZED = "Token type not recognized";
    string constant UNREACHABLE_STATE = "This state should never be reached";
    string constant WRONG_NUMBER_OF_INPUT_TOKENS = "Action: Wrong number of input tokens"; 
    string constant WRONG_NUMBER_OF_OUTPUT_TOKENS = "Action: Wrong number of output tokens"; 
    string constant WRONG_TYPE_OF_INPUT_TOKEN = "Action: Wrong type of input token"; 
    string constant WRONG_TYPE_OF_OUTPUT_TOKEN = "Action: Wrong type of input token"; 
}
