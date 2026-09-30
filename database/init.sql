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
  event_date DATE NOT NULL,
  registration_deadline DATETIME NULL,
  event_type ENUM('standard', 'fundraiser') NOT NULL DEFAULT 'standard',
  capacity INT UNSIGNED NOT NULL DEFAULT 0,
  price DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  goal_amount DECIMAL(10,2) NULL,
  status ENUM('draft', 'published', 'cancelled') NOT NULL DEFAULT 'published',
  image_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_events_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_events_organizer
    FOREIGN KEY (organizer_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_events_goal
    CHECK (event_type <> 'fundraiser' OR goal_amount IS NOT NULL),
  INDEX idx_events_category (category_id),
  INDEX idx_events_organizer (organizer_id),
  INDEX idx_events_date (event_date),
  INDEX idx_events_status (status),
  INDEX idx_events_type (event_type),
  INDEX idx_events_deadline (registration_deadline)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  type ENUM('free', 'paid') NOT NULL DEFAULT 'free',
  status ENUM('confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed',
  reference_code VARCHAR(24) NOT NULL,
  amount_paid DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tickets_user_event (user_id, event_id),
  UNIQUE KEY uq_tickets_reference (reference_code),
  CONSTRAINT fk_tickets_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tickets_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_tickets_event (event_id)
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
  CONSTRAINT fk_pledges_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pledges_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_pledges_amount CHECK (amount > 0),
  INDEX idx_pledges_event (event_id),
  INDEX idx_pledges_user (user_id)
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
  reference_code VARCHAR(24) NULL,
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

INSERT INTO categories (name) VALUES
  ('Technology'),
  ('Social'),
  ('Career'),
  ('Sports'),
  ('Charity')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO users (name, email, password_hash, role, student_id, university, is_verified, verification_code, verified_at)
SELECT 'Demo Organizer', 'organizer@hkstu.edu', '$2b$10$placeholderhashtokennotarealcredential0000000000000000000000', 'organizer', NULL, 'HKU', TRUE, NULL, CURRENT_TIMESTAMP
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'organizer@hkstu.edu');

INSERT INTO users (name, email, password_hash, role, student_id, university, is_verified, verification_code, verified_at)
SELECT 'Demo Student', 'student@hkstu.edu', '$2b$10$placeholderhashtokennotarealcredential0000000000000000000000', 'student', 'HK20260001', 'HKU', TRUE, NULL, CURRENT_TIMESTAMP
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'student@hkstu.edu');

INSERT INTO users (name, email, password_hash, role, student_id, university, is_verified, verification_code, verified_at)
SELECT 'Pending Student', 'pending@connect.hku.hk', '$2b$10$placeholderhashtokennotarealcredential0000000000000000000000', 'student', 'HK20260002', 'HKU', FALSE, 'VRF7K3M2Q9P4XN8D', NULL
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'pending@connect.hku.hk');

INSERT INTO events (title, description, category_id, organizer_id, location, address, latitude, longitude, event_date, registration_deadline, event_type, capacity, price, goal_amount, status)
SELECT 'Campus Innovation Night', 'An evening of student demos and ideas.', c.id, u.id, 'Central Campus', 'Main Building, Pok Fu Lam Road, HKU', 22.2830000, 114.1370000, '2026-10-03', '2026-10-02 23:59:00', 'standard', 120, 0.00, NULL, 'published'
FROM categories c, users u WHERE c.name = 'Technology' AND u.email = 'organizer@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM events e WHERE e.title = 'Campus Innovation Night');

INSERT INTO events (title, description, category_id, organizer_id, location, address, latitude, longitude, event_date, registration_deadline, event_type, capacity, price, goal_amount, status)
SELECT 'International Food Fair', 'Bring an appetite and a dish to share.', c.id, u.id, 'Student Union', 'Student Union Building, CUHK', 22.4190000, 114.2070000, '2026-10-08', '2026-10-07 23:59:00', 'standard', 200, 20.00, NULL, 'published'
FROM categories c, users u WHERE c.name = 'Social' AND u.email = 'organizer@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM events e WHERE e.title = 'International Food Fair');

