import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPublicClient, getAddress, http, isAddress } from "viem";

export const LOCAL_RPC_URL = "http://127.0.0.1:8545";
export const LOCAL_NETWORK_NAME = "hardhat-local";
export const TOKEN_UNIT = 10n ** 18n;
export const TEST_ETH_GRANT = 1n * TOKEN_UNIT;

export function readArgument(name) {
  const argumentIndex = process.argv.indexOf(name);
  if (argumentIndex === -1 || process.argv[argumentIndex + 1] === undefined) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[argumentIndex + 1];
}

export function parseAddress(value, label) {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a valid EVM address.`);
  }
  return getAddress(value);
}

export function parsePositiveBigInt(value, label) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return parsed;
}

export function getPublicClient() {
  return createPublicClient({ transport: http(LOCAL_RPC_URL) });
}

export function loadLocalConfig() {
  const configPath = resolve("shared", "local-contracts.json");
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new Error(
      "Local deployment configuration is missing. Deploy and run npm run local:export first.",
    );
  }

  if (config?.network?.name !== LOCAL_NETWORK_NAME) {
    throw new Error("Configuration is not for the hardhat-local network.");
  }
  if (!config?.contracts?.accessToken?.abi || !config?.contracts?.aiServiceAccess?.abi) {
    throw new Error("Configuration does not contain the required contract ABIs.");
  }
  return config;
}

/**
 * Validates live bytecode and immutable/read-only values. Chain ID alone is
 * deliberately not accepted as evidence that a previous deployment still exists.
 */
export async function verifyLiveDeployment() {
  const config = loadLocalConfig();
  const publicClient = getPublicClient();
  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== config.network.chainId) {
    throw new Error(
      `Chain ID mismatch: config=${config.network.chainId}, RPC=${actualChainId}.`,
    );
  }

  const tokenAddress = parseAddress(config.contracts.accessToken.address, "STK address");
  const serviceAddress = parseAddress(
    config.contracts.aiServiceAccess.address,
    "AIServiceAccess address",
  );
  const [tokenCode, serviceCode] = await Promise.all([
    publicClient.getCode({ address: tokenAddress }),
    publicClient.getCode({ address: serviceAddress }),
  ]);
  if (!tokenCode || tokenCode === "0x" || !serviceCode || serviceCode === "0x") {
    throw new Error(
      "Deployment is stale: expected contract bytecode is absent. Redeploy and export a new configuration.",
    );
  }

  const [name, symbol, totalSupply, configuredToken, treasury, monthlyPrice, yearlyPrice, monthlyDuration, yearlyDuration] =
    await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: config.contracts.accessToken.abi,
        functionName: "name",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: config.contracts.accessToken.abi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: config.contracts.accessToken.abi,
        functionName: "totalSupply",
      }),
      publicClient.readContract({
        address: serviceAddress,
        abi: config.contracts.aiServiceAccess.abi,
        functionName: "accessToken",
      }),
      publicClient.readContract({
        address: serviceAddress,
        abi: config.contracts.aiServiceAccess.abi,
        functionName: "treasury",
      }),
      publicClient.readContract({
        address: serviceAddress,
        abi: config.contracts.aiServiceAccess.abi,
        functionName: "getPlanPrice",
        args: [1],
      }),
      publicClient.readContract({
        address: serviceAddress,
        abi: config.contracts.aiServiceAccess.abi,
        functionName: "getPlanPrice",
        args: [2],
      }),
      publicClient.readContract({
        address: serviceAddress,
        abi: config.contracts.aiServiceAccess.abi,
        functionName: "getPlanDuration",
        args: [1],
      }),
      publicClient.readContract({
        address: serviceAddress,
        abi: config.contracts.aiServiceAccess.abi,
        functionName: "getPlanDuration",
        args: [2],
      }),
    ]);

  if (
    name !== "Access Token" ||
    symbol !== "STK" ||
    totalSupply !== 1_000_000n * TOKEN_UNIT ||
    getAddress(configuredToken) !== tokenAddress ||
    !isAddress(treasury) ||
    monthlyPrice !== 100n * TOKEN_UNIT ||
    yearlyPrice !== 1_000n * TOKEN_UNIT ||
    monthlyDuration !== 30n * 24n * 60n * 60n ||
    yearlyDuration !== 365n * 24n * 60n * 60n
  ) {
    throw new Error("Live contracts do not match the expected AI Token Access deployment.");
  }

  return { config, publicClient, serviceAddress, tokenAddress, treasury };
}

export async function getUnlockedLocalOwner(publicClient) {
  const accounts = await publicClient.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Hardhat node exposes no unlocked local accounts.");
  }
  return parseAddress(accounts[0], "Local owner address");
}
