// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

contract StakingRewards{
    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    address public owner;
    uint256 public duration;
    uint256 public finishAt;
    uint256 public updatedAt;
    uint256 public rewardRate;
    uint256 public rewardPerTokenStored;

    mapping (address => uint256) public userRewardPerTokenPaid; // 每个代币的奖励数量
    mapping (address => uint256) public rewards; // 用户奖励的数值

    uint256 public totalSupply; // 总的质押代币数量
    mapping (address=>uint256)public balanceOf; // 用户的质押代币数值

    modifier onlyOwner(){
        require(msg.sender == owner, "not owner");
        _;
    }

    // 更新用户奖励的状态
    modifier updateReward(address _account){
        rewardPerTokenStored = rewardPerToken();
        updatedAt = lastTimeRewardApplicable();

        if(_account != address(0)){
            rewards[_account] = earned(_account);
            userRewardPerTokenPaid[_account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(address _stakingToken, address _rewardsToken){
        owner = msg.sender;
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
    }

    // 设置奖励持续时间
    function setRewardDuration(uint256 _duration)external onlyOwner{
        require(finishAt < block.timestamp, "reward duration not finished");
        duration = _duration;
    }

    // 设置奖励金额和分配速率
    function notifyRewardAmount(uint256 _amount)external onlyOwner updateReward(address(0)){
        if(block.timestamp > finishAt){
            rewardRate = _amount / duration;
        }else{
            uint256 remainingRewards = rewardRate * (finishAt - block.timestamp);
            rewardRate = (remainingRewards + _amount) / duration;
        }
        require(rewardRate > 0, "reward rate = 0");
        require(rewardRate * duration <= rewardsToken.balanceOf(address(this)), "reward amount > balance");

        finishAt = block.timestamp + duration;
        updatedAt = block.timestamp;
    }

    // 质押
    function stake(uint256 _amount)external  updateReward(msg.sender){
        require(_amount > 0, "amount = 0");
        stakingToken.transferFrom(msg.sender, address(this), _amount);
        balanceOf[msg.sender] += _amount;
        totalSupply += _amount;
    }

    // 撤销
    function withdraw(uint256 _amount)external updateReward(msg.sender){
        require(_amount > 0, "amount == 0");
        balanceOf[msg.sender] -= _amount;
        totalSupply -= _amount;
        stakingToken.transfer(msg.sender, _amount);
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return _min(block.timestamp, finishAt);
    }


    function rewardPerToken() public view returns (uint256) {
        if (totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored +
            ((rewardRate * (lastTimeRewardApplicable() - updatedAt)) * 1e18) /
            totalSupply;
    }

    // 计算当前用户可领取的奖励总额
    function earned(address _account) public view returns (uint256) {
        return
            (balanceOf[_account] *
                (rewardPerToken() - userRewardPerTokenPaid[_account])) /
            1e18 +
            rewards[_account];
    }

    // 拿回奖励
    function getReward() external updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.transfer(msg.sender, reward);
        }
    }

    function _min(uint256 x, uint256 y) private pure returns (uint256) {
        return x <= y ? x : y;
    }

}