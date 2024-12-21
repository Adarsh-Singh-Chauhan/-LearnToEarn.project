// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LearnToEarn {

    // Mapping to track login streaks
    mapping(address => uint256) public loginStreaks;
    
    // Mapping to track the last login time
    mapping(address => uint256) public lastLoginTime;

    // Bonus rewards for login streaks
    uint256[] public streakBonuses = [0, 1 ether, 2 ether, 5 ether, 10 ether, 20 ether]; // Example bonuses

    // Events
    event Login(address indexed user, uint256 streak, uint256 bonus);
    event StreakBonus(address indexed user, uint256 bonusAmount);

    // Modifier to ensure at least 1 day passed since last login
    modifier onlyOncePerDay() {
        require(block.timestamp - lastLoginTime[msg.sender] > 1 days, "You can only log in once per day.");
        _;
    }

    // Function to handle user login
    function login() external onlyOncePerDay {
        uint256 streak = loginStreaks[msg.sender];

        // Check if it's a continuation of the streak or a new streak
        if (block.timestamp - lastLoginTime[msg.sender] > 1 days) {
            // If more than a day has passed since last login, reset streak
            streak = 0;
        }

        // Increment the streak
        loginStreaks[msg.sender] = streak + 1;

        // Reward based on streak
        uint256 bonusAmount = 0;
        if (streak + 1 < streakBonuses.length) {
            bonusAmount = streakBonuses[streak + 1];
        }

        // Transfer reward if any
        if (bonusAmount > 0) {
            payable(msg.sender).transfer(bonusAmount);
            emit StreakBonus(msg.sender, bonusAmount);
        }

        // Update last login time
        lastLoginTime[msg.sender] = block.timestamp;

        // Emit login event
        emit Login(msg.sender, streak + 1, bonusAmount);
    }

    // Function to allow the contract owner to deposit funds into the contract
    function deposit() external payable {}

    // Function to check balance of the contract
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
