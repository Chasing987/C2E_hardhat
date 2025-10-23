import { ethers } from "ethers";
import { abi } from '../artifacts/contracts/Counter.sol/Counter.json';

function getEth(){
    // @ts-ignore
    const eth = window.ethereum;

    if(!eth){
        throw new Error("No ethereum provider found");
    }

    return eth;
}

async function requestAccess() {
    const eth = getEth();
    const result = await eth.request({ method: 'eth_requestAccounts' }) as string[];
    return result && result.length > 0;
}

async function hasSigners(){
    const metamask = getEth();
    const signers = await metamask.request({ method: "eth_accounts" }) as string[];
    return signers.length > 0;
}

async function getContract() {
    // 1. 地址
    // 2. 方法名
    // 3. provider
    // 4. signer

    if(!await hasSigners() && !await requestAccess()){
        throw new Error("No ethereum provider found");
    }

    const provider = new ethers.BrowserProvider(getEth())
    const address = process.env.CONTRACT_ADDRESS;
    // const address = "0x51a10886a854D273Ec169Af02CB9862Cb17bF4c1";
    const contract = new ethers.Contract(
        address,
        // [
        //     "function count() public",
        //     "function getCount() public view returns (uint256)"
        // ],
        abi,
        await provider.getSigner(),
    );

    const counter = document.createElement("div");
    async function getCount() {
        counter.innerHTML = await contract.getCount();
    }
    getCount();

    async function setCount() {
        await contract.count();
    }

    const btn = document.createElement("button");
    btn.innerHTML = "increment";
    btn.onclick = async function() {
        // const tx = await contract.count(); // transaction提交，不是等待transaction完成
        // await tx.wait(); // 等待transaction完成
        // getCount();

        await contract.count();
    }

    contract.on(contract.filters.CounterInc(), async function ({ args }) {
        counter.innerHTML = args[0].toString() || await contract.getCount();
    })

    document.body.appendChild(counter);
    document.body.appendChild(btn);
}

async function main() {
    await getContract();
}

main();