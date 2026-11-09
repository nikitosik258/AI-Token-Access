/**
 * EIP-6963 discovery with a deliberately narrow Trust Wallet selection rule.
 * Other injected wallets are never selected as an implicit fallback.
 */
export function isTrustWalletProvider(provider, info = {}) {
  const identity = `${info.name || ""} ${info.rdns || ""}`.toLowerCase();
  return Boolean(
    provider &&
      (provider.isTrust === true || provider.isTrustWallet === true || identity.includes("trust wallet") || identity.includes("trustwallet")),
  );
}

export class WalletRegistry {
  constructor(browserWindow = window) {
    this.browserWindow = browserWindow;
    this.providers = new Map();
    this.onAnnouncement = this.onAnnouncement.bind(this);
  }

  start() {
    this.browserWindow.addEventListener("eip6963:announceProvider", this.onAnnouncement);
    this.requestProviders();
    this.registerTrustFallbacks();
  }

  stop() {
    this.browserWindow.removeEventListener("eip6963:announceProvider", this.onAnnouncement);
  }

  requestProviders() {
    this.browserWindow.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  onAnnouncement(event) {
    const detail = event?.detail;
    if (!detail?.provider || !isTrustWalletProvider(detail.provider, detail.info)) return;
    if ([...this.providers.values()].some((wallet) => wallet.provider === detail.provider)) return;
    const key = detail.info?.uuid || detail.info?.rdns || `trust-${this.providers.size}`;
    this.providers.set(key, { info: { name: "Trust Wallet", ...detail.info }, provider: detail.provider });
  }

  registerTrustFallbacks() {
    // The namespaced Trust Wallet provider is an explicit Trust identifier,
    // unlike a generic window.ethereum injection.
    if (this.browserWindow.trustwallet?.ethereum) {
      this.onAnnouncement({
        detail: {
          info: { name: "Trust Wallet", rdns: "com.trustwallet.app" },
          provider: this.browserWindow.trustwallet.ethereum,
        },
      });
    }
    const candidates = [
      this.browserWindow.ethereum?.providers?.find((provider) => isTrustWalletProvider(provider)),
      this.browserWindow.ethereum,
    ];
    for (const provider of candidates) {
      if (!isTrustWalletProvider(provider)) continue;
      this.onAnnouncement({ detail: { info: { name: "Trust Wallet", rdns: "com.trustwallet.app" }, provider } });
    }
  }

  getTrustWallets() {
    this.registerTrustFallbacks();
    return [...this.providers.values()];
  }
}
