import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying from:", deployer.address);

  // Deploy MyToken (ERC20)
  const TokenFactory = await ethers.getContractFactory("MyToken");
  const token = await TokenFactory.deploy();
  await token.waitForDeployment();
  console.log("MyToken deployed to:", await token.getAddress());

  // Deploy Vault
  const VaultFactory = await ethers.getContractFactory("Vault");
  const vault = await VaultFactory.deploy(await token.getAddress());
  await vault.waitForDeployment();
  console.log("Vault deployed to:", await vault.getAddress());

  console.log("Done");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
