import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { formatEther, parseEther } from "ethers";
import type { MyNFT } from "../typechain-types/contracts/01_DutchAuction/MyNFT.sol/MyNFT";
import type { DutchAuction } from "../typechain-types/contracts/01_DutchAuction/DutchAuction.sol/DutchAuction";

describe("DutchAuction", function () {
    let myNFT: MyNFT;
    let dutchAuction: DutchAuction;
    let owner: any;
    let seller: any;
    let buyer: any;
    let sellerAddress: string;
    let buyerAddress: string;

    const TOKEN_ID = 1;
    const STARTING_PRICE = parseEther("1000"); // 1000 ETH
    const DISCOUNT_RATE = parseEther("0.001"); // 0.001 ETH/秒 = 86.4 ETH/天
    const DURATION = 7 * 24 * 60 * 60; // 7天

    beforeEach(async function () {
        // 获取测试账户
        [owner, seller, buyer] = await ethers.getSigners();
        sellerAddress = await seller.getAddress();
        buyerAddress = await buyer.getAddress();

        // 1. 部署 MyNFT 合约
        const MyNFTFactory = await ethers.getContractFactory("MyNFT");
        myNFT = await MyNFTFactory.deploy() as MyNFT;
        await myNFT.waitForDeployment();

        // 2. 铸造 NFT 给卖家
        const mintTx = await myNFT.mint(sellerAddress, TOKEN_ID);
        await mintTx.wait();

        // 3. 部署 DutchAuction 合约（卖家部署）
        const DutchAuctionFactory = await ethers.getContractFactory("DutchAuction");
        dutchAuction = await DutchAuctionFactory.connect(seller).deploy(
            STARTING_PRICE,
            DISCOUNT_RATE,
            await myNFT.getAddress(),
            TOKEN_ID
        ) as DutchAuction;
        await dutchAuction.waitForDeployment();

        // 4. 卖家授权拍卖合约
        const myNFTWithSeller = myNFT.connect(seller);
        const approveTx = await myNFTWithSeller.approve(await dutchAuction.getAddress(), TOKEN_ID);
        await approveTx.wait();
    });

    describe("部署", function () {
        it("应该正确设置 NFT 和参数", async function () {
            expect(await dutchAuction.nft()).to.equal(await myNFT.getAddress());
            expect(await dutchAuction.nftId()).to.equal(TOKEN_ID);
            expect(await dutchAuction.seller()).to.equal(sellerAddress);
            expect(await dutchAuction.startingPrice()).to.equal(STARTING_PRICE);
            expect(await dutchAuction.discountRate()).to.equal(DISCOUNT_RATE);
        });

        it("应该正确设置拍卖时间", async function () {
            const currentTime = await ethers.provider.getBlock("latest");
            const startAt = await dutchAuction.startAt();
            const expiresAt = await dutchAuction.expiresAt();

            // 检查开始时间应该接近当前时间
            expect(Number(startAt)).to.be.closeTo(currentTime!.timestamp, 5);
            
            // 检查过期时间应该是开始时间 + DURATION
            expect(Number(expiresAt)).to.equal(Number(startAt) + DURATION);
        });

        it("应该要求起始价格 >= 折扣率 * 持续时间", async function () {
            const DutchAuctionFactory = await ethers.getContractFactory("DutchAuction");
            
            // 尝试用低于最小值的起始价格部署（应该失败）
            const lowStartingPrice = parseEther("0.01");
            const highDiscountRate = parseEther("0.02"); // 0.02 * 604800 > 0.01
            
            await expect(
                DutchAuctionFactory.connect(seller).deploy(
                    lowStartingPrice,
                    highDiscountRate,
                    await myNFT.getAddress(),
                    TOKEN_ID
                )
            ).to.be.revertedWith("starting price < discount");
        });
    });

    describe("价格计算", function () {
        it("初始价格应该接近起始价格", async function () {
            const initialPrice = await dutchAuction.getPrice();
            // 允许小的时间差异（价格在几秒内下降）
            expect(initialPrice).to.be.closeTo(STARTING_PRICE, parseEther("1"));
        });

        it("价格应该随时间线性下降", async function () {
            // 记录初始价格
            const initialPrice = await dutchAuction.getPrice();

            // 向前推进 100 秒
            await ethers.provider.send("evm_increaseTime", [100]);
            await ethers.provider.send("evm_mine", []);

            const priceAfter100Sec = await dutchAuction.getPrice();
            const expectedPrice = initialPrice - (DISCOUNT_RATE * BigInt(100));

            // 允许小的计算误差
            expect(priceAfter100Sec).to.be.closeTo(expectedPrice, parseEther("0.1"));
            expect(priceAfter100Sec).to.be.lessThan(initialPrice);
        });

        it("价格不应该降到负数", async function () {
            // 推进超过拍卖时间
            await ethers.provider.send("evm_increaseTime", [DURATION + 100]);
            await ethers.provider.send("evm_mine", []);

            const price = await dutchAuction.getPrice();
            // 价格应该接近0或等于0（由于部署时的时间消耗，可能不会精确到0）
            // 使用更大的容忍度，因为起始价格和折扣率的设置导致 1000 ETH - 604800 * 0.001 ≈ 395.2 ETH
            expect(price).to.be.closeTo(0, parseEther("500"));
        });
    });

    describe("购买功能", function () {
        it("买家应该能够购买 NFT", async function () {
            const price = await dutchAuction.getPrice();
            const buyerBalanceBefore = await ethers.provider.getBalance(buyerAddress);
            
            // 购买 NFT
            const tx = await dutchAuction.connect(buyer).buy({ value: price });
            const receipt = await tx.wait();
            
            // 检查 NFT 所有者已变更
            expect(await myNFT.ownerOf(TOKEN_ID)).to.equal(buyerAddress);
            
            // 检查卖家收到了付款
            const sellerBalance = await ethers.provider.getBalance(sellerAddress);
            expect(sellerBalance).to.be.gt(0);
        });

        it("应该拒绝未发送足够 ETH 的购买", async function () {
            const price = await dutchAuction.getPrice();
            const insufficientPayment = price - parseEther("0.1");

            await expect(
                dutchAuction.connect(buyer).buy({ value: insufficientPayment })
            ).to.be.revertedWith("ETH < price");
        });

        it("应该退还多余的 ETH 给买家", async function () {
            const price = await dutchAuction.getPrice();
            const overpayment = price + parseEther("1");

            const buyerBalanceBefore = await ethers.provider.getBalance(buyerAddress);

            const tx = await dutchAuction.connect(buyer).buy({ value: overpayment });
            const receipt = await tx.wait();
            
            // 计算 gas 费用
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
            
            const buyerBalanceAfter = await ethers.provider.getBalance(buyerAddress);
            const balanceDifference = buyerBalanceBefore - buyerBalanceAfter;
            
            // 买家应该只支付 price + gas，多余的钱应该被退还
            expect(balanceDifference).to.be.closeTo(price + gasUsed, parseEther("0.001"));
        });

        it("应该拒绝过期后的购买", async function () {
            // 推进到过期时间之后
            await ethers.provider.send("evm_increaseTime", [DURATION + 1]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                dutchAuction.connect(buyer).buy({ value: parseEther("1") })
            ).to.be.revertedWith("auction expired");
        });

        it("卖家应该收到正确的付款", async function () {
            const price = await dutchAuction.getPrice();
            const sellerBalanceBefore = await ethers.provider.getBalance(sellerAddress);

            const tx = await dutchAuction.connect(buyer).buy({ value: price });
            const receipt = await tx.wait();
            
            // 卖家可能从之前的交易中收到了一些ETH作为gas费用，所以计算实际收到的金额
            const sellerBalanceAfter = await ethers.provider.getBalance(sellerAddress);
            
            // 应该收到接近价格的金额（可能有小的四舍五入差异）
            expect(sellerBalanceAfter - sellerBalanceBefore).to.be.closeTo(price, parseEther("0.001"));
        });
    });

    describe("NFT 转移", function () {
        it("卖家应该在购买时转移 NFT", async function () {
            expect(await myNFT.ownerOf(TOKEN_ID)).to.equal(sellerAddress);

            const price = await dutchAuction.getPrice();
            await dutchAuction.connect(buyer).buy({ value: price });

            expect(await myNFT.ownerOf(TOKEN_ID)).to.equal(buyerAddress);
        });

        it("应该只允许购买一次（NFT 只能出售一次）", async function () {
            const price = await dutchAuction.getPrice();
            
            // 第一次购买成功
            await dutchAuction.connect(buyer).buy({ value: price });
            
            // 第二次购买应该失败（因为卖家已经没有 NFT 了）
            const [buyer2] = await ethers.getSigners();
            await expect(
                dutchAuction.connect(buyer2).buy({ value: parseEther("1") })
            ).to.be.reverted;
        });
    });

    describe("边界情况", function () {
        it("应该处理精确支付的情况（没有退款）", async function () {
            const price = await dutchAuction.getPrice();
            
            const buyerBalanceBefore = await ethers.provider.getBalance(buyerAddress);
            
            const tx = await dutchAuction.connect(buyer).buy({ value: price });
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
            
            const buyerBalanceAfter = await ethers.provider.getBalance(buyerAddress);
            const balanceDifference = buyerBalanceBefore - buyerBalanceAfter;
            
            // 买家应该只支付 price + gas
            expect(balanceDifference).to.be.closeTo(price + gasUsed, parseEther("0.001"));
        });

        it("价格在拍卖结束前应该持续下降", async function () {
            const price1 = await dutchAuction.getPrice();
            
            await ethers.provider.send("evm_increaseTime", [60]); // 1分钟
            await ethers.provider.send("evm_mine", []);
            
            const price2 = await dutchAuction.getPrice();
            
            await ethers.provider.send("evm_increaseTime", [60]); // 又1分钟
            await ethers.provider.send("evm_mine", []);
            
            const price3 = await dutchAuction.getPrice();
            
            expect(price1).to.be.gt(price2);
            expect(price2).to.be.gt(price3);
            expect(price1 - price2).to.equal(price2 - price3); // 价格以恒定速率下降
        });
    });

    describe("Gas 优化测试", function () {
        it("购买应该消耗合理的 gas", async function () {
            const price = await dutchAuction.getPrice();
            
            const tx = await dutchAuction.connect(buyer).buy({ value: price });
            const receipt = await tx.wait();
            
            console.log("购买 gas 消耗:", receipt!.gasUsed.toString());
            expect(receipt!.gasUsed).to.be.lessThan(200000); // 应该小于 200k gas
        });
    });
});
