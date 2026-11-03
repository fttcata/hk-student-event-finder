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
curl.exe -i http://localhost:5000/api/categories   # 200, 5 seeded categories
curl.exe -i http://localhost:5000/api/events/2     # 200, price 20, tickets.booked 1, fundraiser null
curl.exe -i http://localhost:5000/api/events/4     # 200, fundraiser.raised 350 of goal 5000, 3 pledges
curl.exe -i http://localhost:5000/api/events/999   # 404
curl.exe -i http://localhost:5000/api/events/abc   # 404
curl.exe -i http://localhost:5000/api/events/1e1   # 404 (strict integer ids only)
curl.exe -i http://localhost:5000/api/nope         # 404 JSON {"error":"Not found"}
```

List items and the detail object share one shape. Dates are UTC ISO strings, e.g.
event 1 has `"date": "2026-10-03T10:00:00.000Z"` (18:00 Hong Kong time). Anonymous
requests get `organizer` without `email`/`student_id`; send a Bearer token to see them.
Malformed JSON bodies return `400 {"error":"Request body must be valid JSON"}`.

## 5. Status filter test

```powershell
# hide an event
docker compose exec mysql mysql -uroot -proot_password student_events -e "UPDATE events SET status='cancelled' WHERE id=1;"
curl.exe http://localhost:5000/api/events        # expect 3 events (total 3)

# put it back
docker compose exec mysql mysql -uroot -proot_password student_events -e "UPDATE events SET status='published' WHERE id=1;"
curl.exe http://localhost:5000/api/events        # expect 4 events (total 4)
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

## 8. Events list filtering tests (`GET /api/events`)

Seed data has 4 published events: 3 standard (2 free, 1 paid) + 1 fundraiser
(goal 5000, raised 350). Seeded capacities are 120/200/40 with at most one
ticket each, and the fundraiser has `capacity = 0` (unlimited), so nothing seeded
is sold out.

```powershell
$base = 'http://localhost:5000/api'
function GetApi($path) {
  $code = curl.exe -s -o "$env:TEMP\ev.json" -w "%{http_code}" "$base$path"
  "$code  $path"
}
docker compose exec mysql mysql -uroot -proot_password student_events -e "SELECT id,name FROM categories;"

# 200 — defaults return the envelope { events, page, limit, total }
GetApi '/events'                                                     # total 4
GetApi '/events?event_type=fundraiser'                               # 1 row
GetApi '/events?event_type=standard'                                 # 3 rows
GetApi '/events?price=free'                                          # 3 rows
GetApi '/events?price=paid'                                          # 1 row (Food Fair)
GetApi '/events?search=Food'                                         # 2 rows
GetApi '/events?category_id=5'                                       # 1 row (Charity)
GetApi '/events?availability=available'                              # 4 rows
GetApi '/events?availability=sold_out'                               # 200, empty on seeds
GetApi '/events?page=1&limit=2'                                      # 2 rows, total 4
GetApi '/events?event_type=standard&price=free&search=workshop'      # 1 row

# 400 — invalid filters
GetApi '/events?event_type=bogus'
GetApi '/events?price=x'
GetApi '/events?category_id=abc'
GetApi '/events?availability=x'
GetApi '/events?page=0'
GetApi '/events?limit=51'
```

To prove the `sold_out` filter hits, insert a throwaway capacity-1 event with one
confirmed ticket, re-run `availability=sold_out` (expect 1 row,
`available_tickets: 0`), then delete the ticket first and the event second —
`tickets → events` is `ON DELETE RESTRICT`, so deleting the event first fails with 1451.

## 9. Create event tests (`POST /api/events`, protected)

> Creating events requires a verified student (`is_verified = 1`), per HANDOFF.md.
> Registration creates unverified users, so the tests below flip the flag once to
> stand in for the (not yet implemented) `POST /api/auth/verify`.

