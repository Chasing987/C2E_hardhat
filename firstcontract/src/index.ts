import { ethers } from "ethers";

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

    if(!await hasSigners() && !await requestAccess()){
        throw new Error("No ethereum provider found");
    }

    const provider = new ethers.BrowserProvider(getEth())
    const address = process.env.CONTRACT_ADDRESS;
    const contract = new ethers.Contract(
        address,
        [
            "function hello() public pure returns (string memory)"
        ],
        provider
    );

    document.body.innerHTML = await contract.hello();
}

async function main() {
    await getContract();
}

main();