-- Triage v5: Modell-Einschätzung, ob der Kontoinhaber persönlich gemeint ist.
-- Alt-Annotationen gelten als adressiert (Default 1) — bestehende Aufgaben und
-- Vorschläge werden nicht rückwirkend ausgeblendet.
ALTER TABLE ai_annotations ADD COLUMN addressed_to_me INTEGER NOT NULL DEFAULT 1;
