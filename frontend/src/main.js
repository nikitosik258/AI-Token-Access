import { BrowserProvider, Contract, formatUnits } from "ethers";
import { BACKEND_ORIGIN, EXPECTED_CHAIN_ID, HARDHAT_NETWORK } from "./config.js";
import { formatRemaining, isValidPlan, shortAddress, userMessage } from "./utils.js";
import { WalletRegistry } from "./wallet-provider.js";
import "./style.css";

const state = {
  config: null, plans: [], provider: null, walletProvider: null, walletInfo: null, signer: null,
  address: null, token: null, access: null, authenticated: false, connecting: false, walletListeners: null,
};
const walletRegistry = new WalletRegistry(window);
const $ = (id) => document.getElementById(id);
const elements = {
  connect: $("connect-button"), networkStatus: $("network-status"), notice: $("notice"), walletTitle: $("wallet-title"),
  walletDetail: $("wallet-detail"), networkName: $("network-name"), chainId: $("chain-id"), balance: $("stk-balance"), auth: $("auth-status"),
  subscriptionState: $("subscription-state"), expiration: $("expiration"), remaining: $("remaining-time"), renew: $("renew-button"),
  plans: $("plans"), chatAccess: $("chat-access"), messages: $("messages"), chatForm: $("chat-form"), chatInput: $("chat-input"),
  chatSubmit: $("chat-submit"), characters: $("character-count"), picker: $("wallet-picker"), walletOptions: $("wallet-options"),
};

function setNotice(message, type = "info") {
  elements.notice.textContent = message;
  elements.notice.className = `notice is-${type}`;
  elements.notice.hidden = !message;
}

