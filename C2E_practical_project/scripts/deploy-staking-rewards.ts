import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { formatEther, parseEther } from "ethers";
import type { StakingRewards } from "../typechain-types/contracts/07_StakingRewards";
import { ERC20Mock } from "../typechain-types/contracts/mocks";

async function main() {
    console.log("=".repeat(50));
    console.log("开始部署质押奖励系统...");
    console.log("=".repeat(50));

    // 获取部署账户
    const [deployer, owner, user1, user2] = await ethers.getSigners();
    console.log("\n部署账户:", deployer.address);
    console.log("所有者账户:", owner.address);
    console.log("用户1账户:", user1.address);
    console.log("用户2账户:", user2.address);
    console.log("部署账户余额:", formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

    // 1. 部署质押代币合约
    console.log("\n--- 步骤 1: 部署质押代币 (Staking Token) ---");
    const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    const stakingToken = await ERC20MockFactory.deploy("Staking Token", "STK") as ERC20Mock;
    await stakingToken.waitForDeployment();
    const stakingTokenAddress = await stakingToken.getAddress();
    console.log("✅ 质押代币部署地址：", stakingTokenAddress);

    // 2. 部署奖励代币合约
    console.log("\n--- 步骤 2: 部署奖励代币 (Rewards Token) ---");
    const rewardsToken = await ERC20MockFactory.deploy("Rewards Token", "RWD") as ERC20Mock;
    await rewardsToken.waitForDeployment();
    const rewardsTokenAddress = await rewardsToken.getAddress();
    console.log("✅ 奖励代币部署地址：", rewardsTokenAddress);

    // 3. 部署 StakingRewards 合约
    console.log("\n--- 步骤 3: 部署 StakingRewards 合约 ---");
    const StakingRewardsFactory = await ethers.getContractFactory("StakingRewards");
    const stakingRewards = await StakingRewardsFactory.connect(owner).deploy(
        stakingTokenAddress,
        rewardsTokenAddress
    ) as StakingRewards;
    await stakingRewards.waitForDeployment();
    const stakingRewardsAddress = await stakingRewards.getAddress();
    console.log("✅ StakingRewards 部署地址：", stakingRewardsAddress);
    console.log("✅ 合约所有者：", await stakingRewards.owner());

    // 4. 分配代币给测试账户
    console.log("\n--- 步骤 4: 分配代币给测试账户 ---");
    const stakingTokenAmount = parseEther("10000");
    const rewardsTokenAmount = parseEther("100000");

    // 给用户分配质押代币
    await stakingToken.mint(await user1.getAddress(), stakingTokenAmount);
    await stakingToken.mint(await user2.getAddress(), stakingTokenAmount);
    console.log(`✅ 已给用户1 ${await user1.getAddress()} 分配 ${formatEther(stakingTokenAmount)} STK`);
    console.log(`✅ 已给用户2 ${await user2.getAddress()} 分配 ${formatEther(stakingTokenAmount)} STK`);

    // 给所有者分配奖励代币
    await rewardsToken.mint(await owner.getAddress(), rewardsTokenAmount);
    console.log(`✅ 已给所有者 ${await owner.getAddress()} 分配 ${formatEther(rewardsTokenAmount)} RWD`);

    // 5. 设置奖励周期
    console.log("\n--- 步骤 5: 设置奖励周期 ---");
    const duration = 7 * 24 * 60 * 60; // 7天
    const rewardAmount = parseEther("10000");

    await stakingRewards.connect(owner).setRewardDuration(duration);
    console.log(`✅ 奖励周期已设置为 ${duration / (24 * 60 * 60)} 天`);

    // 6. 转入奖励代币到合约
    console.log("\n--- 步骤 6: 转入奖励代币到合约 ---");
    await rewardsToken.connect(owner).transfer(stakingRewardsAddress, rewardAmount);
    console.log(`✅ 已向合约转入 ${formatEther(rewardAmount)} RWD 作为奖励`);

    // 7. 开始奖励周期
    console.log("\n--- 步骤 7: 开始奖励周期 ---");
    const tx = await stakingRewards.connect(owner).notifyRewardAmount(rewardAmount);
    await tx.wait();
    const finishAt = await stakingRewards.finishAt();
    const rewardRate = await stakingRewards.rewardRate();
    console.log(`✅ 奖励周期已开始`);
    console.log(`   奖励速率: ${formatEther(rewardRate)} RWD/秒`);
    console.log(`   结束时间: ${new Date(Number(finishAt) * 1000).toLocaleString()}`);

    // 8. 演示用户质押
    console.log("\n--- 步骤 8: 演示用户质押 ---");
    const stakeAmount1 = parseEther("1000");
    const stakeAmount2 = parseEther("500");

    // 用户1质押
    await stakingToken.connect(user1).approve(stakingRewardsAddress, stakeAmount1);
    await stakingRewards.connect(user1).stake(stakeAmount1);
    console.log(`✅ 用户1已质押 ${formatEther(stakeAmount1)} STK`);

    // 用户2质押
    await stakingToken.connect(user2).approve(stakingRewardsAddress, stakeAmount2);
    await stakingRewards.connect(user2).stake(stakeAmount2);
    console.log(`✅ 用户2已质押 ${formatEther(stakeAmount2)} STK`);

    // 9. 查询当前状态
    console.log("\n--- 步骤 9: 查询当前状态 ---");
    const totalSupply = await stakingRewards.totalSupply();
    const user1Balance = await stakingRewards.balanceOf(await user1.getAddress());
    const user2Balance = await stakingRewards.balanceOf(await user2.getAddress());
    const user1Earned = await stakingRewards.earned(await user1.getAddress());
    const user2Earned = await stakingRewards.earned(await user2.getAddress());

    console.log("\n📊 质押统计：");
    console.log(`   总质押量: ${formatEther(totalSupply)} STK`);
    console.log(`   用户1质押: ${formatEther(user1Balance)} STK`);
    console.log(`   用户2质押: ${formatEther(user2Balance)} STK`);

    console.log("\n💰 奖励统计：");
    console.log(`   用户1可领取: ${formatEther(user1Earned)} RWD`);
    console.log(`   用户2可领取: ${formatEther(user2Earned)} RWD`);

    // 10. 验证部署结果
    console.log("\n--- 步骤 10: 验证部署结果 ---");
    const deployerStakingBalance = await stakingToken.balanceOf(await deployer.getAddress());
    const user1StakingBalance = await stakingToken.balanceOf(await user1.getAddress());
    const user2StakingBalance = await stakingToken.balanceOf(await user2.getAddress());
    const ownerRewardBalance = await rewardsToken.balanceOf(await owner.getAddress());
    const contractRewardBalance = await rewardsToken.balanceOf(stakingRewardsAddress);

    console.log("\n💵 代币余额：");
    console.log(`   部署账户质押代币: ${formatEther(deployerStakingBalance)} STK`);
    console.log(`   用户1质押代币: ${formatEther(user1StakingBalance)} STK`);
    console.log(`   用户2质押代币: ${formatEther(user2StakingBalance)} STK`);
    console.log(`   所有者奖励代币: ${formatEther(ownerRewardBalance)} RWD`);
    console.log(`   合约奖励代币: ${formatEther(contractRewardBalance)} RWD`);

    console.log("\n" + "=".repeat(50));
    console.log("✅ 部署完成！");
    console.log("=".repeat(50));
    console.log("\n📋 部署摘要：");
    console.log("   质押代币地址：", stakingTokenAddress);
    console.log("   奖励代币地址：", rewardsTokenAddress);
    console.log("   StakingRewards 地址：", stakingRewardsAddress);
    console.log("   合约所有者：", await stakingRewards.owner());
    console.log("   奖励周期：", duration / (24 * 60 * 60), "天");
    console.log("   奖励金额：", formatEther(rewardAmount), "RWD");
    console.log("\n💡 使用提示：");
    console.log("   1. 用户可以随时质押更多代币: stake(amount)");
    console.log("   2. 用户可以提取质押: withdraw(amount)");
    console.log("   3. 用户可以领取奖励: getReward()");
    console.log("   4. 查询可领取奖励: earned(userAddress)");
    console.log("   5. 所有者可以设置新奖励周期: notifyRewardAmount(amount)");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

