# LearnToEarn — Contract Review

## Review scope

This is a source-level review of the Solidity file in the repository. The historical deployment address currently shown in the README does not identify a chain, and the deployment bytecode was not independently matched to this source. This is not a formal audit.

## Legacy V1 findings

### 1. Streak continuation is unreachable

The `onlyOncePerDay` modifier allows a call only when:

```solidity
block.timestamp - lastLoginTime[msg.sender] > 1 days
```

The body of `login()` repeats the same condition before choosing the streak. Therefore, whenever a repeat login is allowed, that condition is necessarily true and the local streak is reset to zero before incrementing it. The stored streak becomes one on every successful call. A multi-day streak cannot accumulate.

### 2. The V1 reward therefore stays on index one

The V1 reward schedule is `[0, 1, 2, 5, 10, 20] ether`. Since the streak is reset to one on every successful repeat login, V1 selects the first-day reward on each claim. Payment still depends on the contract having enough native-token balance.

### 3. Deposit is not owner-restricted

The V1 comment says the owner can deposit, but there is no owner variable or access-control modifier. The `deposit()` function is public to every address. The actual behavior is an open funding pool.

### 4. Legacy payment uses transfer

V1 uses Solidity's `transfer`, which can fail for recipient contracts whose receive/fallback logic needs more than the 2,300 gas stipend. V2 uses a checked low-level call and updates claim state before the external payment.

## V2 changes

- Streaks use UTC calendar days, not a rolling 24-hour timer.
- A wallet may claim once per UTC day.
- A claim on the next consecutive UTC day increments the streak; a missed day resets it to one.
- The owner is the deploying address and is the only address allowed to update the reward schedule.
- Anyone can fund the pool; deposits must be greater than zero.
- Schedule length is capped at 31 entries (index zero plus up to 30 reward days).
- Each configured reward is capped at 100 native-token units.
- Reward state is updated before the external call; a failed payment reverts the entire claim.
- There is deliberately no owner withdrawal function in this version.

## Remaining risks and release requirements

- The contract has not been externally audited.
- Reward values are denominated in the chain's native currency; their fiat value and availability are not guaranteed.
- The pool can run out of funds, causing reward claims to revert.
- The owner can change future reward values. The UI and README must disclose this control.
- A production deployment needs a confirmed chain, RPC/explorer configuration, deployment verification and a testnet rehearsal.
- The historical V1 address must not be presented as a V2 deployment.

Use test networks and non-valuable test funds until the code has been reviewed and independently audited.
