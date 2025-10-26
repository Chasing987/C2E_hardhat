// 引入依赖模块
const ethers = require("ethers");
const hre = require("hardhat");

/**
 * 自定义的工具函数，用于为某个用户生成一个ERC-2612/EIP-2612 permit签名
 * @param {ethers.Wallet} wallet - 用于签署permit的用户钱包对象
 * @param {ethers.Contract} token - 支持permit功能的ERC20代币合约实例
 * @param {ethers.Signer} spender - 被授权花费代币的用户
 * @param {ethers.BigNumberish} value - 授权的代币数量
 * @param {ethers.BigNumberish} deadline - 签名的截止时间戳，Unix 时间，单位秒
 * @returns {Promise<ethers.Signature>} - 返回生成的签名对象，包含r、s、v值
 */
async function getPermitSignature(wallet, token, spender, value, deadline) {

    /**
     * 获取permit签名所需的域分隔符参数 
     * nonce: 签名的nonce值，通常从合约中获取，这里简化为0,
     * nonce应该是动态的，从合约中查询该用户的当前 Nonce，通常是调用类似 token.nonces(owner)的方法
     * name: 代币的名称
     * version: 代币的版本
     * chainId: 当前链的ID
     */
    const [nonce, name, version, chainId] = await Promise.all([
        0,
        "C2NPermit",
        "1",
        (await wallet.provider.getNetwork()).chainId,
    ]);

    /**
     * 使用EIP-712标准生成permit签名
     * 这里使用ethers.js的signTypedData方法来生成签名
     * 返回一个包含r、s、v值的签名对象
     */
    return ethers.Signature.from(
        await wallet.signTypedData(
            {
                name: name,
                version: version,
                chainId: chainId,
                verifyingContract: await token.getAddress(),
            },
            {
                Permit: [
                    {
                        name: 'owner',
                        type: 'address',
                    },
                    {
                        name: 'spender',
                        type: 'address',
                    },
                    {
                        name: 'value',
                        type: 'uint256',
                    },
                    {
                        name: 'nonce',
                        type: 'uint256',
                    },
                    {
                        name: 'deadline',
                        type: 'uint256',
                    },
                ],
            },
            {
                owner: wallet.address, // 正在的owner地址
                spender: spender.address, // 被授权的spender地址
                value, // 授权的代币数量
                nonce, // 签名的nonce值
                deadline, // 签名的截止时间戳
            }
        )
    )
}

/**
 * 这个脚本的目的是：
 * 1. 部署一个名为C2NPermit的ERC20代币合约，该合约支持permit功能。
 * 2. 使用第一个账户（signer1）为第二个账户（signer2）签署一个permit签名，允许signer2花费100个代币。
 * 3. 调用合约的permit函数，使用签名来授权signer2花费signer1的代币。
 * 4. 这个授权是通过 ​​ERC-2612 的 permit() 签名机制​​完成的，而不是普通的 approve()；
 * 5. 具体来说，它为 signer1生成一个 ​​签名（signature）​​，然后用这个签名调用合约的 permit()方法完成授权。
 */

async function test() {
    // 返回的是本地hardhat节点账户中的前两个账户
    const [signer1, signer2] = await hre.ethers.getSigners();

    // 根据本地目录下的solidity文件，编译并生成一个Factory，用来部署合约
    const contract = await hre.ethers.getContractFactory("C2NPermit");

    // 部署该合约到本地hardhat网络
    const token = await contract.deploy();

    // 等待部署交易确认
    await token.waitForDeployment();

    // 打印部署合约的地址
    console.log("Token deployed to:", await token.getAddress());

    // 授权数量
    const allowance = ethers.parseUnits("100", 18);

    // 最大截止时间
    const MaxUint256 = ethers.MaxUint256;

    // 生成签名，为signer1对signer2授权100个代币生成一个签名，返回的签名结构为{r, s, v}
    const { r, s, v } = await getPermitSignature(
        signer1,
        token,
        signer2,
        allowance,
        MaxUint256
    );

    // 使用生成的签名调用合约的permit函数，完成授权
    await token.permit(signer1, signer2, allowance, MaxUint256, v, r, s);
}

test();