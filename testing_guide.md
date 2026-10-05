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

## 7. Student registration tests (`POST /api/auth/register`)

> Windows PowerShell mangles JSON passed straight to `curl.exe -d`, so each body is written to a file first.

```powershell
$dir = "$env:TEMP\regtests"; New-Item -ItemType Directory -Force -Path $dir | Out-Null
$api = 'http://localhost:5000/api/auth/register'
function Post($file, $expect) {
  $code = curl.exe -s -o "$dir\out.json" -w "%{http_code}" -X POST $api -H "Content-Type: application/json" --data-binary "@$dir\$file"
  $mark = if ($code -eq $expect) { 'PASS' } else { "FAIL (expected $expect)" }
  "[$mark] $file -> $code  $(Get-Content "$dir\out.json" -Raw)"
}
function Body($file, $json) { Set-Content -LiteralPath "$dir\$file" -Value $json -Encoding ASCII -NoNewline }

# 201 — new students from each allowed domain (returns { token, user })
Body hku.json   '{"name":"Louis Chan","email":"louis@connect.hku.hk","password":"password123","student_id":"S1234567"}'
Body cuhk.json  '{"name":"Anson Ho","email":"anson@link.cuhk.edu.hk","password":"password123"}'
Body polyu.json '{"name":"Masud Ali","email":"masud@connect.polyu.hk","password":"password123"}'
Post hku.json   201
Post cuhk.json  201
Post polyu.json 201

# 409 — the same email registered twice
Post hku.json 409

# 400 — invalid payloads
Body gmail.json     '{"name":"Test","email":"test@gmail.com","password":"password123"}'
Body malformed.json '{"name":"Test","email":"not-an-email","password":"password123"}'
Body noname.json    '{"email":"student@link.cuhk.edu.hk","password":"password123"}'
Body shortpw.json   '{"name":"Test","email":"student@link.cuhk.edu.hk","password":"short"}'
Post gmail.json     400
Post malformed.json 400
Post noname.json    400
Post shortpw.json   400

# the password must be stored as a bcrypt hash, never in plain text
docker compose exec mysql mysql -uroot -proot_password student_events -e "SELECT id,name,email,role,university,is_verified,LEFT(password_hash,7) AS hash_prefix FROM users WHERE email='louis@connect.hku.hk';"
```

Expected: three `201`, one `409`, four `400`, and `hash_prefix = $2b$10` with `is_verified = 0`.

## 8. Teardown

```powershell
docker compose down        # keep data
docker compose down -v     # wipe data (next start re-runs init.sql)
```
