# Ticket System Tech

Support ticket system: React + TypeScript frontend, .NET 8 Web API backend, PostgreSQL (Supabase).
See [docs/Plan_Razvoja_Tiket_Sistema.pdf](docs/Plan_Razvoja_Tiket_Sistema.pdf) for the full plan.

## Project structure

```
backend/    ASP.NET Core 8 Web API (Domain / Application / Infrastructure / Api / Tests)
frontend/   React + TypeScript (Vite, Tailwind, TipTap, Recharts)
docs/       Planning documents
```

## Local development

### Backend

Requires .NET 8 SDK and a PostgreSQL connection string.

1. `backend/src/TicketSystemTech.Api/appsettings.Development.json` (git-ignored) holds local secrets.
   Fill in `ConnectionStrings:DefaultConnection` with your Supabase (or any Postgres) connection string.
2. From `backend/`:
   ```bash
   dotnet run --project src/TicketSystemTech.Api
   ```
   On startup the app automatically applies EF Core migrations and seeds reference data
   (SLA plans, departments, help topics) plus one Admin account — see `DbSeeder.cs` for the
   seeded email/password.
3. Swagger UI: `http://localhost:5114/swagger`

### Frontend

Requires Node 20+.

1. `cp frontend/.env.example frontend/.env` and adjust `VITE_API_BASE_URL` if needed.
2. From `frontend/`:
   ```bash
   npm install
   npm run dev
   ```
3. App: `http://localhost:5173`

## Required third-party services (all free tiers, no credit card)

| Purpose | Service | Where to configure |
|---|---|---|
| Database + file storage | [Supabase](https://supabase.com) | `ConnectionStrings:DefaultConnection` |
| Transactional email | [Brevo](https://brevo.com) | `Brevo:ApiKey` |
| AI knowledge-base assistant | [Google AI Studio](https://aistudio.google.com) | `GoogleAi:ApiKey` |
| Backend hosting | [Render](https://render.com) | `backend/render.yaml` |
| Frontend hosting | [Vercel](https://vercel.com) | `frontend/vercel.json` |

## Deployment

- **Backend (Render):** New Web Service → connect this repo → Docker → root `backend/` →
  Render will pick up `render.yaml`. Set the env vars marked `sync: false` in the Render
  dashboard (connection string, JWT secret, frontend URL, CORS origin, Brevo/Google AI keys).
- **Frontend (Vercel):** New Project → connect this repo → root `frontend/` → framework
  preset "Vite". Set `VITE_API_BASE_URL` to the deployed Render URL.
- **Database (Supabase):** New project → Project Settings → Database → connection string
  (use the "Transaction pooler" URI for the backend). Enable the `vector` extension
  (SQL Editor → `create extension if not exists vector;`) before the knowledge-base feature ships.

## Notes / known simplifications (MVP)

- File attachments are stored on local disk (`wwwroot/uploads`) for now — swap
  `IFileStorage`'s registration in `Program.cs` for a Supabase Storage implementation before
  relying on it in production, since Render's free-tier disk is ephemeral.
- JWT access tokens are not refreshed/rotated yet (single longer-lived access token); refresh-token
  rotation is a good hardening item for Phase 2.
- The AI knowledge-base assistant (RAG over documentation + closed tickets) is not implemented yet —
  pending the documentation upload.
