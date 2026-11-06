-- Run this once in the Supabase SQL Editor if the database was initialized
-- before the demo seed data was removed from init.sql.

BEGIN;

DELETE FROM bookmarks
WHERE user_id IN (
  SELECT id FROM users
  WHERE email IN (
    'organizer@hkstu.edu',
    'student@hkstu.edu',
    'pending@connect.hku.hk',
    'cedars-scraper@campushub.local'
  )
)
OR event_id IN (
  SELECT id FROM events
  WHERE title IN (
    'Campus Innovation Night',
    'International Food Fair',
    'Design Portfolio Workshop',
    'Food Bank Drive 2026'
  )
);

DELETE FROM email_log
WHERE user_id IN (
  SELECT id FROM users
  WHERE email IN (
    'organizer@hkstu.edu',
    'student@hkstu.edu',
    'pending@connect.hku.hk',
    'cedars-scraper@campushub.local'
  )
);

DELETE FROM reviews
WHERE event_id IN (
  SELECT id FROM events
  WHERE title IN (
    'Campus Innovation Night',
    'International Food Fair',
    'Design Portfolio Workshop',
    'Food Bank Drive 2026'
  )
);

DELETE FROM chat_messages
WHERE event_id IN (
  SELECT id FROM events
  WHERE title IN (
    'Campus Innovation Night',
    'International Food Fair',
    'Design Portfolio Workshop',
    'Food Bank Drive 2026'
  )
);

DELETE FROM pledges
WHERE event_id IN (
  SELECT id FROM events
  WHERE title IN (
    'Campus Innovation Night',
    'International Food Fair',
    'Design Portfolio Workshop',
    'Food Bank Drive 2026'
  )
);

DELETE FROM tickets
WHERE event_id IN (
  SELECT id FROM events
  WHERE title IN (
    'Campus Innovation Night',
    'International Food Fair',
    'Design Portfolio Workshop',
    'Food Bank Drive 2026'
  )
);

DELETE FROM events
WHERE title IN (
  'Campus Innovation Night',
  'International Food Fair',
  'Design Portfolio Workshop',
  'Food Bank Drive 2026'
);

DELETE FROM users
WHERE email IN (
  'organizer@hkstu.edu',
  'student@hkstu.edu',
  'pending@connect.hku.hk',
  'cedars-scraper@campushub.local'
);

COMMIT;
