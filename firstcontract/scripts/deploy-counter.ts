import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";

async function deploy() {
    const Counter = await ethers.getContractFactory("Counter");
    const counter = await Counter.deploy();

    await counter.waitForDeployment();
    console.log("Counter address is:", await counter.getAddress());
    return counter;
}

async function count(counter: any) {
    await counter.count();
    console.log('count is', await counter.getCount());
}

deploy().then(count);

 
