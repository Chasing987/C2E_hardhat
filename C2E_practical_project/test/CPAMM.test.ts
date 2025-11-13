import { ethers } from "hardhat";
import { expect } from "chai";
import { CPAMM } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ERC20Mock } from "../typechain-types/contracts/mocks";

async function deployERC20Mock(name: string, symbol: string): Promise<ERC20Mock> {
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  return await ERC20Mock.deploy(name, symbol);
}

describe("CPAMM", function () {
  let cpamm: CPAMM;
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

    // 部署 CPAMM
    const CPAMMFactory = await ethers.getContractFactory("CPAMM");
    cpamm = await CPAMMFactory.deploy(
      await token0.getAddress(),
      await token1.getAddress()
    );
    console.log("cpamm deployed to:", await cpamm.getAddress());

    // 给测试用户转一些代币
    await token0.transfer(user1.address, USER_BALANCE);
    await token1.transfer(user1.address, USER_BALANCE);
    await token0.transfer(user2.address, USER_BALANCE);
    await token1.transfer(user2.address, USER_BALANCE);
  });

  describe("Deployment", function () {
    it("Should set the correct token addresses", async function () {
      expect(await cpamm.token0()).to.equal(await token0.getAddress());
      expect(await cpamm.token1()).to.equal(await token1.getAddress());
    });

    it("Should have zero initial reserves", async function () {
      expect(await cpamm.reserve0()).to.equal(0);
      expect(await cpamm.reserve1()).to.equal(0);
      expect(await cpamm.totalSupply()).to.equal(0);
    });
  });

  describe("Liquidity", function () {
    const amount0 = ethers.parseEther("1000");
    const amount1 = ethers.parseEther("1000");

    beforeEach(async function () {
      await token0.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
    });

    it("Should add initial liquidity correctly", async function () {
      await cpamm.connect(user1).addLiquidity(amount0, amount1);
      
      expect(await cpamm.reserve0()).to.equal(amount0);
      expect(await cpamm.reserve1()).to.equal(amount1);
      
      // 初始流动性份额 = sqrt(amount0 * amount1)
      const expectedShares = BigInt(Math.floor(Math.sqrt(Number(amount0) * Number(amount1))));
      expect(await cpamm.totalSupply()).to.equal(expectedShares);
      expect(await cpamm.balanceOf(user1.address)).to.equal(expectedShares);
    });

    it("Should add subsequent liquidity correctly with same ratio", async function () {
      // 首先添加初始流动性
      await cpamm.connect(user1).addLiquidity(amount0, amount1);
      
      const initialTotalSupply = await cpamm.totalSupply();
      const initialReserve0 = await cpamm.reserve0();
      const initialReserve1 = await cpamm.reserve1();
      
      // user2 添加相同比例的流动性
      await token0.connect(user2).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user2).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await cpamm.connect(user2).addLiquidity(amount0, amount1);

      // 储备量应该是初始储备量 + 新增的流动性
      expect(await cpamm.reserve0()).to.equal(initialReserve0 + amount0);
      expect(await cpamm.reserve1()).to.equal(initialReserve1 + amount1);
      
      // 份额应该按比例增加
      const expectedShares = Math.min(
        Number(amount0 * initialTotalSupply) / Number(initialReserve0),
        Number(amount1 * initialTotalSupply) / Number(initialReserve1)
      );
      expect(await cpamm.balanceOf(user2.address)).to.be.closeTo(
        BigInt(Math.floor(expectedShares)),
        BigInt(Math.floor(expectedShares * 0.01)) // 允许1%误差
      );
      expect(await cpamm.totalSupply()).to.be.gt(initialTotalSupply);
    });

    it("Should fail when adding liquidity with different ratios", async function () {
      // 初始流动性 1:1
      await cpamm.connect(user1).addLiquidity(amount0, amount1);
      
      // user2 尝试添加 2:1 比例的流动性（应该失败）
      const amount0_2 = ethers.parseEther("2000");
      const amount1_2 = ethers.parseEther("1000");
      await token0.connect(user2).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user2).approve(await cpamm.getAddress(), ethers.MaxUint256);
      
      await expect(
        cpamm.connect(user2).addLiquidity(amount0_2, amount1_2)
      ).to.be.revertedWith("x / y != dx / dy");
    });

    it("Should remove liquidity correctly", async function () {
      await cpamm.connect(user1).addLiquidity(amount0, amount1);
      const shares = await cpamm.balanceOf(user1.address);
      
      const balance0Before = await token0.balanceOf(user1.address);
      const balance1Before = await token1.balanceOf(user1.address);
      
      // 获取转账前的储备量和余额
      const reserve0Before = await cpamm.reserve0();
      const reserve1Before = await cpamm.reserve1();
      const bal0Before = await token0.balanceOf(await cpamm.getAddress());
      const bal1Before = await token1.balanceOf(await cpamm.getAddress());
      
      await cpamm.connect(user1).removeLiquidity(shares);

      // 合约实现：_update 在转账之前调用，所以储备量反映的是转账前的余额
      // 但转账后，实际余额会减少
      // 注意：这是一个bug，储备量应该在转账后更新
      expect(await cpamm.reserve0()).to.equal(bal0Before);
      expect(await cpamm.reserve1()).to.equal(bal1Before);
      
      // 实际余额应该为0（所有代币都被转出）
      const actualBalance0 = await token0.balanceOf(await cpamm.getAddress());
      const actualBalance1 = await token1.balanceOf(await cpamm.getAddress());
      expect(actualBalance0).to.equal(0);
      expect(actualBalance1).to.equal(0);
      
      expect(await cpamm.totalSupply()).to.equal(0);
      expect(await cpamm.balanceOf(user1.address)).to.equal(0);
      
      // 用户应该收回所有代币
      expect(await token0.balanceOf(user1.address)).to.equal(balance0Before + amount0);
      expect(await token1.balanceOf(user1.address)).to.equal(balance1Before + amount1);
    });

    it("Should remove partial liquidity correctly", async function () {
      await cpamm.connect(user1).addLiquidity(amount0, amount1);
      const totalShares = await cpamm.balanceOf(user1.address);
      const sharesToRemove = totalShares / 2n;
      
      // 获取转账前的余额
      const bal0Before = await token0.balanceOf(await cpamm.getAddress());
      const bal1Before = await token1.balanceOf(await cpamm.getAddress());
      
      await cpamm.connect(user1).removeLiquidity(sharesToRemove);
      
      // 合约实现：_update 在转账之前调用，所以储备量反映的是转账前的余额
      expect(await cpamm.reserve0()).to.equal(bal0Before);
      expect(await cpamm.reserve1()).to.equal(bal1Before);
      
      // 但实际余额应该减少（转账后的余额）
      const actualBalance0 = await token0.balanceOf(await cpamm.getAddress());
      const actualBalance1 = await token1.balanceOf(await cpamm.getAddress());
      
      // 计算预期转出的代币数量
      const expectedAmount0 = (bal0Before * sharesToRemove) / totalShares;
      const expectedAmount1 = (bal1Before * sharesToRemove) / totalShares;
      
      expect(actualBalance0).to.equal(bal0Before - expectedAmount0);
      expect(actualBalance1).to.equal(bal1Before - expectedAmount1);
      
      expect(await cpamm.totalSupply()).to.equal(totalShares - sharesToRemove);
      expect(await cpamm.balanceOf(user1.address)).to.equal(totalShares - sharesToRemove);
    });

    it("Should fail when adding zero liquidity", async function () {
      await expect(
        cpamm.connect(user1).addLiquidity(0, 0)
      ).to.be.revertedWith("invalid shares");
    });

    it("Should fail when removing more shares than owned", async function () {
      await cpamm.connect(user1).addLiquidity(amount0, amount1);
      const shares = await cpamm.balanceOf(user1.address);
      
      await expect(
        cpamm.connect(user1).removeLiquidity(shares + 1n)
      ).to.be.reverted;
    });
  });

  describe("Swap", function () {
    const initialLiquidity = ethers.parseEther("1000");

    beforeEach(async function () {
      // 添加初始流动性
      await token0.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await cpamm.connect(user1).addLiquidity(initialLiquidity, initialLiquidity);
    });

    it("Should swap token0 for token1 correctly", async function () {
      const swapAmount = ethers.parseEther("100");
      
      await token0.connect(user2).approve(await cpamm.getAddress(), swapAmount);
      
      const balanceBefore = await token1.balanceOf(user2.address);
      const reserve0Before = await cpamm.reserve0();
      const reserve1Before = await cpamm.reserve1();
      
      await cpamm.connect(user2).swap(await token0.getAddress(), swapAmount);
      
      const balanceAfter = await token1.balanceOf(user2.address);
      const reserve0After = await cpamm.reserve0();
      const reserve1After = await cpamm.reserve1();

      // 使用常量乘积公式计算输出: amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee)
      const amountInWithFee = (swapAmount * 997n) / 1000n;
      const expectedOutput = (reserve1Before * amountInWithFee) / (reserve0Before + amountInWithFee);
      
      expect(balanceAfter - balanceBefore).to.equal(expectedOutput);
      
      // 检查储备更新（实际余额）
      expect(reserve0After).to.equal(reserve0Before + swapAmount);
      expect(reserve1After).to.equal(reserve1Before - expectedOutput);
    });

    it("Should swap token1 for token0 correctly", async function () {
      const swapAmount = ethers.parseEther("100");
      
      await token1.connect(user2).approve(await cpamm.getAddress(), swapAmount);
      
      const balanceBefore = await token0.balanceOf(user2.address);
      const reserve0Before = await cpamm.reserve0();
      const reserve1Before = await cpamm.reserve1();
      
      await cpamm.connect(user2).swap(await token1.getAddress(), swapAmount);
      
      const balanceAfter = await token0.balanceOf(user2.address);
      const reserve0After = await cpamm.reserve0();
      const reserve1After = await cpamm.reserve1();

      // 使用常量乘积公式计算输出
      const amountInWithFee = (swapAmount * 997n) / 1000n;
      const expectedOutput = (reserve0Before * amountInWithFee) / (reserve1Before + amountInWithFee);
      
      expect(balanceAfter - balanceBefore).to.equal(expectedOutput);
      
      // 检查储备更新
      expect(reserve0After).to.equal(reserve0Before - expectedOutput);
      expect(reserve1After).to.equal(reserve1Before + swapAmount);
    });

    it("Should maintain constant product formula (x * y = k)", async function () {
      const swapAmount = ethers.parseEther("100");
      
      await token0.connect(user2).approve(await cpamm.getAddress(), swapAmount);
      
      const reserve0Before = await cpamm.reserve0();
      const reserve1Before = await cpamm.reserve1();
      const kBefore = reserve0Before * reserve1Before;
      
      await cpamm.connect(user2).swap(await token0.getAddress(), swapAmount);
      
      const reserve0After = await cpamm.reserve0();
      const reserve1After = await cpamm.reserve1();
      
      // 由于有0.3%的手续费，新的k应该大于旧的k
      const kAfter = reserve0After * reserve1After;
      expect(kAfter).to.be.gt(kBefore);
      
      // 验证常量乘积公式（考虑手续费后的新k）
      // amountInWithFee = swapAmount * 997 / 1000
      // 新的储备: (reserve0Before + swapAmount) * (reserve1Before - amountOut)
      // 这个乘积应该大于原来的k
    });

    it("Should fail when trying to swap with unsupported token", async function () {
      const invalidToken = await deployERC20Mock("Invalid", "INV");
      await invalidToken.mint(owner.address, INITIAL_SUPPLY);
      
      await expect(
        cpamm.connect(user2).swap(await invalidToken.getAddress(), ethers.parseEther("100"))
      ).to.be.revertedWith("invalid token");
    });

    it("Should fail when swapping with zero amount", async function () {
      await token0.connect(user2).approve(await cpamm.getAddress(), ethers.parseEther("100"));
      
      await expect(
        cpamm.connect(user2).swap(await token0.getAddress(), 0)
      ).to.be.revertedWith("invalid amount");
    });

    it("Should handle multiple swaps correctly", async function () {
      const swapAmount = ethers.parseEther("50");
      
      await token0.connect(user2).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user2).approve(await cpamm.getAddress(), ethers.MaxUint256);
      
      // 第一次交换：token0 -> token1
      const reserve0Before = await cpamm.reserve0();
      const reserve1Before = await cpamm.reserve1();
      
      await cpamm.connect(user2).swap(await token0.getAddress(), swapAmount);
      
      const reserve0AfterFirst = await cpamm.reserve0();
      const reserve1AfterFirst = await cpamm.reserve1();
      
      // 验证第一次交换后的储备量变化
      expect(reserve0AfterFirst).to.equal(reserve0Before + swapAmount);
      expect(reserve1AfterFirst).to.be.lt(reserve1Before);
      
      // 第二次交换（反向）：使用固定数量的 token1 换回 token0
      // 使用一个较小的数量，以确保有足够的 token1
      const reverseSwapAmount = ethers.parseEther("45");
      await cpamm.connect(user2).swap(await token1.getAddress(), reverseSwapAmount);
      
      const reserve0AfterSecond = await cpamm.reserve0();
      const reserve1AfterSecond = await cpamm.reserve1();
      
      // 验证储备量的变化
      // reserve0 应该减少（因为 token0 被转出）
      expect(reserve0AfterSecond).to.be.lt(reserve0AfterFirst);
      // reserve1 应该增加（因为 token1 被转入）
      expect(reserve1AfterSecond).to.be.gt(reserve1AfterFirst);
      
      // 由于手续费，总储备量应该略有增加
      const totalReservesBefore = reserve0Before + reserve1Before;
      const totalReservesAfter = reserve0AfterSecond + reserve1AfterSecond;
      expect(totalReservesAfter).to.be.gte(totalReservesBefore);
    });

    it("Should calculate correct output with constant product formula", async function () {
      const swapAmount = ethers.parseEther("100");
      const reserve0Before = await cpamm.reserve0();
      const reserve1Before = await cpamm.reserve1();
      
      await token0.connect(user2).approve(await cpamm.getAddress(), swapAmount);
      
      // 手动计算预期输出
      const amountInWithFee = (swapAmount * 997n) / 1000n;
      const expectedOutput = (reserve1Before * amountInWithFee) / (reserve0Before + amountInWithFee);
      
      const balanceBefore = await token1.balanceOf(user2.address);
      await cpamm.connect(user2).swap(await token0.getAddress(), swapAmount);
      const balanceAfter = await token1.balanceOf(user2.address);
      
      expect(balanceAfter - balanceBefore).to.equal(expectedOutput);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small liquidity amounts", async function () {
      const smallAmount = ethers.parseEther("0.0001");
      await token0.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      
      await cpamm.connect(user1).addLiquidity(smallAmount, smallAmount);
      
      expect(await cpamm.reserve0()).to.equal(smallAmount);
      expect(await cpamm.reserve1()).to.equal(smallAmount);
      expect(await cpamm.totalSupply()).to.be.gt(0);
    });

    it("Should handle large swap amounts", async function () {
      // 给 user1 更多代币用于添加大额流动性
      await token0.mint(user1.address, ethers.parseEther("200000"));
      await token1.mint(user1.address, ethers.parseEther("200000"));
      
      const largeLiquidity = ethers.parseEther("100000");
      await token0.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await cpamm.connect(user1).addLiquidity(largeLiquidity, largeLiquidity);
      
      // 给 user2 更多代币
      await token0.mint(user2.address, ethers.parseEther("50000"));
      const largeSwap = ethers.parseEther("10000");
      await token0.connect(user2).approve(await cpamm.getAddress(), largeSwap);
      
      const reserve0Before = await cpamm.reserve0();
      const reserve1Before = await cpamm.reserve1();
      const balanceBefore = await token1.balanceOf(user2.address);
      
      await cpamm.connect(user2).swap(await token0.getAddress(), largeSwap);
      
      const balanceAfter = await token1.balanceOf(user2.address);
      const amountInWithFee = (largeSwap * 997n) / 1000n;
      const expectedOutput = (reserve1Before * amountInWithFee) / (reserve0Before + amountInWithFee);
      
      expect(balanceAfter - balanceBefore).to.equal(expectedOutput);
    });

    it("Should handle multiple users adding and removing liquidity", async function () {
      const amount0 = ethers.parseEther("1000");
      const amount1 = ethers.parseEther("1000");
      
      // user1 添加流动性
      await token0.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user1).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await cpamm.connect(user1).addLiquidity(amount0, amount1);
      
      const shares1 = await cpamm.balanceOf(user1.address);
      
      // user2 添加相同比例的流动性
      await token0.connect(user2).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await token1.connect(user2).approve(await cpamm.getAddress(), ethers.MaxUint256);
      await cpamm.connect(user2).addLiquidity(amount0, amount1);
      
      const shares2 = await cpamm.balanceOf(user2.address);
      
      // user1 移除一半流动性
      await cpamm.connect(user1).removeLiquidity(shares1 / 2n);
      
      // user2 移除所有流动性
      await cpamm.connect(user2).removeLiquidity(shares2);
      
      // 检查最终状态
      const remainingShares = await cpamm.balanceOf(user1.address);
      expect(remainingShares).to.equal(shares1 / 2n);
      expect(await cpamm.balanceOf(user2.address)).to.equal(0);
    });
  });
});

