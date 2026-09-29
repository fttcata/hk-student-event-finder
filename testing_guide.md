# Docker Test Commands

> Note: restart your terminal if `docker` isn't on your PATH. In PowerShell use `curl.exe` (plain `curl` is an alias for `Invoke-WebRequest`).

## 1. Fresh start

```powershell
docker compose down -v
docker compose up -d --build
```

## 2. Watch the DB init

```powershell
docker compose logs mysql
docker compose ps
```

## 3. Verify your schema

```powershell
docker compose exec mysql mysql -uroot -proot_password student_events -e "SHOW TABLES;"

docker compose exec mysql mysql -uroot -proot_password student_events -e "SELECT e.title, c.name AS category, u.name AS organizer FROM events e JOIN categories c ON c.id=e.category_id JOIN users u ON u.id=e.organizer_id;"
```

## 4. API tests

```powershell
curl.exe http://localhost:5000/api/health
curl.exe -i http://localhost:5000/api/events
```

## 5. Status filter test

```powershell
# hide an event
docker compose exec mysql mysql -uroot -proot_password student_events -e "UPDATE events SET status='cancelled' WHERE id=1;"
curl.exe http://localhost:5000/api/events        # expect 2 events

# put it back
docker compose exec mysql mysql -uroot -proot_password student_events -e "UPDATE events SET status='published' WHERE id=1;"
curl.exe http://localhost:5000/api/events        # expect 3 events
```

## 6. Frontend through Nginx

```powershell
curl.exe -i http://localhost/                     # SPA loads
curl.exe -i http://localhost/api/events           # proxied API
curl.exe -i http://localhost/events               # SPA route
```

Then open `http://localhost` in a browser — should show "MySQL API connected" and 3 events.

## 7. Teardown

```powershell
docker compose down        # keep data
docker compose down -v     # wipe data (next start re-runs init.sql)
```
