export function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
}

export function formatRemaining(seconds) {
  const value = Math.max(0, Number(seconds));
  if (!value) return "Время доступа истекло";
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  return `${days} дн. ${hours} ч. ${minutes} мин.`;
}

export function isValidPlan(plan) {
  return Number(plan?.id) === 1 || Number(plan?.id) === 2;
}

export function userMessage(error) {
  const code = error?.code;
  const text = String(error?.shortMessage || error?.reason || error?.message || "");
  if (code === 4001 || /user rejected|user denied/i.test(text)) return "Действие отменено в кошельке.";
  if (/insufficient funds/i.test(text)) return "Недостаточно тестового ETH для оплаты gas.";
  if (/insufficient.*balance|InsufficientTokenBalance/i.test(text)) return "Недостаточно STK для этого тарифа.";
  if (/allowance|InsufficientTokenAllowance/i.test(text)) return "Недостаточный allowance STK.";
  if (/network|chain/i.test(text)) return "Подключите локальную сеть Hardhat с chainId 31337.";
  return text || "Не удалось выполнить операцию. Повторите попытку.";
}
