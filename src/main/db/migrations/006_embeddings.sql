-- Vektor-Index für semantische Suche (sqlite-vec; Extension wird beim
-- DB-Open geladen). rowid = messages.id, Embeddings: multilingual-e5-small.
CREATE VIRTUAL TABLE message_vecs USING vec0(embedding float[384]);
