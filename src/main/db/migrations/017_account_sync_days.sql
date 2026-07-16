-- Sync-Zeitraum pro Konto: NULL = Standard (90 Tage Liste / 183 Tage Suche),
-- 0 = alles synchronisieren, sonst Anzahl Tage für Liste UND Suche.
ALTER TABLE accounts ADD COLUMN sync_days INTEGER;
