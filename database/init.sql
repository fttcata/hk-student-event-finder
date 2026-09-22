CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL,
  event_date DATE NOT NULL,
  location VARCHAR(150) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_events_date (event_date)
);

INSERT INTO events (title, category, event_date, location, description)
VALUES
  ('Campus Innovation Night', 'Technology', '2026-10-03', 'Central Campus', 'An evening of student demos and ideas.'),
  ('International Food Fair', 'Social', '2026-10-08', 'Student Union', 'Bring an appetite and a dish to share.'),
  ('Design Portfolio Workshop', 'Career', '2026-10-12', 'Media Lab', 'Practical feedback for your next portfolio review.');
