-- Entwürfe überleben Threadwechsel und Neustart: ein Entwurf je Thread.
-- display_name/subject werden beim Speichern aus messages übernommen, damit
-- die Eulen-Leiste auch Entwürfe archivierter Threads beschriften kann.
CREATE TABLE drafts (
  thread_key TEXT PRIMARY KEY,
  display_name TEXT,
  subject TEXT,
  text TEXT NOT NULL,
  html TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
