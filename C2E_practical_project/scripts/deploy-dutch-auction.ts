import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { formatEther, parseEther } from "ethers";
import type { MyNFT } from "../typechain-types/contracts/01_DutchAuction/MyNFT.sol/MyNFT";
import type { DutchAuction } from "../typechain-types/contracts/01_DutchAuction/DutchAuction.sol/DutchAuction";

async function main() {
    console.log("=" .repeat(50));
    console.log("开始部署荷兰式拍卖系统...");
    console.log("=" .repeat(50));

    // 获取部署账户
    const [deployer, seller] = await ethers.getSigners();
    console.log("\n部署账户:", deployer.address);
    console.log("卖家账户:", seller.address);
    console.log("账户余额:", formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

    // 1. 部署 MyNFT 合约
    console.log("\n--- 步骤 1: 部署 MyNFT 合约 ---");
    const MyNFTFactory = await ethers.getContractFactory("MyNFT");
    const myNFT = await MyNFTFactory.deploy() as MyNFT;
    await myNFT.waitForDeployment();
    const nftAddress = await myNFT.getAddress();
    console.log("MyNFT 部署地址:", nftAddress);

    // 2. 铸造一个 NFT (tokenId = 1)
    console.log("\n--- 步骤 2: 铸造 NFT ---");
    const tokenId = 1;
    const mintTx = await myNFT.mint(seller.address, tokenId);
    await mintTx.wait();
    console.log(`NFT #${tokenId} 已铸造给卖家 ${seller.address}`);
    console.log(`NFT 所有者:`, await myNFT.ownerOf(tokenId));

    // 3. 卖家授权给荷兰式拍卖合约
    console.log("\n--- 步骤 3: 设置拍卖参数 ---");
    
    // 将 myNFT 合约连接到卖家账户，以便以卖家身份批准
    const myNFTWithSeller = myNFT.connect(seller);
    
    // 荷兰式拍卖参数
    const startingPrice = parseEther("1000");  // 起始价格: 1000 ETH
    const discountRate = parseEther("0.001"); // 折扣率: 0.001 ETH/秒
    const DURATION = 7 * 24 * 60 * 60; // 7天
    const minPrice = discountRate * BigInt(DURATION);
    console.log("起始价格:", formatEther(startingPrice), "ETH");
    console.log("折扣率:", formatEther(discountRate), "ETH/秒");
    console.log("拍卖时长:", DURATION / 86400, "天");
    console.log("最低价格:", formatEther(minPrice), "ETH");

    // 4. 部署荷兰式拍卖合约（以卖家身份部署）
    console.log("\n--- 步骤 4: 部署 DutchAuction 合约 ---");
    const DutchAuctionFactory = await ethers.getContractFactory("DutchAuction");
    const dutchAuction = await DutchAuctionFactory.connect(seller).deploy(
        startingPrice,
        discountRate,
        nftAddress,
        tokenId
    ) as DutchAuction;
    await dutchAuction.waitForDeployment();
    const auctionAddress = await dutchAuction.getAddress();
    console.log("DutchAuction 部署地址:", auctionAddress);

    // 5. 卖家授权荷兰式拍卖合约可以转移 NFT
    console.log("\n--- 步骤 5: 卖家授权拍卖合约 ---");
    const approveTx = await myNFTWithSeller.approve(auctionAddress, tokenId);
    await approveTx.wait();
    console.log(`卖家已授权拍卖合约可以转移 NFT #${tokenId}`);

    // 6. 验证部署结果
    console.log("\n--- 步骤 6: 验证部署结果 ---");
    const currentPrice = await dutchAuction.getPrice();
    console.log("当前拍卖价格:", formatEther(currentPrice), "ETH");
    console.log("拍卖过期时间:", new Date((Number(await dutchAuction.expiresAt()) * 1000)).toLocaleString());

    console.log("\n" + "=" .repeat(50));
    console.log("✅ 部署完成！");
    console.log("=" .repeat(50));
    console.log("\n📋 部署摘要:");
    console.log("MyNFT 地址:", nftAddress);
    console.log("DutchAuction 地址:", auctionAddress);
    console.log("NFT Token ID:", tokenId);
    console.log("卖家地址:", seller.address);
    console.log("起始价格:", formatEther(startingPrice), "ETH");
    console.log("折扣率:", formatEther(discountRate), "ETH/秒");
    console.log("当前价格:", formatEther(currentPrice), "ETH");
    console.log("\n💡 测试命令:");
    console.log("npx hardhat test test/DutchAuction.ts");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
