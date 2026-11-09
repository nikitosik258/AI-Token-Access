# Frontend: AI Token Access

Интерфейс расположен в `frontend/` и использует Vite, JavaScript и ethers.js v6.
Он намеренно не хранит приватные ключи, цены или адреса контрактов в исходном
коде. Адреса и ABI запрашиваются с FastAPI через `GET /contracts/config`; этот
endpoint сперва проверяет актуальную конфигурацию deployment, chainId, bytecode,
metadata STK и привязку контракта подписки к токену.

## Локальный запуск в PowerShell

Все адреса строго используют `127.0.0.1`, не `localhost`.

1. В первом окне из корня проекта запустите Hardhat Network:

   ```powershell
   npm run node
   ```

2. Во втором окне разверните заново контракты и экспортируйте конфигурацию:

   ```powershell
   npm run local:deploy
   ```

3. В третьем окне запустите FastAPI:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

4. Убедитесь, что Ollama работает с установленной локальной моделью, например
   `qwen3:4b-instruct`:

   ```powershell
   ollama serve
   $env:OLLAMA_MODEL = "qwen3:4b-instruct"
   ```

5. В четвёртом окне запустите frontend:

   ```powershell
   Set-Location frontend
   npm install
   npm run dev
   ```

6. Откройте `http://127.0.0.1:5173`.

## Trust Wallet и покупка

Установите и разблокируйте Trust Wallet Browser Extension. Добавьте сеть
`Hardhat Local`: RPC `http://127.0.0.1:8545`, chain ID `31337`, валюта `ETH`.
Импортируйте только один из известных тестовых ключей запущенного локального
Hardhat node. Никогда не импортируйте настоящий пользовательский ключ в учебную
среду.

Нажмите «Подключить кошелёк», затем выберите Trust Wallet: UI запросит SIWE challenge, подпишет его выбранным EIP-1193 provider и
создаст HttpOnly-сессию. При покупке UI получает цену через
`getPlanPrice(plan)`, сравнивает её с текущими балансом и allowance, при
необходимости ждёт подтверждения `approve`, затем ждёт подтверждения
`purchaseSubscription(plan)`. Успех появляется только после подтверждения.

После месячной или годовой покупки UI заново читает `expiresAt`; поэтому при
переключении тарифов показывает единый фактический срок, включая сохранённый
остаток предыдущего периода.

Если одновременно установлены MetaMask и Trust Wallet, UI показывает только
обнаруженный Trust Wallet как вариант подключения: другой injected provider не
будет выбран автоматически. EIP-6963 является основным механизмом обнаружения;
fallback `window.trustwallet.ethereum` используется только после проверки, что
provider действительно принадлежит Trust Wallet.

## Проверки

```powershell
Set-Location frontend
npm test
npm run build
```

Ручная проверка требует запущенных локальных Hardhat, FastAPI, Ollama и
MetaMask: подключить кошелёк, выбрать оба тарифа, подтвердить две транзакции,
убедиться в обновлении баланса/даты и отправить вопрос Qwen при активной
подписке.
