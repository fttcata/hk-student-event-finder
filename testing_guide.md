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
> Registration creates unverified users; §10 exercises `POST /api/auth/verify`, while this
> section flips the flag directly to keep the focus on event creation.

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

# flip directly; POST /api/auth/verify is exercised in §10
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

## 10. Group ticket booking tests (`POST /api/events/:id/tickets`, protected)

> Every attendee must be a registered, verified student. The signed-in buyer may include
> themselves or book seats only for other students: `user_id` is the holder and `purchased_by`
> is the buyer. Send up to four attendee emails (`{ "attendees": [...] }`). `quantity` alone
> still works for one self-booked seat, but `quantity > 1` without `attendees` is a 400.
> Seats remain capacity minus confirmed tickets (`capacity = 0` means unlimited). The
> `UNIQUE(user_id, event_id)` rule still allows one seat per holder, so a cancelled ticket is
> re-confirmed with an UPDATE, never a second INSERT. The client checkout currently sends only
> `quantity`; buying more than one seat from the UI needs the attendee-email inputs.

```powershell
$dir = "$env:TEMP\grouptickettests"; New-Item -ItemType Directory -Force -Path $dir | Out-Null
$api = 'http://localhost:5000/api'
function Body($file, $json) { Set-Content -LiteralPath "$dir\$file" -Value $json -Encoding ASCII -NoNewline }
function Call($method, $path, $file, $auth) {
  $headers = @()
  if ($file) { $headers += @('-H', 'Content-Type: application/json', '--data-binary', "@$dir\$file") }
  if ($auth) { $headers += @('-H', "Authorization: Bearer $auth") }
  $code = curl.exe -s -o "$dir\out.json" -w "%{http_code}" -X $method "$api$path" @headers
  @{ code = "$code"; body = Get-Content "$dir\out.json" -Raw }
}
function Sql($query) { (docker compose exec -T mysql mysql -uroot -proot_password student_events -N -e $query) -join "`n" }
function Check($result, $expect, $label) {
  $mark = if ($result.code -eq "$expect") { 'PASS' } else { "FAIL (expected $expect)" }
  "[$mark] $label -> $($result.code)  $($result.body)"
  $result
}
function Register($name, $email) {
  Body 'reg.json' (@{ name = $name; email = $email; password = 'password123' } | ConvertTo-Json -Compress)
  ((Call 'POST' '/auth/register' 'reg.json' $null).body | ConvertFrom-Json)
}
function Verify($email) {
  $code = (Sql "SELECT verification_code FROM users WHERE email='$email'").Trim()
  Body 'verify.json' (@{ email = $email; code = $code } | ConvertTo-Json -Compress)
  (Call 'POST' '/auth/verify' 'verify.json' $null).code   # 200
}
function CreateEvent($title, $capacity, $price, $date) {
  Body 'event.json' (@{
    event_type = 'standard'; title = $title; description = 'Event used for group ticket booking tests.'
    category = 'Technology'; date = $date; location = 'Test Hall'; capacity = $capacity; price = $price
  } | ConvertTo-Json -Compress)
  ((Call 'POST' '/events' 'event.json' $org.token).body | ConvertFrom-Json).event.id
}
function Book($eventId, $auth, $payload, $expect, $label) {
  Body 'book.json' $payload
  Check (Call 'POST' "/events/$eventId/tickets" 'book.json' $auth) $expect $label
}
function Attendees($emails, $quantity) {
  $payload = @{ attendees = @($emails) }
  if ($null -ne $quantity) { $payload.quantity = $quantity }
  $payload | ConvertTo-Json -Compress
}

# Six users: five verified (organizer, buyer, two friends, other buyer), one unverified.
$org = Register 'Guide Organizer' 'org.group@connect.hku.hk'
$buyer = Register 'Guide Buyer' 'buyer.group@connect.hku.hk'
$f1 = Register 'Guide Friend One' 'friend1.group@connect.hku.hk'
$f2 = Register 'Guide Friend Two' 'friend2.group@connect.hku.hk'
$other = Register 'Guide Other Buyer' 'other.group@connect.hku.hk'
$unverified = Register 'Guide Unverified' 'unverified.group@connect.hku.hk'
foreach ($u in @($org, $buyer, $f1, $f2, $other)) { if ((Verify $u.user.email) -ne '200') { throw "verify failed for $($u.user.email)" } }

$free = CreateEvent 'Guide Group Free' 5 0 '2026-12-15T18:00:00Z'
$paid = CreateEvent 'Guide Group Paid' 3 20 '2026-12-16T18:00:00Z'
$tiny = CreateEvent 'Guide Group Tiny' 2 0 '2026-12-17T18:00:00Z'
$race = CreateEvent 'Guide Group Race' 1 0 '2026-12-18T18:00:00Z'
$closed = CreateEvent 'Guide Group Closed' 5 0 '2026-12-19T18:00:00Z'
$cancelled = CreateEvent 'Guide Group Cancelled' 5 0 '2026-12-20T18:00:00Z'
Sql "UPDATE events SET registration_deadline=UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE id=$closed" | Out-Null
Call 'DELETE' "/events/$cancelled" $null $org.token | Out-Null
$fundraiser = (Sql "SELECT id FROM events WHERE event_type='fundraiser' LIMIT 1").Trim()

# Gates
Book $free $null '{}' 401 'no token'
Book $free $unverified.token '{}' 403 'unverified buyer'
Book $fundraiser $buyer.token '{}' 400 'fundraiser uses donations'
Book $closed $buyer.token '{}' 409 'registration closed'
Book $cancelled $buyer.token '{}' 409 'cancelled event'
Book 'abc' $buyer.token '{}' 404 'non-numeric id'
Book '999999' $buyer.token '{}' 404 'missing event'

