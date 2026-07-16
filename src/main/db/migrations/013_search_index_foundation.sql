-- M13: belastbarer lokaler Suchindex und nachvollziehbarer Embedding-Stand.

-- Die bisherige contentless FTS-Tabelle konnte weder normal aktualisiert noch
-- verwaiste Zeilen loeschen. Die gespeicherte Variante bleibt voll lokal, ist
-- aber mit DELETE + INSERT deterministisch wartbar.
DROP TABLE IF EXISTS messages_fts;
CREATE VIRTUAL TABLE messages_fts USING fts5(
  subject, sender, recipients, body,
  tokenize = "unicode61 remove_diacritics 2",
  prefix = '2 3'
);

-- Bereits geladene Daten sofort wieder durchsuchbar machen. Auch Envelopes
-- ohne Body landen im Index; Anhangnamen werden Teil des Volltexts.
INSERT INTO messages_fts (rowid, subject, sender, recipients, body)
SELECT
  m.id,
  COALESCE(m.subject, ''),
  trim(COALESCE(m.from_name, '') || ' ' || COALESCE(m.from_addr, '')),
  COALESCE(m.to_json, '') || ' ' || COALESCE(m.cc_json, ''),
  COALESCE(b.text_plain, m.snippet, '') || ' ' || COALESCE((
    SELECT group_concat(COALESCE(a.filename, ''), ' ')
    FROM attachments a
    WHERE a.message_id = m.id
  ), '')
FROM messages m
LEFT JOIN message_bodies b ON b.message_id = m.id;

-- content_hash beschreibt den aktuell lokalen Mailinhalt. embedded_hash und
-- embedding_model beschreiben exakt den Vektor, der in message_vecs liegt.
-- Ein abweichender Hash macht die Nachricht automatisch wieder pending.
CREATE TABLE message_embedding_state (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  embedded_hash TEXT,
  embedding_model TEXT,
  indexed_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_embedding_state_current
  ON message_embedding_state(embedding_model, embedded_hash, content_hash);

-- Alte Vektoren hatten weder Content-Hash noch Modellversion. Ein einmaliger
-- sauberer Rebuild verhindert, dass ein inzwischen geaenderter Body als
-- aktuell gilt.
DELETE FROM message_vecs;

-- Bestehende Installationen hatten nur 90 Tage Envelopes und 30 Tage Bodies.
-- NULL zwingt den Syncer zu einer einmaligen, fortsetzbaren 183-Tage-Runde.
ALTER TABLE folders ADD COLUMN envelope_backfill_since INTEGER;
ALTER TABLE folders ADD COLUMN body_backfill_since INTEGER;
