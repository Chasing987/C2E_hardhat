// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

// 部署测试
// 账户1（deployer）-> launch
// 账户2 -> pledge
// 账户3 -> pledge
contract CrowdFund {
    event Launch(uint id, address indexed creator, uint goal, uint32 startAt, uint32 endAt);
    event Cancel(uint id);
    event Pledge(uint indexed id, address indexed caller, uint amount);
    event Unpledge(uint indexed  id, address indexed caller, uint amount);
    event Claim(uint indexed id);
    event Refund(uint indexed  id, address indexed caller, uint amount);

    struct Campaign{
        address creator;  // 众筹的创建者
        uint goal;  // 众筹目标额
        uint pledged; // 已经认捐到的资金
        uint32 startAt; // 开始时间
        uint32 endAt; // 结束时间
        bool claimed; // 是否已经提取了
    }

    IERC20 public immutable token;
    uint public count; // 轮次
    mapping (uint => Campaign) public campaigns; // 每个轮次中，众筹的详细信息
    mapping (uint => mapping (address => uint)) public pledgeAmount; // 每个轮次中，每个地址的认捐金额

    constructor(address _token){
        token = IERC20(_token);
    }

    // 发起众筹
    function launch(uint _goal, uint32 _startOffset, uint32 _endOffset) external {
        require(_endOffset > _startOffset, "endAt <= startAt");
        require(_endOffset < 30 days, "end > 30 days");

        uint32 _startAt = uint32(block.timestamp) + _startOffset;
        uint32 _endAt = uint32(block.timestamp) + _endOffset;

        count += 1;
        campaigns[count] = Campaign({
            creator: msg.sender,
            goal: _goal,
            pledged: 0,
            startAt: _startAt,
            endAt: _endAt,
            claimed: false
        });

        emit Launch(count, msg.sender, _goal, _startAt, _endAt);
    }

    // 取消众筹
    function cancel(uint _id)external {
        Campaign memory campaign = campaigns[_id];
        require(msg.sender == campaign.creator);
        require(block.timestamp < campaign.startAt, "started");

        delete campaigns[_id];
        emit Cancel(_id);
    }

    // 认捐资金
    function pledge(uint _id, uint _amount)external {
        Campaign storage campaign = campaigns[_id];
        require(block.timestamp >= campaign.startAt, "not started");
        require(block.timestamp <= campaign.endAt, "ended");

        campaign.pledged += _amount;
        pledgeAmount[_id][msg.sender] += _amount;

        token.transferFrom(msg.sender, address(this), _amount);
        emit Pledge(_id, msg.sender, _amount);
    }

    // 撤回认捐
    function unpledge(uint _id, uint _amount) external {
        Campaign storage cpn = campaigns[_id];
        require(block.timestamp <= cpn.endAt, "ended");

        cpn.pledged -= _amount;
        pledgeAmount[_id][msg.sender] -= _amount;
        token.transfer(msg.sender, _amount);

        emit Unpledge(_id, msg.sender, _amount);
    }

    // 提取资金
    function claim(uint _id) external {
        Campaign storage campaign = campaigns[_id];
        require(msg.sender == campaign.creator, "not creator");
        require(block.timestamp > campaign.endAt, "not ended");
        require(campaign.pledged >= campaign.goal, "pledged < goal");
        require(!campaign.claimed, "claimed");

        campaign.claimed = true;

        token.transfer(msg.sender, campaign.pledged);
        emit Claim(_id);
    }

    // 失败退款
    function refund(uint _id)external {
        Campaign storage campaign = campaigns[_id];
        require(block.timestamp > campaign.endAt, "not ended");
        require(campaign.pledged < campaign.goal, "pledged >= goal");

        uint balance = pledgeAmount[_id][msg.sender];
        pledgeAmount[_id][msg.sender] = 0;
        token.transfer(msg.sender, balance);
    }
}