# Single ticket for self (backward-compatible quantity path)
Book $free $buyer.token '{"quantity":1}' 201 'buyer books one seat for self'   # available 4
Book $free $buyer.token '{"quantity":1}' 409 'buyer already holds a seat'

# Validation
Book $free $buyer.token (Attendees @($f1.user.email, $f1.user.email)) 400 'duplicate attendee email'
Book $free $buyer.token (Attendees @('nobody@connect.hku.hk')) 400 'unknown attendee email'
Book $free $buyer.token (Attendees @($unverified.user.email)) 403 'unverified attendee'
Book $free $buyer.token '{"quantity":3}' 400 'quantity > 1 without attendees'
Book $free $buyer.token (Attendees @($f1.user.email, $f2.user.email) 3) 400 'quantity/attendee mismatch'
Book $free $buyer.token (Attendees @($f1.user.email, $f2.user.email, $other.user.email, $buyer.user.email, $org.user.email)) 400 'more than four attendees'

# Buyer books for two friends (buyer is not in the attendee list)
Book $free $other.token (Attendees @($f1.user.email, $f2.user.email)) 201 'other buys two seats for friends'

# Buyer books three seats including themselves on a paid event
Book $paid $buyer.token (Attendees @($buyer.user.email, $f1.user.email, $f2.user.email)) 201 'paid group of three'
Book $paid $other.token (Attendees @($f1.user.email)) 409 'f1 already holds paid ticket'

# Capacity is checked against the whole group, then a fitting group succeeds
Book $tiny $buyer.token (Attendees @($buyer.user.email, $f1.user.email, $f2.user.email)) 409 'three seats for capacity two'
Book $tiny $buyer.token (Attendees @($buyer.user.email, $f1.user.email)) 201 'two seats for capacity two'

# Last-seat race: capacity 1, two buyers in parallel -> one 201, one 409
Body 'race.json' '{}'
$race1 = Start-Job -ScriptBlock { param($id, $tok, $f, $o) curl.exe -s -o $o -w "%{http_code}" -X POST "http://localhost:5000/api/events/$id/tickets" -H "Content-Type: application/json" --data-binary "@$f" -H "Authorization: Bearer $tok" } -ArgumentList $race, $buyer.token, "$dir\race.json", "$dir\raceA.json"
$race2 = Start-Job -ScriptBlock { param($id, $tok, $f, $o) curl.exe -s -o $o -w "%{http_code}" -X POST "http://localhost:5000/api/events/$id/tickets" -H "Content-Type: application/json" --data-binary "@$f" -H "Authorization: Bearer $tok" } -ArgumentList $race, $other.token, "$dir\race.json", "$dir\raceB.json"
Wait-Job $race1, $race2 | Out-Null
"race -> $(Receive-Job $race1) / $(Receive-Job $race2)   # one 201 and one 409"

# Cancel f1's paid ticket, then have another buyer rebook it
$oldRow = (Sql "SELECT id FROM tickets WHERE user_id=$($f1.user.id) AND event_id=$paid").Trim()
Sql "UPDATE tickets SET status='cancelled' WHERE id=$oldRow" | Out-Null
Book $paid $other.token (Attendees @($f1.user.email)) 201 'other rebooks cancelled f1 seat'
$newRow = (Sql "SELECT id FROM tickets WHERE user_id=$($f1.user.id) AND event_id=$paid").Trim()
"rebook row -> old $oldRow / new $newRow   # same id; purchased_by is now other"

# DB checks: holder vs buyer, paid amounts, one race seat, email_log per ticket
Sql "SELECT id,user_id,purchased_by,event_id,status,reference_code,amount_paid FROM tickets WHERE event_id IN ($free,$paid,$tiny,$race) ORDER BY id"
Sql "SELECT COUNT(*) AS confirmed_race_seats FROM tickets WHERE event_id=$race AND status='confirmed'"
Sql "SELECT COUNT(*) AS booking_emails FROM email_log WHERE reference_code LIKE 'TKT%'"

# Cleanup: tickets first (FK RESTRICT), then events, then users
Sql "DELETE FROM tickets WHERE event_id IN ($free,$paid,$tiny,$race)" | Out-Null
Sql "DELETE FROM events WHERE organizer_id=$($org.user.id)" | Out-Null
Sql "DELETE FROM users WHERE email IN ('org.group@connect.hku.hk','buyer.group@connect.hku.hk','friend1.group@connect.hku.hk','friend2.group@connect.hku.hk','other.group@connect.hku.hk','unverified.group@connect.hku.hk')" | Out-Null
```

Expected: `401`/`403` gates, `201` for the single free seat, two friend seats, paid group,
tiny group, and rebook; `400` for unknown/unverified/duplicate attendees and quantity misuse;
`409` for duplicate holder, capacity overflow, closed/cancelled events; `404` for bad ids.
The three paid tickets total HK$60 with `available_tickets = 0`; the free event ends with
`available_tickets = 2`; exactly one race seat is confirmed; rebooking reuses the same row id
and changes `purchased_by`. Receipt emails depend on SMTP: without `server/.env` credentials
`receipt_email_sent` is `false`, every ticket still gets an `email_log` `booking` row marked
`failed`, and with Mailtrap credentials those rows become `sent`.

## 11. Teardown

```powershell
docker compose down        # keep data
docker compose down -v     # wipe data (next start re-runs init.sql)
```
