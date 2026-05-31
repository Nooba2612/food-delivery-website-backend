# Kong Verify Checklist

## Quick start

1. Pull Kong image if Docker previously failed:
   `docker pull kong/kong-gateway:3.14`
2. Start the stack:
   `docker compose up -d`
3. Run the quick verification:
   `npm run verify:kong:lite`
4. Run the full verification when you also want to confirm rate limiting:
   `npm run verify:kong`
5. For Gemini embeddings after changing the embedding model, rebuild the vector data:
   `npm run ingest:dishes`

## What the script checks

### `npm run verify:kong:lite`

- `docker compose ps` shows `backend`, `kong`, `mysql_db`, and `redis`
- Backend direct health endpoint: `http://localhost:5678/status`
- Kong proxy health endpoint: `http://localhost:8000/status`
- Kong Swagger proxy: `http://localhost:8000/api-docs`
- Kong Admin API: `http://localhost:8001/services`
- CORS preflight for `http://localhost:3000`
- Socket.IO polling handshake through `http://localhost:8000/socket.io`

### `npm run verify:kong`

- `docker compose ps` shows `backend`, `kong`, `mysql_db`, and `redis`
- Backend direct health endpoint: `http://localhost:5678/status`
- Kong proxy health endpoint: `http://localhost:8000/status`
- Kong Swagger proxy: `http://localhost:8000/api-docs`
- Kong Admin API: `http://localhost:8001/services`
- CORS preflight for `http://localhost:3000`
- Socket.IO polling handshake through `http://localhost:8000/socket.io`
- Rate limiting returns `429` after repeated calls to `POST /api/orders`
- Rate limiting returns `429` after repeated calls to `POST /api/chat` once the per-IP budget exceeds 30 requests per minute

## Manual checks after script passes

1. Open `http://localhost:8000/api-docs` in the browser and confirm Swagger UI loads.
2. Open the frontend and confirm normal API flows still work through `http://localhost:8000/api`.
3. Test login with Google and Facebook after updating the callback URLs in each provider console:
   `http://localhost:8000/api/auth/google/redirect`
   `http://localhost:8000/api/auth/facebook/redirect`
4. Open chat or call features and confirm realtime events work after page refresh.
5. Trigger checkout or VNPay flow carefully and confirm the frontend shows the `429` toast when spamming requests.
6. Open the chat UI and confirm each IP is throttled after around 30 AI questions in the same minute.

## Notes

- Prefer `verify:kong:lite` while debugging config repeatedly.
- The rate-limit check intentionally consumes the current minute budget for the configured test path.
- The protected business prefixes in Kong are `/api/orders`, `/api/payments`, and `/api/vnpay`.
- The AI chat route `/api/chat` is rate-limited to 30 requests per minute per IP.
- Kong service retry is configured in `kong.yaml` with `retries: 2`, `connect_timeout: 3000`, `write_timeout: 5000`, and `read_timeout: 5000`.
- Backend outbound calls also retry up to 2 more times with exponential backoff for network, timeout, or upstream `5xx` failures.
- Current retry coverage in the backend includes email SMTP, AWS S3 upload, dish embedding generation, Qdrant semantic search, and chatbot completion generation.
- After switching the embedding model away from `qwen3-embedding:0.6b`, old vectors in Qdrant are no longer dimension-compatible. Run `npm run ingest:dishes` to recreate the collection with the new embedding size.
- If you rerun the script immediately, the rate-limit test may still be blocked until the minute window resets.
- You can override script defaults manually:
  `powershell -ExecutionPolicy Bypass -File ./scripts/verify-kong.ps1 -GatewayBaseUrl http://localhost:8000`

## How to explain fault tolerance

You can present the retry mechanism like this:

- Kong is the first fault-tolerance layer. If the upstream backend connection is slow or temporarily unavailable, Kong retries the request up to 2 times with a 3-5 second timeout budget.
- The backend is the second fault-tolerance layer. When it calls external services such as SMTP, S3, OpenAI, or Qdrant, it retries transient failures up to 2 times with exponential backoff `1s -> 2s`.
- The backend only retries transient faults such as timeout, connection reset, refused connection, or upstream `5xx`. It does not retry normal business errors like validation failures or `4xx`.

npm run reindex:qdrant:dishes
docker compose up -d --build
docker logs -f eatsy_backend
