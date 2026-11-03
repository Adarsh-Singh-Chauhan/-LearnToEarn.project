// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LearnToEarnV2
/// @notice Calendar-day streak rewards funded by a shared native-token pool.
/// @dev V2 fixes the legacy streak-reset bug. This contract is not audited.
contract LearnToEarnV2 {
    address public immutable owner;

    mapping(address => uint256) public loginStreaks;
    mapping(address => uint256) public lastLoginTime;
    mapping(address => uint256) public lastLoginDay;
    mapping(address => bool) public hasLoggedIn;

    uint256[] public streakBonuses;

    uint256 public constant MAX_BONUS_PER_CLAIM = 100 ether;
    uint256 public constant MAX_STREAK_DAYS = 30;

    bool private entered;

    event Login(address indexed user, uint256 indexed day, uint256 streak, uint256 bonus);
    event StreakBonus(address indexed user, uint256 bonusAmount);
    event PoolFunded(address indexed funder, uint256 amount, uint256 newBalance);
    event StreakBonusesUpdated(uint256 bonusCount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }

    modifier nonReentrant() {
        require(!entered, "Reentrant call");
        entered = true;
        _;
        entered = false;
    }

    constructor() {
        owner = msg.sender;

        // Index 0 is intentionally unused. Index 1 is the first-day bonus.
        streakBonuses.push(0);
        streakBonuses.push(1 ether);
        streakBonuses.push(2 ether);
        streakBonuses.push(5 ether);
        streakBonuses.push(10 ether);
        streakBonuses.push(20 ether);
    }

    /// @notice Claim the reward for the current UTC calendar day.
    /// @dev A missed calendar day resets the streak to day one.
    function login() external nonReentrant {
        uint256 today = block.timestamp / 1 days;
        uint256 previousDay = lastLoginDay[msg.sender];

        if (hasLoggedIn[msg.sender]) {
            require(today > previousDay, "Already claimed today");
        }

        uint256 streak;
        if (!hasLoggedIn[msg.sender]) {
            streak = 1;
        } else if (today == previousDay + 1) {
            streak = loginStreaks[msg.sender] + 1;
        } else {
            streak = 1;
        }

        uint256 bonus = streak < streakBonuses.length ? streakBonuses[streak] : 0;

        // Effects are applied before the external payment call.
        hasLoggedIn[msg.sender] = true;
        loginStreaks[msg.sender] = streak;
        lastLoginDay[msg.sender] = today;
        lastLoginTime[msg.sender] = block.timestamp;

        if (bonus > 0) {
            (bool sent, ) = payable(msg.sender).call{value: bonus}("");
            require(sent, "Reward transfer failed");
            emit StreakBonus(msg.sender, bonus);
        }

        emit Login(msg.sender, today, streak, bonus);
    }

    /// @notice Anyone can contribute native tokens to the shared reward pool.
    function deposit() external payable {
        require(msg.value > 0, "Deposit must be greater than zero");
        emit PoolFunded(msg.sender, msg.value, address(this).balance);
    }

    /// @notice Read the current reward-pool balance.
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Number of entries in the reward schedule, including index zero.
    function bonusCount() external view returns (uint256) {
        return streakBonuses.length;
    }

    /// @notice Update the reward schedule. Only the deployer/owner can do this.
    /// @dev Index zero must remain zero; at most 30 reward days are supported.
    function setStreakBonuses(uint256[] calldata bonuses) external onlyOwner {
        require(bonuses.length >= 2, "Schedule must include a day-one bonus");
        require(bonuses.length <= MAX_STREAK_DAYS + 1, "Schedule is too long");
        require(bonuses[0] == 0, "Index zero must be zero");

        for (uint256 i = 1; i < bonuses.length; i++) {
            require(bonuses[i] <= MAX_BONUS_PER_CLAIM, "Bonus exceeds maximum");
        }

        delete streakBonuses;
        for (uint256 i = 0; i < bonuses.length; i++) {
            streakBonuses.push(bonuses[i]);
        }

        emit StreakBonusesUpdated(bonuses.length);
    }
}
