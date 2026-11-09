# Frontend AI Token Access

Локальный Vite-интерфейс на HTML, CSS, JavaScript и ethers.js v6. Он работает
только с фиксированными адресами `127.0.0.1`:

- UI: `http://127.0.0.1:5173`;
- FastAPI: `http://127.0.0.1:8000`;
- Hardhat RPC: `http://127.0.0.1:8545`.

## Запуск

В первом окне PowerShell в корне проекта запустите локальную сеть и актуальное
развёртывание. После перезапуска сети старые адреса не годятся:

```powershell
npm run node
# в отдельном окне:
npm run local:deploy
```

Во втором окне запустите FastAPI, в третьем — Ollama. Затем в этом каталоге:

```powershell
npm install
npm run dev
```

Откройте `http://127.0.0.1:5173`. Не заменяйте `127.0.0.1` на `localhost`:
это нарушит строгую SIWE-проверку origin в backend.

## Проверки

```powershell
npm test
npm run build
```

Адреса и ABI не вшиты в frontend: при загрузке UI получает их через
`GET /contracts/config`. Backend отдаёт ответ только после проверки chainId,
bytecode, ERC-20 metadata и связи контракта подписки с STK. Если Hardhat Network
перезапущен, выполните новое развёртывание и экспорт, а затем перезагрузите UI.

Для Trust Wallet Browser Extension добавьте сеть с RPC
`http://127.0.0.1:8545`, chainId `31337` и импортируйте только тестовый аккаунт
локального Hardhat node. Frontend обнаруживает Trust Wallet через EIP-6963,
показывает явный выбор Trust Wallet и не выбирает MetaMask или другой
инжектированный кошелёк автоматически.
