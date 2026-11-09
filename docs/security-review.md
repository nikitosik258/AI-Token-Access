# Security and quality review — AI Token Access

Дата: 08.11.2026. Это внутренний анализ кода, конфигурации и тестов учебного
локального MVP; он **не является независимым внешним аудитом**.

## Итог

Критических и высоких уязвимостей не обнаружено. Оплата и хранение срока
подписки корректны для заявленной модели, а FastAPI получает срок доступа
непосредственно из blockchain и не доверяет frontend.

| Область | Результат |
| --- | --- |
| ERC-20 | Fixed supply 1 000 000 STK; public mint/burn отсутствуют; OZ ERC20 обрабатывает balances/allowances |
| Подписка | SafeERC20, immutable token/treasury, `nonReentrant`, CEI, только caller изменяет свой `expiresAt` |
| Тарифы | 100/30 дней и 1000/365 дней; invalid plan revert; остаток сохраняется при MY/YM |
| Backend | Серверный SIWE challenge, nonce single-use, exact domain/URI/chainId, HttpOnly Lax cookie, exact Origin на POST |
| LLM access | `/llm/chat` требует сессию и server-side `hasAccess`; expired access получает 403 |
| Frontend | Trust Wallet EIP-6963/EIP-1193, только выбранный provider, public ABI/config, `textContent` для LLM |

## Найденное и исправленное

| Severity | Проблема | Последствие | Исправление |
| --- | --- | --- | --- |
| Low | Начальный текст frontend упоминал MetaMask, хотя фактически используется Trust Wallet | Вводящая в заблуждение инструкция | Текст заменён на Trust Wallet |
| Low | Integration-runner до исправления мог сохранять test transfers/time travel | Нелокально воспроизводимое состояние dev-сети | Добавлен Hardhat snapshot/revert и восстановление ETH test-account |
| Informational | В `main.js` остаётся неиспользуемый legacy connector | Долг кода, не исполняется и не участвует в выборе provider | Не удалён в рамках минимального review; рекомендуется убрать в отдельной небольшой задаче |

## Проверки

- Hardhat: 29/29 passed; покрыты ERC-20, CEI rollback, tariff changes, expiry, constructor addresses.
- Backend: 30/30 passed; покрыты SIWE replay/domain/URI/chain/session, CORS, access, LLM errors and limiter.
- Frontend: 6/6 passed; Trust detection ignores MetaMask, safe formatting and errors.
- Local integration-runner: 32 assertions passed, включая real FastAPI SIWE, Qwen, month/year, renewals, expiry/403 и no-ETH gas failure.
- Vite production build и Solidity compilation успешны.

## Ограничения

- In-memory sessions/challenges/rate limit предназначены только для одного local MVP process; production потребует shared durable storage.
- `cookie_secure=False` допустим лишь на `http://127.0.0.1`; production потребует HTTPS, secure cookie и stricter deployment controls.
- Hardhat dev accounts и RPC не безопасны вне локальной машины.
- Отклонение подписи/транзакции и account/network switching Trust Wallet требуют ручной browser-проверки; UI их обрабатывает, но внешний browser automation не запускался.

## Готовность

Проект готов к локальной учебной демонстрации при запущенных Hardhat, FastAPI,
Ollama и Vite. Для реального использования требуется отдельный внешний audit и
production-hardening.
