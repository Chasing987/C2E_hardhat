// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.24;

import "hardhat/console.sol";

contract Counter {
    uint counter;

    function  count() public returns (uint) {
        counter += 1;
        console.log("Counter is now:", counter);
        return counter;
        
    }
}
