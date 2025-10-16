import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";

async function deploy() {
    const Counter = await ethers.getContractFactory("Counter");
    const counter = await Counter.deploy();

    await counter.waitForDeployment();
    return counter;
}

async function count(counter: any) {
    console.log(await counter.count());
}

deploy().then(count);


