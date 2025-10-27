# 荷兰式拍卖（Dutch Auction）项目

## 项目概述

这是一个基于 Hardhat 的智能合约项目，实现了荷兰式拍卖（Dutch Auction）机制用于 NFT 交易。

### 荷兰式拍卖原理

荷兰式拍卖是一种降价拍卖方式：
- 从高价格开始，随时间逐渐降价
- 第一个愿意支付当前价格的买家赢得拍卖
- 价格计算公式：`当前价格 = 起始价格 - 折扣率 × 已过时间`

## 合约说明

### 1. MyNFT.sol

自定义的 ERC721 NFT 合约，包含：
- 基本的 ERC721 功能（转移、授权等）
- `mint()` 函数：铸造新的 NFT
- `burn()` 函数：销毁 NFT

### 2. DutchAuction.sol

荷兰式拍卖合约，包含：
- **构造函数**：设置起始价格、折扣率、拍卖时长（7天）
- **buy() 函数**：买家购买 NFT，自动转账给卖家并退款多余 ETH
- **getPrice() 函数**：查询当前拍卖价格

#### 重要参数
- `startingPrice`: 起始价格
- `discountRate`: 折扣率（ETH/秒）
- `DURATION`: 拍卖时长（7天）
- **要求**：`startingPrice >= discountRate × DURATION`

## 使用指南

### 安装依赖

```bash
npm install
```

### 编译合约

```bash
npx hardhat compile
```

### 运行测试

```bash
npx hardhat test test/DutchAuction.ts
```

测试覆盖包括：
- ✅ 合约部署和参数设置
- ✅ 拍卖时间设置
- ✅ 价格计算（初始价格、线性下降、负值处理）
- ✅ 购买功能（正常购买、支付不足、退款、过期拒绝）
- ✅ NFT 转移
- ✅ 边界情况处理
- ✅ Gas 优化

### 部署合约

```bash
npx hardhat run scripts/deploy-dutch-auction.ts
```

部署流程：
1. 部署 MyNFT 合约
2. 铸造 NFT 给卖家
3. 部署 DutchAuction 合约（以卖家身份）
4. 卖家授权拍卖合约可以转移 NFT
5. 显示拍卖信息和当前价格

## 脚本说明

### deploy-dutch-auction.ts

部署脚本，执行完整的部署流程：

```typescript
// 默认参数
起始价格: 1000 ETH
折扣率: 0.001 ETH/秒（约 86.4 ETH/天）
拍卖时长: 7 天
```

### 测试参数

测试中的参数会确保：
- `startingPrice (1000 ETH) >= discountRate (0.001 ETH/s) × DURATION (604800s)`

这确保了价格不会降到负数。

## 项目结构

```
contracts/
  ├── 01_DutchAuction/
  │   ├── MyNFT.sol           # NFT 合约
  │   └── DutchAuction.sol    # 荷兰式拍卖合约
scripts/
  └── deploy-dutch-auction.ts # 部署脚本
test/
  └── DutchAuction.ts         # 测试文件
```

## 主要功能

1. **NFT 铸造**：卖家可以通过 MyNFT 合约铸造 NFT
2. **拍卖创建**：卖家部署 DutchAuction 合约并发起拍卖
3. **价格查询**：任何人都可以查询当前拍卖价格
4. **购买 NFT**：买家调用 `buy()` 函数购买 NFT
5. **自动退款**：如果支付金额超过当前价格，多余部分自动退还给买家

## 注意事项

1. 部署前确保卖家已将 NFT 授权给拍卖合约
2. 拍卖时长为 7 天，过期后无法购买
3. 价格以恒定速率下降（折扣率）
4. 购买后 NFT 自动转移给买家
5. 卖家会收到购买价格对应的 ETH

## Gas 消耗

- 合约部署：MyNFT ~1.74M gas，DutchAuction ~654K gas
- 购买操作：~76K gas
- Mint NFT：~69K gas
- Approve：~49K gas

## 改进建议

1. 添加卖家撤销拍卖功能
2. 添加最小价格限制
3. 添加批量拍卖支持
4. 添加事件日志
5. 添加提现功能（如果拍卖未成功）

## License

MIT
