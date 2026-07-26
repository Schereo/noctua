-- Recipient suggestions matched contacts by display name with a correlated
-- `EXISTS (SELECT 1 FROM messages …)` evaluated once per contact row, plus a
-- second correlated subquery for the name itself. With 3k contacts and 42k
-- messages that is ~130M row probes without a usable index — measured at
-- 15-90 seconds of synchronous main-process work per call, and the recipient
-- field fires one call per 120ms of typing. The name now lives on
-- contact_stats, so the suggestion query never touches `messages` again.
ALTER TABLE contact_stats ADD COLUMN display_name TEXT;

-- Also serves the sender inventory of the fuzzy-sender channel, which groups
-- by lower(from_addr); from_name makes it covering for the backfill below.
CREATE INDEX IF NOT EXISTS idx_msg_from_addr_lower ON messages(lower(from_addr), from_name);

UPDATE contact_stats SET display_name = (
  SELECT m.from_name FROM messages m
  WHERE lower(m.from_addr) = contact_stats.addr AND m.from_name IS NOT NULL
  GROUP BY m.from_name ORDER BY count(*) DESC LIMIT 1
);
