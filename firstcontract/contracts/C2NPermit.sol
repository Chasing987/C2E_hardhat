// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.4.0
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract C2NPermit is ERC20, ERC20Permit {
    constructor()
        ERC20("C2NPermit", "C2N")
        ERC20Permit("C2NPermit")
    {
        _mint(msg.sender, 100 * 10 ** decimals());
    }
}