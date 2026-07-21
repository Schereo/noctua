/**
 * The trigram tokenizer folds case and diacritics (ü→u) on both the indexed
 * text and the query — but ß is not a diacritic, so sharp-s must be folded
 * manually and IDENTICALLY at index time (ingest, migration 021) and query
 * time (buildFtsMatch, owl retrieval).
 */
export function foldSharpS(text: string): string {
  return text.replaceAll('ß', 'ss').replaceAll('ẞ', 'SS')
}
