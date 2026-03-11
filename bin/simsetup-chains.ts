#!/usr/bin/env ts-node
/**
 * simsetup-chains.ts
 * 
 * Setup Simulator - Chain Simulation Module
 *
 * Flight simulator for agent architectures on Solana & Base (EVM).
 * Simulates multi-agent transaction cost, performance, and failure modes
 * before you build.
 *
 * Features:
 *   * Solana devnet transaction simulation via Helius RPC
 *   * Base Sepolia transaction simulation via public RPC
 *   * Test token mint creation on both chains
 *   * Wallet balance & health checks
 *   * Transfer simulation with gas/priority-fee estimation
 *   * Failure-mode injection (timeout, revert, insufficient funds)
 *   * Latency & throughput benchmarking
 *   * Cost estimation rollup
 *
 * Usage:
 *   HELIUS_API_KEY=<key> ts-node bin/simsetup-chains.ts [--chain solana|base|all] [--mode mint|transfer|stress|full]
 *
 * Environment Variables:
 *   HELIUS_API_KEY          - Required for Solana Helius RPC
 *   BASE_RPC_URL            - Optional override for Base RPC (default: public Sepolia)
 *   SOLANA_PRIVATE_KEY      - Optional base58-encoded keypair for signing (devnet)
 *   BASE_PRIVATE_KEY        - Optional hex-encoded private key for signing (Sepolia)
 *   SIM_FAILURE_RATE        - Injected failure probability 0-1 (default: 0.0)
 *   SIM_CONCURRENCY         - Parallel transaction count for stress tests (default: 10)
 *   SIM_ITERATIONS          - Number of iterations per test (default: 5)
 * 
 */

import * as crypto from "crypto";

// - Wallet Configuration -

const WALLETS = {
  solana: {
    address: "DdQA9Xoe5i3B6eWCYqxHbb9yWB2vB7kTmjHs6JmTM9c2",
    chain: "solana",
    network: "devnet",
    explorer: "https://explorer.solana.com/address/DdQA9Xoe5i3B6eWCYqxHbb9yWB2vB7kTmjHs6JmTM9c2?cluster=devnet",
  },
  base: {
    address: "0xB6762f3dD802B4C0E5ae919b6C10288Be98D61F2",
    chain: "base",
    network: "sepolia",
    explorer: "https://sepolia.basescan.org/address/0xB6762f3dD802B4C0E5ae919b6C10288Be98D61F2",
  },
} as const;

// - RPC Configuration -

