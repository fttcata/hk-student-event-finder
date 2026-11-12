-- Schema + seed data. MySQL runs this file automatically the first time the Docker volume is
-- created (docker compose down -v && docker compose up --build to start over). It is also safe to
-- rerun by hand against an existing database: tables use IF NOT EXISTS and every seed insert skips
-- rows that are already there.
--
-- Seed event dates are computed from the moment the database boots, so a fresh deployment always
-- opens on upcoming events. Every seeded account signs in with the password Demo1234!

SET NAMES utf8mb4;
-- All DATETIME columns hold UTC (the API returns ISO 'Z' strings), so compute seed dates in UTC.
SET time_zone = '+00:00';

-- ------------------------------------------------------------------------------------- schema
--
-- Index notes (the queries live in server/queries/*.js):
--  * Every event list/detail response computes booked seats, money raised, pledge count and
--    donor count with correlated subqueries per event row. The tickets and pledges composite
--    indexes below are covering indexes for those subqueries, so each one is an index-only range
--    read instead of a lookup of every matching row.
--  * Composite indexes whose first column is a foreign key also serve that foreign key, so the
--    old single-column FK indexes they replace are not needed.

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'organizer', 'admin') NOT NULL DEFAULT 'student',
  student_id VARCHAR(40) NULL,
  university ENUM('HKU', 'CUHK', 'PolyU', 'Other') NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_code VARCHAR(32) NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  category_id INT UNSIGNED NOT NULL,
  organizer_id INT UNSIGNED NOT NULL,
  location VARCHAR(150) NOT NULL,
  address VARCHAR(200) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  -- Start of the event in UTC (all DATETIME columns are UTC; the API returns ISO 'Z' strings).
  event_date DATETIME NOT NULL,
  registration_deadline DATETIME NULL,
  event_type ENUM('standard', 'fundraiser') NOT NULL DEFAULT 'standard',
  capacity INT UNSIGNED NOT NULL DEFAULT 0,
  -- Stored counter, decremented by the booking transaction and restored on cancellation.
  available_tickets INT UNSIGNED NOT NULL DEFAULT 0,
  price DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  goal_amount DECIMAL(10,2) NULL,
  status ENUM('draft', 'published', 'cancelled') NOT NULL DEFAULT 'published',
  image_url VARCHAR(500) NULL,
  -- Scraped events only. source IS NULL means the event was created in this app; anything else
  -- names the website it came from, and the API treats that event as read-only.
  source VARCHAR(30) NULL,
  source_id VARCHAR(64) NULL,
  source_url VARCHAR(500) NULL,
  source_organizer VARCHAR(200) NULL,
  fee_text VARCHAR(150) NULL,
  end_date DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Lets each scrape update an event it already stored. Multiple NULLs are allowed, so app events are unaffected.
  -- Also serves the scraper's "WHERE source = ? AND status = 'published'" lookups.
  UNIQUE KEY uq_events_source (source, source_id),
  -- RESTRICT: removing a category or an organizer must not silently delete events
  -- (and with them other students' tickets and pledges). Cancel events instead.
  CONSTRAINT fk_events_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_events_organizer
    FOREIGN KEY (organizer_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_events_goal
    CHECK (event_type <> 'fundraiser' OR goal_amount IS NOT NULL),
  INDEX idx_events_category (category_id),
  -- GET /api/events: WHERE status = 'published' ... ORDER BY event_date LIMIT n.
  INDEX idx_events_status_date (status, event_date),
  -- GET /api/events?event_type=fundraiser (and =standard): equality on both, then date order.
  INDEX idx_events_type_status_date (event_type, status, event_date),
  -- GET /api/users/me/events (organiser dashboard); also serves fk_events_organizer.
  INDEX idx_events_organizer_status_date (organizer_id, status, event_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  purchased_by INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  attendee_name VARCHAR(120) NOT NULL,
  attendee_email VARCHAR(160) NOT NULL,
  type ENUM('free', 'paid') NOT NULL DEFAULT 'free',
  status ENUM('confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed',
  ticket_code VARCHAR(36) NOT NULL,
  amount_paid DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One ticket per student per event. Also serves "my tickets" (WHERE user_id = ?), the chat
  -- membership check and the booking row locks (user_id + event_id).
  UNIQUE KEY uq_tickets_user_event (user_id, event_id),
  -- QR check-in and booking emails look tickets up by code.
  UNIQUE KEY uq_tickets_code (ticket_code),
  -- RESTRICT: tickets are receipts; they must outlive neither their event nor their holder by accident.
  CONSTRAINT fk_tickets_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- purchased_by is the student who paid; user_id is the student who holds/attends.
  CONSTRAINT fk_tickets_buyer
    FOREIGN KEY (purchased_by) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_tickets_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Covering index for the booked-seat count on every event row:
  --   COUNT(*) WHERE event_id = ? AND status = 'confirmed' AND user_id <> organizer_id
  -- Also serves fk_tickets_event and the attendee locks (WHERE event_id = ? AND user_id IN (...)).
  INDEX idx_tickets_event_status_user (event_id, status, user_id),
  -- Admin account deletion: WHERE purchased_by = ? AND user_id <> ?; also serves fk_tickets_buyer.
  INDEX idx_tickets_buyer_user (purchased_by, user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pledges (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reference_code VARCHAR(24) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pledges_reference (reference_code),
  -- RESTRICT: pledges are donation receipts, same rule as tickets.
  CONSTRAINT fk_pledges_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_pledges_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_pledges_amount CHECK (amount > 0),
  -- Covering index for the fundraiser figures on every event row: SUM(amount), COUNT(*) and
  -- COUNT(DISTINCT user_id) WHERE event_id = ?, plus the donor leaderboard (GROUP BY user_id)
  -- and the chat membership check (event_id + user_id). Also serves fk_pledges_event.
  INDEX idx_pledges_event_user_amount (event_id, user_id, amount),
  -- "My pledges": WHERE user_id = ? ORDER BY created_at DESC; also serves fk_pledges_user.
  INDEX idx_pledges_user_created (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_chat_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_chat_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_chat_event_time (event_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reviews (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_event_user (event_id, user_id),
  CONSTRAINT fk_reviews_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reviews_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  INDEX idx_reviews_event (event_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_log (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('booking', 'donation', 'reminder', 'verification') NOT NULL,
  reference_code VARCHAR(36) NULL,
  status ENUM('sent', 'failed') NOT NULL DEFAULT 'sent',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_email_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_email_user_type (user_id, type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_id),
  CONSTRAINT fk_bookmarks_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_bookmarks_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_bookmarks_event (event_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------------------------- seed: lookups

INSERT INTO categories (name) VALUES
  ('Technology'),
  ('Social'),
  ('Career'),
  ('Sports'),
  ('Charity')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ------------------------------------------------------------------------------ seed: accounts
--
-- Same accounts as server/scripts/populate-demo.js. Logins must use an HKU/CUHK/PolyU domain
-- because the client validates the email before it calls the API.
--   demo.student@connect.hku.hk   student: a ticket for every event, a pledge to every fundraiser
--   hku.careers@connect.hku.hk    organizer of the HKU Careers Fair (its chat room is already open)
--   admin@connect.hku.hk          administrator (admin events page, user management)
--   pending@connect.hku.hk        unverified student, verification code VRF7K3M2Q9P4XN8D
-- All of them, and the 8 organizers / 159 other students, use the password Demo1234!
-- INSERT IGNORE keeps an existing account (and its password) untouched on a rerun.

INSERT IGNORE INTO users (name, email, password_hash, role, student_id, university, is_verified, verification_code, verified_at) VALUES
  ('HKU Careers & Placement Office', 'hku.careers@connect.hku.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'organizer', NULL, 'HKU', TRUE, NULL, UTC_TIMESTAMP()),
  ('HKU Athletics Club', 'hku.athletics@connect.hku.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'organizer', NULL, 'HKU', TRUE, NULL, UTC_TIMESTAMP()),
  ('HKU Rotaract Club', 'hku.rotaract@connect.hku.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'organizer', NULL, 'HKU', TRUE, NULL, UTC_TIMESTAMP()),
  ('CUHK Student Union', 'cuhk.su@link.cuhk.edu.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'organizer', NULL, 'CUHK', TRUE, NULL, UTC_TIMESTAMP()),
  ('CUHK Cat Club', 'cuhk.cats@link.cuhk.edu.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'organizer', NULL, 'CUHK', TRUE, NULL, UTC_TIMESTAMP()),
  ('PolyU Music Society', 'polyu.music@connect.polyu.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'organizer', NULL, 'PolyU', TRUE, NULL, UTC_TIMESTAMP()),
  ('PolyU Design Society', 'polyu.design@connect.polyu.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'organizer', NULL, 'PolyU', TRUE, NULL, UTC_TIMESTAMP()),
  ('PolyU Entrepreneurship Club', 'polyu.entrepreneurs@connect.polyu.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'organizer', NULL, 'PolyU', TRUE, NULL, UTC_TIMESTAMP()),
  ('CampusHub Admin', 'admin@connect.hku.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'admin', NULL, 'HKU', TRUE, NULL, UTC_TIMESTAMP()),
  ('Demo Student', 'demo.student@connect.hku.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'student', '3035123456', 'HKU', TRUE, NULL, UTC_TIMESTAMP()),
  ('Pending Student', 'pending@connect.hku.hk', '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2', 'student', 'HK20260002', 'HKU', FALSE, 'VRF7K3M2Q9P4XN8D', NULL),
  -- Owns scraped CEDARS events (events.organizer_id is required). Its hash is not a valid bcrypt
  -- hash, so nobody can sign in as it.
  ('HKU CEDARS', 'cedars-scraper@campushub.local', '$2b$10$placeholderhashtokennotarealcredential0000000000000000000000', 'organizer', NULL, 'HKU', TRUE, NULL, UTC_TIMESTAMP());

-- 159 more verified students (first.last@<university domain>), named exactly like populate-demo.js.
INSERT IGNORE INTO users (name, email, password_hash, role, student_id, university, is_verified, verification_code, verified_at)
WITH RECURSIVE seq (n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 158
),
named AS (
  SELECT n,
         ELT(n % 24 + 1, 'Alice', 'Brian', 'Chloe', 'Daniel', 'Emily', 'Felix', 'Grace', 'Hugo',
             'Iris', 'Jason', 'Karen', 'Leo', 'Mandy', 'Nathan', 'Olivia', 'Peter',
             'Queenie', 'Ryan', 'Sophie', 'Tommy', 'Vivian', 'Wilson', 'Yoyo', 'Zoe') AS first_name,
         ELT(FLOOR(n / 24) % 12 + 1, 'Chan', 'Lee', 'Wong', 'Cheung', 'Lam', 'Ho', 'Ng', 'Tam',
             'Yip', 'Tsang', 'Lau', 'Kwok') AS last_name,
         n % 3 + 1 AS university_index
  FROM seq
)
SELECT CONCAT(first_name, ' ', last_name),
       CONCAT(LOWER(first_name), '.', LOWER(last_name), '@',
              ELT(university_index, 'connect.hku.hk', 'link.cuhk.edu.hk', 'connect.polyu.hk')),
       '$2b$10$U.PoRgpb38EPUAA3NDdMyOttpCh5bPWFg8qFyfA0AJt7iwVHWuVs2',
       'student',
       CONCAT('S2026', LPAD(n + 1, 4, '0')),
       ELT(university_index, 'HKU', 'CUHK', 'PolyU'),
       TRUE, NULL, UTC_TIMESTAMP()
FROM named;

-- -------------------------------------------------------------------- seed: working tables
--
-- Plain tables (dropped at the end) rather than TEMPORARY ones, because MySQL cannot refer to a
-- temporary table twice in one statement.

DROP TABLE IF EXISTS seed_students, seed_events, seed_pledge_buckets, seed_chat;

-- Students in a fixed order: the demo student is 0, then S20260001 = 1, S20260002 = 2, ...
-- Event N takes the first N students as attendees, so the demo student holds every ticket.
CREATE TABLE seed_students AS
SELECT IF(email = 'demo.student@connect.hku.hk', 0, CAST(SUBSTRING(student_id, 6) AS UNSIGNED)) AS seq,
       id AS user_id, name, email
FROM users
WHERE role = 'student'
  AND (email = 'demo.student@connect.hku.hk' OR student_id REGEXP '^S2026[0-9]{4}$');

-- One row per demo event. Start times are Hong Kong wall-clock times `days_ahead` days after
-- boot, or `starts_in_hours` hours after boot (rounded up to the half hour) so one event's chat
-- room is already open. goal_amount set = fundraiser; otherwise a standard ticketed event.
CREATE TABLE seed_events (
  title VARCHAR(150) NOT NULL PRIMARY KEY,
  description TEXT NOT NULL,
  category VARCHAR(80) NOT NULL,
  organizer_email VARCHAR(160) NOT NULL,
  location VARCHAR(150) NOT NULL,
  address VARCHAR(200) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  starts_in_hours INT NULL,
  days_ahead INT NULL,
  hk_hour INT NULL,
  hk_minute INT NULL,
  capacity INT UNSIGNED NOT NULL DEFAULT 0,
  price DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  attendees INT UNSIGNED NOT NULL DEFAULT 0,
  goal_amount DECIMAL(10,2) NULL,
  image_url VARCHAR(500) NOT NULL
) DEFAULT CHARSET = utf8mb4;

INSERT INTO seed_events
  (title, description, category, organizer_email, location, address, latitude, longitude,
   starts_in_hours, days_ahead, hk_hour, hk_minute, capacity, price, attendees, goal_amount, image_url)
VALUES
  ('HKU Careers Fair 2026 — Graduate & Internship Expo',
   'Meet 60+ employers from banking, consulting, engineering and the public sector in one hall. The CV clinic runs all evening, company talks run every 20 minutes, and a free LinkedIn headshot booth is available. Open to HKU students and recent graduates — bring your student card.',
   'Career', 'hku.careers@connect.hku.hk', 'Loke Yuen Yee Hall, HKU', '3 University Drive, Pok Fu Lam, Hong Kong',
   22.2839, 114.134, 5, NULL, NULL, NULL, 150, 0, 118, NULL, 'https://picsum.photos/seed/hku-careers-fair/1200/800'),
  ('HKU Harbour Night Run 2026',
   'A relaxed 5 km along the Central Harbourfront followed by stretching and snacks, plus a 2 km family route. All paces welcome; bag drop and water stations provided. Proceeds support the HKU Athletics Club travel fund.',
   'Sports', 'hku.athletics@connect.hku.hk', 'Central Harbourfront Event Space', 'Lung Wo Road, Central, Hong Kong',
   22.2852, 114.1612, NULL, 9, 19, 30, 200, 80, 148, NULL, 'https://picsum.photos/seed/hku-harbour-run/1200/800'),
  ('Warm Winter Blanket Drive 2026',
   'We are buying blankets and winter packs for elderly residents in Sham Shui Po. Every dollar goes to supplies bought at cost through a partner NGO, and the delivery day is open to volunteers. Pledge any amount — repeated donations are welcome.',
   'Charity', 'hku.rotaract@connect.hku.hk', 'Sun Yat-sen Place, HKU', 'Main Campus, Pok Fu Lam Road, Hong Kong',
   22.2836, 114.1367, NULL, 18, 10, 0, 0, 0, 0, 15000, 'https://picsum.photos/seed/blanket-drive/1200/800'),
  ('CUHK Marathon Fundraiser 2026',
   'Run the 10 km or gather a relay team for the 21 km route around Lake Ad Excellentiam. Collect pledges per kilometre or make a one-off donation; all funds go to the CUHK Student Union emergency grant for students facing sudden medical costs.',
   'Charity', 'cuhk.su@link.cuhk.edu.hk', 'Lake Ad Excellentiam, CUHK', 'Central Avenue, CUHK, Sha Tin, Hong Kong',
   22.4196, 114.2068, NULL, 26, 7, 30, 0, 0, 0, 50000, 'https://picsum.photos/seed/cuhk-marathon/1200/800'),
  ('CUHK AI & Robotics Hackathon',
   'Twelve hours, four tracks and hardware on loan from the engineering faculty. Build a campus assistant, a warehouse robot demo or anything in between. Teams of up to four; beginners welcome at the morning bootcamp. Lunch and dinner provided.',
   'Technology', 'cuhk.su@link.cuhk.edu.hk', 'Ho Sin Hang Engineering Building, CUHK', 'Central Avenue, CUHK, Sha Tin, Hong Kong',
   22.4192, 114.206, NULL, 13, 9, 30, 100, 0, 76, NULL, 'https://picsum.photos/seed/cuhk-hackathon/1200/800'),
  ('CUHK Inter-Hall Sports Day',
   'Track and field, basketball, badminton and the famous tug-of-war final. Register with your hall team or come and cheer — the opening parade starts at 9am sharp. Free entry for all CUHK students.',
   'Sports', 'cuhk.su@link.cuhk.edu.hk', 'Peking Road Sports Field, CUHK', 'Peking Road, CUHK, Sha Tin, Hong Kong',
   22.4166, 114.21, NULL, 7, 9, 0, 240, 0, 158, NULL, 'https://picsum.photos/seed/cuhk-sports-day/1200/800'),
  ('Stray Cat Clinic Fund',
   'Funding vaccinations and neutering for the campus cat colony, run with a local vet clinic. The target covers one full clinic day and six months of food. Every pledge is listed on the wall of donors at the clinic.',
   'Charity', 'cuhk.cats@link.cuhk.edu.hk', 'University Mall, CUHK', 'University Mall, CUHK, Sha Tin, Hong Kong',
   22.418, 114.205, NULL, 21, 13, 0, 0, 0, 0, 8000, 'https://picsum.photos/seed/cat-clinic-fund/1200/800'),
  ('PolyU Music Night 2026',
   'Six student bands, one stage and a late-night acoustic set in the courtyard. Doors at 7pm, first band at 7:30pm. Ticket includes one drink; all proceeds fund the society practice rooms.',
   'Social', 'polyu.music@connect.polyu.hk', 'Shaw Auditorium, PolyU', '11 Yuk Choi Road, Hung Hom, Kowloon',
   22.3036, 114.1797, NULL, 16, 19, 30, 180, 180, 152, NULL, 'https://picsum.photos/seed/polyu-music-night/1200/800'),
  ('PolyU Design Portfolio Clinic',
   'Practical, one-to-one feedback for your next portfolio review from final-year design students and alumni. Each slot lasts 25 minutes and covers layout, storytelling and the interview walkthrough. Limited to 30 places.',
   'Career', 'polyu.design@connect.polyu.hk', 'Jockey Club Innovation Tower, PolyU', '11 Yuk Choi Road, Hung Hom, Kowloon',
   22.3053, 114.1794, NULL, 11, 14, 0, 30, 0, 30, NULL, 'https://picsum.photos/seed/polyu-portfolio-clinic/1200/800'),
  ('PolyU Startup Pitch Night',
   'Ten student teams pitch to a panel of alumni investors and founders, followed by open networking. Come to pitch, to find a co-founder, or just to see what is being built on campus. Free entry, registration required.',
   'Technology', 'polyu.entrepreneurs@connect.polyu.hk', 'PolyU InnoHub, Hung Hom', '11 Yuk Choi Road, Hung Hom, Kowloon',
   22.305, 114.18, NULL, 23, 18, 30, 120, 0, 84, NULL, 'https://picsum.photos/seed/polyu-pitch-night/1200/800');

-- Pledges per fundraiser: `pledge_count` pledges of `amount`, in bucket order. Donors cycle
-- through seed_students starting with the demo student.
CREATE TABLE seed_pledge_buckets (
  title VARCHAR(150) NOT NULL,
  bucket INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  pledge_count INT NOT NULL,
  PRIMARY KEY (title, bucket)
) DEFAULT CHARSET = utf8mb4;

INSERT INTO seed_pledge_buckets (title, bucket, amount, pledge_count) VALUES
  ('Warm Winter Blanket Drive 2026', 1, 100, 10),
  ('Warm Winter Blanket Drive 2026', 2, 200, 8),
  ('Warm Winter Blanket Drive 2026', 3, 500, 5),
  ('Warm Winter Blanket Drive 2026', 4, 888, 4),
  ('Warm Winter Blanket Drive 2026', 5, 1188, 1),
  ('CUHK Marathon Fundraiser 2026', 1, 100, 12),
  ('CUHK Marathon Fundraiser 2026', 2, 200, 14),
  ('CUHK Marathon Fundraiser 2026', 3, 500, 10),
  ('CUHK Marathon Fundraiser 2026', 4, 888, 8),
  ('CUHK Marathon Fundraiser 2026', 5, 1000, 6),
  ('CUHK Marathon Fundraiser 2026', 6, 2000, 4),
  ('Stray Cat Clinic Fund', 1, 50, 8),
  ('Stray Cat Clinic Fund', 2, 100, 6),
  ('Stray Cat Clinic Fund', 3, 200, 3),
  ('Stray Cat Clinic Fund', 4, 550, 1);

CREATE TABLE seed_chat (
  title VARCHAR(150) NOT NULL,
  position INT NOT NULL,
  author_email VARCHAR(160) NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (title, position)
) DEFAULT CHARSET = utf8mb4;

INSERT INTO seed_chat (title, position, author_email, content) VALUES
  ('HKU Careers Fair 2026 — Graduate & Internship Expo', 1, 'hku.careers@connect.hku.hk', 'Doors open at 5:30pm — bring your student card for check-in.'),
  ('HKU Careers Fair 2026 — Graduate & Internship Expo', 2, 'demo.student@connect.hku.hk', 'Will the CV clinic run all evening?'),
  ('HKU Careers Fair 2026 — Graduate & Internship Expo', 3, 'hku.careers@connect.hku.hk', 'Yes, drop in any time before 8pm. A printed copy of your CV helps.'),
  ('HKU Careers Fair 2026 — Graduate & Internship Expo', 4, 'alice.chan@connect.hku.hk', 'Any fintech employers attending this year?'),
  ('HKU Careers Fair 2026 — Graduate & Internship Expo', 5, 'hku.careers@connect.hku.hk', 'Twelve fintech booths confirmed, including two HKU spin-offs.');

-- -------------------------------------------------------------------------------- seed: events

-- The API sets the registration deadline two hours before the start (see routes/events.js).
INSERT INTO events
  (title, description, category_id, organizer_id, location, address, latitude, longitude,
   event_date, registration_deadline, event_type, capacity, available_tickets, price, goal_amount,
   status, image_url)
SELECT s.title, s.description, c.id, u.id, s.location, s.address, s.latitude, s.longitude,
       s.starts_at, s.starts_at - INTERVAL 2 HOUR,
       IF(s.goal_amount IS NULL, 'standard', 'fundraiser'),
       s.capacity, s.capacity, s.price, s.goal_amount,
       'published', s.image_url
FROM (
  SELECT seed_events.*,
         IF(starts_in_hours IS NOT NULL,
            FROM_UNIXTIME(CEIL((UNIX_TIMESTAMP() + starts_in_hours * 3600) / 1800) * 1800),
            -- Hong Kong midnight today (UTC+8), plus the days and HK time, converted back to UTC.
            TIMESTAMP(DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR))
              + INTERVAL days_ahead DAY + INTERVAL hk_hour HOUR + INTERVAL hk_minute MINUTE
              - INTERVAL 8 HOUR) AS starts_at
  FROM seed_events
) s
JOIN categories c ON c.name = s.category
JOIN users u ON u.email = s.organizer_email
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.title = s.title);

-- ------------------------------------------------------------------------------- seed: tickets

-- Attendees: event N's first N students (one ticket each; the unique key skips existing ones).
INSERT IGNORE INTO tickets
  (user_id, purchased_by, event_id, attendee_name, attendee_email, type, status, ticket_code, amount_paid, created_at)
SELECT st.user_id, st.user_id, e.id, st.name, st.email,
       IF(e.price > 0, 'paid', 'free'), 'confirmed', UUID(), e.price,
       UTC_TIMESTAMP() - INTERVAL (st.seq * 23) MINUTE
FROM seed_events s
JOIN events e ON e.title = s.title AND e.source IS NULL
JOIN seed_students st ON st.seq < s.attendees
WHERE s.goal_amount IS NULL;

-- Every organizer holds a free ticket to their own event (it does not take a seat).
-- Also works as a backfill: run it once against a database created before this rule.
INSERT INTO tickets
  (user_id, purchased_by, event_id, attendee_name, attendee_email, type, status, ticket_code, amount_paid)
SELECT e.organizer_id, e.organizer_id, e.id, u.name, u.email, 'free', 'confirmed', UUID(), 0.00
FROM events e
JOIN users u ON u.id = e.organizer_id
WHERE NOT EXISTS (SELECT 1 FROM tickets t WHERE t.user_id = e.organizer_id AND t.event_id = e.id);

-- Derive the stored counter from the confirmed attendee tickets (the organizer's is not a seat).
-- CAST to SIGNED so an over-booked row clamps to 0 instead of overflowing the UNSIGNED column.
UPDATE events e
SET e.available_tickets = GREATEST(
  CAST(e.capacity AS SIGNED) - (
    SELECT COUNT(*) FROM tickets t
    WHERE t.event_id = e.id AND t.status = 'confirmed' AND t.user_id <> e.organizer_id
  ),
  0
)
WHERE e.source IS NULL;

-- ------------------------------------------------------------------------------- seed: pledges

-- Reference codes are deterministic (PLG + event id + donor number), so a rerun skips them.
INSERT IGNORE INTO pledges (event_id, user_id, amount, reference_code, created_at)
WITH RECURSIVE seq (n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 99
),
buckets AS (
  SELECT b.*,
         SUM(b.pledge_count) OVER (PARTITION BY b.title ORDER BY b.bucket) - b.pledge_count AS first_donor
  FROM seed_pledge_buckets b
)
SELECT e.id, st.user_id, b.amount,
       CONCAT('PLG', LPAD(e.id, 4, '0'), LPAD(b.first_donor + seq.n, 5, '0')),
       UTC_TIMESTAMP() - INTERVAL ((b.first_donor + seq.n) * 97) MINUTE
FROM buckets b
JOIN seq ON seq.n < b.pledge_count
JOIN events e ON e.title = b.title AND e.source IS NULL
JOIN seed_students st ON st.seq = (b.first_donor + seq.n) % 160;

-- ------------------------------------------------------------- seed: emails, chat, bookmarks

-- Receipts "sent" for the seeded tickets and pledges, so the email log is not empty.
INSERT INTO email_log (user_id, type, reference_code, status, created_at)
SELECT t.purchased_by, 'booking', t.ticket_code, 'sent', t.created_at
FROM tickets t
JOIN events e ON e.id = t.event_id
JOIN seed_events s ON s.title = e.title
WHERE NOT EXISTS (SELECT 1 FROM email_log l WHERE l.reference_code = t.ticket_code);

INSERT INTO email_log (user_id, type, reference_code, status, created_at)
SELECT p.user_id, 'donation', p.reference_code, 'sent', p.created_at
FROM pledges p
JOIN events e ON e.id = p.event_id
JOIN seed_events s ON s.title = e.title
WHERE NOT EXISTS (SELECT 1 FROM email_log l WHERE l.reference_code = p.reference_code);

-- Messages are a few minutes apart so the chat room reads in order.
INSERT INTO chat_messages (event_id, user_id, content, created_at)
SELECT e.id, u.id, m.content, UTC_TIMESTAMP() - INTERVAL ((10 - m.position) * 7) MINUTE
FROM seed_chat m
JOIN events e ON e.title = m.title AND e.source IS NULL
JOIN users u ON u.email = m.author_email
WHERE NOT EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.event_id = e.id AND cm.content = m.content);

INSERT IGNORE INTO bookmarks (user_id, event_id)
SELECT u.id, e.id
FROM users u
JOIN events e ON e.title IN ('PolyU Music Night 2026', 'CUHK Marathon Fundraiser 2026') AND e.source IS NULL
WHERE u.email = 'demo.student@connect.hku.hk';

DROP TABLE IF EXISTS seed_students, seed_events, seed_pledge_buckets, seed_chat;

-- Refresh index statistics after the bulk seed so the optimizer picks the indexes above from
-- the first request instead of waiting for InnoDB's background recalculation.
ANALYZE TABLE users, events, tickets, pledges, chat_messages, bookmarks;
