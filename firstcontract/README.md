# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```

```shell
// 第一个合约,使用hardhat，使用到一些命令
yarn: npm install -g yarn

// 创建文件
mkdir firstcontract

// 转至firstcontract目录下
cd firstcontract

// 初始化项目，生成node_modules文件以及package.json
yarn init -y

// 安装hardhat框架
yarn add -D hardhat

// 初始化合约项目
npx hardhat init

// 合约编译
npx hardhat complie

// 添加ts库
yarn add -D ts-node typescript

// 添加chai
yarn add -D @types/mocha

// 测试
npx hardhat test 

// 部署
npx hardhat run scripts/deploy-hello.ts --network localhost

// localhost地址, 即本地上起了一个区块链网络
npx hardhat node

// webpack 打包工具
pnpm dev

// 验证合约 
// 0x6Ea3004bD10c56318f3f4D521990faE50ab72A27为部署合约的地址
npx hardhat verify --network sepolia_eth 0x6Ea3004bD10c56318f3f4D521990faE50ab72A27
```
