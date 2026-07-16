-- Eindeutiger, rein interner Postfachname. Der sichtbare Absendername bleibt display_name.
ALTER TABLE accounts ADD COLUMN account_name TEXT;

UPDATE accounts
SET account_name = CASE
  WHEN lower(email) LIKE '%@googlemail.com' OR lower(email) LIKE '%@gmail.com' THEN 'Gmail'
  WHEN lower(email) LIKE '%@hotmail.%' THEN 'Hotmail'
  WHEN lower(email) LIKE '%@outlook.%' OR lower(email) LIKE '%@live.%' THEN 'Outlook'
  WHEN provider = 'proton' THEN 'Proton'
  ELSE substr(email, 1, instr(email, '@') - 1)
END;

-- Bei mehreren bestehenden Konten mit demselben abgeleiteten Namen bleibt das
-- älteste kurz; weitere erhalten zunächst eine eindeutige Nummer und können in
-- den Einstellungen umbenannt werden.
UPDATE accounts
SET account_name = account_name || ' ' || id
WHERE id NOT IN (
  SELECT min(id) FROM accounts GROUP BY lower(account_name)
);

CREATE UNIQUE INDEX idx_accounts_account_name_nocase
  ON accounts(lower(account_name));

CREATE TRIGGER accounts_account_name_required_insert
BEFORE INSERT ON accounts
WHEN NEW.account_name IS NULL OR trim(NEW.account_name) = ''
BEGIN
  SELECT RAISE(ABORT, 'Postfachname fehlt');
END;

CREATE TRIGGER accounts_account_name_required_update
BEFORE UPDATE OF account_name ON accounts
WHEN NEW.account_name IS NULL OR trim(NEW.account_name) = ''
BEGIN
  SELECT RAISE(ABORT, 'Postfachname fehlt');
END;
