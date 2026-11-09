import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";

import {
  LOCAL_RPC_URL,
  TOKEN_UNIT,
  getUnlockedLocalOwner,
  parseAddress,
  parsePositiveBigInt,
  readArgument,
  verifyLiveDeployment,
} from "./local-deployment.mjs";

const recipient = parseAddress(readArgument("--recipient"), "Recipient");
const amountStk = parsePositiveBigInt(readArgument("--amount-stk"), "STK amount");
const amount = amountStk * TOKEN_UNIT;
const { config, publicClient, tokenAddress } = await verifyLiveDeployment();
const owner = await getUnlockedLocalOwner(publicClient);
const ownerStkBalance = await publicClient.readContract({
  address: tokenAddress,
  abi: config.contracts.accessToken.abi,
  functionName: "balanceOf",
  args: [owner],
});
if (ownerStkBalance < amount) {
  throw new Error("Local owner has insufficient STK for this grant.");
}

const walletClient = createWalletClient({ account: owner, chain: hardhat, transport: http(LOCAL_RPC_URL) });
const beforeBalance = await publicClient.readContract({
  address: tokenAddress,
  abi: config.contracts.accessToken.abi,
  functionName: "balanceOf",
  args: [recipient],
});
const hash = await walletClient.writeContract({
  address: tokenAddress,
  abi: config.contracts.accessToken.abi,
  functionName: "transfer",
  args: [recipient, amount],
  account: owner,
});
await publicClient.waitForTransactionReceipt({ hash });
const afterBalance = await publicClient.readContract({
  address: tokenAddress,
  abi: config.contracts.accessToken.abi,
  functionName: "balanceOf",
  args: [recipient],
});

if (afterBalance - beforeBalance !== amount) {
  throw new Error("STK balance did not increase by the requested amount.");
}
console.log(`Granted ${amountStk} STK to ${recipient}.`);
