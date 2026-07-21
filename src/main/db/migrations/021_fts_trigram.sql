-- M91: substring-capable full-text search. The unicode61 prefix index only
-- matched token starts, so "Tafeln" could never find the German compound
-- "Großflächentafeln", and "gross" never matched "groß". The trigram
-- tokenizer matches any substring of three or more characters; case and
-- diacritics (ü→u) are folded by the tokenizer itself, while ß→ss is folded
-- in the stored text and in the query terms (ß is not a diacritic).
DROP TABLE IF EXISTS messages_fts;
CREATE VIRTUAL TABLE messages_fts USING fts5(
  subject, sender, recipients, body,
  tokenize = "trigram case_sensitive 0 remove_diacritics 1"
);

INSERT INTO messages_fts (rowid, subject, sender, recipients, body)
SELECT
  m.id,
  replace(COALESCE(m.subject, ''), 'ß', 'ss'),
  replace(trim(COALESCE(m.from_name, '') || ' ' || COALESCE(m.from_addr, '')), 'ß', 'ss'),
  replace(COALESCE(m.to_json, '') || ' ' || COALESCE(m.cc_json, ''), 'ß', 'ss'),
  replace(COALESCE(b.text_plain, m.snippet, '') || ' ' || COALESCE((
    SELECT group_concat(COALESCE(a.filename, ''), ' ')
    FROM attachments a
    WHERE a.message_id = m.id
  ), ''), 'ß', 'ss')
FROM messages m
LEFT JOIN message_bodies b ON b.message_id = m.id;
