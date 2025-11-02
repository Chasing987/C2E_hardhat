import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { formatEther, parseEther } from "ethers";
import type { CrowdFund } from "../typechain-types/contracts/03_CrowdFund/CrowdFund.sol/CrowdFund";
import type { MyToken } from "../typechain-types/contracts/03_CrowdFund/MyToken.sol/MyToken";
import { token } from "../typechain-types/@openzeppelin/contracts";
import { any } from "hardhat/internal/core/params/argumentTypes";

async function main() {
    console.log("=".repeat(50));
    console.log("开始部署众筹系统...");
    console.log("=".repeat(50));

    // 获取部署账户
    const [deployer, founder, supporter1, supporter2] = await ethers.getSigners();
    console.log("\n部署账户:", deployer.address);
    console.log("发起人账户:", founder.address);
    console.log("账户余额:", formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

    // 1. 部署MyToken合约
    console.log("\n--- 步骤 1: 部署 MyToken");
    const MyTokenFactory = await ethers.getContractFactory("MyToken");
    const myToken = await MyTokenFactory.deploy() as MyToken;  // 在这里默认是使用第一个账户进行部署的，即deployer
    await myToken.waitForDeployment();
    const tokenAddress = await myToken.getAddress();
    console.log("MyToken 部署地址：", tokenAddress);

    // 2、部署CrowdFund合约
    console.log("\n--- 步骤 2: 部署 CrowdFund 合约 ---");
    const CrowdFundFactory = await ethers.getContractFactory("CrowdFund");
    const crowdFund = await CrowdFundFactory.deploy(tokenAddress) as CrowdFund;
    await crowdFund.waitForDeployment();
    const crowdFundAddress = await crowdFund.getAddress();
    console.log("CrowdFund 部署地址：", crowdFundAddress);

    // 3、分配代币给测试账户
    console.log("\n--- 步骤 3: 分配代币给测试账户 ---");
    const tokenAmount = parseEther("1000");

    // 给发起人分配代币
    const transferToFounderTx = await myToken.transfer(await founder.getAddress(), tokenAmount);
    await transferToFounderTx.wait();
    console.log(`已给发起人 ${await founder.getAddress()} 分配 ${formatEther(tokenAmount)} CFT`);

    // 给支持者1分配代币
    const transferToSupporter1Tx = await myToken.transfer(await supporter1.getAddress(), tokenAmount);
    await transferToSupporter1Tx.wait();
    console.log(`已给支持者1 ${await supporter1.getAddress()} 分配 ${formatEther(tokenAmount)} CFT`);

    // 给支持者2分配代币
    const transferToSupporter2Tx = await myToken.transfer(await supporter2.getAddress(), tokenAmount);
    await transferToSupporter2Tx.wait();
    console.log(`已给支持者2 ${await supporter2.getAddress()} 分配 ${formatEther(tokenAmount)} CFT`);

    // 4、演示发起众筹
    console.log("\n--- 步骤 4: 发起众筹 ---");
    const fundingGoal = parseEther("500");
    const startOffset = 10;
    const endOffset = 300; // 5分钟结束

    // 发起人先授权 CrowdFund 合约可以转移代币
    const myTokenWithFounder = myToken.connect(founder);
    const approveTx = await myTokenWithFounder.approve(crowdFundAddress, tokenAmount);
    await approveTx.wait();
    console.log("发起人已授权 CrowdFund 合约");

    // 发起众筹
    // connect 不改变合约地址或 ABI，只改变谁来签名交易。
    const crowdFundWithFounder = crowdFund.connect(founder);
    const launchTx = await crowdFundWithFounder.launch(fundingGoal, startOffset, endOffset);
    const launchReceipt = await launchTx.wait();

    // 查找 Launch 事件
    const launchEvent = launchReceipt?.logs.find((log: any) => {
        try {
            const parsed = crowdFund.interface.parseLog(log);
            return parsed?.name === "Launch";
        } catch {
            return false;
        }
    });

    if (launchEvent) {
        const parsed = crowdFund.interface.parseLog(launchEvent);
        const campaignId = parsed?.args[0];
        console.log(`✅ 众筹已发起！众筹ID: ${campaignId}`);
        console.log(`  目标金额: ${formatEther(fundingGoal)} CFT`);
        console.log(`  开始时间: ${new Date((Number(parsed?.args[3]) * 1000)).toLocaleDateString()}`);
        console.log(`  结束事件: ${new Date((Number(parsed?.args[4]) * 1000)).toLocaleDateString()}`);
    }

    // 5、验证部署结果
    console.log("\n--- 步骤 5: 验证部署结果 ---");
    const deployerTokenBalance = await myToken.balanceOf(await deployer.getAddress());
    const founderTokenBalance = await myToken.balanceOf(await founder.getAddress());
    const supporter1TokenBalance = await myToken.balanceOf(await supporter1.getAddress());
    const supporter2TokenBalance = await myToken.balanceOf(await supporter2.getAddress());

    console.log("\n代币余额：");
    console.log(` 部署账户：${formatEther(deployerTokenBalance)} CFT`);
    console.log(` 发起人：${formatEther(founderTokenBalance)} CFT`);
    console.log(` 支持者1：${formatEther(supporter1TokenBalance)} CFT`);
    console.log(` 支持者2：${formatEther(supporter2TokenBalance)} CFT`);

    console.log("\n" + "=".repeat(50));
    console.log("✅部署完成！");
    console.log("=".repeat(50));
    console.log("\n 部署摘要：");
    console.log("MyToken 地址：", tokenAddress);
    console.log("CrowdFund 地址：", crowdFundAddress);
    console.log("发起人地址：", founder.address);
    console.log("支持者1地址：", supporter1.address);
    console.log("支持者2地址：", supporter2.address);
    console.log("众筹目标：", formatEther(fundingGoal), "CFT");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })

