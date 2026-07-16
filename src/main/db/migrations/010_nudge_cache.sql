-- Stups-Entwürfe cachen: einmal generieren, beim nächsten Öffnen anzeigen.
ALTER TABLE followups ADD COLUMN nudge_draft TEXT;
