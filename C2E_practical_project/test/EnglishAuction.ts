import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { parseEther } from "ethers";
import type { MyNFT } from "../typechain-types/contracts/01_DutchAuction/MyNFT.sol/MyNFT";

describe("EnglishAuction", function () {
    let myNFT: MyNFT;
    let englishAuction: any;
    let owner: any;
    let seller: any;
    let buyer: any;
    let buyer2: any;

    const TOKEN_ID = 1;
    const STARTING_BID = parseEther("1");

    beforeEach(async function () {
        [owner, seller, buyer, buyer2] = await ethers.getSigners();

        // 部署并铸造 NFT 给卖家
        const MyNFTFactory = await ethers.getContractFactory("MyNFT");
        myNFT = (await MyNFTFactory.deploy()) as MyNFT;
        await myNFT.waitForDeployment();
        await myNFT.mint(await seller.getAddress(), TOKEN_ID);

        // 卖家部署 EnglishAuction（constructor 中 seller = msg.sender）
        const EnglishAuctionFactory = await ethers.getContractFactory("EnglishAuction");
        englishAuction = await EnglishAuctionFactory.connect(seller).deploy(
            await myNFT.getAddress(),
            TOKEN_ID,
            STARTING_BID
        );
        await englishAuction.waitForDeployment();

        // 卖家授权并启动拍卖
        await myNFT.connect(seller).approve(await englishAuction.getAddress(), TOKEN_ID);
        await englishAuction.connect(seller).start();
    });

    it("应该正确设置初始状态", async function () {
        expect(await englishAuction.nft()).to.equal(await myNFT.getAddress());
        expect((await englishAuction.nftId()).toString()).to.equal(TOKEN_ID.toString());
        expect(await englishAuction.seller()).to.equal(await seller.getAddress());
        expect(await englishAuction.highestBid()).to.equal(STARTING_BID);
    });

    it("应该接受更高的出价并更新最高出价者", async function () {
        const bid1 = parseEther("2");
        await englishAuction.connect(buyer).bid({ value: bid1 });
        expect(await englishAuction.highestBid()).to.equal(bid1);
        expect(await englishAuction.highestBidder()).to.equal(await buyer.getAddress());

        const bid2 = parseEther("3");
        await englishAuction.connect(buyer2).bid({ value: bid2 });
        expect(await englishAuction.highestBid()).to.equal(bid2);
        expect(await englishAuction.highestBidder()).to.equal(await buyer2.getAddress());
    });

    it("之前的最高出价者应该可以提款", async function () {
        const bid1 = parseEther("2");
        await englishAuction.connect(buyer).bid({ value: bid1 });
        const bid2 = parseEther("3");
        await englishAuction.connect(buyer2).bid({ value: bid2 });

        // 之前最高（buyer）现在可以 withdraw
        const balBefore = await ethers.provider.getBalance(await buyer.getAddress());
        const tx = await englishAuction.connect(buyer).withdraw();
        await tx.wait();

        // 确保 bids 映射被清零
        expect((await englishAuction.bids(await buyer.getAddress())).toString()).to.equal('0');
    });

    it("结束拍卖应将 NFT 和资金转移给卖家/最高出价者", async function () {
        const bid1 = parseEther("2");
        await englishAuction.connect(buyer).bid({ value: bid1 });

        // 推进时间到结束后（合约中 start() 设为 +60 秒）
        await ethers.provider.send("evm_increaseTime", [61]);
        await ethers.provider.send("evm_mine", []);

        const sellerBalanceBefore = await ethers.provider.getBalance(await seller.getAddress());
        await englishAuction.connect(buyer).end();

        // NFT 转移给最高出价者
        expect(await myNFT.ownerOf(TOKEN_ID)).to.equal(await buyer.getAddress());

        const sellerBalanceAfter = await ethers.provider.getBalance(await seller.getAddress());
        expect(sellerBalanceAfter).to.be.gt(sellerBalanceBefore);
    });
});
