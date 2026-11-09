import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";

import {
  LOCAL_RPC_URL,
  TEST_ETH_GRANT,
  TOKEN_UNIT,
  getUnlockedLocalOwner,
  parseAddress,
  readArgument,
  verifyLiveDeployment,
} from "./local-deployment.mjs";

const monthlyUser = parseAddress(readArgument("--monthly-user"), "MONTHLY_USER");
const yearlyUser = parseAddress(readArgument("--yearly-user"), "YEARLY_USER");
if (monthlyUser === yearlyUser) {
  throw new Error("MONTHLY_USER and YEARLY_USER must be different addresses.");
}

const MONTHLY_GRANT = 300n * TOKEN_UNIT;
const YEARLY_GRANT = 2_500n * TOKEN_UNIT;
const { config, publicClient, serviceAddress, tokenAddress } = await verifyLiveDeployment();
const owner = await getUnlockedLocalOwner(publicClient);
const [ownerEth, ownerStk] = await Promise.all([
  publicClient.getBalance({ address: owner }),
  publicClient.readContract({
    address: tokenAddress,
    abi: config.contracts.accessToken.abi,
    functionName: "balanceOf",
    args: [owner],
  }),
]);
if (ownerStk < MONTHLY_GRANT + YEARLY_GRANT) {
  throw new Error("Local owner has insufficient STK for the demonstration grants.");
}
if (ownerEth < TEST_ETH_GRANT * 2n + 10n ** 16n) {
  throw new Error("Local owner has insufficient test ETH for grants and gas.");
}

const walletClient = createWalletClient({ account: owner, chain: hardhat, transport: http(LOCAL_RPC_URL) });
const token = { address: tokenAddress, abi: config.contracts.accessToken.abi };
const beforeMonthly = await publicClient.readContract({ ...token, functionName: "balanceOf", args: [monthlyUser] });
const beforeYearly = await publicClient.readContract({ ...token, functionName: "balanceOf", args: [yearlyUser] });

for (const [recipient, amount] of [[monthlyUser, MONTHLY_GRANT], [yearlyUser, YEARLY_GRANT]]) {
  const ethHash = await walletClient.sendTransaction({ account: owner, to: recipient, value: TEST_ETH_GRANT });
  await publicClient.waitForTransactionReceipt({ hash: ethHash });
  const stkHash = await walletClient.writeContract({
    ...token,
    functionName: "transfer",
    args: [recipient, amount],
    account: owner,
  });
  await publicClient.waitForTransactionReceipt({ hash: stkHash });
}

const [monthlyStk, yearlyStk, monthlyEth, yearlyEth, monthlyPrice, yearlyPrice, monthlyDuration, yearlyDuration] =
  await Promise.all([
    publicClient.readContract({ ...token, functionName: "balanceOf", args: [monthlyUser] }),
    publicClient.readContract({ ...token, functionName: "balanceOf", args: [yearlyUser] }),
    publicClient.getBalance({ address: monthlyUser }),
    publicClient.getBalance({ address: yearlyUser }),
    publicClient.readContract({ address: serviceAddress, abi: config.contracts.aiServiceAccess.abi, functionName: "getPlanPrice", args: [1] }),
    publicClient.readContract({ address: serviceAddress, abi: config.contracts.aiServiceAccess.abi, functionName: "getPlanPrice", args: [2] }),
    publicClient.readContract({ address: serviceAddress, abi: config.contracts.aiServiceAccess.abi, functionName: "getPlanDuration", args: [1] }),
    publicClient.readContract({ address: serviceAddress, abi: config.contracts.aiServiceAccess.abi, functionName: "getPlanDuration", args: [2] }),
  ]);

if (monthlyStk - beforeMonthly !== MONTHLY_GRANT || yearlyStk - beforeYearly !== YEARLY_GRANT) {
  throw new Error("Demonstration STK transfers did not produce the expected balances.");
}
if (monthlyEth < TEST_ETH_GRANT || yearlyEth < TEST_ETH_GRANT) {
  throw new Error("One or both demonstration users do not have enough local ETH for gas.");
}
if (monthlyPrice !== 100n * TOKEN_UNIT || yearlyPrice !== 1_000n * TOKEN_UNIT || monthlyDuration !== 30n * 24n * 60n * 60n || yearlyDuration !== 365n * 24n * 60n * 60n) {
  throw new Error("Live plan parameters do not match the expected values.");
}

console.log(JSON.stringify({ monthlyUser: { address: monthlyUser, stk: monthlyStk.toString(), ethWei: monthlyEth.toString() }, yearlyUser: { address: yearlyUser, stk: yearlyStk.toString(), ethWei: yearlyEth.toString() }, plans: { monthlyPrice: monthlyPrice.toString(), yearlyPrice: yearlyPrice.toString(), monthlyDuration: monthlyDuration.toString(), yearlyDuration: yearlyDuration.toString() } }, null, 2));
