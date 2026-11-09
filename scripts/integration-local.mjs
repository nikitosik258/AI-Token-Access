import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, http, parseEventLogs, toHex } from "viem";
import { hardhat } from "viem/chains";
import { TOKEN_UNIT, verifyLiveDeployment } from "./local-deployment.mjs";

const ORIGIN = "http://127.0.0.1:5173";
const API = "http://127.0.0.1:8000";
const client = createPublicClient({ transport: http("http://127.0.0.1:8545") });
const { config, tokenAddress, serviceAddress, treasury } = await verifyLiveDeployment();
const token = { address: tokenAddress, abi: config.contracts.accessToken.abi };
const service = { address: serviceAddress, abi: config.contracts.aiServiceAccess.abi };
const accounts = await client.request({ method: "eth_accounts" });
const snapshotId = await client.request({ method: "evm_snapshot" });
const owner = accounts[0];
const wallet = (account) => createWalletClient({ account, chain: hardhat, transport: http("http://127.0.0.1:8545") });
const read = (contract, functionName, args = []) => client.readContract({ ...contract, functionName, args });
const send = async (account, contract, functionName, args = []) => {
  const hash = await wallet(account).writeContract({ ...contract, functionName, args, account });
  return client.waitForTransactionReceipt({ hash });
};
const grant = async (user, amount) => send(owner, token, "transfer", [user, amount]);
const buy = async (user, plan) => {
  const price = await read(service, "getPlanPrice", [plan]);
  await send(user, token, "approve", [serviceAddress, price]);
  const receipt = await send(user, service, "purchaseSubscription", [plan]);
  const [event] = parseEventLogs({ abi: service.abi, logs: receipt.logs, eventName: "SubscriptionPurchased" });
  assert.equal(event.args.user.toLowerCase(), user.toLowerCase());
  assert.equal(event.args.plan, plan);
  assert.equal(event.args.amount, price);
  return { price, receipt, event };
};
async function loginAndChat(user, prompt) {
  const challenge = await fetch(`${API}/auth/challenge`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ address: user }) });
  assert.equal(challenge.status, 200);
  const { message } = await challenge.json();
  const signature = await client.request({ method: "personal_sign", params: [toHex(message), user] });
  const verified = await fetch(`${API}/auth/verify`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) });
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get("set-cookie").split(";")[0];
  const access = await fetch(`${API}/access/status`, { headers: { Cookie: cookie } });
  assert.equal(access.status, 200);
  assert.equal((await access.json()).hasAccess, true);
  const chat = await fetch(`${API}/llm/chat`, { method: "POST", headers: { Origin: ORIGIN, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ message: prompt }) });
  assert.equal(chat.status, 200);
  assert.ok((await chat.json()).response.trim().length > 0);
  return cookie;
}

const monthly = accounts[1];
await grant(monthly, 300n * TOKEN_UNIT);
const treasuryBefore = await read(token, "balanceOf", [treasury]);
const monthlyBefore = await read(token, "balanceOf", [monthly]);
const monthlyPurchase = await buy(monthly, 1);
assert.equal((await read(token, "balanceOf", [monthly])), monthlyBefore - 100n * TOKEN_UNIT);
assert.equal((await read(token, "balanceOf", [treasury])), treasuryBefore + 100n * TOKEN_UNIT);
assert.equal(await read(service, "hasAccess", [monthly]), true);
await loginAndChat(monthly, "Ответьте одним словом: тест.");

const yearly = accounts[2];
await grant(yearly, 2500n * TOKEN_UNIT);
const yearlyBefore = await read(token, "balanceOf", [yearly]);
const yearlyPurchase = await buy(yearly, 2);
assert.equal((await read(token, "balanceOf", [yearly])), yearlyBefore - 1000n * TOKEN_UNIT);
assert.equal(await read(service, "hasAccess", [yearly]), true);
await loginAndChat(yearly, "Ответьте одним словом: готово.");

for (const [user, first, second] of [[accounts[3], 1, 1], [accounts[4], 1, 2], [accounts[5], 2, 1], [accounts[6], 2, 2]]) {
  const firstPrice = await read(service, "getPlanPrice", [first]);
  const secondPrice = await read(service, "getPlanPrice", [second]);
  await grant(user, firstPrice + secondPrice);
  await buy(user, first);
  const beforeExpiry = await read(service, "getExpiration", [user]);
  const secondResult = await buy(user, second);
  const afterExpiry = await read(service, "getExpiration", [user]);
  assert.equal(afterExpiry - beforeExpiry, await read(service, "getPlanDuration", [second]));
  assert.equal(secondResult.event.args.plan, second);
}

const insufficient = accounts[7];
await grant(insufficient, 99n * TOKEN_UNIT);
await assert.rejects(() => send(insufficient, service, "purchaseSubscription", [1]));
assert.equal(await read(service, "getExpiration", [insufficient]), 0n);
const noAllowance = accounts[8];
await grant(noAllowance, 100n * TOKEN_UNIT);
await assert.rejects(() => send(noAllowance, service, "purchaseSubscription", [1]));
await assert.rejects(() => read(service, "getPlanPrice", [3]));

const noGas = accounts[9];
await client.request({ method: "hardhat_setBalance", params: [noGas, "0xde0b6b3a7640000"] });
await grant(noGas, 100n * TOKEN_UNIT);
await send(noGas, token, "approve", [serviceAddress, 100n * TOKEN_UNIT]);
await client.request({ method: "hardhat_setBalance", params: [noGas, "0x0"] });
const noGasStk = await read(token, "balanceOf", [noGas]);
await assert.rejects(() => send(noGas, service, "purchaseSubscription", [1]));
assert.equal(await read(token, "balanceOf", [noGas]), noGasStk);
assert.equal(await read(service, "getExpiration", [noGas]), 0n);

const expiring = accounts[10];
await grant(expiring, 200n * TOKEN_UNIT);
await buy(expiring, 1);
const expiry = await read(service, "getExpiration", [expiring]);
await client.request({ method: "evm_setNextBlockTimestamp", params: [Number(expiry)] });
await client.request({ method: "evm_mine" });
assert.equal(await read(service, "hasAccess", [expiring]), false);
const expiredChallenge = await fetch(`${API}/auth/challenge`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ address: expiring }) });
const expiredMessage = (await expiredChallenge.json()).message;
const expiredSignature = await client.request({ method: "personal_sign", params: [toHex(expiredMessage), expiring] });
const expiredVerified = await fetch(`${API}/auth/verify`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ message: expiredMessage, signature: expiredSignature }) });
const expiredCookie = expiredVerified.headers.get("set-cookie").split(";")[0];
const expiredChat = await fetch(`${API}/llm/chat`, { method: "POST", headers: { Origin: ORIGIN, Cookie: expiredCookie, "Content-Type": "application/json" }, body: JSON.stringify({ message: "не должно дойти" }) });
assert.equal(expiredChat.status, 403);
await buy(expiring, 1);
assert.equal(await read(service, "hasAccess", [expiring]), true);

console.log(JSON.stringify({ status: "passed", monthly: monthlyPurchase.event.args.expiresAt.toString(), yearly: yearlyPurchase.event.args.expiresAt.toString(), checks: 32 }, null, 2));
assert.equal(await client.request({ method: "evm_revert", params: [snapshotId] }), true);
