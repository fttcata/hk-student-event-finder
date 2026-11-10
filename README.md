# hk-student-event-finder
Modern Tech on WWW group project. (COMP3322)

## Stack

- `client/`: React 19, Vite, Tailwind CSS, React Router
- `server/`: Node.js, Express, `mysql2`, standard parameterized SQL
- `database/`: MySQL 8 initialization and seed data

## Run locally

Requirements: Node.js 20+ and Docker Desktop.

```powershell
docker compose up -d
```

Open `http://localhost`. The client container serves the React SPA on port 80 and proxies `/api` to the Express container on port 5000. The API is also available on host port 5001, and MySQL on host port 3307, to avoid common local port conflicts.

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
dependencies are installed, using host port 3307 for the Compose database:

```sh
DB_HOST=127.0.0.1 DB_PORT=3307 npm run admin:promote -- your-verified-account@example.com
```

Log out and sign in again after promotion. Admins can manage published
events from the Admin link; cancelling an event keeps its tickets and pledges as records.

The database credentials in `server/.env.example` match `docker-compose.yml` for local development only. Do not use them in production.

Email receipts: `docker compose up -d` also starts **Mailpit**, a local mock SMTP server, so every booking
confirmation and donation receipt appears in the mock inbox at `http://localhost:8025` — no external
credentials required. On startup the server logs `SMTP ready (mailpit:1025)`; if you see a warning instead,
recreate the server container with `docker compose up -d server`.

### Demo data (presentation prep)

With the stack running, seed realistic Hong Kong university events (free, paid, sold out, and fundraisers
with live goal progress):

```sh
cd server
npm run db:populate-demo             # add anything missing; safe to rerun
npm run db:populate-demo -- --reset  # rebuild the demo events with fresh dates
```

`--reset` also cancels app events whose date has already passed, so the listing opens on upcoming
events instead of leftovers from an earlier seed.

The script creates 8 organizer accounts, 160 student accounts, confirmed tickets, pledges, chat messages
and bookmarks. Demo logins (the client only accepts HKU/CUHK/PolyU domains):

- `demo.student@connect.hku.hk` / `Demo1234!` — student dashboard with tickets and a donation
- `hku.careers@connect.hku.hk` / `Demo1234!` — organizer of the HKU Careers Fair

To use a Mailtrap sandbox in Docker instead of Mailpit, override the SMTP settings for Compose (shell
variables or a root `.env`, which Compose reads for interpolation):

```sh
SMTP_HOST=sandbox.smtp.mailtrap.io SMTP_PORT=2525 \
SMTP_USER=your-mailtrap-username SMTP_PASSWORD=your-mailtrap-password \
  docker compose up -d server
```

For non-Docker development, `server/.env` already points at Mailpit on `127.0.0.1:1025`.

Ticket checkout collects a name and email address for each attendee. Each ticket is stored with its
attendee details and its own reference code, and confirmation is sent to that attendee when SMTP is
configured. After updating an existing MySQL volume, run this migration once from the repository root:

```sh
DB_HOST=127.0.0.1 DB_PORT=3307 DB_NAME=student_events DB_USER=app_user DB_PASSWORD=app_password \
  npm run db:migrate-ticket-attendees --prefix server
```

The migration backfills existing tickets from their purchaser accounts and can be safely rerun.
Fresh databases get the attendee fields from `database/init.sql`.
