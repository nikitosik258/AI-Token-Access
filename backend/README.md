# Backend

FastAPI backend for SIWE authentication and verified read-only access to the
local AI Token Access contracts.

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

It accepts browser requests only from `http://127.0.0.1:5173`, reads the
current `shared/local-contracts.json`, and never handles a user private key.
See [backend setup](../docs/backend-setup.md).
