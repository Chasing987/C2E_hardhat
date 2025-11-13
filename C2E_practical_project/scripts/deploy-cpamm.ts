import { ethers } from "hardhat";
import { CPAMM, CPAMM__factory } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 部署两个测试代币
  const TestToken = await ethers.getContractFactory("ERC20Mock");
  const token0 = await TestToken.deploy("Token0", "TK0");
  const token1 = await TestToken.deploy("Token1", "TK1");

  await token0.waitForDeployment();
  await token1.waitForDeployment();

  // 铸造一些初始代币用于测试
  const initialSupply = ethers.parseEther("1000000");
  await token0.mint(deployer.address, initialSupply);
  await token1.mint(deployer.address, initialSupply);

  console.log("Token0 deployed to:", await token0.getAddress());
  console.log("Token1 deployed to:", await token1.getAddress());

  // 部署 CPAMM
  const CPAMM: CPAMM__factory = await ethers.getContractFactory("CPAMM");
  const cpamm = await CPAMM.deploy(
    await token0.getAddress(),
    await token1.getAddress()
  );

  await cpamm.waitForDeployment();

  console.log("CPAMM deployed to:", await cpamm.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

