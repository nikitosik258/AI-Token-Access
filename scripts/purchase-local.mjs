import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";

import {
  LOCAL_RPC_URL,
  TOKEN_UNIT,
  parseAddress,
  readArgument,
  verifyLiveDeployment,
} from "./local-deployment.mjs";

const user = parseAddress(readArgument("--user"), "User");
const plan = Number(readArgument("--plan"));
if (plan !== 1 && plan !== 2) {
  throw new Error("--plan must be 1 (MONTHLY) or 2 (YEARLY).");
}

const { config, publicClient, serviceAddress, tokenAddress } = await verifyLiveDeployment();
const token = { address: tokenAddress, abi: config.contracts.accessToken.abi };
const service = { address: serviceAddress, abi: config.contracts.aiServiceAccess.abi };
const [price, stkBalance, ethBalance, allowance] = await Promise.all([
  publicClient.readContract({ ...service, functionName: "getPlanPrice", args: [plan] }),
  publicClient.readContract({ ...token, functionName: "balanceOf", args: [user] }),
  publicClient.getBalance({ address: user }),
  publicClient.readContract({ ...token, functionName: "allowance", args: [user, serviceAddress] }),
]);
if (ethBalance < 10n ** 15n) {
  throw new Error("User has insufficient local test ETH for approve and purchase gas.");
}
if (stkBalance < price) {
  throw new Error(`User has insufficient STK: needs ${price / TOKEN_UNIT} STK.`);
}

const walletClient = createWalletClient({ account: user, chain: hardhat, transport: http(LOCAL_RPC_URL) });
if (allowance < price) {
  const approvalHash = await walletClient.writeContract({
    ...token,
    functionName: "approve",
    args: [serviceAddress, price],
    account: user,
  });
  await publicClient.waitForTransactionReceipt({ hash: approvalHash });
}

const purchaseHash = await walletClient.writeContract({
  ...service,
  functionName: "purchaseSubscription",
  args: [plan],
  account: user,
});
await publicClient.waitForTransactionReceipt({ hash: purchaseHash });
const [expiration, remainingStk] = await Promise.all([
  publicClient.readContract({ ...service, functionName: "getExpiration", args: [user] }),
  publicClient.readContract({ ...token, functionName: "balanceOf", args: [user] }),
]);
console.log(JSON.stringify({ user, plan, price: price.toString(), expiration: expiration.toString(), remainingStk: remainingStk.toString() }, null, 2));
