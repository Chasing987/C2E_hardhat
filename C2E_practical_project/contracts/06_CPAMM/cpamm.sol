// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract CPAMM {
    IERC20 public immutable token0;
    IERC20 public immutable token1;

    uint256 public reserve0;
    uint256 public reserve1;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    constructor(address _token1, address _token2){
        token0 = IERC20(_token1);
        token1 = IERC20(_token2);
    }

    function _mint(address to, uint256 _amount) private{
        totalSupply += _amount;
        balanceOf[to] += _amount;
    }

    function _burn(address from, uint256 _amount) private{
        totalSupply -= _amount;
        balanceOf[from] -= _amount;
    }

    function _update(uint256 _reserve0, uint256 _reserve1) private{
        reserve0 = _reserve0;
        reserve1 = _reserve1;
    }

    function swap(address _tokenIn, uint256 _amountIn) external returns (uint256 amountOut){
        require(_tokenIn == address(token0) || _tokenIn == address(token1), "invalid token");
        require(_amountIn > 0, "invalid amount");

        bool isToken0 = _tokenIn == address(token0);
        (IERC20 tokenIn, IERC20 tokenOut, uint256 reserveIn, uint256 reserveOut) = isToken0 
        ? (token0, token1, reserve0, reserve1) : (token1, token0, reserve1, reserve0);

        tokenIn.transferFrom(msg.sender, address(this), _amountIn);

        /*
        xy = k
        (x + dx)(y - dy) = k
        ydx / (x + dx) = dy
        */
        // 0.3% fee 
        uint256 amountInWithFee = (_amountIn * 997) / 1000;
        amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
        tokenOut.transfer(msg.sender, amountOut);

        _update(token0.balanceOf(address(this)), token1.balanceOf(address(this)));
    }

    function addLiquidity(uint256 _amount0, uint256 _amount1)external returns(uint256 shares){
        token0.transferFrom(msg.sender, address(this), _amount0);
        token1.transferFrom(msg.sender, address(this), _amount1);

        if(reserve0 > 0 || reserve1 > 0){
            require(reserve0 * _amount1 == reserve1 * _amount0, "x / y != dx / dy");

        }

        if(totalSupply == 0){
            shares = Math.sqrt(_amount0 * _amount1);
        }else{
            shares = Math.min(
                (_amount0 * totalSupply) / reserve0,
                (_amount1 * totalSupply) / reserve1
            );
        }

        require(shares > 0, "invalid shares");
        _mint(msg.sender, shares);
        _update(token0.balanceOf(address(this)), token1.balanceOf(address(this)));
    }

    function removeLiquidity(uint256 _shares) external returns (uint256 amount0, uint256 amount1){
        uint256 bal0 = token0.balanceOf(address(this));
        uint256 bal1 = token1.balanceOf(address(this));

        amount0 = (bal0 * _shares) / totalSupply;
        amount1 = (bal1 * _shares) / totalSupply;

        require(amount0 > 0 && amount1 > 0, "invalid amount");

        _burn(msg.sender, _shares);
        _update(token0.balanceOf(address(this)), token1.balanceOf(address(this)));

        token0.transfer(msg.sender, amount0);
        token1.transfer(msg.sender, amount1);
    }

}