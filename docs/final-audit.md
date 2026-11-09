# Финальная экспертная проверка AI Token Access

Дата: 08.11.2026. Это фактическая внутренняя проверка кода и локальной среды,
не внешний независимый аудит.

## 1. Описание

Гибридная учебная платформа: ERC-20 STK оплачивает on-chain срок доступа,
FastAPI проверяет этот срок и только после этого вызывает локальную Qwen/Ollama.
LLM не является децентрализованной и не хранится в blockchain.

## 2. Требования преподавателя

| Требование | Статус | Подтверждение |
| --- | --- | --- |
| Инновационно-экономическая часть | Готово | README: utility STK, фиксированная эмиссия, учебные цены, нет рыночной доходности |
| Техническая часть | Готово | contracts, FastAPI, Vite, архитектура, roadmap |
| Практическая часть | Частично готово | исходники/тесты есть; GitHub URL и сохранённые screenshots отсутствуют |
| ERC-20 / fixed supply | Готово | `AccessToken.sol`, 29 Hardhat tests |
| MONTHLY/YEARLY, renew/switch | Готово | 100/30 и 1000/365; 4 сочетания проверены |
| Авторизация и доступ к LLM | Готово | SIWE, server-side `hasAccess`, реальная Qwen integration |
| Browser wallet | Готово с отличием | фактически Trust Wallet EIP-6963/EIP-1193, не MetaMask |

## 3. Реализованные функции и токеномика

Access Token (`STK`) — ERC-20 с 18 decimals и единственной эмиссией
1 000 000 STK deployer. Public mint/burn отсутствуют. STK — только учебный
utility-token оплаты AI-доступа. MONTHLY: plan 1, 100 STK, 30 дней; YEARLY:
plan 2, 1000 STK, 365 дней. Скидка 16,7%: 12 monthly = 1200 STK/360 дней,
yearly = 1000 STK/365 дней. Платежи направляются immutable treasury.

## 4. Фактические проверки

| Проверка | Результат |
| --- | --- |
| Solidity compilation | успешно |
| Hardhat contracts | 29/29 passed |
| FastAPI pytest | 30/30 passed (2 dependency deprecation warnings) |
| Frontend unit tests | 6/6 passed |
| Vite build | успешно |
| Integration runner | 32 assertions passed: real RPC, SIWE, Ollama, monthly/yearly, 4 renewals, expiry/403, no-STK/no-allowance/invalid plan/no-gas |
| Environment | `/health` = blockchain ok; Ollama has `qwen3:4b-instruct` |
| Manual browser | Trust Wallet → SIWE → approve → MONTHLY → FastAPI → Qwen подтверждён ранее вручную |

## 5. Проблемы и исправления

- Исправлен устаревший пользовательский текст MetaMask на Trust Wallet.
- Integration runner изолирован snapshot/revert, чтобы не оставлять time travel и платежи.
- Критических дефектов тарифов, доступа, treasury или подписи не выявлено.

## 6. Оставшиеся ограничения

- Нет `.git`/GitHub URL: публикация не подготовлена до создания Git-репозитория пользователем.
- `docs/screenshots/` и реальные screenshots отсутствуют; есть точный checklist.
- Trust Wallet manual проверен для месячного тарифа; yearly UI purchase не выполнялась вручную, но проверена реальным local runner.
- In-memory sessions/rate limiter и HTTP cookie предназначены только для local MVP.

## 7. Вывод

Проект работает и готов к локальной демонстрации. К написанию курсовой можно
переходить после добавления GitHub-ссылки (если требуется преподавателем) и
создания реальных screenshots по `docs/screenshots-checklist.md`.