```powershell
$dir = "$env:TEMP\eventtests"; New-Item -ItemType Directory -Force -Path $dir | Out-Null
$api = 'http://localhost:5000/api'
function Body($file, $json) { Set-Content -LiteralPath "$dir\$file" -Value $json -Encoding ASCII -NoNewline }
function Post($path, $file, $auth, $expect, $label) {
  $headers = @('-H', 'Content-Type: application/json', '--data-binary', "@$dir\$file")
  if ($auth) { $headers += @('-H', "Authorization: Bearer $auth") }
  $code = curl.exe -s -o "$dir\out.json" -w "%{http_code}" -X POST "$api$path" @headers
  $mark = if ($code -eq $expect) { 'PASS' } else { "FAIL (expected $expect)" }
  "[$mark] $label -> $code  $(Get-Content "$dir\out.json" -Raw)"
}

# register + log in (user starts unverified), grab the token
Body reg.json '{"name":"Event Tester","email":"eventtest@connect.hku.hk","password":"password123"}'
curl.exe -s -X POST "$api/auth/register" -H "Content-Type: application/json" --data-binary "@$dir\reg.json" | Out-Null
Body login.json '{"email":"eventtest@connect.hku.hk","password":"password123"}'
$token = (curl.exe -s -X POST "$api/auth/login" -H "Content-Type: application/json" --data-binary "@$dir\login.json" | ConvertFrom-Json).token

Body std.json '{"event_type":"standard","title":"Intro to Robotics","description":"Hands-on session building small robots with mentors.","category":"Technology","date":"2026-12-15T18:00:00Z","location":"HKU Main Building","address":"Pok Fu Lam Road, HKU","latitude":22.2831,"longitude":114.1371,"capacity":50,"price":0}'
Body paid.json '{"event_type":"standard","title":"Wine Tasting Night","description":"An evening of wine tasting to support student travel grants.","category":"Social","date":"2026-12-20T19:00:00Z","location":"CUHK Student Union","capacity":30,"price":20}'
Body fundraiser.json '{"event_type":"fundraiser","title":"Winter Charity Drive","description":"Collecting pledges to buy supplies for local shelters this winter.","category":"Charity","date":"2026-12-25T09:00:00Z","location":"Online + Campus","fundraiser_goal":5000}'
Body bad-category.json '{"event_type":"standard","title":"Arts Night","description":"A description that is longer than twenty characters.","category":"Arts","date":"2026-12-15T18:00:00Z","location":"Somewhere","capacity":10,"price":0}'
Body bad-goal.json '{"event_type":"fundraiser","title":"Tiny Goal","description":"A description that is longer than twenty characters.","category":"Charity","date":"2026-12-15T18:00:00Z","location":"Somewhere","fundraiser_goal":50}'

# 401 (auth) and 403 (unverified) gates
Post '/events' std.json $null 401 'no token'
Post '/events' std.json 'garbage.token' 401 'garbage token'
Post '/events' std.json $token 403 'unverified user'

# stand in for POST /api/auth/verify (the middleware re-reads the user each request)
docker compose exec mysql mysql -uroot -proot_password student_events -e "UPDATE users SET is_verified=1 WHERE email='eventtest@connect.hku.hk';"

# 201 — created event comes back with the spec field names
Post '/events' std.json $token 201 'standard free'          # total_tickets 50, available_tickets 50
Post '/events' paid.json $token 201 'standard paid'         # price 20
Post '/events' fundraiser.json $token 201 'fundraiser'      # fundraiser_goal 5000, available null (unlimited)

# 400 — invalid payloads
Post '/events' bad-category.json $token 400 "category 'Arts' is offered by the client but not seeded"
Post '/events' bad-goal.json $token 400 'fundraiser goal below HK$100'

# registration_deadline is computed: exactly 24h before the start (UTC), organizer = token user
docker compose exec mysql mysql -uroot -proot_password student_events -e "SELECT id,event_type,organizer_id,event_date,registration_deadline,capacity,price,goal_amount FROM events WHERE organizer_id=(SELECT id FROM users WHERE email='eventtest@connect.hku.hk');"

# the new events are immediately visible through the public endpoints
curl.exe -s "$api/events?search=Robotics"          # 1 row
curl.exe -s "$api/events?event_type=fundraiser"    # includes Winter Charity Drive

# cleanup the test rows
docker compose exec mysql mysql -uroot -proot_password student_events -e "DELETE FROM events WHERE organizer_id=(SELECT id FROM users WHERE email='eventtest@connect.hku.hk'); DELETE FROM users WHERE email='eventtest@connect.hku.hk';"
```

