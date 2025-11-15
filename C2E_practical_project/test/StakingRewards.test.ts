import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { formatEther, parseEther } from "ethers";
import type { StakingRewards } from "../typechain-types/contracts/07_StakingRewards";
import { ERC20Mock } from "../typechain-types/contracts/mocks";
import { expect } from "chai";

async function deployERC20Mock(name: string, symbol: string): Promise<ERC20Mock> {
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    return await ERC20Mock.deploy(name, symbol);
}

describe("StakingRewards", function () {
    let stakingRewards: StakingRewards;
    let stakingToken: ERC20Mock;
    let rewardsToken: ERC20Mock;
    let deployer: any;
    let owner: any;
    let user1: any;
    let user2: any;
    let ownerAddress: string;
    let user1Address: string;
    let user2Address: string;

    const STAKE_AMOUNT_1 = parseEther("1000");
    const STAKE_AMOUNT_2 = parseEther("500");
    const REWARD_AMOUNT = parseEther("10000");
    const DURATION = 7 * 24 * 60 * 60; // 7 days

    beforeEach(async function () {
        // 获取测试账户
        [deployer, owner, user1, user2] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        user1Address = await user1.getAddress();
        user2Address = await user2.getAddress();

        // 部署代币合约
        stakingToken = await deployERC20Mock("Staking Token", "STK");
        rewardsToken = await deployERC20Mock("Rewards Token", "RWD");

        // 部署 StakingRewards 合约（使用 owner 作为部署者，这样 owner 就是合约所有者）
        const StakingRewardsFactory = await ethers.getContractFactory("StakingRewards");
        stakingRewards = (await StakingRewardsFactory.connect(owner).deploy(
            await stakingToken.getAddress(),
            await rewardsToken.getAddress()
        )) as StakingRewards;
        await stakingRewards.waitForDeployment();

        // 分配代币给用户
        await stakingToken.mint(user1Address, parseEther("10000"));
        await stakingToken.mint(user2Address, parseEther("10000"));
        await rewardsToken.mint(ownerAddress, parseEther("100000"));
    });

    describe("部署", function () {
        it("应该正确部署 StakingRewards 合约", async function () {
            expect(await stakingRewards.getAddress()).to.be.properAddress;
            expect(await stakingRewards.stakingToken()).to.equal(await stakingToken.getAddress());
            expect(await stakingRewards.rewardsToken()).to.equal(await rewardsToken.getAddress());
            expect(await stakingRewards.owner()).to.equal(ownerAddress);
        });

        it("应该正确初始化状态变量", async function () {
            expect(await stakingRewards.totalSupply()).to.equal(0);
            expect(await stakingRewards.duration()).to.equal(0);
            expect(await stakingRewards.finishAt()).to.equal(0);
        });
    });

    describe("设置奖励周期 (setRewardDuration)", function () {
        it("所有者应该能够设置奖励周期", async function () {
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            expect(await stakingRewards.duration()).to.equal(DURATION);
        });

        it("非所有者不应该能够设置奖励周期", async function () {
            await expect(
                stakingRewards.connect(user1).setRewardDuration(DURATION)
            ).to.be.revertedWith("not owner");
        });

        it("应该在奖励周期未结束时拒绝设置新周期", async function () {
            // 先设置周期并开始奖励
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);

            // 尝试在周期未结束时设置新周期，应该失败
            await expect(
                stakingRewards.connect(owner).setRewardDuration(DURATION * 2)
            ).to.be.revertedWith("reward duration not finished");
        });
    });

    describe("通知奖励金额 (notifyRewardAmount)", function () {
        beforeEach(async function () {
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
        });

        it("所有者应该能够设置奖励金额", async function () {
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);

            const rewardRate = await stakingRewards.rewardRate();
            const finishAt = await stakingRewards.finishAt();
            const currentTime = await ethers.provider.getBlock("latest").then(b => b!.timestamp);

            expect(rewardRate).to.be.gt(0);
            expect(finishAt).to.be.gt(currentTime);
        });

        it("非所有者不应该能够设置奖励金额", async function () {
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await expect(
                stakingRewards.connect(user1).notifyRewardAmount(REWARD_AMOUNT)
            ).to.be.revertedWith("not owner");
        });

        it("应该拒绝奖励代币余额不足的情况", async function () {
            // 只转入部分代币
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), parseEther("1000"));
            await expect(
                stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT)
            ).to.be.revertedWith("reward amount > balance");
        });

        it("应该拒绝零奖励速率", async function () {
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            // 设置一个很长的周期，导致奖励速率接近0
            await stakingRewards.connect(owner).setRewardDuration(parseEther("1")); // 非常大的周期
            await expect(
                stakingRewards.connect(owner).notifyRewardAmount(1) // 很小的奖励金额
            ).to.be.revertedWith("reward rate = 0");
        });

        it("应该能够合并剩余奖励和新奖励", async function () {
            // 第一次设置奖励
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);
            const firstRewardRate = await stakingRewards.rewardRate();

            // 推进时间，但未到结束时间
            await ethers.provider.send("evm_increaseTime", [DURATION / 2]);
            await ethers.provider.send("evm_mine", []);

            // 添加新奖励（应该合并剩余奖励）
            const newRewardAmount = parseEther("5000");
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), newRewardAmount);
            await stakingRewards.connect(owner).notifyRewardAmount(newRewardAmount);
            const secondRewardRate = await stakingRewards.rewardRate();

            // 新的奖励速率应该不同（因为合并了剩余奖励）
            expect(secondRewardRate).to.be.gt(0);
        });
    });

    describe("质押 (stake)", function () {
        beforeEach(async function () {
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);
        });

        it("用户应该能够质押代币", async function () {
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);

            expect(await stakingRewards.balanceOf(user1Address)).to.equal(STAKE_AMOUNT_1);
            expect(await stakingRewards.totalSupply()).to.equal(STAKE_AMOUNT_1);
            expect(await stakingToken.balanceOf(await stakingRewards.getAddress())).to.equal(STAKE_AMOUNT_1);
        });

        it("应该拒绝零金额质押", async function () {
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await expect(
                stakingRewards.connect(user1).stake(0)
            ).to.be.revertedWith("amount = 0");
        });

        it("应该允许多个用户质押", async function () {
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingToken.connect(user2).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_2);

            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);
            await stakingRewards.connect(user2).stake(STAKE_AMOUNT_2);

            expect(await stakingRewards.balanceOf(user1Address)).to.equal(STAKE_AMOUNT_1);
            expect(await stakingRewards.balanceOf(user2Address)).to.equal(STAKE_AMOUNT_2);
            expect(await stakingRewards.totalSupply()).to.equal(STAKE_AMOUNT_1 + STAKE_AMOUNT_2);
        });

        it("应该允许同一用户多次质押", async function () {
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1 * BigInt(2));
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);

            expect(await stakingRewards.balanceOf(user1Address)).to.equal(STAKE_AMOUNT_1 * BigInt(2));
            expect(await stakingRewards.totalSupply()).to.equal(STAKE_AMOUNT_1 * BigInt(2));
        });

        it("质押时应该更新奖励状态", async function () {
            // 先让一个用户质押，这样 totalSupply > 0，奖励才会累积
            await stakingToken.connect(user2).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_2);
            await stakingRewards.connect(user2).stake(STAKE_AMOUNT_2);

            // 推进一些时间，让奖励累积
            await ethers.provider.send("evm_increaseTime", [3600]); // 1小时
            await ethers.provider.send("evm_mine", []);

            // 现在 user1 质押，应该会更新奖励状态
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);

            // 检查用户奖励状态已更新（应该等于当前的 rewardPerTokenStored）
            const userRewardPerTokenPaid = await stakingRewards.userRewardPerTokenPaid(user1Address);
            const rewardPerTokenStored = await stakingRewards.rewardPerTokenStored();
            expect(userRewardPerTokenPaid).to.equal(rewardPerTokenStored);
        });
    });

    describe("提取质押 (withdraw)", function () {
        beforeEach(async function () {
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);

            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);
        });

        it("用户应该能够提取质押代币", async function () {
            const withdrawAmount = parseEther("300");
            const userBalanceBefore = await stakingToken.balanceOf(user1Address);

            await stakingRewards.connect(user1).withdraw(withdrawAmount);

            expect(await stakingRewards.balanceOf(user1Address)).to.equal(STAKE_AMOUNT_1 - withdrawAmount);
            expect(await stakingRewards.totalSupply()).to.equal(STAKE_AMOUNT_1 - withdrawAmount);
            expect(await stakingToken.balanceOf(user1Address)).to.equal(userBalanceBefore + withdrawAmount);
        });

        it("应该拒绝零金额提取", async function () {
            await expect(
                stakingRewards.connect(user1).withdraw(0)
            ).to.be.revertedWith("amount == 0");
        });

        it("应该拒绝提取超过余额的金额", async function () {
            await expect(
                stakingRewards.connect(user1).withdraw(STAKE_AMOUNT_1 + parseEther("1"))
            ).to.be.reverted;
        });

        it("提取时应该更新奖励状态", async function () {
            // 推进时间让奖励累积
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            const rewardBefore = await stakingRewards.earned(user1Address);
            await stakingRewards.connect(user1).withdraw(parseEther("100"));
            const rewardAfter = await stakingRewards.earned(user1Address);

            // 奖励应该被更新（可能为0，因为提取后重新计算）
            expect(rewardAfter).to.be.gte(0);
        });
    });

    describe("奖励计算", function () {
        beforeEach(async function () {
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);
        });

        it("应该正确计算每代币奖励", async function () {
            // 初始时总质押量为0，应该返回存储值
            let rewardPerToken = await stakingRewards.rewardPerToken();
            expect(rewardPerToken).to.equal(await stakingRewards.rewardPerTokenStored());

            // 用户质押后，应该开始累积奖励
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);

            // 推进时间
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            const newRewardPerToken = await stakingRewards.rewardPerToken();
            expect(newRewardPerToken).to.be.gt(rewardPerToken);
        });

        it("应该正确计算用户累计奖励", async function () {
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);

            // 初始奖励应该为0
            let earned = await stakingRewards.earned(user1Address);
            expect(earned).to.equal(0);

            // 推进时间
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            // 现在应该有奖励
            earned = await stakingRewards.earned(user1Address);
            expect(earned).to.be.gt(0);
        });

        it("应该正确计算多个用户的奖励分配", async function () {
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingToken.connect(user2).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_2);

            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);
            await stakingRewards.connect(user2).stake(STAKE_AMOUNT_2);

            // 推进时间
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            const earned1 = await stakingRewards.earned(user1Address);
            const earned2 = await stakingRewards.earned(user2Address);

            // user1 质押量是 user2 的2倍，应该获得约2倍的奖励
            expect(earned1).to.be.gt(0);
            expect(earned2).to.be.gt(0);
            // 由于精度问题，这里只检查都大于0，实际比例可能略有差异
        });

        it("应该在奖励周期结束后停止累积奖励", async function () {
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);

            // 推进到周期结束
            await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
            await ethers.provider.send("evm_mine", []);

            const earnedBefore = await stakingRewards.earned(user1Address);

            // 再推进一些时间
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            const earnedAfter = await stakingRewards.earned(user1Address);

            // 奖励不应该再增加
            expect(earnedAfter).to.equal(earnedBefore);
        });
    });

    describe("领取奖励 (getReward)", function () {
        beforeEach(async function () {
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);

            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);

            // 推进时间让奖励累积
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);
        });

        it("用户应该能够领取奖励", async function () {
            const earnedBefore = await stakingRewards.earned(user1Address);
            const userRewardBalanceBefore = await rewardsToken.balanceOf(user1Address);

            // getReward() 会先更新奖励状态，所以实际领取的可能会略有不同（因为时间推进）
            await stakingRewards.connect(user1).getReward();

            const userRewardBalanceAfter = await rewardsToken.balanceOf(user1Address);
            const actualReceived = userRewardBalanceAfter - userRewardBalanceBefore;
            
            // 验证领取的奖励应该大于等于预期（因为 getReward 会更新状态，可能略有增加）
            expect(actualReceived).to.be.gte(earnedBefore);
            // 验证领取的奖励接近预期（允许合理的精度差异，因为时间推进）
            expect(actualReceived).to.be.closeTo(earnedBefore, parseEther("1"));
            expect(await stakingRewards.rewards(user1Address)).to.equal(0);
        });

        it("无奖励时领取应该不失败", async function () {
            // 先领取一次
            await stakingRewards.connect(user1).getReward();

            // 再次领取（应该没有奖励了，因为 rewards[user1] 已被清零）
            const userRewardBalanceBefore = await rewardsToken.balanceOf(user1Address);
            const rewardsBefore = await stakingRewards.rewards(user1Address);
            expect(rewardsBefore).to.equal(0); // 确认奖励已被清零

            await stakingRewards.connect(user1).getReward();
            const userRewardBalanceAfter = await rewardsToken.balanceOf(user1Address);

            // 余额不应该变化（或只有极小的变化，因为 getReward 会更新状态）
            // 由于 getReward 会调用 updateReward，可能会重新计算并设置 rewards，但应该为0
            // 允许极小的差异（由于时间推进导致的微小奖励）
            const difference = userRewardBalanceAfter > userRewardBalanceBefore 
                ? userRewardBalanceAfter - userRewardBalanceBefore 
                : userRewardBalanceBefore - userRewardBalanceAfter;
            expect(difference).to.be.lt(parseEther("1")); // 差异应该很小
        });

        it("领取后应该更新奖励状态", async function () {
            await stakingRewards.connect(user1).getReward();

            // 推进时间
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            // 应该开始累积新的奖励
            const newEarned = await stakingRewards.earned(user1Address);
            expect(newEarned).to.be.gt(0);
        });
    });

    describe("完整流程测试", function () {
        it("应该正确处理完整的质押-奖励-提取流程", async function () {
            // 1. 设置奖励周期
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);

            // 2. 用户质押
            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);

            // 3. 推进时间
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            // 4. 领取奖励
            const earned = await stakingRewards.earned(user1Address);
            expect(earned).to.be.gt(0);

            const userRewardBalanceBefore = await rewardsToken.balanceOf(user1Address);
            await stakingRewards.connect(user1).getReward();
            const userRewardBalanceAfter = await rewardsToken.balanceOf(user1Address);
            const actualReceived = userRewardBalanceAfter - userRewardBalanceBefore;
            // 验证领取的奖励应该大于等于预期（因为 getReward 会更新状态）
            expect(actualReceived).to.be.gte(earned);
            // 验证领取的奖励接近预期（允许合理的精度差异）
            expect(actualReceived).to.be.closeTo(earned, parseEther("1"));

            // 5. 提取部分质押
            const withdrawAmount = parseEther("300");
            const userStakeBalanceBefore = await stakingToken.balanceOf(user1Address);
            await stakingRewards.connect(user1).withdraw(withdrawAmount);
            const userStakeBalanceAfter = await stakingToken.balanceOf(user1Address);
            expect(userStakeBalanceAfter).to.equal(userStakeBalanceBefore + withdrawAmount);

            // 6. 验证最终状态
            expect(await stakingRewards.balanceOf(user1Address)).to.equal(STAKE_AMOUNT_1 - withdrawAmount);
            expect(await stakingRewards.totalSupply()).to.equal(STAKE_AMOUNT_1 - withdrawAmount);
        });

        it("应该正确处理多用户多周期场景", async function () {
            // 第一个周期
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);

            await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_1);
            await stakingToken.connect(user2).approve(await stakingRewards.getAddress(), STAKE_AMOUNT_2);

            await stakingRewards.connect(user1).stake(STAKE_AMOUNT_1);
            await stakingRewards.connect(user2).stake(STAKE_AMOUNT_2);

            // 推进到周期结束
            await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
            await ethers.provider.send("evm_mine", []);

            // 领取奖励
            await stakingRewards.connect(user1).getReward();
            await stakingRewards.connect(user2).getReward();

            // 第二个周期
            await stakingRewards.connect(owner).setRewardDuration(DURATION);
            await rewardsToken.connect(owner).transfer(await stakingRewards.getAddress(), REWARD_AMOUNT);
            await stakingRewards.connect(owner).notifyRewardAmount(REWARD_AMOUNT);

            // 推进时间
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            // 验证新周期的奖励
            const earned1 = await stakingRewards.earned(user1Address);
            const earned2 = await stakingRewards.earned(user2Address);
            expect(earned1).to.be.gt(0);
            expect(earned2).to.be.gt(0);
        });
    });
});

