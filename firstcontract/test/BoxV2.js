const hre = require("hardhat");

async function deploy() {
    // V2版本工厂

    const BoxV2 = await hre.ethers.getContractFactory("BoxV2");

    // 升级代理到V2版本
    const v2 = await hre.upgrades.upgradeProxy("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", BoxV2);

    await v2.waitForDeployment();

    console.log("BoxV1 deployed to:", await v2.getAddress());
    console.log("BoxV1 value of x:", await v2.x());
    await v2.cal();

    console.log("after BoxV1 value of x:", await v2.x());
}

deploy();