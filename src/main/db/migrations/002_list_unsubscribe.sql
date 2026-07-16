-- Deterministisches Newsletter-Signal für die AI-Triage.
ALTER TABLE messages ADD COLUMN list_unsubscribe INTEGER NOT NULL DEFAULT 0;