Expected: `401`/`401`/`403`, three `201`s, two `400`s, and DB rows where
`event_date` keeps the time sent (`2026-12-15T18:00:00Z` → `2026-12-15 18:00:00`) and
`registration_deadline` = `event_date` − 24h, `organizer_id` matches
the token user, fundraiser rows have `goal_amount` set and `capacity = 0`.

## 10. Ticket booking tests (`POST /api/events/:id/tickets`, protected)

> Booking requires a verified student (`is_verified = 1`), a published standard event, and open
> registration. Seats are capacity minus confirmed tickets (`capacity = 0` means unlimited,
> see HANDOFF.md §1). Verification is flipped in SQL as a stand-in for the not-yet-implemented
> `POST /api/auth/verify`. A cancelled ticket row is re-confirmed on rebooking (never a second INSERT).

```powershell
$dir = "$env:TEMP\tickettests"; New-Item -ItemType Directory -Force -Path $dir | Out-Null
$api = 'http://localhost:5000/api'
function Body($file, $json) { Set-Content -LiteralPath "$dir\$file" -Value $json -Encoding ASCII -NoNewline }
function Call($method, $path, $file, $auth) {
  $headers = @()
  if ($file) { $headers += @('-H', 'Content-Type: application/json', '--data-binary', "@$dir\$file") }
  if ($auth) { $headers += @('-H', "Authorization: Bearer $auth") }
  $code = curl.exe -s -o "$dir\out.json" -w "%{http_code}" -X $method "$api$path" @headers
  @{ code = $code; body = Get-Content "$dir\out.json" -Raw }
}
function Register($name, $email) {
  Body reg.json "{`"name`":`"$name`",`"email`":`"$email`",`"password`":`"password123`"}"
  Call 'POST' '/auth/register' 'reg.json' $null | Out-Null
  Body login.json "{`"email`":`"$email`",`"password`":`"password123`"}"
  (Call 'POST' '/auth/login' 'login.json' $null).body | ConvertFrom-Json
}
function Book($eventId, $auth, $expect, $label) {
  $result = Call 'POST' "/events/$eventId/tickets" $null $auth
  $mark = if ($result.code -eq $expect) { 'PASS' } else { "FAIL (expected $expect)" }
  "[$mark] $label -> $($result.code)  $($result.body)"
  $result.body
}

# 4 users: the organizer creates events, two bookers race for the last seat, one stays unverified.
$org = Register 'Ticket Organizer' 'org.tickets@connect.hku.hk'
$book1 = Register 'Ticket Booker One' 'ticket1@connect.hku.hk'
$book2 = Register 'Ticket Booker Two' 'ticket2@connect.hku.hk'
$unverified = Register 'Ticket Unverified' 'unverified.tickets@connect.hku.hk'
docker compose exec mysql mysql -uroot -proot_password student_events -e "UPDATE users SET is_verified=1 WHERE email IN ('org.tickets@connect.hku.hk','ticket1@connect.hku.hk','ticket2@connect.hku.hk');"

function CreateEvent($file, $json) {
  Body $file $json
  ((Call 'POST' '/events' $file $org.token).body | ConvertFrom-Json).event.id
}
$free = CreateEvent 'e-free.json' '{"event_type":"standard","title":"Ticket Test Free","description":"Event used for ticket booking tests in the guide.","category":"Technology","date":"2026-12-15T18:00:00Z","location":"Test Hall","capacity":2,"price":0}'
$race = CreateEvent 'e-race.json' '{"event_type":"standard","title":"Ticket Test Race","description":"Last-seat race test event for concurrent bookings.","category":"Technology","date":"2026-12-16T18:00:00Z","location":"Test Hall","capacity":1,"price":0}'
$paid = CreateEvent 'e-paid.json' '{"event_type":"standard","title":"Ticket Test Paid","description":"Paid ticket test event with a twenty dollar price.","category":"Social","date":"2026-12-17T18:00:00Z","location":"Test Hall","capacity":3,"price":20}'
$closed = CreateEvent 'e-closed.json' '{"event_type":"standard","title":"Ticket Test Closed","description":"Deadline is forced into the past by the test script.","category":"Career","date":"2026-12-18T18:00:00Z","location":"Test Hall","capacity":5,"price":0}'
$cancelled = CreateEvent 'e-cancelled.json' '{"event_type":"standard","title":"Ticket Test Cancelled","description":"Cancelled by its organizer before anyone books a seat.","category":"Sports","date":"2026-12-19T18:00:00Z","location":"Test Hall","capacity":5,"price":0}'
docker compose exec mysql mysql -uroot -proot_password student_events -e "UPDATE events SET registration_deadline=UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE id=$closed;"
Call 'DELETE' "/events/$cancelled" $null $org.token | Out-Null
$fundraiser = (docker compose exec mysql mysql -uroot -proot_password student_events -N -e "SELECT id FROM events WHERE event_type='fundraiser' LIMIT 1;" | Select-Object -First 1).Trim()

