// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
// import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
 

contract UUPSV2 is UUPSUpgradeable, OwnableUpgradeable{
    uint public x;

    function _authorizeUpgrade(address implement) internal override {

    }

    function initialize(uint _var) external initializer{
        x = _var;
        __Ownable_init(msg.sender);
    }

    function cal() external {
        x = x * 2;
    }
}