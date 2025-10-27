// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC721 {
    function transferFrom (
        address _from,
        address _to,
        uint _nftId
    ) external;
}

contract DutchAuction {
    // NFT 相关信息
    IERC721 public immutable nft;
    uint public immutable nftId;

    // 拍卖信息
    uint private constant DURATION = 7 days;
    address public immutable seller;
    uint public immutable startingPrice;
    uint public immutable startAt;
    uint public immutable expiresAt;
    uint public immutable discountRate;

   // 卖家出售 NFT
   constructor(
        uint _startingPrice,
        uint _discountRate,
        address _nft,
        uint _nftId
   )
   {
        seller = payable(msg.sender);
        startingPrice = _startingPrice;
        discountRate = _discountRate;
        startAt = block.timestamp;
        expiresAt = block.timestamp + DURATION;

        require( _startingPrice >= _discountRate * DURATION, "starting price < discount");

        nft = IERC721(_nft);
        nftId = _nftId;
   }

   // 买家购买 NFT
    function buy() external payable {
        require(block.timestamp < expiresAt, "auction expired");

        uint price = getPrice();
        require(msg.value >= price, "ETH < price");

        nft.transferFrom(seller, msg.sender, nftId);
        
        // 将拍卖款转给卖家
        (bool success, ) = payable(seller).call{value: price}("");
        require(success, "Failed to send ETH to seller");
        
        // 退还多余的 ETH 给买家
        uint refund = msg.value - price;
        if(refund > 0) {
            (bool success_refund, ) = payable(msg.sender).call{value: refund}("");
            require(success_refund, "Failed to refund");
        }
    }

    // 查看当前价格
    function getPrice() public view returns(uint) {
        uint timeElapsed = block.timestamp - startAt;
        uint discount = discountRate * timeElapsed;
        return startingPrice - discount;
    }
}