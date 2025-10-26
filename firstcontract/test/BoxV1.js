const hre = require("hardhat");

async function deploy() {
    // V1版本工厂

    const BoxV1 = await hre.ethers.getContractFactory("BoxV1");

    // 通过V1版本部署代理
    const v1 = await hre.upgrades.deployProxy(BoxV1, [1], { initializer: 'initialize' });

    await v1.waitForDeployment();

    console.log("BoxV1 deployed to:", await v1.getAddress());
    console.log("BoxV1 value of x:", await v1.x());
    await v1.cal();

    console.log("after BoxV1 value of x:", await v1.x());
}

deploy();