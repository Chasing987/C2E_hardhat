// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract BoxV2 is Initializable{
    
    uint public x;
    function initialize(uint _val)external initializer{
        x = _val;
    }

    function cal() external {
        x = x * 2;
    }

       function showInvoke() external pure returns (bytes memory){
        return abi.encodeWithSelector(this.initialize.selector, 1);
    }
}