import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";

async function deploy() {
    const HelloWorld = await ethers.getContractFactory("HelloWorld");

    const hello = await HelloWorld.deploy();
    await hello.waitForDeployment();
    return hello;
}

async function sayHello(hello:any) {
    console.log("Say Hello:", await hello.hello());
}

deploy().then(sayHello);