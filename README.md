# hk-student-event-finder
Modern Tech on WWW group project.

## Stack

- `client/`: React 19, Vite, Tailwind CSS, React Router
- `server/`: Node.js, Express, `mysql2`, standard parameterized SQL
- `database/`: MySQL 8 initialization and seed data

## Run locally

Requirements: Node.js 20+ and Docker Desktop.

```powershell
docker compose up -d
```

Open `http://localhost`. The client container serves the React SPA on port 80 and proxies `/api` to the Express container on port 5000.

For local development without Docker:

```powershell
Copy-Item server/.env.example server/.env
npm install
npm run dev
```

The Vite client runs at `http://localhost:5173` and proxies API calls to `http://localhost:5000`.

Useful checks:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
Invoke-RestMethod http://localhost:5000/api/events
```

The database credentials in `server/.env.example` match `docker-compose.yml` for local development only. Do not use them in production.
