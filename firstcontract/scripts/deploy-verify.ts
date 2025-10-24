import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";


async function foo() {
    const Verify = await ethers.getContractFactory("Verify");
    const v = await Verify.deploy();
    await v.waitForDeployment();
    return v;
}

async function deploy() {
    const v = await foo();
    console.log("Verify address is:", await v.getAddress());
    return v;
}

deploy();

 
