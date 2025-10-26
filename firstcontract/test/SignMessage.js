const ethers = require("ethers");
const hre = require("hardhat");

async function sign(message) {
    const [signer] = await hre.ethers.getSigners();

    console.log(signer.address);

    const messageHashBytes = ethers.toBeArray(
        ethers.keccak256(ethers.toUtf8Bytes(message))
    );

    console.log(await signer.signMessage(messageHashBytes));

}

sign("C2N");