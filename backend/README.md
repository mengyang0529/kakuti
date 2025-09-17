# Backend Configuration Cheatsheet

This service reads all runtime configuration from environment variables so that deployment targets such as Cloud Run can manage values centrally. The table below lists the key variables, expected defaults, and typical production overrides.

| Variable | Default | Notes |
| --- | --- | --- |
| `LLM_PROVIDER` | `gemini` | `gemini`, `openai`, `ollama` etc. |
| `GEMINI_API_KEY` | _unset_ | Stored in Secret Manager for production. |
| `GEMINI_REQUEST_TIMEOUT` | `30` | Seconds; set via `--update-env-vars`. |
| `REQUIRE_API_KEY` | `false` | Toggle API key guard for all routes. |
| `API_KEY` | _unset_ | Frontend uses this in `X-API-Key` header; rotate regularly. |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list used by CORS middleware. |
| `DB_TYPE` | `sqlite` | Use `postgresql` once Cloud SQL is wired up. |
| `DOCMIND_DB` | _(unset)_ | When unset and `DB_TYPE=sqlite`, the app uses a temp file in `/tmp` (non-persistent). Set to `storage/docmind.db` for local development. |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | _varies_ | Required when `DB_TYPE=postgresql`; pass via secrets. |
| `GOOGLE_API_KEY` | _unset_ | Optional if using Google RAG endpoints. |

## SQLite behaviour in MVP

When `DB_TYPE=sqlite` and `DOCMIND_DB` is **not** provided, the database lives under the container's temp directory. This is intentional for MVP deployments on Cloud Run so that no persistence is implied. Local development should explicitly set `DOCMIND_DB=storage/docmind.db` (see `.env.engine`).

## Health endpoints

- `GET /health` – returns `{ "ok": true }` and vector status; suitable for basic checks.
- `GET /healthz` – minimal OK response for Cloud Run health checks.

## CORS

Set `ALLOWED_ORIGINS` to a comma separated list of trusted origins (e.g. `https://<username>.github.io`). Wildcards are intentionally not supported.

## Secrets

Store sensitive values (LLM keys, database URLs, API keys) in Secret Manager and mount them with `gcloud run deploy ... --update-secrets`. Avoid editing environment variables directly in the Cloud Console to prevent configuration drift.