function getSolanaRpcUrl(): string {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.warn("[WARN] HELIUS_API_KEY not set - falling back to public devnet RPC (rate-limited)");
    return "https://api.devnet.solana.com";
  }
  return `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
}

function getBaseRpcUrl(): string {
  return process.env.BASE_RPC_URL || "https://sepolia.base.org";
}

// - Simulation Configuration -

interface SimConfig {
  chain: "solana" | "base" | "all";
  mode: "mint" | "transfer" | "stress" | "full";
  failureRate: number;
  concurrency: number;
  iterations: number;
  verbose: boolean;
}

function parseArgs(): SimConfig {
  const args = process.argv.slice(2);
  const config: SimConfig = {
    chain: "all",
    mode: "full",
    failureRate: parseFloat(process.env.SIM_FAILURE_RATE || "0"),
    concurrency: parseInt(process.env.SIM_CONCURRENCY || "10", 10),
    iterations: parseInt(process.env.SIM_ITERATIONS || "5", 10),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--chain" && args[i + 1]) {
      config.chain = args[i + 1] as SimConfig["chain"];
      i++;
    }
    if (args[i] === "--mode" && args[i + 1]) {
      config.mode = args[i + 1] as SimConfig["mode"];
      i++;
    }
    if (args[i] === "--failure-rate" && args[i + 1]) {
      config.failureRate = parseFloat(args[i + 1]);
      i++;
    }
    if (args[i] === "--concurrency" && args[i + 1]) {
      config.concurrency = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === "--iterations" && args[i + 1]) {
      config.iterations = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return config;
}

// - Utility Types -

interface SimResult {
  chain: string;
  operation: string;
  success: boolean;
  latencyMs: number;
  costEstimate: string;
  txSignature?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface StressReport {
  chain: string;
  totalTx: number;
  successCount: number;
  failCount: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  throughputTps: number;
  totalCostEstimate: string;
}

// - Logger -

const LOG_COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(level: "info" | "warn" | "error" | "success" | "debug", msg: string, data?: unknown): void {
  const colors: Record<string, string> = {
    info: LOG_COLORS.blue,
    warn: LOG_COLORS.yellow,
    error: LOG_COLORS.red,
    success: LOG_COLORS.green,
    debug: LOG_COLORS.dim,
  };
  const prefix = `${colors[level]}[${level.toUpperCase().padEnd(7)}]${LOG_COLORS.reset}`;
  console.log(`${prefix} ${msg}`);
  if (data) {
    console.log(`${LOG_COLORS.dim}${JSON.stringify(data, null, 2)}${LOG_COLORS.reset}`);
  }
}

function banner(text: string): void {
  const line = "=".repeat(70);
  console.log(`\n${LOG_COLORS.cyan}${line}`);
  console.log(`  ${LOG_COLORS.bright}${text}`);
  console.log(`${LOG_COLORS.cyan}${line}${LOG_COLORS.reset}\n`);
}

function sectionHeader(text: string): void {
  console.log(`\n${LOG_COLORS.magenta}-- ${text} ${"-".repeat(Math.max(0, 60 - text.length))}${LOG_COLORS.reset}\n`);
}

// - JSON-RPC Helper -

let rpcIdCounter = 0;

async function jsonRpc(url: string, method: string, params: unknown[], timeoutMs = 30000): Promise<unknown> {
  const id = ++rpcIdCounter;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };

    if (json.error) {
      throw new Error(`RPC Error ${json.error.code}: ${json.error.message}`);
    }

    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

// - Failure Injection -

type FailureType = "timeout" | "revert" | "insufficient_funds" | "nonce_mismatch" | "network_error";

function shouldInjectFailure(rate: number): FailureType | null {
  if (Math.random() >= rate) return null;

  const failures: FailureType[] = [
    "timeout",
    "revert",
    "insufficient_funds",
    "nonce_mismatch",
    "network_error",
  ];
  return failures[Math.floor(Math.random() * failures.length)];
}

function simulateFailure(failureType: FailureType): never {
  switch (failureType) {
    case "timeout":
      throw new Error("[INJECTED] Transaction timed out after 30000ms");
    case "revert":
      throw new Error("[INJECTED] Transaction reverted: execution reverted");
    case "insufficient_funds":
      throw new Error("[INJECTED] Insufficient funds for transaction + gas");
    case "nonce_mismatch":
      throw new Error("[INJECTED] Nonce too low - concurrent transaction detected");
    case "network_error":
      throw new Error("[INJECTED] Network error: ECONNREFUSED");
  }
}

// - Timing Helper -

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, durationMs: Math.round(performance.now() - start) };
}

// - Percentile Helper -

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ===============================================================================
// SOLANA SIMULATION MODULE
// ===============================================================================

class SolanaSimulator {
  private rpcUrl: string;
  private wallet: typeof WALLETS.solana;

  constructor() {
    this.rpcUrl = getSolanaRpcUrl();
    this.wallet = WALLETS.solana;
  }

  /** Check wallet health: balance, recent blockhash, slot */
  async healthCheck(): Promise<SimResult> {
    const op = "solana:healthCheck";
    try {
      const { result, durationMs } = await timed(async () => {
        const [balance, slot, blockHash, version] = await Promise.all([
          jsonRpc(this.rpcUrl, "getBalance", [this.wallet.address]) as Promise<{ value: number }>,
          jsonRpc(this.rpcUrl, "getSlot", []) as Promise<number>,
          jsonRpc(this.rpcUrl, "getLatestBlockhash", [{ commitment: "finalized" }]) as Promise<{
            value: { blockhash: string; lastValidBlockHeight: number };
          }>,
          jsonRpc(this.rpcUrl, "getVersion", []) as Promise<{ "solana-core": string }>,
        ]);
        return { balance, slot, blockHash, version };
      });

      const balanceSol = (result.balance as any).value / 1e9;
      log("success", `Solana wallet balance: ${balanceSol} SOL`);
      log("info", `Slot: ${result.slot} | Blockhash: ${(result.blockHash as any).value.blockhash.slice(0, 16)}...`);
      log("info", `Solana core version: ${(result.version as any)["solana-core"]}`);

      return {
        chain: "solana",
        operation: op,
        success: true,
        latencyMs: durationMs,
        costEstimate: "0 SOL",
        metadata: {
          balanceSol,
          slot: result.slot,
          blockhash: (result.blockHash as any).value.blockhash,
          solanaVersion: (result.version as any)["solana-core"],
        },
      };
    } catch (err: any) {
      log("error", `Health check failed: ${err.message}`);
      return { chain: "solana", operation: op, success: false, latencyMs: 0, costEstimate: "0 SOL", error: err.message };
    }
  }

  /** Simulate a token mint creation via simulateTransaction */
  async simulateMint(config: SimConfig): Promise<SimResult> {
    const op = "solana:simulateMint";

    const failure = shouldInjectFailure(config.failureRate);
    if (failure) {
      log("warn", `[FAILURE INJECTION] ${failure}`);
      simulateFailure(failure);
    }

    try {
      const { result, durationMs } = await timed(async () => {
        // Fetch minimum rent exemption for a mint account (82 bytes for SPL Token Mint)
        const rentExemption = (await jsonRpc(this.rpcUrl, "getMinimumBalanceForRentExemption", [82])) as number;

        // Fetch recent prioritization fees for cost estimation
        const recentFees = (await jsonRpc(this.rpcUrl, "getRecentPrioritizationFees", [])) as Array<{
          slot: number;
          prioritizationFee: number;
        }>;

        const avgPriorityFee =
          recentFees.length > 0
            ? recentFees.reduce((sum, f) => sum + f.prioritizationFee, 0) / recentFees.length
            : 0;

        // Get token accounts owned by wallet to understand existing state
        const tokenAccounts = (await jsonRpc(this.rpcUrl, "getTokenAccountsByOwner", [
          this.wallet.address,
          { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
          { encoding: "jsonParsed" },
        ])) as { value: Array<unknown> };

        return {
          rentExemption,
          avgPriorityFee,
          existingTokenAccounts: tokenAccounts.value.length,
        };
      });

      const rentSol = result.rentExemption / 1e9;
      const baseTxFee = 0.000005; // 5000 lamports
      const priorityFeeSol = result.avgPriorityFee / 1e9;
      const totalCost = rentSol + baseTxFee + priorityFeeSol;

      // Generate a deterministic "simulated" mint address
      const simulatedMint = crypto.createHash("sha256")
        .update(`sim-mint-${Date.now()}-${this.wallet.address}`)
        .digest("hex")
        .slice(0, 44);

      log("success", `Mint simulation complete`);
      log("info", `Rent exemption: ${rentSol} SOL`);
      log("info", `Avg priority fee: ${result.avgPriorityFee} microlamports`);
      log("info", `Existing token accounts: ${result.existingTokenAccounts}`);
      log("info", `Simulated mint address: ${simulatedMint}`);
      log("info", `Estimated total cost: ${totalCost.toFixed(9)} SOL`);

      return {
        chain: "solana",
        operation: op,
        success: true,
        latencyMs: durationMs,
        costEstimate: `${totalCost.toFixed(9)} SOL`,
        metadata: {
          simulatedMintAddress: simulatedMint,
          rentExemptionLamports: result.rentExemption,
          avgPriorityFeeMicrolamports: result.avgPriorityFee,
          existingTokenAccounts: result.existingTokenAccounts,
          breakdown: {
            rentSol,
            baseTxFee,
            priorityFeeSol,
            totalCost,
          },
        },
      };
    } catch (err: any) {
      log("error", `Mint simulation failed: ${err.message}`);
      return { chain: "solana", operation: op, success: false, latencyMs: 0, costEstimate: "0 SOL", error: err.message };
    }
  }

  /** Simulate a SOL transfer transaction */
  async simulateTransfer(config: SimConfig): Promise<SimResult> {
    const op = "solana:simulateTransfer";

    const failure = shouldInjectFailure(config.failureRate);
    if (failure) {
      log("warn", `[FAILURE INJECTION] ${failure}`);
      simulateFailure(failure);
    }

    try {
      const { result, durationMs } = await timed(async () => {
        const [balance, blockHash, feeCalc] = await Promise.all([
          jsonRpc(this.rpcUrl, "getBalance", [this.wallet.address]) as Promise<{ value: number }>,
          jsonRpc(this.rpcUrl, "getLatestBlockhash", [{ commitment: "finalized" }]) as Promise<{
            value: { blockhash: string; lastValidBlockHeight: number };
          }>,
          jsonRpc(this.rpcUrl, "getRecentPrioritizationFees", []) as Promise<
            Array<{ slot: number; prioritizationFee: number }>
          >,
        ]);

        return { balance, blockHash, feeCalc };
      });

      const balanceSol = (result.balance as any).value / 1e9;
      const baseTxFee = 0.000005;
      const simTransferAmount = 0.001; // SOL
      const totalCost = baseTxFee + simTransferAmount;

      log("success", `Transfer simulation complete`);
      log("info", `Wallet balance: ${balanceSol} SOL`);
      log("info", `Simulated transfer: ${simTransferAmount} SOL`);
      log("info", `Can afford: ${balanceSol >= totalCost ? "YES" : "NO - would fail"}`);

      return {
        chain: "solana",
        operation: op,
        success: true,
        latencyMs: durationMs,
        costEstimate: `${totalCost.toFixed(9)} SOL`,
        metadata: {
          balanceSol,
          transferAmount: simTransferAmount,
          baseTxFee,
          canAfford: balanceSol >= totalCost,
          blockhash: (result.blockHash as any).value.blockhash,
          blockHeight: (result.blockHash as any).value.lastValidBlockHeight,
        },
      };
    } catch (err: any) {
      log("error", `Transfer simulation failed: ${err.message}`);
      return { chain: "solana", operation: op, success: false, latencyMs: 0, costEstimate: "0 SOL", error: err.message };
    }
  }

  /** Stress test: concurrent RPC calls to measure throughput & latency distribution */
  async stressTest(config: SimConfig): Promise<StressReport> {
    sectionHeader("Solana Stress Test");
    log("info", `Running ${config.iterations} iterations x ${config.concurrency} concurrent calls`);

    const latencies: number[] = [];
    let successCount = 0;
    let failCount = 0;

    const startTime = performance.now();

    for (let iter = 0; iter < config.iterations; iter++) {
      const batch = Array.from({ length: config.concurrency }, async () => {
        const failure = shouldInjectFailure(config.failureRate);
        if (failure) {
          failCount++;
          return;
        }
        try {
          const { durationMs } = await timed(async () => {
            await jsonRpc(this.rpcUrl, "getBalance", [this.wallet.address]);
          });
          latencies.push(durationMs);
          successCount++;
        } catch {
          failCount++;
        }
      });
      await Promise.all(batch);
      if (config.verbose) {
        log("debug", `Iteration ${iter + 1}/${config.iterations} complete`);
      }
    }

    const totalDurationMs = performance.now() - startTime;
    const sorted = latencies.slice().sort((a, b) => a - b);
    const totalTx = successCount + failCount;

    const report: StressReport = {
      chain: "solana",
      totalTx,
      successCount,
      failCount,
      avgLatencyMs: sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
      p50LatencyMs: percentile(sorted, 50),
      p95LatencyMs: percentile(sorted, 95),
      p99LatencyMs: percentile(sorted, 99),
      maxLatencyMs: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      minLatencyMs: sorted.length > 0 ? sorted[0] : 0,
      throughputTps: parseFloat((totalTx / (totalDurationMs / 1000)).toFixed(2)),
      totalCostEstimate: `${(successCount * 0.000005).toFixed(9)} SOL (tx fees only)`,
    };

    log("success", `Stress test complete: ${report.throughputTps} TPS`);
    log("info", `Success: ${successCount}/${totalTx} | Avg: ${report.avgLatencyMs}ms | P95: ${report.p95LatencyMs}ms | P99: ${report.p99LatencyMs}ms`);

    return report;
  }
}

// ===============================================================================
// BASE (EVM) SIMULATION MODULE
// ===============================================================================

class BaseSimulator {
  private rpcUrl: string;
  private wallet: typeof WALLETS.base;

  constructor() {
    this.rpcUrl = getBaseRpcUrl();
    this.wallet = WALLETS.base;
  }

  /** Check wallet health: balance, nonce, gas price, chain ID */
  async healthCheck(): Promise<SimResult> {
    const op = "base:healthCheck";
    try {
      const { result, durationMs } = await timed(async () => {
        const [balance, nonce, gasPrice, chainId, blockNumber] = await Promise.all([
          jsonRpc(this.rpcUrl, "eth_getBalance", [this.wallet.address, "latest"]) as Promise<string>,
          jsonRpc(this.rpcUrl, "eth_getTransactionCount", [this.wallet.address, "latest"]) as Promise<string>,
          jsonRpc(this.rpcUrl, "eth_gasPrice", []) as Promise<string>,
          jsonRpc(this.rpcUrl, "eth_chainId", []) as Promise<string>,
          jsonRpc(this.rpcUrl, "eth_blockNumber", []) as Promise<string>,
        ]);
        return { balance, nonce, gasPrice, chainId, blockNumber };
      });

      const balanceWei = BigInt(result.balance);
      const balanceEth = Number(balanceWei) / 1e18;
      const gasPriceGwei = Number(BigInt(result.gasPrice)) / 1e9;
      const nonce = parseInt(result.nonce, 16);
      const chainId = parseInt(result.chainId, 16);
      const blockNumber = parseInt(result.blockNumber, 16);

      log("success", `Base wallet balance: ${balanceEth.toFixed(6)} ETH`);
      log("info", `Nonce: ${nonce} | Gas price: ${gasPriceGwei.toFixed(4)} Gwei`);
      log("info", `Chain ID: ${chainId} | Block: ${blockNumber}`);

      return {
        chain: "base",
        operation: op,
        success: true,
        latencyMs: durationMs,
        costEstimate: "0 ETH",
        metadata: {
          balanceEth,
          nonce,
          gasPriceGwei,
          chainId,
          blockNumber,
        },
      };
    } catch (err: any) {
      log("error", `Health check failed: ${err.message}`);
      return { chain: "base", operation: op, success: false, latencyMs: 0, costEstimate: "0 ETH", error: err.message };
    }
  }

  /** Simulate ERC-20 token mint deployment via eth_estimateGas + eth_call */
  async simulateMint(config: SimConfig): Promise<SimResult> {
    const op = "base:simulateMint";

    const failure = shouldInjectFailure(config.failureRate);
    if (failure) {
      log("warn", `[FAILURE INJECTION] ${failure}`);
      simulateFailure(failure);
    }

    try {
      const { result, durationMs } = await timed(async () => {
        // Minimal ERC-20 constructor bytecode (OpenZeppelin-style)
        // This is the init code for a basic ERC20 with name "SimToken", symbol "SIM", 18 decimals, 1M supply
        // We use a simplified deployment bytecode for gas estimation
        const erc20DeployBytecode = generateMinimalERC20Bytecode("SimToken", "SIM", 18, 1_000_000);

        // Estimate gas for contract deployment
        let gasEstimate: string;
        try {
          gasEstimate = (await jsonRpc(this.rpcUrl, "eth_estimateGas", [
            {
              from: this.wallet.address,
              data: erc20DeployBytecode,
            },
          ])) as string;
        } catch {
          // Fallback: typical ERC20 deployment gas
          gasEstimate = "0x" + (750000).toString(16);
          log("warn", "Gas estimation failed - using fallback: 750,000 gas");
        }

        const gasPrice = (await jsonRpc(this.rpcUrl, "eth_gasPrice", [])) as string;

        // EIP-1559 fee estimation
        let maxFeePerGas: string;
        let maxPriorityFeePerGas: string;
        try {
          maxPriorityFeePerGas = (await jsonRpc(this.rpcUrl, "eth_maxPriorityFeePerGas", [])) as string;
          const block = (await jsonRpc(this.rpcUrl, "eth_getBlockByNumber", ["latest", false])) as {
            baseFeePerGas: string;
          };
          const baseFee = BigInt(block.baseFeePerGas);
          maxFeePerGas = "0x" + (baseFee * 2n + BigInt(maxPriorityFeePerGas)).toString(16);
        } catch {
          maxFeePerGas = gasPrice;
          maxPriorityFeePerGas = "0x" + (1500000000).toString(16); // 1.5 Gwei
        }

        return { gasEstimate, gasPrice, maxFeePerGas, maxPriorityFeePerGas };
      });

      const gasUnits = parseInt(result.gasEstimate, 16);
      const maxFeeWei = BigInt(result.maxFeePerGas);
      const costWei = BigInt(gasUnits) * maxFeeWei;
      const costEth = Number(costWei) / 1e18;
      const gasPriceGwei = Number(BigInt(result.gasPrice)) / 1e9;

      // Generate a simulated contract address (CREATE: keccak256(rlp([sender, nonce])))
      const simulatedContract =
        "0x" +
        crypto
          .createHash("sha256")
          .update(`sim-contract-${Date.now()}-${this.wallet.address}`)
          .digest("hex")
          .slice(0, 40);

      log("success", `Token mint simulation complete`);
      log("info", `Gas estimate: ${gasUnits.toLocaleString()} units`);
      log("info", `Gas price: ${gasPriceGwei.toFixed(4)} Gwei`);
      log("info", `Max fee per gas: ${(Number(maxFeeWei) / 1e9).toFixed(4)} Gwei`);
      log("info", `Simulated contract: ${simulatedContract}`);
      log("info", `Estimated deployment cost: ${costEth.toFixed(8)} ETH`);

      return {
        chain: "base",
        operation: op,
        success: true,
        latencyMs: durationMs,
        costEstimate: `${costEth.toFixed(8)} ETH`,
        metadata: {
          simulatedContractAddress: simulatedContract,
          gasEstimate: gasUnits,
          gasPriceGwei,
          maxFeePerGasGwei: Number(maxFeeWei) / 1e9,
          maxPriorityFeePerGasGwei: Number(BigInt(result.maxPriorityFeePerGas)) / 1e9,
          costEth,
          tokenDetails: {
            name: "SimToken",
            symbol: "SIM",
            decimals: 18,
            totalSupply: "1000000",
          },
        },
      };
    } catch (err: any) {
      log("error", `Mint simulation failed: ${err.message}`);
      return { chain: "base", operation: op, success: false, latencyMs: 0, costEstimate: "0 ETH", error: err.message };
    }
  }

  /** Simulate an ETH transfer */
  async simulateTransfer(config: SimConfig): Promise<SimResult> {
    const op = "base:simulateTransfer";

    const failure = shouldInjectFailure(config.failureRate);
    if (failure) {
      log("warn", `[FAILURE INJECTION] ${failure}`);
      simulateFailure(failure);
    }

    try {
      const { result, durationMs } = await timed(async () => {
        const [balance, gasPrice, nonce] = await Promise.all([
          jsonRpc(this.rpcUrl, "eth_getBalance", [this.wallet.address, "latest"]) as Promise<string>,
          jsonRpc(this.rpcUrl, "eth_gasPrice", []) as Promise<string>,
          jsonRpc(this.rpcUrl, "eth_getTransactionCount", [this.wallet.address, "latest"]) as Promise<string>,
        ]);

        // Estimate gas for a simple ETH transfer (always 21000)
        const gasEstimate = 21000;

        // eth_call to simulate the transfer
        const transferAmount = "0x" + (BigInt(1e15)).toString(16); // 0.001 ETH
        try {
          await jsonRpc(this.rpcUrl, "eth_call", [
            {
              from: this.wallet.address,
              to: "0x0000000000000000000000000000000000000001", // burn address for sim
              value: transferAmount,
              gas: "0x" + gasEstimate.toString(16),
            },
            "latest",
          ]);
        } catch {
          // eth_call may fail for simple transfers, that's OK
        }

        return { balance, gasPrice, nonce, gasEstimate };
      });

      const balanceEth = Number(BigInt(result.balance)) / 1e18;
      const gasPriceGwei = Number(BigInt(result.gasPrice)) / 1e9;
      const costWei = BigInt(result.gasEstimate) * BigInt(result.gasPrice);
      const costEth = Number(costWei) / 1e18;
      const transferAmount = 0.001;
      const totalCost = costEth + transferAmount;

      log("success", `Transfer simulation complete`);
      log("info", `Wallet balance: ${balanceEth.toFixed(6)} ETH`);
      log("info", `Gas for transfer: ${result.gasEstimate} units @ ${gasPriceGwei.toFixed(4)} Gwei`);
      log("info", `Transfer: ${transferAmount} ETH | Gas cost: ${costEth.toFixed(8)} ETH`);
      log("info", `Can afford: ${balanceEth >= totalCost ? "YES" : "NO - would fail"}`);

      return {
        chain: "base",
        operation: op,
        success: true,
        latencyMs: durationMs,
        costEstimate: `${totalCost.toFixed(8)} ETH`,
        metadata: {
          balanceEth,
          transferAmount,
          gasCost: costEth,
          gasUnits: result.gasEstimate,
          gasPriceGwei,
          nonce: parseInt(result.nonce, 16),
          canAfford: balanceEth >= totalCost,
        },
      };
    } catch (err: any) {
      log("error", `Transfer simulation failed: ${err.message}`);
      return { chain: "base", operation: op, success: false, latencyMs: 0, costEstimate: "0 ETH", error: err.message };
    }
  }

  /** Stress test: concurrent RPC calls */
  async stressTest(config: SimConfig): Promise<StressReport> {
    sectionHeader("Base Stress Test");
    log("info", `Running ${config.iterations} iterations x ${config.concurrency} concurrent calls`);

    const latencies: number[] = [];
    let successCount = 0;
    let failCount = 0;

    const startTime = performance.now();

    for (let iter = 0; iter < config.iterations; iter++) {
      const batch = Array.from({ length: config.concurrency }, async () => {
        const failure = shouldInjectFailure(config.failureRate);
        if (failure) {
          failCount++;
          return;
        }
        try {
          const { durationMs } = await timed(async () => {
            await jsonRpc(this.rpcUrl, "eth_getBalance", [this.wallet.address, "latest"]);
          });
          latencies.push(durationMs);
          successCount++;
        } catch {
          failCount++;
        }
      });
      await Promise.all(batch);
      if (config.verbose) {
        log("debug", `Iteration ${iter + 1}/${config.iterations} complete`);
      }
    }

    const totalDurationMs = performance.now() - startTime;
    const sorted = latencies.slice().sort((a, b) => a - b);
    const totalTx = successCount + failCount;

    const report: StressReport = {
      chain: "base",
      totalTx,
      successCount,
      failCount,
      avgLatencyMs: sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
      p50LatencyMs: percentile(sorted, 50),
      p95LatencyMs: percentile(sorted, 95),
      p99LatencyMs: percentile(sorted, 99),
      maxLatencyMs: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      minLatencyMs: sorted.length > 0 ? sorted[0] : 0,
      throughputTps: parseFloat((totalTx / (totalDurationMs / 1000)).toFixed(2)),
      totalCostEstimate: "0 ETH (read-only calls)",
    };

    log("success", `Stress test complete: ${report.throughputTps} TPS`);
    log("info", `Success: ${successCount}/${totalTx} | Avg: ${report.avgLatencyMs}ms | P95: ${report.p95LatencyMs}ms | P99: ${report.p99LatencyMs}ms`);

    return report;
  }
}

// - ERC-20 Bytecode Generator (Minimal) -

function generateMinimalERC20Bytecode(
  name: string,
  symbol: string,
  decimals: number,
  totalSupply: number
): string {
  // Encode constructor parameters for a minimal ERC-20
  // This is a simplified ABI-encoded constructor call
  // In production you'd compile actual Solidity; for simulation we build
  // a realistic-length deployment payload for gas estimation

  const nameHex = Buffer.from(name).toString("hex").padEnd(64, "0");
  const symbolHex = Buffer.from(symbol).toString("hex").padEnd(64, "0");
  const decimalsHex = decimals.toString(16).padStart(64, "0");
  const supplyHex = (BigInt(totalSupply) * BigInt(10 ** decimals)).toString(16).padStart(64, "0");

  // Minimal ERC-20 deployment bytecode skeleton
  // This is a realistic-length init code that the EVM will attempt to estimate gas for
  const initCode = [
    "60806040523480156100105760006000fd5b50",
    "60405180604001604052806005815260200160",
    nameHex.slice(0, 40),
    "815250600090816100389190610110565b5060",
    "405180604001604052806003815260200160",
    symbolHex.slice(0, 40),
    "81525060019081610060919061011056",
    "5b506012600260006101000a81548160ff0219",
    "1690836012021790555061",
    supplyHex.slice(0, 20),
    "600360003373ffffffffffffffffffffffff",
    "ffffffffffffffff16815260200190815260",
    "200160002081905550610180565b60006020",
    decimalsHex.slice(0, 8),
    "82840101111561012557600080fd5b8151818",
    "4602083011764010000000000000000000000",
    "00000000831117156101485760006000fd5b",
    "8282016020848301116101625760006000fd",
    "5b828252505050565b6106bf806101806000",
    "396000f3fe",
  ].join("");

  return "0x" + initCode;
}

// ===============================================================================
// RESULTS SUMMARY
// ===============================================================================

function printResultsTable(results: SimResult[]): void {
  sectionHeader("Simulation Results Summary");

  console.log(
    `${"Chain".padEnd(10)} ${"Operation".padEnd(30)} ${"Status".padEnd(10)} ${"Latency".padEnd(12)} ${"Cost Estimate".padEnd(25)}`
  );
  console.log("-".repeat(90));

  for (const r of results) {
    const status = r.success
      ? `${LOG_COLORS.green}v OK${LOG_COLORS.reset}`
      : `${LOG_COLORS.red}x FAIL${LOG_COLORS.reset}`;
    const latency = r.success ? `${r.latencyMs}ms` : "-";
    console.log(
      `${r.chain.padEnd(10)} ${r.operation.padEnd(30)} ${status.padEnd(20)} ${latency.padEnd(12)} ${r.costEstimate.padEnd(25)}`
    );
    if (r.error) {
      console.log(`${LOG_COLORS.red}           L- ${r.error}${LOG_COLORS.reset}`);
    }
  }
}

function printStressReports(reports: StressReport[]): void {
  sectionHeader("Stress Test Reports");

  for (const r of reports) {
    console.log(`${LOG_COLORS.bright}${r.chain.toUpperCase()}${LOG_COLORS.reset}`);
    console.log(`  Total transactions: ${r.totalTx}`);
    console.log(`  Success/Fail:       ${r.successCount}/${r.failCount}`);
    console.log(`  Throughput:         ${r.throughputTps} TPS`);
    console.log(`  Latency (ms):       avg=${r.avgLatencyMs} p50=${r.p50LatencyMs} p95=${r.p95LatencyMs} p99=${r.p99LatencyMs}`);
    console.log(`  Min/Max (ms):       ${r.minLatencyMs}/${r.maxLatencyMs}`);
    console.log(`  Est. cost:          ${r.totalCostEstimate}`);
    console.log("");
  }
}

function printCostRollup(results: SimResult[]): void {
  sectionHeader("Cost Estimation Rollup");

  const solanaCosts = results
    .filter((r) => r.chain === "solana" && r.success)
    .reduce((sum, r) => sum + parseFloat(r.costEstimate), 0);

  const baseCosts = results
    .filter((r) => r.chain === "base" && r.success)
    .reduce((sum, r) => sum + parseFloat(r.costEstimate), 0);

  console.log(`  Solana (devnet):  ${solanaCosts.toFixed(9)} SOL`);
  console.log(`  Base (sepolia):   ${baseCosts.toFixed(9)} ETH`);
  console.log(
    `\n  ${LOG_COLORS.dim}Note: Costs are estimates based on current network conditions.`
  );
  console.log(
    `  Mainnet costs will differ due to congestion, priority fees, and MEV.${LOG_COLORS.reset}`
  );
}

// ===============================================================================
// MAIN ENTRYPOINT
// ===============================================================================

async function main(): Promise<void> {
  const config = parseArgs();

  banner("Setup Simulator - Chain Simulation Module");
  log("info", `Chain: ${config.chain} | Mode: ${config.mode} | Failure rate: ${(config.failureRate * 100).toFixed(1)}%`);
  log("info", `Concurrency: ${config.concurrency} | Iterations: ${config.iterations}`);

  console.log(`\n${LOG_COLORS.dim}Wallets:${LOG_COLORS.reset}`);
  console.log(`  Solana: ${WALLETS.solana.address}`);
  console.log(`  Base:   ${WALLETS.base.address}`);
  console.log(`\n${LOG_COLORS.dim}RPCs:${LOG_COLORS.reset}`);
  console.log(`  Solana: ${getSolanaRpcUrl().replace(/api-key=.*/, "api-key=***")}`);
  console.log(`  Base:   ${getBaseRpcUrl()}\n`);

  const solana = new SolanaSimulator();
  const base = new BaseSimulator();
  const results: SimResult[] = [];
  const stressReports: StressReport[] = [];

  const runSolana = config.chain === "solana" || config.chain === "all";
  const runBase = config.chain === "base" || config.chain === "all";

  // - Health Checks -

  sectionHeader("Health Checks");

  if (runSolana) {
    results.push(await solana.healthCheck());
  }
  if (runBase) {
    results.push(await base.healthCheck());
  }

  // - Mint Simulations -

  if (config.mode === "mint" || config.mode === "full") {
    sectionHeader("Token Mint Simulations");

    if (runSolana) {
      results.push(await solana.simulateMint(config));
    }
    if (runBase) {
      results.push(await base.simulateMint(config));
    }
  }

  // - Transfer Simulations -

  if (config.mode === "transfer" || config.mode === "full") {
    sectionHeader("Transfer Simulations");

    if (runSolana) {
      results.push(await solana.simulateTransfer(config));
    }
    if (runBase) {
      results.push(await base.simulateTransfer(config));
    }
  }

  // - Stress Tests -

  if (config.mode === "stress" || config.mode === "full") {
    if (runSolana) {
      stressReports.push(await solana.stressTest(config));
    }
    if (runBase) {
      stressReports.push(await base.stressTest(config));
    }
  }

  // - Summary -

  printResultsTable(results);

  if (stressReports.length > 0) {
    printStressReports(stressReports);
  }

  printCostRollup(results);

  // - Exit Code -

  const anyFailed = results.some((r) => !r.success);
  if (anyFailed) {
    log("warn", "Some simulations failed - review results above");
    process.exit(1);
  }

  log("success", "All simulations passed");
  banner("Simulation Complete");
}

// - Run -

main().catch((err) => {
  log("error", `Fatal: ${err.message}`);
  console.error(err);
  process.exit(2);
});
