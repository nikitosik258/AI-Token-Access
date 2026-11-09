import test from "node:test";
import assert from "node:assert/strict";
import { formatRemaining, isValidPlan, shortAddress, userMessage } from "../src/utils.js";
import { WalletRegistry, isTrustWalletProvider } from "../src/wallet-provider.js";

test("formats a wallet address safely", () => {
  assert.equal(shortAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), "0xf39F…2266");
});

test("formats remaining subscription time without negative values", () => {
  assert.equal(formatRemaining(90_061), "1 дн. 1 ч. 1 мин.");
  assert.equal(formatRemaining(-1), "Время доступа истекло");
});

test("accepts exactly the two supported plans", () => {
  assert.equal(isValidPlan({ id: 1 }), true);
  assert.equal(isValidPlan({ id: 2 }), true);
  assert.equal(isValidPlan({ id: 3 }), false);
});

test("turns a rejected wallet request into a readable message", () => {
  assert.equal(userMessage({ code: 4001 }), "Действие отменено в кошельке.");
});

test("identifies Trust Wallet without accepting an arbitrary injected provider", () => {
  assert.equal(isTrustWalletProvider({ isTrust: true }), true);
  assert.equal(isTrustWalletProvider({}, { name: "Trust Wallet", rdns: "com.trustwallet.app" }), true);
  assert.equal(isTrustWalletProvider({ isMetaMask: true }, { name: "MetaMask" }), false);
});

test("EIP-6963 registry keeps Trust Wallet and ignores another wallet", () => {
  const browserWindow = new EventTarget();
  browserWindow.ethereum = { isMetaMask: true };
  browserWindow.trustwallet = { ethereum: { isTrust: true } };
  const registry = new WalletRegistry(browserWindow);
  registry.start();
  browserWindow.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: { info: { name: "MetaMask", rdns: "io.metamask" }, provider: { isMetaMask: true } },
  }));
  assert.equal(registry.getTrustWallets().length, 1);
  assert.equal(registry.getTrustWallets()[0].info.name, "Trust Wallet");
  registry.stop();
});
