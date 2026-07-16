-- Eulen-Gespräche: Frage-Antwort-Verläufe der Owl-View überleben den Neustart.
-- messages_json trägt den kompletten Verlauf als JSON-Array
-- [{role, content, at?, sources?}] — die Eule erinnert sich, statt zu vergessen.
CREATE TABLE owl_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_owl_conversations_updated ON owl_conversations (updated_at DESC);
