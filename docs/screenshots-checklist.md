# Скриншоты для сдачи

Сохраняйте реальные изображения в `docs/screenshots/` (папка создаётся вручную).

| Файл | Открыть / действие | Должно быть видно |
| --- | --- | --- |
| 01_contract_deployment.png | PowerShell, `npm run local:deploy` | два адреса deployment |
| 02_erc20_token.png | Trust Wallet / UI | STK и balance |
| 03_token_transfer.png | PowerShell fund script | подтверждённый transfer |
| 04_monthly_plan.png | UI тарифов | 100 STK, 30 дней |
| 05_yearly_plan.png | UI тарифов | 1000 STK, 365 дней, выгода |
| 06_wallet_connected.png | UI после SIWE | Trust Wallet, chainId, balance |
| 07_monthly_purchase.png | Trust Wallet/UI | approve и purchase monthly |
| 08_yearly_purchase.png | отдельный пользователь | yearly purchase |
| 09_subscription_status.png | UI | expiresAt и access active |
| 10_subscription_extension.png | UI после второй покупки | продлённый expiresAt |
| 11_ai_chat_response.png | UI чат | реальный ответ Qwen |
| 12_hardhat_tests.png | `npm test` | 29 passing |
| 13_backend_tests.png | pytest | 30 passed |

Подписи и транзакции подтверждайте вручную в Trust Wallet; не подменяйте их
макетами и не снимайте seed phrase/private key.
