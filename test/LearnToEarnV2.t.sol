// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LearnToEarnV2} from "../contracts/LearnToEarnV2.sol";

interface Vm {
    function warp(uint256 timestamp) external;
    function deal(address account, uint256 newBalance) external;
    function prank(address sender) external;
    function expectRevert(bytes calldata reason) external;
}

contract LearnToEarnV2Test {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    LearnToEarnV2 private app;
    address private alice = address(0xA11CE);
    address private bob = address(0xB0B);

    function setUp() public {
        app = new LearnToEarnV2();
        vm.deal(address(this), 100 ether);
        app.deposit{value: 50 ether}();
        vm.warp(2 days);
    }

    function testFirstClaimPaysDayOneBonus() public {
        vm.prank(alice);
        app.login();

        _eq(app.loginStreaks(alice), 1);
        _eq(app.lastLoginDay(alice), 2);
        _eq(alice.balance, 1 ether);
        _eq(app.contractBalance(), 49 ether);
    }

    function testConsecutiveCalendarDaysIncreaseStreakAndBonus() public {
        vm.prank(alice);
        app.login();

        vm.warp(3 days);
        vm.prank(alice);
        app.login();

        _eq(app.loginStreaks(alice), 2);
        _eq(alice.balance, 3 ether);
        _eq(app.contractBalance(), 47 ether);
    }

    function testMissingCalendarDayResetsStreakToOne() public {
        vm.prank(alice);
        app.login();

        vm.warp(4 days);
        vm.prank(alice);
        app.login();

        _eq(app.loginStreaks(alice), 1);
        _eq(alice.balance, 2 ether);
    }

    function testCannotClaimTwiceOnSameDay() public {
        vm.prank(alice);
        app.login();

        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Already claimed today"));
        vm.prank(alice);
        app.login();
    }

    function testUnfundedClaimRevertsWithoutChangingState() public {
        LearnToEarnV2 emptyPool = new LearnToEarnV2();

        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Reward transfer failed"));
        vm.prank(bob);
        emptyPool.login();

        _eq(emptyPool.loginStreaks(bob), 0);
        _eq(emptyPool.lastLoginDay(bob), 0);
    }

    function testOnlyOwnerCanChangeRewardSchedule() public {
        uint256[] memory schedule = new uint256[](2);
        schedule[0] = 0;
        schedule[1] = 0.5 ether;

        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Not contract owner"));
        vm.prank(alice);
        app.setStreakBonuses(schedule);
    }

    function testOwnerCanChangeRewardSchedule() public {
        uint256[] memory schedule = new uint256[](2);
        schedule[0] = 0;
        schedule[1] = 0.5 ether;

        app.setStreakBonuses(schedule);
        vm.prank(alice);
        app.login();

        _eq(alice.balance, 0.5 ether);
    }

    function testAnyoneCanFundThePool() public {
        vm.deal(bob, 2 ether);
        vm.prank(bob);
        app.deposit{value: 1 ether}();

        _eq(app.contractBalance(), 51 ether);
    }

    function testRewardScheduleCannotExceedConfiguredMaximum() public {
        uint256[] memory schedule = new uint256[](2);
        schedule[0] = 0;
        schedule[1] = 101 ether;

        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Bonus exceeds maximum"));
        app.setStreakBonuses(schedule);
    }

    function _eq(uint256 actual, uint256 expected) private pure {
        require(actual == expected, "Assertion failed");
    }
}
