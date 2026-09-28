CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'organizer', 'admin') NOT NULL DEFAULT 'student',
  student_id VARCHAR(40) NULL,
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
  event_date DATE NOT NULL,
  capacity INT UNSIGNED NOT NULL DEFAULT 0,
  price DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  status ENUM('draft', 'published', 'cancelled') NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_events_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_events_organizer
    FOREIGN KEY (organizer_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_events_category (category_id),
  INDEX idx_events_organizer (organizer_id),
  INDEX idx_events_date (event_date),
  INDEX idx_events_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rsvps (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  status ENUM('going', 'maybe', 'cancelled') NOT NULL DEFAULT 'going',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rsvps_user_event (user_id, event_id),
  CONSTRAINT fk_rsvps_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rsvps_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_rsvps_event (event_id)
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
  ('Sports')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO users (name, email, password_hash, role, student_id) VALUES
  ('Demo Organizer', 'organizer@hkstu.edu', '$2b$10$placeholderhashtokennotarealcredential0000000000000000000000', 'organizer', NULL),
  ('Demo Student', 'student@hkstu.edu', '$2b$10$placeholderhashtokennotarealcredential0000000000000000000000', 'student', 'HK20260001')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO events (title, description, category_id, organizer_id, location, event_date, capacity, price, status)
SELECT 'Campus Innovation Night', 'An evening of student demos and ideas.', c.id, u.id, 'Central Campus', '2026-10-03', 120, 0.00, 'published'
FROM categories c, users u WHERE c.name = 'Technology' AND u.email = 'organizer@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM events e WHERE e.title = 'Campus Innovation Night');

INSERT INTO events (title, description, category_id, organizer_id, location, event_date, capacity, price, status)
SELECT 'International Food Fair', 'Bring an appetite and a dish to share.', c.id, u.id, 'Student Union', '2026-10-08', 200, 20.00, 'published'
FROM categories c, users u WHERE c.name = 'Social' AND u.email = 'organizer@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM events e WHERE e.title = 'International Food Fair');

INSERT INTO events (title, description, category_id, organizer_id, location, event_date, capacity, price, status)
SELECT 'Design Portfolio Workshop', 'Practical feedback for your next portfolio review.', c.id, u.id, 'Media Lab', '2026-10-12', 40, 0.00, 'published'
FROM categories c, users u WHERE c.name = 'Career' AND u.email = 'organizer@hkstu.edu'
AND NOT EXISTS (SELECT 1 FROM events e WHERE e.title = 'Design Portfolio Workshop');

INSERT INTO rsvps (user_id, event_id, status)
SELECT u.id, e.id, 'going'
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'Campus Innovation Night'
AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.user_id = u.id AND r.event_id = e.id);

INSERT INTO rsvps (user_id, event_id, status)
SELECT u.id, e.id, 'maybe'
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'Design Portfolio Workshop'
AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.user_id = u.id AND r.event_id = e.id);

INSERT INTO bookmarks (user_id, event_id)
SELECT u.id, e.id
FROM users u, events e
WHERE u.email = 'student@hkstu.edu' AND e.title = 'International Food Fair'
AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id = u.id AND b.event_id = e.id);
