-- Wann wurde zuletzt gestupst? Überlebt Ansichtswechsel und Neustart;
-- die UI zeigt „HEUTE GESTUPST" nur, wenn der Zeitstempel von heute ist.
ALTER TABLE followups ADD COLUMN nudged_at INTEGER;