function setNetwork(ok, text) {
  elements.networkStatus.textContent = text;
  elements.networkStatus.className = `network-status ${ok ? "is-ready" : "is-error"}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${BACKEND_ORIGIN}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.detail || `Ошибка API (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadPublicData() {
  try {
    const [config, planData] = await Promise.all([api("/contracts/config"), api("/plans")]);
    if (BigInt(config.network.chainId) !== EXPECTED_CHAIN_ID) throw new Error("Backend вернул неподдерживаемую сеть.");
    state.config = config;
    state.plans = planData.plans;
    renderPlans();
    setNetwork(true, "Hardhat Network доступна");
  } catch (error) {
    setNetwork(false, "Hardhat Network недоступна");
    setNotice(`Не удалось получить конфигурацию: ${userMessage(error)}`, "error");
  }
}

function renderPlans() {
  elements.plans.replaceChildren();
  for (const plan of state.plans.filter(isValidPlan)) {
    const yearly = Number(plan.id) === 2;
    const card = document.createElement("article");
    card.className = `plan-card ${yearly ? "is-featured" : ""}`;
    const badge = yearly ? "Выгода 16,7%" : "Гибкий доступ";
    const badgeElement = document.createElement("span");
    badgeElement.className = "plan-badge";
    badgeElement.textContent = badge;
    const title = document.createElement("h3");
    title.textContent = `${yearly ? "Годовая" : "Месячная"} подписка`;
    const price = document.createElement("p");
    price.className = "plan-price";
    price.textContent = `${plan.priceStk} STK`;
    const duration = document.createElement("p");
    duration.className = "plan-duration";
    duration.textContent = `${Math.round(plan.durationSeconds / 86_400)} дней`;
    const features = document.createElement("ul");
    for (const feature of ["Доступ к ИИ-чату", "Вопросы и ответы", "Продление подписки"]) {
      const item = document.createElement("li");
      item.textContent = feature;
      features.append(item);
    }
    card.append(badgeElement, title, price, duration, features);
    if (yearly) {
      const note = document.createElement("p");
      note.className = "plan-note";
      note.textContent = "12 × 100 STK = 1200 STK; годовой период — 1000 STK и 365 дней.";
      card.append(note);
    }
    const button = document.createElement("button");
    button.className = "button button-primary plan-button";
    button.textContent = `Купить за ${plan.priceStk} STK`;
    button.disabled = !state.address;
    button.addEventListener("click", () => purchase(plan));
    card.append(button);
    elements.plans.append(card);
  }
}

async function ensureExpectedNetwork() {
  if (BigInt(await state.walletProvider.request({ method: "eth_chainId" })) === EXPECTED_CHAIN_ID) return;
  try {
    await state.walletProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HARDHAT_NETWORK.chainId }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await state.walletProvider.request({ method: "wallet_addEthereumChain", params: [HARDHAT_NETWORK] });
  }
  if (BigInt(await state.walletProvider.request({ method: "eth_chainId" })) !== EXPECTED_CHAIN_ID) throw new Error("Выбрана неверная сеть.");
  state.provider = new BrowserProvider(state.walletProvider);
}

async function authenticate() {
  const challenge = await api("/auth/challenge", { method: "POST", body: JSON.stringify({ address: state.address }) });
  const signature = await state.signer.signMessage(challenge.message);
  const verified = await api("/auth/verify", { method: "POST", body: JSON.stringify({ message: challenge.message, signature }) });
  if (verified.address.toLowerCase() !== state.address.toLowerCase()) throw new Error("Backend подтвердил другой адрес.");
  state.authenticated = true;
  elements.auth.textContent = "Авторизован";
}

async function connectLegacy() {
  if (!window.ethereum) {
    setNotice("MetaMask не найден. Установите расширение и импортируйте только тестовый аккаунт Hardhat.", "error");
    return;
  }
  try {
    elements.connect.disabled = true;
    elements.connect.textContent = "Подключение…";
    if (!state.config) await loadPublicData();
    if (!state.config) throw new Error("Конфигурация контрактов недоступна.");
    state.provider = new BrowserProvider(window.ethereum);
    await state.provider.send("eth_requestAccounts", []);
    await ensureExpectedNetwork();
    state.signer = await state.provider.getSigner();
    state.address = await state.signer.getAddress();
    state.token = new Contract(state.config.contracts.accessToken.address, state.config.contracts.accessToken.abi, state.signer);
    state.access = new Contract(state.config.contracts.aiServiceAccess.address, state.config.contracts.aiServiceAccess.abi, state.signer);
    await authenticate();
    elements.walletTitle.textContent = shortAddress(state.address);
    elements.walletDetail.textContent = "Подключён локальный тестовый аккаунт MetaMask.";
    elements.networkName.textContent = state.config.network.name;
    elements.chainId.textContent = String(EXPECTED_CHAIN_ID);
    elements.connect.textContent = shortAddress(state.address);
    await refreshAccount();
    setNotice("Кошелёк подключён и SIWE-сессия создана.", "success");
  } catch (error) {
    state.authenticated = false;
    elements.auth.textContent = "Не авторизован";
    setNotice(userMessage(error), "error");
  } finally {
    elements.connect.disabled = false;
    if (!state.address) elements.connect.textContent = "Подключить MetaMask";
    renderPlans();
  }
}

function clearWalletOptions() {
  elements.walletOptions.replaceChildren();
  elements.picker.hidden = true;
}

function showWalletPicker() {
  const wallets = walletRegistry.getTrustWallets();
  elements.walletOptions.replaceChildren();
  if (wallets.length === 0) {
    elements.picker.hidden = true;
    setNotice("Trust Wallet не обнаружен. Откройте расширение Trust Wallet, разблокируйте его и обновите страницу.", "error");
    return;
  }
  elements.picker.hidden = false;
  for (const wallet of wallets) {
    const option = document.createElement("button");
    option.className = "button button-primary wallet-option";
    option.type = "button";
    const label = document.createElement("span");
    label.textContent = wallet.info.name || "Trust Wallet";
    if (wallet.info.icon) {
      const icon = document.createElement("img");
      icon.className = "wallet-icon";
      icon.alt = "";
      icon.src = wallet.info.icon;
      option.append(icon);
    }
    option.append(label);
    option.addEventListener("click", () => connectTrustWallet(wallet));
    elements.walletOptions.append(option);
  }
}

function detachWalletListeners() {
  if (!state.walletProvider?.removeListener || !state.walletListeners) return;
  state.walletProvider.removeListener("accountsChanged", state.walletListeners.accountsChanged);
  state.walletProvider.removeListener("chainChanged", state.walletListeners.chainChanged);
  state.walletListeners = null;
}

function attachWalletListeners() {
  if (!state.walletProvider?.on) return;
  detachWalletListeners();
  const accountsChanged = async (accounts) => {
    if (state.connecting) return;
    await resetSession();
    if (accounts.length > 0) showWalletPicker();
  };
  const chainChanged = async () => {
    if (state.connecting) return;
    await resetSession();
    await loadPublicData();
  };
  state.walletListeners = { accountsChanged, chainChanged };
  state.walletProvider.on("accountsChanged", accountsChanged);
  state.walletProvider.on("chainChanged", chainChanged);
}

async function connectTrustWallet(wallet) {
  if (state.connecting) return;
  try {
    state.connecting = true;
    elements.connect.disabled = true;
    elements.connect.textContent = "Подключение…";
    if (!state.config) await loadPublicData();
    if (!state.config) throw new Error("Конфигурация контрактов недоступна.");
    state.walletProvider = wallet.provider;
    state.walletInfo = wallet.info;
    state.provider = new BrowserProvider(state.walletProvider);
    await state.provider.send("eth_requestAccounts", []);
    await ensureExpectedNetwork();
    state.signer = await state.provider.getSigner();
    state.address = await state.signer.getAddress();
    state.token = new Contract(state.config.contracts.accessToken.address, state.config.contracts.accessToken.abi, state.signer);
    state.access = new Contract(state.config.contracts.aiServiceAccess.address, state.config.contracts.aiServiceAccess.abi, state.signer);
    await authenticate();
    attachWalletListeners();
    elements.walletTitle.textContent = shortAddress(state.address);
    elements.walletDetail.textContent = `Подключён локальный тестовый аккаунт ${state.walletInfo.name || "Trust Wallet"}.`;
    elements.networkName.textContent = state.config.network.name;
    elements.chainId.textContent = String(EXPECTED_CHAIN_ID);
    elements.connect.textContent = state.walletInfo.name || "Trust Wallet";
    clearWalletOptions();
    await refreshAccount();
    setNotice("Trust Wallet подключён, SIWE-сессия создана.", "success");
  } catch (error) {
    state.authenticated = false;
    elements.auth.textContent = "Не авторизован";
    setNotice(userMessage(error), "error");
  } finally {
    state.connecting = false;
    elements.connect.disabled = false;
    if (!state.address) elements.connect.textContent = "Подключить кошелёк";
    renderPlans();
  }
}

function connect() {
  walletRegistry.requestProviders();
  showWalletPicker();
}

function updateSubscription(access) {
  const active = Boolean(access?.hasAccess);
  elements.subscriptionState.textContent = active ? "Доступ активен" : "Нет доступа";
  elements.subscriptionState.className = `state-badge ${active ? "is-active" : "is-inactive"}`;
  elements.chatAccess.textContent = active ? "Чат доступен" : "Нужна подписка";
  elements.chatAccess.className = `state-badge ${active ? "is-active" : "is-inactive"}`;
  elements.chatInput.disabled = !active;
  elements.chatSubmit.disabled = !active;
  elements.renew.disabled = !state.address;
  if (active) {
    const date = new Date(Number(access.expiresAt) * 1000).toLocaleString("ru-RU");
    elements.expiration.textContent = `Подписка активна до ${date}`;
    elements.remaining.textContent = `Осталось: ${formatRemaining(access.remainingSeconds)}.`;
  } else {
    elements.expiration.textContent = "Подписка не активна";
    elements.remaining.textContent = "Выберите тариф, чтобы открыть ИИ-чат.";
  }
}

async function refreshAccount() {
  if (!state.address || !state.token) return;
  try {
    const [balance, access] = await Promise.all([state.token.balanceOf(state.address), api("/access/status")]);
    elements.balance.textContent = `${formatUnits(balance, 18)} STK`;
    updateSubscription(access);
  } catch (error) {
    if (error.status === 401) {
      state.authenticated = false;
      elements.auth.textContent = "Сессия истекла";
    }
    setNotice(userMessage(error), "error");
  }
}

async function purchase(plan) {
  if (!state.address || !state.token || !state.access) return setNotice("Сначала подключите и авторизуйте кошелёк.", "error");
  if (!isValidPlan(plan)) return setNotice("Выбран некорректный тариф.", "error");
  try {
    const planId = Number(plan.id);
    const price = await state.access.getPlanPrice(planId);
    const balance = await state.token.balanceOf(state.address);
    if (balance < price) throw new Error("Недостаточно STK для выбранного тарифа.");
    const serviceAddress = state.config.contracts.aiServiceAccess.address;
    const allowance = await state.token.allowance(state.address, serviceAddress);
    if (allowance < price) {
      setNotice("Подтвердите разрешение STK в MetaMask…", "info");
      const approval = await state.token.approve(serviceAddress, price);
      await approval.wait();
    }
    setNotice("Подтвердите покупку подписки в MetaMask…", "info");
    const purchaseTransaction = await state.access.purchaseSubscription(planId);
    setNotice("Транзакция отправлена. Ожидается подтверждение Hardhat…", "info");
    await purchaseTransaction.wait();
    await refreshAccount();
    setNotice("Подписка успешно оплачена. Дата окончания обновлена из блокчейна.", "success");
  } catch (error) {
    setNotice(userMessage(error), "error");
  }
}

function appendMessage(role, content, model = "") {
  const empty = elements.messages.querySelector(".empty-chat");
  if (empty) empty.remove();
  const article = document.createElement("article");
  article.className = `message message-${role}`;
  const title = document.createElement("strong");
  title.textContent = role === "user" ? "Вы" : model || "Qwen";
  const body = document.createElement("p");
  body.textContent = content;
  article.append(title, body);
  elements.messages.append(article);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

async function sendChat(event) {
  event.preventDefault();
  const message = elements.chatInput.value.trim();
  if (!message) return;
  try {
    elements.chatSubmit.disabled = true;
    elements.chatSubmit.textContent = "Qwen отвечает…";
    appendMessage("user", message);
    elements.chatInput.value = "";
    elements.characters.textContent = "0";
    const answer = await api("/llm/chat", { method: "POST", body: JSON.stringify({ message }) });
    appendMessage("assistant", answer.response, answer.model);
  } catch (error) {
    setNotice(error.status === 403 ? "Подписка отсутствует или истекла. Выберите тариф." : userMessage(error), "error");
    await refreshAccount();
  } finally {
    elements.chatSubmit.textContent = "Отправить";
    elements.chatSubmit.disabled = elements.chatInput.disabled;
  }
}

async function resetSession() {
  try { await api("/auth/logout", { method: "POST" }); } catch { /* stale cookies are safe to ignore */ }
  detachWalletListeners();
  state.address = null; state.signer = null; state.token = null; state.access = null; state.authenticated = false;
  state.provider = null; state.walletProvider = null; state.walletInfo = null;
  elements.walletTitle.textContent = "Подключение не выполнено";
  elements.walletDetail.textContent = "Подключите тестовый аккаунт MetaMask для просмотра баланса и покупки подписки.";
  elements.balance.textContent = "—"; elements.auth.textContent = "Не авторизован"; elements.connect.textContent = "Подключить MetaMask";
  elements.connect.textContent = "Подключить кошелёк";
  updateSubscription(null); renderPlans();
}

elements.connect.addEventListener("click", connect);
elements.renew.addEventListener("click", () => document.getElementById("plans-title").scrollIntoView({ behavior: "smooth" }));
elements.chatForm.addEventListener("submit", sendChat);
elements.chatInput.addEventListener("input", () => { elements.characters.textContent = String(elements.chatInput.value.length); });
walletRegistry.start();
loadPublicData();
