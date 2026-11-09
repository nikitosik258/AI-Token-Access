import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";

import {
  LOCAL_RPC_URL,
  TEST_ETH_GRANT,
  getUnlockedLocalOwner,
  parseAddress,
  parsePositiveBigInt,
  readArgument,
  verifyLiveDeployment,
} from "./local-deployment.mjs";

const recipient = parseAddress(readArgument("--recipient"), "Recipient");
const amountWei = process.argv.includes("--amount-wei")
  ? parsePositiveBigInt(readArgument("--amount-wei"), "ETH amount in wei")
  : TEST_ETH_GRANT;
const { publicClient } = await verifyLiveDeployment();
const owner = await getUnlockedLocalOwner(publicClient);
const ownerBalance = await publicClient.getBalance({ address: owner });

// Keep a small margin for gas; Hardhat's default local owner has ample test ETH.
if (ownerBalance < amountWei + 10n ** 16n) {
  throw new Error("Local owner has insufficient test ETH for the grant and gas.");
}

const walletClient = createWalletClient({ account: owner, chain: hardhat, transport: http(LOCAL_RPC_URL) });
const beforeBalance = await publicClient.getBalance({ address: recipient });
const hash = await walletClient.sendTransaction({ account: owner, to: recipient, value: amountWei });
await publicClient.waitForTransactionReceipt({ hash });
const afterBalance = await publicClient.getBalance({ address: recipient });

if (afterBalance - beforeBalance !== amountWei) {
  throw new Error("Test ETH balance did not increase by the requested amount.");
}
console.log(`Granted ${amountWei} wei of local test ETH to ${recipient}.`);
