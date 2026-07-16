-- Eigene gesendete Nachrichten und kontenuebergreifende Selbst-Sends sind
-- keine Aufgaben fuer den Nutzer. Bestehende Fehlklassifikationen bereinigen.
DELETE FROM tasks
WHERE source_kind = 'mail'
  AND source_id IN (
    SELECT m.id
    FROM messages m
    JOIN folders f ON f.id = m.folder_id
    WHERE f.special_use = '\Sent'
       OR EXISTS (
         SELECT 1 FROM accounts own WHERE lower(own.email) = lower(m.from_addr)
       )
  );

UPDATE ai_annotations
SET action_items_json = '[]', needs_reply = 0
WHERE message_id IN (
  SELECT m.id
  FROM messages m
  JOIN folders f ON f.id = m.folder_id
  WHERE f.special_use = '\Sent'
     OR EXISTS (
       SELECT 1 FROM accounts own WHERE lower(own.email) = lower(m.from_addr)
     )
);
