import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";

async function foo() {
    const HW = await ethers.getContractFactory("HelloWorld");
    const hw = await HW.deploy();
    await hw.waitForDeployment();

    return hw;
}

async function deploy() {
    const hw = await foo();
    return hw;
}

async function sayHello(hello:any) {
    console.log("Say Hello:", await hello.hello());
}

deploy().then(sayHello);