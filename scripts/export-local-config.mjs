import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAddress } from "viem";

import { LOCAL_NETWORK_NAME, LOCAL_RPC_URL, getPublicClient, parseAddress, readArgument } from "./local-deployment.mjs";

const tokenAddress = parseAddress(readArgument("--token"), "STK address");
const serviceAddress = parseAddress(readArgument("--access"), "AIServiceAccess address");
const publicClient = getPublicClient();

function readArtifact(contractName, sourceName) {
  const artifactPath = resolve("artifacts", "contracts", sourceName, `${contractName}.json`);
  try {
    return JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch {
    throw new Error(`Artifact missing at ${artifactPath}. Run npm run compile first.`);
  }
}

const tokenArtifact = readArtifact("AccessToken", "AccessToken.sol");
const serviceArtifact = readArtifact("AIServiceAccess", "AIServiceAccess.sol");
const [tokenCode, serviceCode] = await Promise.all([
  publicClient.getCode({ address: tokenAddress }),
  publicClient.getCode({ address: serviceAddress }),
]);
if (!tokenCode || tokenCode === "0x" || !serviceCode || serviceCode === "0x") {
  throw new Error("Cannot export: one or both supplied addresses do not contain bytecode.");
}

const [chainId, name, symbol, totalSupply, configuredToken, treasury, monthlyPrice, yearlyPrice, monthlyDuration, yearlyDuration] =
  await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: "name" }),
    publicClient.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: "symbol" }),
    publicClient.readContract({ address: tokenAddress, abi: tokenArtifact.abi, functionName: "totalSupply" }),
    publicClient.readContract({ address: serviceAddress, abi: serviceArtifact.abi, functionName: "accessToken" }),
    publicClient.readContract({ address: serviceAddress, abi: serviceArtifact.abi, functionName: "treasury" }),
    publicClient.readContract({ address: serviceAddress, abi: serviceArtifact.abi, functionName: "getPlanPrice", args: [1] }),
    publicClient.readContract({ address: serviceAddress, abi: serviceArtifact.abi, functionName: "getPlanPrice", args: [2] }),
    publicClient.readContract({ address: serviceAddress, abi: serviceArtifact.abi, functionName: "getPlanDuration", args: [1] }),
    publicClient.readContract({ address: serviceAddress, abi: serviceArtifact.abi, functionName: "getPlanDuration", args: [2] }),
  ]);

if (
  name !== "Access Token" ||
  symbol !== "STK" ||
  totalSupply !== 1_000_000n * 10n ** 18n ||
  getAddress(configuredToken) !== tokenAddress ||
  monthlyPrice !== 100n * 10n ** 18n ||
  yearlyPrice !== 1_000n * 10n ** 18n ||
  monthlyDuration !== 30n * 24n * 60n * 60n ||
  yearlyDuration !== 365n * 24n * 60n * 60n
) {
  throw new Error("Cannot export: live contracts do not match expected parameters.");
}

const config = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  network: { name: LOCAL_NETWORK_NAME, chainId, rpcUrl: LOCAL_RPC_URL },
  contracts: {
    accessToken: { address: tokenAddress, abi: tokenArtifact.abi },
    aiServiceAccess: { address: serviceAddress, abi: serviceArtifact.abi },
  },
  verification: { name, symbol, totalSupply: totalSupply.toString(), treasury },
};

mkdirSync(resolve("shared"), { recursive: true });
const outputPath = resolve("shared", "local-contracts.json");
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Exported verified local configuration to ${outputPath}`);
