import { ethers } from "hardhat";
import { expect } from "chai";
import { CSAMM } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ERC20Mock } from "../typechain-types/contracts/mocks";

async function deployERC20Mock(name: string, symbol: string): Promise<ERC20Mock> {
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  return await ERC20Mock.deploy(name, symbol);
}

describe("CSAMM", function () {
  let csamm: CSAMM;
  let token0: ERC20Mock;
  let token1: ERC20Mock;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const USER_BALANCE = ethers.parseEther("10000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    console.log("owner address:", owner.address);
    console.log("user1 address:", user1.address);
    console.log("user2 address:", user2.address);

    // 部署测试代币
    token0 = await deployERC20Mock("Token0", "TK0");
    token1 = await deployERC20Mock("Token1", "TK1");
    console.log("token0 deployed to:", await token0.getAddress());
    console.log("token1 deployed to:", await token1.getAddress());

    await token0.waitForDeployment();
    await token1.waitForDeployment();
    // 铸造初始代币供应量
    await token0.mint(owner.address, INITIAL_SUPPLY);
    await token1.mint(owner.address, INITIAL_SUPPLY);

    // 部署 CSAMM
    const CSAMMFactory = await ethers.getContractFactory("CSAMM");
    csamm = await CSAMMFactory.deploy(
      await token0.getAddress(),
      await token1.getAddress()
    );
    console.log("csamm deployed to:", await csamm.getAddress());

    // 给测试用户转一些代币
    await token0.transfer(user1.address, USER_BALANCE);
    await token1.transfer(user1.address, USER_BALANCE);
    await token0.transfer(user2.address, USER_BALANCE);
    await token1.transfer(user2.address, USER_BALANCE);
  });

  describe("Deployment", function () {
    it("Should set the correct token addresses", async function () {
      expect(await csamm.token0()).to.equal(await token0.getAddress());
      expect(await csamm.token1()).to.equal(await token1.getAddress());
    });

    it("Should have zero initial reserves", async function () {
      expect(await csamm.reserve0()).to.equal(0);
      expect(await csamm.reserve1()).to.equal(0);
      expect(await csamm.totalSupply()).to.equal(0);
    });
  });

  describe("Liquidity", function () {
    const amount0 = ethers.parseEther("1000");
    const amount1 = ethers.parseEther("1000");

    beforeEach(async function () {
      await token0.connect(user1).approve(await csamm.getAddress(), amount0);
      await token1.connect(user1).approve(await csamm.getAddress(), amount1);
    });

    it("Should add initial liquidity correctly", async function () {
      await csamm.connect(user1).addLiquidity(amount0, amount1);
      
      expect(await csamm.reserve0()).to.equal(amount0);
      expect(await csamm.reserve1()).to.equal(amount1);
      expect(await csamm.totalSupply()).to.equal(amount0 + amount1);
      expect(await csamm.balanceOf(user1.address)).to.equal(amount0 + amount1);
    });

    it("Should add subsequent liquidity correctly", async function () {
      // 首先添加初始流动性
      await csamm.connect(user1).addLiquidity(amount0, amount1);
      
      const initialTotalSupply = await csamm.totalSupply();
      
      // user2 添加相同数量的流动性
      await token0.connect(user2).approve(await csamm.getAddress(), amount0);
      await token1.connect(user2).approve(await csamm.getAddress(), amount1);
      await csamm.connect(user2).addLiquidity(amount0, amount1);

      expect(await csamm.reserve0()).to.equal(amount0 * 2n);
      expect(await csamm.reserve1()).to.equal(amount1 * 2n);
      expect(await csamm.totalSupply()).to.equal((amount0 + amount1) * 2n);
      expect(await csamm.balanceOf(user2.address)).to.equal(initialTotalSupply);
    });

    it("Should add liquidity with different ratios", async function () {
      // 初始流动性 1:1
      await csamm.connect(user1).addLiquidity(amount0, amount1);
      
      // user2 添加 2:1 比例的流动性
      const amount0_2 = ethers.parseEther("2000");
      const amount1_2 = ethers.parseEther("1000");
      await token0.connect(user2).approve(await csamm.getAddress(), amount0_2);
      await token1.connect(user2).approve(await csamm.getAddress(), amount1_2);
      
      const totalSupplyBefore = await csamm.totalSupply();
      const reserve0Before = await csamm.reserve0();
      const reserve1Before = await csamm.reserve1();
      
      await csamm.connect(user2).addLiquidity(amount0_2, amount1_2);
      
      // 计算预期 shares: (d0 + d1) * totalSupply / (reserve0 + reserve1)
      const d0 = amount0_2;
      const d1 = amount1_2;
      const expectedShares = ((d0 + d1) * totalSupplyBefore) / (reserve0Before + reserve1Before);
      
      expect(await csamm.balanceOf(user2.address)).to.equal(expectedShares);
      expect(await csamm.reserve0()).to.equal(reserve0Before + d0);
      expect(await csamm.reserve1()).to.equal(reserve1Before + d1);
    });

    it("Should remove liquidity correctly", async function () {
      await csamm.connect(user1).addLiquidity(amount0, amount1);
      const shares = await csamm.balanceOf(user1.address);
      
      const balance0Before = await token0.balanceOf(user1.address);
      const balance1Before = await token1.balanceOf(user1.address);
      
      await csamm.connect(user1).removeLiquidity(shares);

      expect(await csamm.reserve0()).to.equal(0);
      expect(await csamm.reserve1()).to.equal(0);
      expect(await csamm.totalSupply()).to.equal(0);
      expect(await csamm.balanceOf(user1.address)).to.equal(0);
      
      // 用户应该收回所有代币
      expect(await token0.balanceOf(user1.address)).to.equal(balance0Before + amount0);
      expect(await token1.balanceOf(user1.address)).to.equal(balance1Before + amount1);
    });

    it("Should remove partial liquidity correctly", async function () {
      await csamm.connect(user1).addLiquidity(amount0, amount1);
      const totalShares = await csamm.balanceOf(user1.address);
      const sharesToRemove = totalShares / 2n;
      
      const reserve0Before = await csamm.reserve0();
      const reserve1Before = await csamm.reserve1();
      
      await csamm.connect(user1).removeLiquidity(sharesToRemove);
      
      expect(await csamm.reserve0()).to.equal(reserve0Before / 2n);
      expect(await csamm.reserve1()).to.equal(reserve1Before / 2n);
      expect(await csamm.totalSupply()).to.equal(totalShares / 2n);
      expect(await csamm.balanceOf(user1.address)).to.equal(totalShares / 2n);
    });

    it("Should fail when adding zero liquidity", async function () {
      await expect(
        csamm.connect(user1).addLiquidity(0, 0)
      ).to.be.revertedWith("shares = 0");
    });

    it("Should fail when removing more shares than owned", async function () {
      await csamm.connect(user1).addLiquidity(amount0, amount1);
      const shares = await csamm.balanceOf(user1.address);
      
      await expect(
        csamm.connect(user1).removeLiquidity(shares + 1n)
      ).to.be.reverted;
    });
  });

  describe("Swap", function () {
    const initialLiquidity = ethers.parseEther("1000");

    beforeEach(async function () {
      // 添加初始流动性
      await token0.connect(user1).approve(await csamm.getAddress(), initialLiquidity);
      await token1.connect(user1).approve(await csamm.getAddress(), initialLiquidity);
      await csamm.connect(user1).addLiquidity(initialLiquidity, initialLiquidity);
    });

    it("Should swap token0 for token1 correctly", async function () {
      const swapAmount = ethers.parseEther("100");
      
      // 先转账 token0 到合约（因为 swap 函数从余额变化计算 amountIn）
      await token0.connect(user2).transfer(await csamm.getAddress(), swapAmount);
      
      const balanceBefore = await token1.balanceOf(user2.address);
      const reserve0Before = await csamm.reserve0();
      const reserve1Before = await csamm.reserve1();
      
      await csamm.connect(user2).swap(await token0.getAddress(), swapAmount);
      
      const balanceAfter = await token1.balanceOf(user2.address);
      const reserve0After = await csamm.reserve0();
      const reserve1After = await csamm.reserve1();

      // 检查收到的代币数量（考虑0.3%的手续费）
      const expectedOutput = (swapAmount * 997n) / 1000n;
      expect(balanceAfter - balanceBefore).to.equal(expectedOutput);
      
      // 检查储备更新
      expect(reserve0After).to.equal(reserve0Before + swapAmount);
      expect(reserve1After).to.equal(reserve1Before - expectedOutput);
    });

    it("Should swap token1 for token0 correctly", async function () {
      const swapAmount = ethers.parseEther("100");
      
      // 先转账 token1 到合约
      await token1.connect(user2).transfer(await csamm.getAddress(), swapAmount);
      
      const balanceBefore = await token0.balanceOf(user2.address);
      const reserve0Before = await csamm.reserve0();
      const reserve1Before = await csamm.reserve1();
      
      await csamm.connect(user2).swap(await token1.getAddress(), swapAmount);
      
      const balanceAfter = await token0.balanceOf(user2.address);
      const reserve0After = await csamm.reserve0();
      const reserve1After = await csamm.reserve1();

      // 检查收到的代币数量（考虑0.3%的手续费）
      const expectedOutput = (swapAmount * 997n) / 1000n;
      expect(balanceAfter - balanceBefore).to.equal(expectedOutput);
      
      // 检查储备更新
      expect(reserve0After).to.equal(reserve0Before - expectedOutput);
      expect(reserve1After).to.equal(reserve1Before + swapAmount);
    });

    it("Should use fixed ratio formula for swap (1:0.997)", async function () {
      const swapAmount = ethers.parseEther("100");
      
      const reserve0Before = await csamm.reserve0();
      const reserve1Before = await csamm.reserve1();
      
      await token0.connect(user2).transfer(await csamm.getAddress(), swapAmount);
      await csamm.connect(user2).swap(await token0.getAddress(), swapAmount);
      
      const reserve0After = await csamm.reserve0();
      const reserve1After = await csamm.reserve1();
      
      // 检查储备是否正确更新
      expect(reserve0After).to.equal(reserve0Before + swapAmount);
      
      // 检查输出代币数量（固定比例 1:0.997，不考虑储备量）
      const expectedOutput = (swapAmount * 997n) / 1000n;
      expect(reserve1After).to.equal(reserve1Before - expectedOutput);
      
      // 验证固定比例计算：amountOut = amountIn * 997 / 1000
      const actualOutput = reserve1Before - reserve1After;
      expect(actualOutput).to.equal(expectedOutput);
      
      // 由于使用固定比例而非常量乘积公式，总储备量会因手续费而增加
      const totalReservesBefore = reserve0Before + reserve1Before;
      const totalReservesAfter = reserve0After + reserve1After;
      const feeAmount = swapAmount - expectedOutput; // 手续费 = 3 / 1000 * swapAmount
      expect(totalReservesAfter).to.equal(totalReservesBefore + feeAmount);
    });

    it("Should fail when trying to swap with unsupported token", async function () {
      const invalidToken = await deployERC20Mock("Invalid", "INV");
      await invalidToken.mint(owner.address, INITIAL_SUPPLY);
      
      await expect(
        csamm.connect(user2).swap(await invalidToken.getAddress(), ethers.parseEther("100"))
      ).to.be.revertedWith("tokenIn is not support");
    });

    it("Should fail when swapping with insufficient liquidity", async function () {
      const swapAmount = ethers.parseEther("2000"); // 超过储备量
      
      await token0.connect(user2).transfer(await csamm.getAddress(), swapAmount);
      
      // 这应该会失败，因为储备量不足
      await expect(
        csamm.connect(user2).swap(await token0.getAddress(), swapAmount)
      ).to.be.reverted;
    });

    it("Should handle multiple swaps correctly", async function () {
      const swapAmount = ethers.parseEther("50");
      
      // 第一次交换
      await token0.connect(user2).transfer(await csamm.getAddress(), swapAmount);
      await csamm.connect(user2).swap(await token0.getAddress(), swapAmount);
      
      const reserve0AfterFirst = await csamm.reserve0();
      const reserve1AfterFirst = await csamm.reserve1();
      
      // 第二次交换（反向）
      await token1.connect(user2).transfer(await csamm.getAddress(), swapAmount);
      await csamm.connect(user2).swap(await token1.getAddress(), swapAmount);
      
      // 储备应该回到接近初始状态（由于手续费会略有不同）
      const reserve0AfterSecond = await csamm.reserve0();
      const reserve1AfterSecond = await csamm.reserve1();
      
      // 由于手续费，储备不会完全回到初始状态
      expect(reserve0AfterSecond).to.be.lt(reserve0AfterFirst);
      expect(reserve1AfterSecond).to.be.gt(reserve1AfterFirst);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small liquidity amounts", async function () {
      const smallAmount = ethers.parseEther("0.0001");
      await token0.connect(user1).approve(await csamm.getAddress(), smallAmount);
      await token1.connect(user1).approve(await csamm.getAddress(), smallAmount);
      
      await csamm.connect(user1).addLiquidity(smallAmount, smallAmount);
      
      expect(await csamm.reserve0()).to.equal(smallAmount);
      expect(await csamm.reserve1()).to.equal(smallAmount);
    });

    it("Should handle large swap amounts", async function () {
      // 给 user1 更多代币用于添加大额流动性
      await token0.mint(user1.address, ethers.parseEther("200000"));
      await token1.mint(user1.address, ethers.parseEther("200000"));
      
      const largeLiquidity = ethers.parseEther("100000");
      await token0.connect(user1).approve(await csamm.getAddress(), largeLiquidity);
      await token1.connect(user1).approve(await csamm.getAddress(), largeLiquidity);
      await csamm.connect(user1).addLiquidity(largeLiquidity, largeLiquidity);
      
      const largeSwap = ethers.parseEther("10000");
      await token0.connect(user2).transfer(await csamm.getAddress(), largeSwap);
      
      const balanceBefore = await token1.balanceOf(user2.address);
      await csamm.connect(user2).swap(await token0.getAddress(), largeSwap);
      const balanceAfter = await token1.balanceOf(user2.address);
      
      const expectedOutput = (largeSwap * 997n) / 1000n;
      expect(balanceAfter - balanceBefore).to.equal(expectedOutput);
    });
  });
});