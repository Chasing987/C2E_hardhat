import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { formatEther, parseEther } from "ethers";
import type { MyNFT } from "../typechain-types/contracts/02_EnglishAuction/MyNFT.sol/MyNFT";

async function main() {
    console.log("=".repeat(50));
    console.log("开始部署 EnglishAuction 测试场景...");
    console.log("=".repeat(50));

    const [deployer, seller, buyer] = await ethers.getSigners();
    console.log("部署者:", deployer.address);
    console.log("卖家:", seller.address);
    console.log("买家:", buyer.address);

    // 部署 MyNFT 并铸造给卖家
    const MyNFTFactory = await ethers.getContractFactory("MyNFT");
    const myNFT = (await MyNFTFactory.deploy()) as MyNFT;
    await myNFT.waitForDeployment();
    const nftAddress = await myNFT.getAddress();
    console.log("MyNFT 部署地址:", nftAddress);

    const TOKEN_ID = 1;
    const mintTx = await myNFT.mint(seller.address, TOKEN_ID);
    await mintTx.wait();
    console.log(`已铸造 NFT #${TOKEN_ID} 给 卖家 ${seller.address}`);

    // 卖家部署 EnglishAuction（由于合约 constructor 中 seller = msg.sender）
    const STARTING_BID = parseEther("1");
    const EnglishAuctionFactory = await ethers.getContractFactory("EnglishAuction");
    const englishAuction: any = await EnglishAuctionFactory.connect(seller).deploy(
        nftAddress,
        TOKEN_ID,
        STARTING_BID
    );
    await englishAuction.waitForDeployment();
    const auctionAddress = await englishAuction.getAddress();
    console.log("EnglishAuction 地址:", auctionAddress);

    // 卖家需要把 NFT 授权给合约后再 start()
    const myNFTWithSeller = myNFT.connect(seller);
    const approveTx = await myNFTWithSeller.approve(auctionAddress, TOKEN_ID);
    await approveTx.wait();
    console.log("卖家已授权拍卖合约转移 NFT");

    // 卖家发起拍卖
    const startTx = await englishAuction.connect(seller).start();
    await startTx.wait();
    console.log("拍卖已开始，结束时间 (timestamp)：", (await englishAuction.endAt()).toString());

    console.log("\n部署完成 ✅");
    console.log("MyNFT:", nftAddress);
    console.log("EnglishAuction:", auctionAddress);
    console.log("TOKEN_ID:", TOKEN_ID);
    console.log("起始出价:", formatEther(STARTING_BID), "ETH");
    console.log("测试命令: npx hardhat test test/EnglishAuction.ts");
}

main().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
});
