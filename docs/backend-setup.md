# Backend: локальный запуск и безопасность

## Фиксированные адреса

| Компонент | Адрес |
| --- | --- |
| Frontend origin | `http://127.0.0.1:5173` |
| FastAPI | `http://127.0.0.1:8000` |
| Hardhat RPC | `http://127.0.0.1:8545` |
| Ollama (резерв) | `http://127.0.0.1:11434` |

Во всём backend используется `127.0.0.1`; `localhost` не является допустимой
альтернативой. SIWE domain — `127.0.0.1:5173`, SIWE URI —
`http://127.0.0.1:5173`, chain ID — `31337`.

## Установка и запуск в PowerShell

Сначала должны работать локальный Hardhat node и актуальный экспорт контрактов:

```powershell
npm run node
npm run local:deploy
npm run local:verify
```

Создайте venv и установите зависимости:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Запустите API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Swagger доступен по `http://127.0.0.1:8000/docs`. Если порт 8000 занят,
освободите именно процесс, который вы намеренно запускали на этом порту; не
переносите backend на другой origin без одновременного изменения SIWE/CORS.

Проверки:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend\tests -q
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/plans
```

## Ollama и Qwen

Установите Ollama для Windows из официального установщика, затем в PowerShell
загрузите модель по умолчанию:

```powershell
ollama pull qwen3:4b
ollama run qwen3:4b
```

Тег `qwen3:4b` занимает около 2.5 GB. При нехватке ресурсов загрузите более
лёгкий тег, например `qwen3:1.7b`, и перед запуском backend задайте его без
изменения кода:

```powershell
$env:OLLAMA_MODEL = "qwen3:1.7b"
```

Ollama должен слушать исключительно `http://127.0.0.1:11434`. Backend вызывает
`POST /api/chat` с `stream=false`, максимумом 512 генерируемых токенов и
тайм-аутом 60 секунд. Для Qwen backend передаёт `think=false`, игнорирует
thinking-поле ответа и отклоняет очевидный reasoning-текст, если устаревшая
связка Ollama/Qwen поместила его в `message.content`. Пользователю передаётся
только безопасный видимый ответ.

После входа через SIWE запрос проверяется так:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/llm/chat `
  -ContentType "application/json" `
  -Body '{"message":"Что такое блокчейн?"}' `
  -WebSession $session
```

Запрос без session cookie получает `401`; без активной on-chain подписки —
`403`; недоступные Ollama, модель или RPC — `503`; превышение timeout — `504`.
Лимит составляет 10 запросов за 60 секунд на подтверждённый адрес кошелька.

## Маршруты

| Маршрут | Назначение |
| --- | --- |
| `GET /health` | Статус API и проверка live RPC/контрактов. |
| `POST /auth/challenge` | Выдаёт короткоживущий EIP-4361 challenge. |
| `POST /auth/verify` | Проверяет подпись и устанавливает HttpOnly cookie. |
| `POST /auth/logout` | Удаляет session cookie и серверную сессию. |
| `GET /plans` | Читает цены и периоды из смарт-контракта. |
| `GET /access/status` | Возвращает подтверждённый кошелёк и live статус подписки. |
| `POST /llm/chat` | Проверяет сессию и on-chain доступ, затем вызывает локальный Ollama/Qwen. |

## SIWE и сессии

1. Frontend отправляет адрес на `/auth/challenge` с `Origin:
   http://127.0.0.1:5173`.
2. Backend создаёт криптографически случайный nonce, фиксирует адрес, domain,
   URI, chain ID, issuedAt и expirationTime в памяти.
3. MetaMask подписывает полный текст сообщения.
4. `/auth/verify` восстанавливает подписавший адрес, проверяет точное
   серверное сообщение, domain, URI, chain ID, nonce, срок и отсутствие
   повторного использования nonce.
5. После успеха создаётся HttpOnly cookie с `SameSite=Lax` и `Secure=False`
   только для локального HTTP-разработки.

Nonce и сессии намеренно хранятся только в памяти MVP. Перезапуск FastAPI
сбрасывает их и требует нового входа.

## CORS и CSRF

CORS разрешает ровно один origin: `http://127.0.0.1:5173`, с
`allow_credentials=True`. Изменяющие состояние маршруты (`challenge`,
`verify`, `logout`, `llm/chat`) дополнительно требуют точного заголовка
`Origin`, поэтому cookie нельзя использовать из другого origin.

## Данные блокчейна и отказоустойчивость

Backend читает `shared/local-contracts.json`, но не доверяет файлу вслепую:
перед чтением проверяет RPC, chain ID, bytecode адресов, метаданные STK и
связь `AIServiceAccess.accessToken`. Если RPC недоступен или deployment
устарел после перезапуска Hardhat, API отвечает ошибкой и не предоставляет
доступ. Цены и сроки читаются из контракта, а не дублируются в backend.
