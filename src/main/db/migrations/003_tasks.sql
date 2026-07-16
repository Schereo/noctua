-- Aufgaben, automatisch aus Mails (und später Signal) extrahiert.
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('mail', 'signal', 'manual')),
  source_id INTEGER,
  account_id INTEGER,
  title TEXT NOT NULL,
  notes TEXT,
  due_date TEXT,                        -- 'YYYY-MM-DD' oder NULL
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX idx_tasks_status ON tasks(status, due_date);
-- Dedupe: Re-Scans derselben Quelle erzeugen keine Duplikate.
CREATE UNIQUE INDEX idx_tasks_source ON tasks(source_kind, source_id, title);
