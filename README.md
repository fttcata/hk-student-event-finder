# hk-student-event-finder
Modern Tech on WWW group project. (COMP3322)

## Stack

- `client/`: React 19, Vite, Tailwind CSS, React Router
- `server/`: Node.js, Express, `pg`, standard parameterized SQL
- `database/`: PostgreSQL initialization and seed data (compatible with Supabase)

## Run locally

Requirements: Node.js 20+ and Docker Desktop.

```powershell
docker compose up -d
```

Open `http://localhost`. The client container serves the React SPA on port 80 and proxies `/api` to the Express container on port 5000. The API is also available on host port 5001, and PostgreSQL on host port 5432.

### Supabase

Create a Supabase project, open the SQL Editor, and run [`database/init.sql`](database/init.sql).
Set `DATABASE_URL` in `server/.env` to the project's connection string (the pooler connection
string is recommended), and set `DB_SSL=true`. The application uses its existing Express
authentication while Supabase provides PostgreSQL as the database.

The initialization script does not add demo data. If the project was initialized before the
demo seed was removed, run [`database/remove-mock-data.sql`](database/remove-mock-data.sql) once
in the Supabase SQL Editor.

For local development without Docker:

```powershell
Copy-Item server/.env.example server/.env
npm install
npm run dev
```

The Vite client runs at `http://localhost:5173` and proxies API calls to `http://localhost:5000`.

Useful checks:

```powershell
Invoke-RestMethod http://localhost:5001/api/health
Invoke-RestMethod http://localhost:5001/api/events
```

### Admin access

Create and verify an account through the normal sign-up flow, then promote that account using
the server command below. The command uses the configured database and never creates or prints a
password:

```sh
cd server
npm run admin:promote -- your-verified-account@example.com
```

For Docker-based development, run the command on the host from the `server` directory after
dependencies are installed, using the local PostgreSQL connection:

```sh
DATABASE_URL=postgresql://app_user:app_password@127.0.0.1:5432/student_events npm run admin:promote -- your-verified-account@example.com
```

Log out and sign in again after promotion. Admins can manage published
events from the Admin link; cancelling an event keeps its tickets and pledges as records.

The database credentials in `server/.env.example` match `docker-compose.yml` for local development only. Do not use them in production.

Email receipts: set `SMTP_USER` / `SMTP_PASSWORD` in `server/.env` to your Mailtrap sandbox credentials
(Mailtrap → Sandboxes → SMTP). The Docker server reads its `SMTP_*` settings from that file too, so run
`docker compose up -d server` after changing it. On startup the server logs `SMTP ready` or why SMTP failed.

Ticket checkout collects a name and email address for each attendee. Each ticket is stored with its
attendee details and its own reference code, and confirmation is sent to that attendee when SMTP is
configured. After updating an existing database, run this migration once from the repository root:

```sh
DATABASE_URL=postgresql://app_user:app_password@127.0.0.1:5432/student_events \
  npm run db:migrate-ticket-attendees --prefix server
```

The migration backfills existing tickets from their purchaser accounts and can be safely rerun.
Fresh databases get the attendee fields from `database/init.sql`.
