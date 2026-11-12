# Campus Hub — Database ER Diagram

Paste the block below into the [Mermaid Live Editor](https://mermaid.live) to view/export.

```mermaid
erDiagram
    users ||--o{ events : "organizes"
    categories ||--o{ events : "categorizes"
    users ||--o{ tickets : "holds"
    users ||--o{ tickets : "purchases"
    events ||--o{ tickets : "issued for"
    users ||--o{ pledges : "donates"
    events ||--o{ pledges : "fundraiser for"
    users ||--o{ chat_messages : "writes"
    events ||--o{ chat_messages : "chat room"
    users ||--o{ reviews : "writes"
    events ||--o{ reviews : "reviewed"
    users ||--o{ email_log : "receives"
    users ||--o{ bookmarks : "saves"
    events ||--o{ bookmarks : "bookmarked"

    users {
        int id PK
        varchar name
        varchar email UK
        varchar password_hash
        enum role "student|organizer|admin"
        varchar student_id
        enum university "HKU|CUHK|PolyU|Other"
        bool is_verified
        varchar verification_code
        timestamp verified_at
        timestamp created_at
    }

    categories {
        int id PK
        varchar name UK
    }

    events {
        int id PK
        varchar title
        text description
        int category_id FK
        int organizer_id FK
        varchar location
        varchar address
        decimal latitude
        decimal longitude
        datetime event_date
        datetime registration_deadline
        enum event_type "standard|fundraiser"
        int capacity
        int available_tickets "stored counter; 0 for fundraisers"
        decimal price
        decimal goal_amount "CHECK: required if fundraiser"
        enum status "draft|published|cancelled"
        varchar image_url
        varchar source "NULL = created in this app"
        varchar source_id "UK with source"
        varchar source_url
        varchar source_organizer
        varchar fee_text
        datetime end_date
        timestamp created_at
        timestamp updated_at
    }

    tickets {
        int id PK
        int user_id FK
        int purchased_by FK
        int event_id FK
        enum type "free|paid"
        enum status "confirmed|cancelled"
        varchar ticket_code UK "UUID"
        decimal amount_paid
        timestamp created_at
        datetime checked_in_at "NULL until scanned"
    }

    pledges {
        int id PK
        int event_id FK
        int user_id FK
        decimal amount "CHECK: > 0"
        varchar reference_code UK
        timestamp created_at
    }

    chat_messages {
        int id PK
        int event_id FK
        int user_id FK
        text content
        timestamp created_at
    }

    reviews {
        int id PK
        int event_id FK
        int user_id FK
        tinyint rating "CHECK: 1-5"
        text comment
        timestamp created_at
    }

    email_log {
        int id PK
        int user_id FK
        enum type "booking|donation|reminder|verification"
        varchar reference_code
        enum status "sent|failed"
        timestamp created_at
    }

    bookmarks {
        int user_id PK,FK
        int event_id PK,FK
        timestamp created_at
    }
```

## Legend

- `PK` — primary key
- `FK` — foreign key
- `UK` — unique constraint
- `PK,FK` — composite primary key that is also a foreign key
- `CHECK` — MySQL 8 check constraint (enforced on insert/update)
- `rsvps` table is intentionally absent — replaced by `tickets` (free/paid ticketing with receipt reference codes)

## Notes for reviewers

- 9 tables total: `users`, `categories`, `events`, `tickets`, `pledges`, `chat_messages`, `reviews`, `email_log`, `bookmarks`
- All FKs use `ON UPDATE CASCADE`. `ON DELETE` is `RESTRICT` for `events.category_id`, `events.organizer_id`
  and all three FKs of `tickets` and both FKs of `pledges` (receipts must not disappear with a category,
  user or event — cancel events via `status` instead); every other FK uses `ON DELETE CASCADE`
- `tickets.user_id` is the attendee/holder; `tickets.purchased_by` is the student who paid, so one buyer
  can book seats for several registered students. `UNIQUE(user_id, event_id)` still applies per holder.
- `events.available_tickets` is the stored booking counter for standard events; booking decrements it
  and cancellation restores it inside the event-row lock. Fundraisers keep it at `0` (unlimited).
- All `DATETIME`/`TIMESTAMP` values are UTC (`event_date` is the start instant, not just a day)
- Fundraiser progress is computed live: `SELECT COALESCE(SUM(amount),0) FROM pledges WHERE event_id = ?`
- `pledges` has no `UNIQUE(user_id, event_id)` — repeat donations are allowed by design
- Chat time-window rules (open T-6h, close +7d) are enforced in Express middleware, not in SQL
- `events.source` marks scraped events (`NULL` = created in this app). They are owned by a system user,
  stay out of the default `GET /api/events` list (`?source=external` returns them) and are read-only in the API
