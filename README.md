# AI Token Access

Учебный MVP для курсовой работы: доступ к локальной языковой модели Qwen
оплачивается тестовым ERC-20 токеном STK в локальной сети Hardhat.

## Идея, цель и проблема

Система показывает связку blockchain-оплаты и off-chain ИИ: контракт хранит
оплаченный срок доступа, а FastAPI перед каждым запросом проверяет его в сети.
Цель — реализовать безопасный учебный сценарий подписки без реальных денег.

## Возможности

- фиксированный ERC-20 Access Token (`STK`);
- два тарифа и продление без потери остатка времени;
- Trust Wallet Browser Extension через EIP-6963/EIP-1193 и SIWE;
- FastAPI с server-side проверкой `hasAccess`;
- локальная Qwen через Ollama;
- Vite-интерфейс, тесты контрактов, backend и frontend.

## Технологии и архитектура

Solidity 0.8.28, OpenZeppelin, Hardhat 3, TypeScript/Viem; Python/FastAPI,
Web3.py, Ollama; HTML/CSS/JavaScript, Vite, ethers.js v6. Trust Wallet
подписывает SIWE и транзакции; frontend получает ABI/адреса из
`GET /contracts/config`; backend читает blockchain сам и не доверяет UI.

```text
Trust Wallet → AccessToken / AIServiceAccess → Hardhat Network
      ↓ SIWE                                  ↑
Frontend → FastAPI (hasAccess) → Ollama / Qwen
```

## Токеномика и тарифы

| Параметр | Значение |
| --- | --- |
| Токен | Access Token (STK), ERC-20 |
| Эмиссия | 1 000 000 STK, один раз deployer |
| Дополнительный mint / burn | отсутствуют |
| Назначение | оплата доступа к ИИ |
| MONTHLY | 100 STK / 30 дней |
| YEARLY | 1000 STK / 365 дней |

Годовой тариф дешевле на 16,7% относительно 12 месячных периодов: `1200 STK`
против `1000 STK`. При этом 12 месячных периодов составляют 360 дней, а годовой
тариф действует 365 дней. Все цены учебные; рыночная стоимость STK не задаётся.

## Структура

`contracts/` — Solidity; `test/` — Hardhat tests; `ignition/` — deployment;
`backend/` — FastAPI; `frontend/` — Vite UI; `scripts/` — local scripts;
`shared/` — exported ABI/config; `docs/` — документация.

## Требования и установка

Windows PowerShell, Node.js >= 22.13.0, npm >= 11.3.0, Python с `.venv`,
Ollama и Trust Wallet Browser Extension. Из корня:

```powershell
npm install
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Set-Location frontend; npm install; Set-Location ..
```

## Локальный запуск

Откройте отдельные PowerShell-окна. Используйте только `127.0.0.1`, не
`localhost`.

```powershell
# 1. Hardhat Network
npm run node

# 2. после каждого нового node: deploy + export
npm run local:deploy

# 3. Ollama
$env:OLLAMA_MODEL = "qwen3:4b-instruct"
ollama serve

# 4. FastAPI
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

# 5. Frontend
Set-Location frontend; npm run dev
```

UI: `http://127.0.0.1:5173`; API: `http://127.0.0.1:8000`; RPC:
`http://127.0.0.1:8545`; Ollama: `http://127.0.0.1:11434`.

В Trust Wallet добавьте `Hardhat Local`, RPC `http://127.0.0.1:8545`, chainId
`31337`, ETH. Импортируйте только тестовый аккаунт локального node. Для выдачи
тестовых средств:

```powershell
npm run local:fund-eth -- --recipient ВАШ_АДРЕС
npm run local:fund-stk -- --recipient ВАШ_АДРЕС --amount-stk 300
```

Подключите Trust Wallet, подтвердите SIWE, выберите тариф. UI ждёт подтверждения
`approve`, затем `purchaseSubscription`; после этого обновляет реальный
`expiresAt`. При активном доступе отправьте вопрос в ИИ-чат. Повторная покупка
любого тарифа добавляет период к существующему сроку.

## Тесты

```powershell
npm run compile
npm test
npm run test:integration
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend\tests -q
Set-Location frontend; npm test; npm run build
```

## Ограничения

Только локальная сеть и тестовые активы. Сессии/лимитер in-memory; нет
production HTTPS, public network, истории диалогов или внешнего security audit.
Подробности: `docs/`.