INSERT INTO events (title, description, category_id, organizer_id, location, address, latitude, longitude, event_date, registration_deadline, event_type, capacity, price, goal_amount, status)
SELECT 'Design Portfolio Workshop', 'Practical feedback for your next portfolio review.', c.id, u.id, 'Media Lab', 'Innovation Tower, PolyU', 22.3070000, 114.1810000, '2026-10-12', '2026-10-11 23:59:00', 'standard', 40, 0.00, NULL, 'published'
FROM categories c, users u WHERE c.name = 'Career' AND u.email = 'organizer@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM events e WHERE e.title = 'Design Portfolio Workshop');

INSERT INTO events (title, description, category_id, organizer_id, location, address, latitude, longitude, event_date, registration_deadline, event_type, capacity, price, goal_amount, status)
SELECT 'Food Bank Drive 2026', 'Raise funds for the HK Food Bank. Every pledge counts.', c.id, u.id, 'Online + Campus Points', 'Campus Centre, HKU', 22.2840000, 114.1380000, '2026-11-15', '2026-11-14 23:59:00', 'fundraiser', 0, 0.00, 5000.00, 'published'
FROM categories c, users u WHERE c.name = 'Charity' AND u.email = 'organizer@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM events e WHERE e.title = 'Food Bank Drive 2026');

INSERT INTO tickets (user_id, event_id, type, status, reference_code, amount_paid)
SELECT u.id, e.id, 'free', 'confirmed', 'TKT9W2R4K7M1', 0.00
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'Campus Innovation Night'
AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.user_id = u.id AND t.event_id = e.id);

INSERT INTO tickets (user_id, event_id, type, status, reference_code, amount_paid)
SELECT u.id, e.id, 'paid', 'confirmed', 'TKT4H8N2P6Q3X', 20.00
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'International Food Fair'
AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.user_id = u.id AND t.event_id = e.id);

INSERT INTO tickets (user_id, event_id, type, status, reference_code, amount_paid)
SELECT u.id, e.id, 'free', 'cancelled', 'TKT7C5V9B1L8Z', 0.00
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'Design Portfolio Workshop'
AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.user_id = u.id AND t.event_id = e.id);

INSERT INTO pledges (event_id, user_id, amount, reference_code)
SELECT e.id, u.id, 100.00, 'PLG5T3Y8U2I6'
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'Food Bank Drive 2026'
AND NOT EXISTS (SELECT 1 FROM pledges p WHERE p.reference_code = 'PLG5T3Y8U2I6');

INSERT INTO pledges (event_id, user_id, amount, reference_code)
SELECT e.id, u.id, 50.00, 'PLG1A7S4D0F9'
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'Food Bank Drive 2026'
AND NOT EXISTS (SELECT 1 FROM pledges p WHERE p.reference_code = 'PLG1A7S4D0F9');

INSERT INTO pledges (event_id, user_id, amount, reference_code)
SELECT e.id, u.id, 200.00, 'PLG2G6H3J5K8'
FROM users u, events e
WHERE u.email = 'organizer@hkstu.edu' AND e.title = 'Food Bank Drive 2026'
AND NOT EXISTS (SELECT 1 FROM pledges p WHERE p.reference_code = 'PLG2G6H3J5K8');

INSERT INTO chat_messages (event_id, user_id, content)
SELECT e.id, u.id, 'See everyone at the demo night!'
FROM users u, events e
WHERE u.email = 'organizer@hkstu.edu' AND e.title = 'Campus Innovation Night'
AND NOT EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.content = 'See everyone at the demo night!');

INSERT INTO chat_messages (event_id, user_id, content)
SELECT e.id, u.id, 'Will there be food?'
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'International Food Fair'
AND NOT EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.content = 'Will there be food?');

INSERT INTO reviews (event_id, user_id, rating, comment)
SELECT e.id, u.id, 5, 'Great workshops and friendly mentors.'
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'Campus Innovation Night'
AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.event_id = e.id AND r.user_id = u.id);

INSERT INTO email_log (user_id, type, reference_code, status)
SELECT u.id, 'booking', 'TKT9W2R4K7M1', 'sent'
FROM users u
WHERE u.email = 'student@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM email_log el WHERE el.reference_code = 'TKT9W2R4K7M1');

INSERT INTO email_log (user_id, type, reference_code, status)
SELECT u.id, 'donation', 'PLG5T3Y8U2I6', 'sent'
FROM users u
WHERE u.email = 'student@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM email_log el WHERE el.reference_code = 'PLG5T3Y8U2I6');

INSERT INTO bookmarks (user_id, event_id)
SELECT u.id, e.id
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'International Food Fair'
AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id = u.id AND b.event_id = e.id);
