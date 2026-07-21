-- M96: switch the semantic index to multilingual-e5-base (768d). Measured on
-- a 57-case gold set from the real mailbox: recall@1 51%->65%, MRR 0.61->0.70
-- together with the retuned fulltext fusion weight. The vec0 table dimension
-- is fixed at creation, so rebuild it; the embedding indexer re-embeds every
-- message automatically (model mismatch + missing vectors both re-pend).
DROP TABLE IF EXISTS message_vecs;
CREATE VIRTUAL TABLE message_vecs USING vec0(embedding float[768]);
