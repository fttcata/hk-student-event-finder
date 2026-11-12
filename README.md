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
events and delete eligible student accounts from the Admin link. Cancelling an event keeps its
tickets and pledges as records. Accounts owning events or tickets purchased for other attendees
must be handled before they can be deleted.

The database credentials in `server/.env.example` match `docker-compose.yml` for local development only. Do not use them in production.

Email receipts use the **Mailtrap Email Sandbox**. Copy `server/.env.example` to `server/.env`,
then add your Mailtrap credentials before starting Compose:

```sh
cp server/.env.example server/.env
```

On startup the server logs `SMTP ready (sandbox.smtp.mailtrap.io:2525)` when the connection succeeds.

### Demo data (pre-loaded on first boot)

`database/init.sql` seeds the database the first time the MySQL volume is created, so
`docker compose up --build` on a fresh machine opens on realistic Hong Kong university events (free,
paid, sold out, and fundraisers with live goal progress). Event dates are computed from the moment the
database boots, so they are always upcoming. To start over from the seed:

```sh
docker compose down -v          # deletes the MySQL volume and all its data
docker compose up --build
```

The seed creates 8 organizer accounts, 160 student accounts, ~770 confirmed tickets, 100 pledges, chat
messages and bookmarks. Every account uses the password `Demo1234!` (the client only accepts
HKU/CUHK/PolyU domains):

- `demo.student@connect.hku.hk` — student dashboard with a ticket for every event and a pledge to every fundraiser
- `hku.careers@connect.hku.hk` — organizer of the HKU Careers Fair (starts ~5 hours after boot, so its chat room is open)
- `admin@connect.hku.hk` — administrator (admin events page, user management)
- `pending@connect.hku.hk` — unverified student; verification code `VRF7K3M2Q9P4XN8D`

To refresh the demo dates on a database that is already running without wiping it:

```sh
cd server
npm run db:populate-demo             # add anything missing; safe to rerun
npm run db:populate-demo -- --reset  # rebuild the demo events with fresh dates
```

`--reset` also cancels app events whose date has already passed, so the listing opens on upcoming
events instead of leftovers from an earlier seed.

For non-Docker development, copy `server/.env.example` to `server/.env` and set its `SMTP_*`
values to your Mailtrap sandbox credentials. The server explicitly loads `server/.env` even when
started from the repository root.

Ticket checkout collects a name and email address for each attendee. Each ticket is stored with its
attendee details and its own reference code. When SMTP is configured, only the buyer receives one
confirmation containing all ticket QR codes. After updating an existing MySQL volume, run this
migration once from the repository root:

```sh
DB_HOST=127.0.0.1 DB_PORT=3307 DB_NAME=student_events DB_USER=app_user DB_PASSWORD=app_password \
  npm run db:migrate-ticket-attendees --prefix server
DB_HOST=127.0.0.1 DB_PORT=3307 DB_NAME=student_events DB_USER=app_user DB_PASSWORD=app_password \
  npm run db:migrate-ticket-checkin --prefix server
```

The migrations backfill existing tickets from their purchaser accounts and add the check-in timestamp;
both can be safely rerun. Fresh databases get these fields from `database/init.sql`.

Event organizers and administrators can open the ticket scanner from the event page, dashboard, or
admin event list. Camera access requires a secure context: use `http://localhost` during development,
or HTTPS when opening the site from another device on the network.
