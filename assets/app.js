(() => {
  "use strict";

  const LEGACY_ADDRESS = "0xc6BC7A58E304Ac2144afEc045AEfDb67B77713E0";
  const V1_ABI = [
    "function login()",
    "function loginStreaks(address) view returns (uint256)",
    "function lastLoginTime(address) view returns (uint256)",
    "function streakBonuses(uint256) view returns (uint256)",
    "function contractBalance() view returns (uint256)",
    "event Login(address indexed user,uint256 streak,uint256 bonus)",
    "event StreakBonus(address indexed user,uint256 bonusAmount)"
  ];
  const V2_ABI = [
    "function login()",
    "function deposit() payable",
    "function loginStreaks(address) view returns (uint256)",
    "function lastLoginTime(address) view returns (uint256)",
    "function lastLoginDay(address) view returns (uint256)",
    "function hasLoggedIn(address) view returns (bool)",
    "function streakBonuses(uint256) view returns (uint256)",
    "function bonusCount() view returns (uint256)",
    "function contractBalance() view returns (uint256)",
    "function owner() view returns (address)",
    "event Login(address indexed user,uint256 indexed day,uint256 streak,uint256 bonus)",
    "event StreakBonus(address indexed user,uint256 bonusAmount)",
    "event PoolFunded(address indexed funder,uint256 amount,uint256 newBalance)"
  ];

  const state = {
    provider: null,
    signer: null,
    account: null,
    chainId: null,
    contract: null,
    mode: "legacy",
    codeVerified: false,
    v2HasClaimedToday: false
  };

  const el = (id) => document.getElementById(id);
  const short = (value) => value ? value.slice(0, 6) + "…" + value.slice(-4) : "—";

  function formatNative(value) {
    if (!window.ethers || value === null || value === undefined) return "—";
    const formatted = window.ethers.formatEther(value);
    const number = Number(formatted);
    if (!Number.isFinite(number)) return formatted + " native";
    return number.toLocaleString("en-IN", { maximumFractionDigits: 5 }) + " native";
  }

  function setMessage(message, kind) {
    const node = el("consoleMessage");
    node.textContent = message;
    node.className = "console-message" + (kind ? " " + kind : "");
  }

  function toast(message) {
    const node = el("toast");
    node.textContent = message;
    node.classList.add("show");
    window.setTimeout(() => node.classList.remove("show"), 3200);
  }

  function setConnectedUI() {
    const connected = Boolean(state.account);
    el("walletStatus").textContent = connected ? "Connected · " + short(state.account) : "Wallet not connected";
    el("walletDot").parentElement.classList.toggle("connected", connected);
    el("accountShort").textContent = connected ? short(state.account) : "Not connected";
    el("connectButton").textContent = connected ? "Wallet connected" : "Connect wallet";
    el("connectTop").textContent = connected ? short(state.account) : "Connect wallet";
    el("networkName").textContent = state.chainId === null ? "Not detected" : networkLabel(state.chainId);
    el("refreshButton").disabled = !connected;
    updateActionButtons();
  }

  function networkLabel(chainId) {
    const labels = {
      "1": "Ethereum Mainnet",
      "11155111": "Sepolia",
      "137": "Polygon",
      "80002": "Polygon Amoy",
      "42161": "Arbitrum One",
      "10": "Optimism",
      "8453": "Base",
      "56": "BNB Smart Chain",
      "43114": "Avalanche"
    };
    return labels[String(chainId)] || "Chain ID " + chainId;
  }

  function currentAddress() {
    return el("contractAddress").value.trim();
  }

  function updateModeUI() {
    state.mode = el("contractMode").value;
    const isLegacy = state.mode === "legacy";
    el("legacyAlert").hidden = !isLegacy;
    el("contractAddress").value = isLegacy ? LEGACY_ADDRESS : "";
    el("contractAddress").placeholder = isLegacy ? "Legacy contract address" : "Paste the deployed V2 address";
    el("transactionHint").textContent = isLegacy
      ? "Legacy V1 claim and deposit actions are paused. Connect a wallet to inspect on-chain state only."
      : "V2 transactions are enabled only after contract bytecode is verified on the connected wallet network.";
    state.contract = null;
    state.codeVerified = false;
    clearMetrics();
    updateActionButtons();
    if (state.account) void inspectContract();
    else setMessage(isLegacy ? "Legacy V1 is available for read-only inspection." : "Paste a deployed V2 address and connect your wallet.");
  }

  function clearMetrics() {
    el("poolBalance").textContent = "—";
    el("userStreak").textContent = "—";
    el("nextReward").textContent = "—";
    el("lastClaim").textContent = "—";
    el("rewardHint").textContent = "Connect wallet to read contract";
    el("codeStatus").textContent = "Not checked";
    el("rewardSchedule").innerHTML = '<span class="reward-chip">Connect wallet to read schedule</span>';
  }

  function updateActionButtons() {
    const enabled = state.mode === "v2" && Boolean(state.signer) && state.codeVerified && Boolean(state.contract);
    el("loginButton").disabled = !enabled || state.v2HasClaimedToday;
    el("depositButton").disabled = !enabled;
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setMessage("No EVM wallet detected. Install MetaMask or use a browser with an EIP-1193 wallet.", "error");
      toast("EVM wallet not found");
      return;
    }
    if (!window.ethers) {
      setMessage("The ethers.js library could not be loaded. Refresh the page and try again.", "error");
      return;
    }

    try {
      state.provider = new window.ethers.BrowserProvider(window.ethereum);
      const accounts = await state.provider.send("eth_requestAccounts", []);
      if (!accounts || !accounts.length) throw new Error("No account was returned by the wallet.");
      state.signer = await state.provider.getSigner();
      state.account = await state.signer.getAddress();
      const network = await state.provider.getNetwork();
      state.chainId = network.chainId.toString();
      setConnectedUI();
      setMessage("Wallet connected. Checking for contract bytecode on " + networkLabel(state.chainId) + "…");
      await inspectContract();
      toast("Wallet connected");
    } catch (error) {
      setMessage(error && error.message ? error.message : "Wallet connection was cancelled.", "error");
    }
  }

  async function inspectContract() {
    if (!state.provider || !state.account) {
      setMessage("Connect your wallet first.", "error");
      return;
    }
    const address = currentAddress();
    if (!window.ethers.isAddress(address)) {
      state.codeVerified = false;
      state.contract = null;
      updateActionButtons();
      setMessage("Enter a valid contract address for the selected version.", "error");
      return;
    }

    try {
      setMessage("Checking contract code and reading on-chain values…");
      const code = await state.provider.getCode(address);
      if (!code || code === "0x") {
        state.codeVerified = false;
        state.contract = null;
        el("codeStatus").textContent = "No code at address";
        updateActionButtons();
        setMessage("No contract bytecode was found at this address on " + networkLabel(state.chainId) + ". Switch wallet network or check the address.", "error");
        return;
      }

      const abi = state.mode === "v2" ? V2_ABI : V1_ABI;
      const contract = new window.ethers.Contract(address, abi, state.provider);
      const balance = await state.provider.getBalance(address);
      const streak = await contract.loginStreaks(state.account);
      const lastLogin = await contract.lastLoginTime(state.account);
      const latestBlock = await state.provider.getBlock("latest");
      const now = latestBlock ? Number(latestBlock.timestamp) : Math.floor(Date.now() / 1000);
      const currentDay = Math.floor(now / 86400);

      state.contract = contract;
      state.codeVerified = true;
      el("codeStatus").textContent = "Bytecode found";
      el("poolBalance").textContent = formatNative(balance);
      el("userStreak").textContent = streak.toString() + (state.mode === "legacy" ? " · V1" : " days");
      el("lastClaim").textContent = Number(lastLogin) > 0
        ? new Date(Number(lastLogin) * 1000).toLocaleString()
        : "No check-in yet";

      let count = 6;
      let nextBonus = null;
      let hint = "";
      state.v2HasClaimedToday = false;

      if (state.mode === "v2") {
        count = Number(await contract.bonusCount());
        const lastDay = Number(await contract.lastLoginDay(state.account));
        const hasLogged = await contract.hasLoggedIn(state.account);
        state.v2HasClaimedToday = hasLogged && lastDay === currentDay;
        let nextStreak = 1;
        if (hasLogged && !state.v2HasClaimedToday && lastDay === currentDay - 1) {
          nextStreak = Number(streak) + 1;
        } else if (hasLogged && state.v2HasClaimedToday) {
          nextStreak = Number(streak) + 1;
        }
        nextBonus = nextStreak < count ? await contract.streakBonuses(nextStreak) : 0n;
        hint = state.v2HasClaimedToday ? "Already claimed today · UTC" : "Next eligible claim · day " + nextStreak;
        el("transactionHint").textContent = state.v2HasClaimedToday
          ? "Today's UTC claim is already used. The next claim becomes available after the UTC day changes."
          : "V2 contract verified on this network. Review the reward schedule before signing a transaction.";
      } else {
        hint = "V1 claim paused · streak reset bug";
        el("transactionHint").textContent = "Legacy V1 is connected for reads only. Its streak logic resets each successful repeat claim, so writes remain disabled.";
      }

      const rewards = [];
      for (let i = 1; i < count; i++) {
        const amount = await contract.streakBonuses(i);
        rewards.push({ day: i, amount: amount });
      }
      el("rewardSchedule").innerHTML = rewards.length
        ? rewards.map((reward) => '<span class="reward-chip">DAY ' + reward.day + '<b>' + formatNative(reward.amount) + '</b></span>').join("")
        : '<span class="reward-chip">No reward schedule returned</span>';

      el("nextReward").textContent = state.mode === "legacy" ? "Paused" : formatNative(nextBonus);
      el("rewardHint").textContent = hint;
      updateActionButtons();
      setMessage("Contract bytecode found. Read-only data loaded from " + networkLabel(state.chainId) + ".", "success");
    } catch (error) {
      state.codeVerified = false;
      state.contract = null;
      updateActionButtons();
      setMessage(error && error.message ? error.message : "Unable to read the selected contract. Check version, address and network.", "error");
    }
  }

  async function claimDailyReward() {
    if (state.mode !== "v2" || !state.signer || !state.contract || !state.codeVerified) return;
    if (state.v2HasClaimedToday) {
      toast("Today's UTC claim is already used");
      return;
    }
    try {
      el("loginButton").disabled = true;
      el("loginButton").textContent = "Confirm in wallet…";
      const tx = await state.contract.connect(state.signer).login();
      setMessage("Transaction submitted: " + tx.hash + " · waiting for confirmation…");
      await tx.wait();
      setMessage("Daily claim confirmed on-chain.", "success");
      toast("Daily reward claim confirmed");
      await inspectContract();
    } catch (error) {
      setMessage(error && error.shortMessage ? error.shortMessage : error.message || "Transaction failed.", "error");
    } finally {
      el("loginButton").textContent = "Claim daily reward ↗";
      updateActionButtons();
    }
  }

  async function fundPool() {
    if (state.mode !== "v2" || !state.signer || !state.contract || !state.codeVerified) return;
    const rawAmount = el("depositAmount").value.trim();
    if (!rawAmount || Number(rawAmount) <= 0) {
      setMessage("Enter a funding amount greater than zero.", "error");
      return;
    }
    try {
      const amount = window.ethers.parseEther(rawAmount);
      const confirmed = window.confirm("You are about to send " + rawAmount + " native tokens to the V2 reward pool on " + networkLabel(state.chainId) + ". This transaction cannot be reversed. Continue?");
      if (!confirmed) return;
      el("depositButton").disabled = true;
      el("depositButton").textContent = "Confirm in wallet…";
      const tx = await state.contract.connect(state.signer).deposit({ value: amount });
      setMessage("Funding transaction submitted: " + tx.hash + " · waiting for confirmation…");
      await tx.wait();
      el("depositAmount").value = "";
      setMessage("Reward pool funding confirmed on-chain.", "success");
      toast("Pool funding confirmed");
      await inspectContract();
    } catch (error) {
      setMessage(error && error.shortMessage ? error.shortMessage : error.message || "Funding transaction failed.", "error");
    } finally {
      el("depositButton").textContent = "Fund pool";
      updateActionButtons();
    }
  }

  function init() {
    el("connectTop").addEventListener("click", connectWallet);
    el("connectButton").addEventListener("click", connectWallet);
    el("refreshButton").addEventListener("click", inspectContract);
    el("contractMode").addEventListener("change", updateModeUI);
    el("loginButton").addEventListener("click", claimDailyReward);
    el("depositButton").addEventListener("click", fundPool);
    el("menuToggle").addEventListener("click", () => {
      const menu = document.querySelector(".main-nav");
      const open = menu.classList.toggle("open");
      el("menuToggle").setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".main-nav a").forEach((link) => {
      link.addEventListener("click", () => {
        document.querySelector(".main-nav").classList.remove("open");
        el("menuToggle").setAttribute("aria-expanded", "false");
      });
    });
    clearMetrics();

    if (window.ethereum && window.ethereum.on) {
      window.ethereum.on("accountsChanged", () => window.location.reload());
      window.ethereum.on("chainChanged", () => window.location.reload());
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
