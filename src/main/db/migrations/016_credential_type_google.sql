-- Der CHECK auf credential_type kennt 'oauth-google' nicht, und SQLite kann
-- Constraints nicht nachträglich ändern → accounts nach dem offiziellen
-- 12-Schritt-Verfahren neu aufbauen (FKs sind während Migrationen aus, siehe
-- migrate.ts — sonst würde DROP TABLE per CASCADE alle Mails mitlöschen).
-- Kinder-Tabellen referenzieren "accounts" namentlich; durch DROP + RENAME
-- zeigen ihre Fremdschlüssel danach wieder auf die neue Tabelle.
CREATE TABLE accounts_new (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'microsoft', 'proton', 'imap')),
  credential_type TEXT NOT NULL
    CHECK (credential_type IN ('password', 'oauth-ms', 'oauth-google', 'bridge')),
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL,
  tls_fingerprint256 TEXT,              -- Cert-Pinning (Proton Bridge)
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  color TEXT,
  created_at INTEGER NOT NULL,
  signature TEXT,
  account_name TEXT
);

INSERT INTO accounts_new (id, email, display_name, provider, credential_type,
    imap_host, imap_port, smtp_host, smtp_port, tls_fingerprint256,
    ai_enabled, color, created_at, signature, account_name)
  SELECT id, email, display_name, provider, credential_type,
    imap_host, imap_port, smtp_host, smtp_port, tls_fingerprint256,
    ai_enabled, color, created_at, signature, account_name
  FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;

-- Index und Trigger hingen an der alten Tabelle und fielen mit dem DROP
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
