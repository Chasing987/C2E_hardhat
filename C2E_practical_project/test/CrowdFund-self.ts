import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { formatEther, parseEther } from "ethers";
import type { CrowdFund } from "../typechain-types/contracts/03_CrowdFund/CrowdFund.sol/CrowdFund";
import type { MyToken } from "../typechain-types/contracts/03_CrowdFund/MyToken.sol/MyToken";
import { expect } from "chai";

describe("CrowdFund", function () {
    let myToken: MyToken;
    let crowdFund: CrowdFund;
    let deployer: any;
    let creator: any;
    let supporter1: any;
    let supporter2: any;
    let creatorAddress: string;
    let supporter1Address: string;
    let supporter2Address: string;

    const TOKEN_AMOUNT = parseEther("1000");
    const FUNDING_GOAL = parseEther("500");
    const PLEDGE_AMOUNT_1 = parseEther("200");
    const PLEDGE_AMOUNT_2 = parseEther("300");

    beforeEach(async function () {
        // 获取测试账户
        [deployer, creator, supporter1, supporter2] = await ethers.getSigners();
        creatorAddress = await creator.getAddress();
        supporter1Address = await supporter1.getAddress();
        supporter2Address = await supporter2.getAddress();

        // 1、部署 MyToken 合约
        const MyTokenFactory = await ethers.getContractFactory("MyToken");
        myToken = (await MyTokenFactory.deploy()) as MyToken;
        await myToken.waitForDeployment();

        // 2、部署 CrowdFund 合约
        const CrowdFundFactory = await ethers.getContractFactory("CrowdFund");
        crowdFund = (await CrowdFundFactory.deploy(await myToken.getAddress())) as CrowdFund;
        await crowdFund.waitForDeployment();

        // 3、分配代币给测试账户
        const transferToCreatorTx = await myToken.transfer(creatorAddress, TOKEN_AMOUNT);
        await transferToCreatorTx.wait();

        const transferToSupporter1Tx = await myToken.transfer(supporter1Address, TOKEN_AMOUNT);
        await transferToSupporter1Tx.wait();

        const transferToSupporter2Tx = await myToken.transfer(supporter2Address, TOKEN_AMOUNT);
        await transferToSupporter2Tx.wait();
    });

    describe("部署", function () {
        it("应该正确部署 MyToken 和 CrowdFund 合约", async function () {
            expect(await myToken.getAddress()).to.be.properAddress;
            expect(await crowdFund.getAddress()).to.be.properAddress;
            expect(await crowdFund.token()).to.equal(await myToken.getAddress());
        });

        it("应正确初始化代币余额", async function () {
            const deployerBalance = await myToken.balanceOf(await deployer.getAddress());
            const creatorBalance = await myToken.balanceOf(creatorAddress);
            const supporter1Balance = await myToken.balanceOf(supporter1Address);
            const supporter2Balance = await myToken.balanceOf(supporter2Address);

            expect(deployerBalance).to.be.gt(0);
            expect(creatorBalance).to.equal(TOKEN_AMOUNT);
            expect(supporter1Balance).to.equal(TOKEN_AMOUNT);
            expect(supporter2Balance).to.equal(TOKEN_AMOUNT);
        });

        it("应该正确初始化众筹计数", async function () {
            expect(await crowdFund.count()).to.equal(0);
        });
    });

    describe("发起众筹(launch)", function () {
        it("应该能够发起众筹", async function () {
            const startOffset = 60; // 60秒后开始
            const endOffset = 7 * 24 * 60 * 60; // 7天后结束

            const tx = await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            const receipt = await tx.wait();

            // 检查众筹计数增加
            expect(await crowdFund.count()).to.equal(1);

            // 检查事件
            const launchEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Launch";
                } catch {
                    return false;
                }
            });

            // launchEvent 未找到 -> expect 会抛出，测试失败
            expect(launchEvent).to.not.be.undefined;

            if (launchEvent) {
                const parsed = crowdFund.interface.parseLog(launchEvent);
                expect(parsed?.args[1]).to.equals(creatorAddress);
                expect(parsed?.args[2]).to.equals(FUNDING_GOAL);
            }

            // 检查众筹信息
            const campaign = await crowdFund.campaigns(1);
            expect(campaign.creator).to.equal(creatorAddress);
            expect(campaign.goal).to.equal(FUNDING_GOAL);
            expect(campaign.pledged).to.equal(0);
            expect(campaign.claimed).to.be.false;
        });

        it("应该拒绝无效的时间参数（endOffset <= startOffset）", async function () {
            const startOffset = 100;
            const endOffset = 100; // 等于 startOffset，应该失败

            await expect(
                crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset)
            ).to.be.revertedWith("endAt <= startAt");
        });

        it("应该拒绝超过30天的众筹期限", async function () {
            const startOffset = 0;
            const endOffset = 31 * 24 * 60 * 60; // 31天，应该失败

            await expect(
                crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset)
            ).to.be.revertedWith("end > 30 days");
        });

        it("应该能够发起多个众筹", async function () {
            const startOffset = 60; // 60秒后开始
            const endOffset = 7 * 24 * 60 * 60; // 7天后结束

            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);

            expect(await crowdFund.count()).to.equal(2);

            const campaign1 = await crowdFund.campaigns(1);
            const campaign2 = await crowdFund.campaigns(2);

            expect(campaign1.creator).to.equal(creatorAddress);
            expect(campaign2.creator).to.equal(creatorAddress);
        });
    });

    describe("取消众筹(cancel)", function () {
        beforeEach(async function () {
            const startOffset = 60; // 60秒后开始
            const endOffset = 7 * 24 * 60 * 60; // 7天后结束
            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
        });

        it("创建者应该能够取消众筹", async function () {
            const tx = await crowdFund.connect(creator).cancel(1);
            const receipt = await tx.wait();

            // 检查事件
            const cancelEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Cancel";
                } catch {
                    return false;
                }
            });

            expect(cancelEvent).to.not.be.undefined;

            // 检查众筹信息已被删除（creator 应该是零地址）
            const campaign = await crowdFund.campaigns(1);
            expect(campaign.creator).to.equal(ethers.ZeroAddress);
        });

        it("非创建者不应该能够取消众筹", async function () {
            await expect(crowdFund.connect(supporter1).cancel(1)).to.be.reverted;
        });

        it("不应该能够取消已开始的众筹", async function () {
            const startOffset = 0; // 立即开始
            const endOffset = 7 * 24 * 60 * 60;

            // 发起一个立即开始的众筹
            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);

            // 推进时间以确定众筹已开始
            // 为什么用 61 秒：测试里常用 startOffset = 0 或 startOffset = 60（表示 60 秒后开始）
            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            await expect(crowdFund.connect(creator).cancel(2)).to.be.revertedWith("started");
        });
    });

    describe("认捐资金(pledge)", function () {
        let campaignId: number;

        beforeEach(async function () {
            const startOffset = 0;
            const endOffset = 7 * 24 * 60 * 60;
            const tx = await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            const receipt = await tx.wait();

            // 从事件中获取 campaignId
            const launchEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Launch";
                } catch {
                    return false;
                }
            });

            if (launchEvent) {
                const parsed = crowdFund.interface.parseLog(launchEvent);
                campaignId = Number(parsed?.args[0]);
            } else {
                campaignId = 1;
            }

            // 授权CrowdFund 合约
            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await myToken.connect(supporter2).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
        });

        it("应该能够成功认捐", async function () {
            const tx = await crowdFund.connect(supporter1).pledge(campaignId, PLEDGE_AMOUNT_1);
            const receipt = await tx.wait();

            // 检查事件
            const pledgeEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Pledge";
                } catch {
                    return false;
                }
            });

            expect(pledgeEvent).to.not.be.undefined;

            // 检查众筹状态
            const campaign = await crowdFund.campaigns(campaignId);
            expect(campaign.pledged).to.equal(PLEDGE_AMOUNT_1);

            // 检查认捐金额
            expect(await crowdFund.pledgeAmount(campaignId, supporter1Address)).to.equal(PLEDGE_AMOUNT_1);

            // 检查代币转移
            const crowdFundBalance = await myToken.balanceOf(await crowdFund.getAddress());
            expect(crowdFundBalance).to.equal(PLEDGE_AMOUNT_1);
        });

        it("应该拒绝在开始前认捐", async function () {
            // 发起一个延迟开始的众筹
            const startOffset = 60;
            const endOffset = 7 * 24 * 60 * 60;
            const tx2 = await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            const receipt2 = await tx2.wait();

            let campaignId2 = 2;
            const launchEvent2 = receipt2?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Launch";
                } catch {
                    return false;
                }
            });

            if (launchEvent2) {
                const parsed = crowdFund.interface.parseLog(launchEvent2);
                campaignId2 = Number(parsed?.args[0]);
            }

            await expect(
                crowdFund.connect(supporter1).pledge(campaignId2, PLEDGE_AMOUNT_1)
            ).to.be.revertedWith("not started");
        });

        it("应该拒绝在结束后认捐", async function () {
            // 推进到结束后
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                crowdFund.connect(supporter1).pledge(campaignId, PLEDGE_AMOUNT_1)
            ).to.be.revertedWith("ended");
        });

        it("应该允许多个账户认捐", async function () {
            await crowdFund.connect(supporter1).pledge(campaignId, PLEDGE_AMOUNT_1);
            await crowdFund.connect(supporter2).pledge(campaignId, PLEDGE_AMOUNT_2);

            const campaign = await crowdFund.campaigns(campaignId);
            expect(campaign.pledged).to.equal(PLEDGE_AMOUNT_1 + PLEDGE_AMOUNT_2);

            expect(await crowdFund.pledgeAmount(campaignId, supporter1Address)).to.equal(PLEDGE_AMOUNT_1);
            expect(await crowdFund.pledgeAmount(campaignId, supporter2Address)).to.equal(PLEDGE_AMOUNT_2);
        });

        it("应该允许同一账户多次认捐", async function () {
            await crowdFund.connect(supporter1).pledge(campaignId, PLEDGE_AMOUNT_1);
            await crowdFund.connect(supporter1).pledge(campaignId, PLEDGE_AMOUNT_1);

            const campaign = await crowdFund.campaigns(campaignId);
            expect(campaign.pledged).to.equal(PLEDGE_AMOUNT_1 * BigInt(2));

            expect(await crowdFund.pledgeAmount(campaignId, supporter1Address)).to.equal(PLEDGE_AMOUNT_1 * BigInt(2));
        });
    });


    describe("撤回认捐(unpledge)", function () {
        let campaignId: number;

        beforeEach(async function () {
            const startOffset = 0;
            const endOffset = 7 * 24 * 60 * 60;

            const tx = await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            const receipt = await tx.wait();

            let campaignIdFromEvent = 1;
            const launchEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Launch";
                } catch {
                    return false;
                }
            });

            if (launchEvent) {
                const parsed = crowdFund.interface.parseLog(launchEvent);
                campaignIdFromEvent = Number(parsed?.args[0]);
            }

            campaignId = campaignIdFromEvent;

            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(campaignId, PLEDGE_AMOUNT_1);
        });

        it("应该能够成功撤回认捐", async function () {
            const unpledgeAmount = parseEther("100");
            const supporter1BalanceBefore = await myToken.balanceOf(supporter1Address);

            const tx = await crowdFund.connect(supporter1).unpledge(campaignId, unpledgeAmount);
            const receipt = await tx.wait();

            // 检查事件
            const unpledgeEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Unpledge";
                } catch {
                    return false;
                }
            });

            expect(unpledgeAmount).to.not.be.undefined;

            // 检查众筹状态
            const campaign = await crowdFund.campaigns(campaignId);
            expect(campaign.pledged).to.equal(PLEDGE_AMOUNT_1 - unpledgeAmount);

            // 检查认捐金额
            expect(await crowdFund.pledgeAmount(campaignId, supporter1Address)).to.equal(PLEDGE_AMOUNT_1 - unpledgeAmount);

            // 检查代币返还
            const supporter1BalanceAfter = await myToken.balanceOf(supporter1Address);
            expect(supporter1BalanceAfter).to.equals(supporter1BalanceBefore + unpledgeAmount);
        });

        it("应该拒绝在结束后撤回认捐", async function () {
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                crowdFund.connect(supporter1).unpledge(campaignId, parseEther("100"))
            ).to.be.revertedWith("ended");
        });

        it("应该拒绝撤回超过认捐金额", async function () {
            await expect(
                crowdFund.connect(supporter1).unpledge(campaignId, PLEDGE_AMOUNT_1 + parseEther("1"))
            ).to.be.reverted;
        });
    });

    describe("提取资金(claim)", function () {
        let campaignId: number;

        beforeEach(async function () {
            const startOffset = 0;
            const endOffset = 7 * 24 * 60 * 60;
            const tx = await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            const receipt = await tx.wait();

            let campaignIdFromEvent = 1;
            const launchEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Launch";
                } catch {
                    return false;
                }
            });
            if (launchEvent) {
                const parsed = crowdFund.interface.parseLog(launchEvent);
                campaignIdFromEvent = Number(parsed?.args[0]);
            }
            campaignId = campaignIdFromEvent;

            // 认捐足够的资金
            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await myToken.connect(supporter2).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(campaignId, PLEDGE_AMOUNT_1);
            await crowdFund.connect(supporter2).pledge(campaignId, PLEDGE_AMOUNT_2);

            // 推进到结束后
            await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
            await ethers.provider.send("evm_mine", []);
        });


        it("创建者应该能够提取资金（当达到目标时）", async function () {
            const creatorBalanceBefore = await myToken.balanceOf(creatorAddress);
            const campaign = await crowdFund.campaigns(campaignId);
            const totalPledged = campaign.pledged;

            const tx = await crowdFund.connect(creator).claim(campaignId);
            const receipt = await tx.wait();

            // 检查事件
            const claimEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Claim";
                } catch {
                    return false;
                }
            });

            expect(claimEvent).to.not.be.undefined;

            // 检查claimed 状态
            const campaignAfter = await crowdFund.campaigns(campaignId);
            expect(campaignAfter.claimed).to.be.true;

            // 检查代币转移
            const creatorBalanceAfter = await myToken.balanceOf(creatorAddress);
            expect(creatorBalanceAfter).to.equal(creatorBalanceBefore + totalPledged);
        });

        it("非创建者不应该能够提取资金", async function () {
            await expect(
                crowdFund.connect(supporter1).claim(campaignId)
            ).to.be.revertedWith("not creator");
        });

        it("应该拒绝在结束前提取资金", async function () {
            // 创建新的众筹
            const startOffset = 0;
            const endOffset = 7 * 24 * 60 * 60;
            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);

            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(2, FUNDING_GOAL);

            await expect(
                crowdFund.connect(creator).claim(2)
            ).to.be.revertedWith("not ended");
        });

        it("应该拒绝在未达到目标时提取资金", async function () {
            // 创建新的众筹
            const startOffset = 0;
            const endOffset = 60; // 60秒后结束
            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);

            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(2, parseEther("100")); // 少于目标

            // 推进到结束后
            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                crowdFund.connect(creator).claim(2)
            ).to.be.revertedWith("pledged < goal");
        });

        it("应该拒绝重复提取", async function () {
            await crowdFund.connect(creator).claim(campaignId);

            await expect(
                crowdFund.connect(creator).claim(campaignId)
            ).to.be.revertedWith("claimed");
        });
    });

    describe("退款 (refund)", function () {
        let campaignId: number;

        beforeEach(async function () {
            const startOffset = 0;
            const endOffset = 60; // 60秒后结束
            const tx = await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            const receipt = await tx.wait();

            let campaignIdFromEvent = 1;
            const launchEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Launch";
                } catch {
                    return false;
                }
            });
            if (launchEvent) {
                const parsed = crowdFund.interface.parseLog(launchEvent);
                campaignIdFromEvent = Number(parsed?.args[0]);
            }
            campaignId = campaignIdFromEvent;

            // 认捐但未达到目标
            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await myToken.connect(supporter2).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(campaignId, parseEther("100"));
            await crowdFund.connect(supporter2).pledge(campaignId, parseEther("200"));

            // 推进到结束后
            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);
        });

        it("支持者应该能够在未达到目标时退款", async function () {
            const supporter1BalanceBefore = await myToken.balanceOf(supporter1Address);
            const pledgeAmount = await crowdFund.pledgeAmount(campaignId, supporter1Address);

            await crowdFund.connect(supporter1).refund(campaignId);

            // 检查认捐金额被清零
            expect(await crowdFund.pledgeAmount(campaignId, supporter1Address)).to.equal(0);

            // 检查代币返还
            const supporter1BalanceAfter = await myToken.balanceOf(supporter1Address);
            expect(supporter1BalanceAfter).to.equal(supporter1BalanceBefore + pledgeAmount);
        });

        it("应该拒绝在未结束时退款", async function () {
            // 创建新的众筹
            const startOffset = 0;
            const endOffset = 60;
            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);

            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(2, parseEther("100"));

            await expect(
                crowdFund.connect(supporter1).refund(2)
            ).to.be.revertedWith("not ended");
        });

        it("应该拒绝在达到目标时退款", async function () {
            // 创建达到目标的新众筹
            const startOffset = 0;
            const endOffset = 60;
            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);

            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(2, FUNDING_GOAL);

            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                crowdFund.connect(supporter1).refund(2)
            ).to.be.revertedWith("pledged >= goal");
        });

        it("应该允许多个支持者退款", async function () {
            const supporter1BalanceBefore = await myToken.balanceOf(supporter1Address);
            const supporter2BalanceBefore = await myToken.balanceOf(supporter2Address);
            const pledgeAmount1 = await crowdFund.pledgeAmount(campaignId, supporter1Address);
            const pledgeAmount2 = await crowdFund.pledgeAmount(campaignId, supporter2Address);

            await crowdFund.connect(supporter1).refund(campaignId);
            await crowdFund.connect(supporter2).refund(campaignId);

            // 检查认捐金额被清零
            expect(await crowdFund.pledgeAmount(campaignId, supporter1Address)).to.equal(0);
            expect(await crowdFund.pledgeAmount(campaignId, supporter2Address)).to.equal(0);

            // 检查代币返还
            const supporter1BalanceAfter = await myToken.balanceOf(supporter1Address);
            const supporter2BalanceAfter = await myToken.balanceOf(supporter2Address);
            expect(supporter1BalanceAfter).to.equal(supporter1BalanceBefore + pledgeAmount1);
            expect(supporter2BalanceAfter).to.equal(supporter2BalanceBefore + pledgeAmount2);
        });
    });


    describe("边界情况和集成测试", function () {
        it("应该处理完整的成功场景：发起 -> 认捐 -> 提取", async function () {
            const startOffset = 0;
            const endOffset = 60;
            const tx = await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            const receipt = await tx.wait();

            let campaignId = 1;
            const launchEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Launch";
                } catch {
                    return false;
                }
            });
            if (launchEvent) {
                const parsed = crowdFund.interface.parseLog(launchEvent);
                campaignId = Number(parsed?.args[0]);
            }

            // 认捐
            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await myToken.connect(supporter2).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(campaignId, PLEDGE_AMOUNT_1);
            await crowdFund.connect(supporter2).pledge(campaignId, PLEDGE_AMOUNT_2);

            // 检查认捐状态
            const campaign = await crowdFund.campaigns(campaignId);
            expect(campaign.pledged).to.equal(PLEDGE_AMOUNT_1 + PLEDGE_AMOUNT_2);

            // 推进到结束后
            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            // 提取
            const creatorBalanceBefore = await myToken.balanceOf(creatorAddress);
            await crowdFund.connect(creator).claim(campaignId);
            const creatorBalanceAfter = await myToken.balanceOf(creatorAddress);

            expect(creatorBalanceAfter).to.equal(creatorBalanceBefore + campaign.pledged);
        });

        it("应该处理完整的失败场景：发起 -> 认捐（不足） -> 退款", async function () {
            const startOffset = 0;
            const endOffset = 60;
            const tx = await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);
            const receipt = await tx.wait();

            let campaignId = 1;
            const launchEvent = receipt?.logs.find((log: any) => {
                try {
                    const parsed = crowdFund.interface.parseLog(log);
                    return parsed?.name === "Launch";
                } catch {
                    return false;
                }
            });
            if (launchEvent) {
                const parsed = crowdFund.interface.parseLog(launchEvent);
                campaignId = Number(parsed?.args[0]);
            }

            // 认捐不足
            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(campaignId, parseEther("100"));

            // 推进到结束后
            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine", []);

            // 退款
            const supporter1BalanceBefore = await myToken.balanceOf(supporter1Address);
            const pledgeAmount = await crowdFund.pledgeAmount(campaignId, supporter1Address);
            await crowdFund.connect(supporter1).refund(campaignId);
            const supporter1BalanceAfter = await myToken.balanceOf(supporter1Address);

            expect(supporter1BalanceAfter).to.equal(supporter1BalanceBefore + pledgeAmount);
        });

        it("应该正确处理认捐和撤回的组合", async function () {
            const startOffset = 0;
            const endOffset = 7 * 24 * 60 * 60;
            await crowdFund.connect(creator).launch(FUNDING_GOAL, startOffset, endOffset);

            await myToken.connect(supporter1).approve(await crowdFund.getAddress(), TOKEN_AMOUNT);
            await crowdFund.connect(supporter1).pledge(1, PLEDGE_AMOUNT_1);
            await crowdFund.connect(supporter1).unpledge(1, parseEther("50"));

            const campaign = await crowdFund.campaigns(1);
            expect(campaign.pledged).to.equal(PLEDGE_AMOUNT_1 - parseEther("50"));
            expect(await crowdFund.pledgeAmount(1, supporter1Address)).to.equal(PLEDGE_AMOUNT_1 - parseEther("50"));
        });
    });
});