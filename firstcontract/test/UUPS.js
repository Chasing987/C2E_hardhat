const hre = require("hardhat");

async function deploy() {
    const _UUPSV1 = await hre.ethers.getContractFactory("UUPSV1");
    const v1 = await hre.upgrades.deployProxy(_UUPSV1, [1], { initializer: 'initialize', kind: 'uups' });

    await v1.waitForDeployment();

    console.log("UUPSV1 deployed to:", await v1.getAddress());
    console.log("Initial value:", await v1.x());
    await v1.cal();
    console.log("Now value:", await v1.x());

    // 升级
    const _UUPSV2 = await hre.ethers.getContractFactory("UUPSV2");
    await hre.upgrades.upgradeProxy(await v1.getAddress(), _UUPSV2);
    
    console.log("Value after upgrade:", await v1.x());
    await v1.cal();
    console.log("Now value:", await v1.x());
}

deploy();