# 401 / 403 gates
Book $free $null 401 'no token'
Book $free $unverified.token 403 'unverified user'

# 201 — response carries ticket_code plus the decremented available_tickets
Book $free $book1.token 201 'book free seat'          # type free, amount_paid 0, available 1
Book $free $book1.token 409 'duplicate booking'
Book $paid $book2.token 201 'book paid seat'          # type paid, amount_paid 20
Book $fundraiser $book1.token 400 'fundraiser uses donations, not tickets'
Book $closed $book1.token 409 'registration deadline passed'
Book $cancelled $book1.token 409 'cancelled event'
Book 'abc' $book1.token 404 'non-numeric id'
Book '999999' $book1.token 404 'missing event'

# last-seat race: capacity 1, two users in parallel → one 201, one 409
$race1 = Start-Job -ScriptBlock { param($id, $tok, $d) curl.exe -s -o "$d\race1.json" -w "%{http_code}" -X POST "http://localhost:5000/api/events/$id/tickets" -H "Authorization: Bearer $tok" } -ArgumentList $race, $book1.token, $dir
$race2 = Start-Job -ScriptBlock { param($id, $tok, $d) curl.exe -s -o "$d\race2.json" -w "%{http_code}" -X POST "http://localhost:5000/api/events/$id/tickets" -H "Authorization: Bearer $tok" } -ArgumentList $race, $book2.token, $dir
Wait-Job $race1, $race2 | Out-Null
"race -> $(Receive-Job $race1) / $(Receive-Job $race2)"   # one 201 and one 409

# rebooking confirms the same cancelled row (UNIQUE user+event), never a second INSERT
docker compose exec mysql mysql -uroot -proot_password student_events -e "UPDATE tickets SET status='cancelled' WHERE user_id=$($book1.user.id) AND event_id=$free;"
Book $free $book1.token 201 'rebook after cancel'

# DB checks: one confirmed race row, ticket/code columns, email_log booking entries
docker compose exec mysql mysql -uroot -proot_password student_events -e "SELECT id,user_id,event_id,type,status,reference_code,amount_paid FROM tickets WHERE event_id IN ($free,$race,$paid); SELECT COUNT(*) AS confirmed_race_seats FROM tickets WHERE event_id=$race AND status='confirmed'; SELECT type,status,reference_code FROM email_log WHERE reference_code LIKE 'TKT%' ORDER BY id DESC LIMIT 5;"

# cleanup: tickets first (FK RESTRICT), then events, then users
docker compose exec mysql mysql -uroot -proot_password student_events -e "DELETE FROM tickets WHERE event_id IN ($free,$race,$paid); DELETE FROM events WHERE organizer_id=$($org.user.id); DELETE FROM users WHERE email IN ('org.tickets@connect.hku.hk','ticket1@connect.hku.hk','ticket2@connect.hku.hk','unverified.tickets@connect.hku.hk');"
```

Expected: `401`/`403`, `201` for free/paid/rebook, `400` for the fundraiser, `409` for
duplicate/deadline/cancelled, `404` for bad or missing ids, exactly **one** confirmed race row,
and `ticket_code` matching `TKT` + 9 uppercase alphanumerics. Receipt emails depend on SMTP:
without `server/.env` credentials `receipt_email_sent` is `false` and `email_log` records
`failed`; with Mailtrap credentials it is `true`/`sent`.

## 11. Teardown

```powershell
docker compose down        # keep data
docker compose down -v     # wipe data (next start re-runs init.sql)
```
