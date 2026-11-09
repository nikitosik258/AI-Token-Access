# Локальное развёртывание блокчейна

## Границы среды

Проект использует только локальную Hardhat Network:

| Параметр | Значение |
| --- | --- |
| Имя сети | `hardhat-local` |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Валюта для газа | тестовый ETH Hardhat |

Не добавляйте публичные сети и не отправляйте реальные ETH или токены. Все
аккаунты и средства в этой инструкции существуют только в запущенном локальном
узле.

## Запуск и развёртывание

Откройте два PowerShell-окна в корне проекта.

В первом запустите локальный узел и не закрывайте это окно:

```powershell
npm run node
```

Во втором выполните компиляцию, развёртывание Ignition и автоматический экспорт
конфигурации:

```powershell
npm run local:deploy
```

Модуль `AIServiceAccessModule` разворачивает в правильном порядке:

1. `AccessToken`;
2. `AIServiceAccess`, передавая адрес первого контракта и treasury из
   `ignition/parameters/local.json`.

После этого проверьте реальные bytecode, адреса, chain ID и параметры:

```powershell
npm run local:verify
```

Команда `local:export` запускается автоматически в конце `local:deploy`.
Она читает результаты Ignition, проверяет live bytecode и создаёт
`shared/local-contracts.json`. В нём есть chain ID, RPC URL, актуальные адреса
и ABI обоих контрактов. Backend и frontend должны читать именно этот файл, а
не хранить адреса в исходном коде.

`shared/local-contracts.json` намеренно исключён из Git: после нового
локального узла адреса могут стать неактуальными. Версионируемый шаблон —
`shared/local-contracts.example.json`.

## Демонстрационные средства

Адреса пользователей задаются вручную параметрами. Следующая команда выдаёт:

- MONTHLY_USER: 300 STK и 1 тестовый ETH;
- YEARLY_USER: 2500 STK и 1 тестовый ETH;
- дополнительно проверяет цены и сроки тарифов в live-контракте.

```powershell
$monthlyUser = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
$yearlyUser = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
npm run local:demo -- --monthly-user $monthlyUser --yearly-user $yearlyUser
```

Для точечной выдачи используйте:

```powershell
npm run local:fund-eth -- --recipient $monthlyUser
npm run local:fund-stk -- --recipient $monthlyUser --amount-stk 300
```

Скрипты проверяют наличие актуального deployment, достаточный баланс владельца
первичной эмиссии и фактическое изменение баланса получателя. ETH нужен только
для локального газа при `approve`, `purchaseSubscription` и `transfer`.

## Проверка покупки

Скрипт ниже при необходимости сначала выполняет `approve` ровно на стоимость
тарифа, затем покупает подписку и выводит `expiresAt`:

```powershell
# MONTHLY: 100 STK, 30 дней
npm run local:purchase -- --user $monthlyUser --plan 1

# YEARLY: 1000 STK, 365 дней
npm run local:purchase -- --user $yearlyUser --plan 2
```

Это демонстрационный скрипт для разблокированных тестовых аккаунтов Hardhat;
он не содержит и не считывает приватные ключи.

## MetaMask

1. В MetaMask откройте добавление сети вручную.
2. Укажите имя `AI Token Access Local`, RPC URL `http://127.0.0.1:8545`, Chain
   ID `31337` и валюту `ETH`.
3. Импортируйте **только** один тестовый аккаунт, выведенный текущей командой
   `npm run node`. Эти ключи публичны и пригодны исключительно для локальной
   Hardhat Network.
4. Никогда не импортируйте в эту сеть реальный seed phrase или приватный ключ
   пользователя.
5. Получите адрес STK из экспортированной конфигурации:

   ```powershell
   $config = Get-Content .\shared\local-contracts.json | ConvertFrom-Json
   $config.contracts.accessToken.address
   ```

6. В MetaMask выберите «Import tokens», вставьте этот адрес. Кошелёк прочитает
   имя `Access Token`, символ `STK` и 18 decimals из токена.
7. После `local:demo` проверьте в MetaMask тестовые ETH и STK пользователя.

## После перезапуска Hardhat Network

Перезапуск `npm run node` может сбросить состояние сети, хотя chain ID снова
будет `31337`. Поэтому chain ID не является доказательством актуальности
контрактов. Всегда начинайте с:

```powershell
npm run local:verify
```

Команда проверяет bytecode обоих адресов, name/symbol/totalSupply STK, связь
`AIServiceAccess.accessToken`, treasury, цены и сроки. Если проверка сообщает
об отсутствии bytecode, deployment устарел.

В этом случае остановите старый node, запустите новый node и удалите только
локальный кэш Ignition для сети 31337:

```powershell
Test-Path .\ignition\deployments\chain-31337
Remove-Item -LiteralPath .\ignition\deployments\chain-31337 -Recurse -Force
npm run local:deploy
npm run local:verify
```

После нового развёртывания `local:deploy` автоматически перезапишет
`shared/local-contracts.json`; потребители ABI должны перечитать этот файл.

## Проверочные команды

```powershell
npm run compile
npx tsc --noEmit
npm test
npx hardhat test --coverage
npm run local:verify
```
