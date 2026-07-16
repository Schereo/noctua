# Hunspell-Wörterbücher

Vendored für die Editor-Rechtschreibprüfung (Main-Prozess, `src/main/spell/`).
Geladen via `?asset`-Import und `hunspell-asm` (echtes Hunspell als WASM —
nspell schied aus, weil es deutsche Komposita nicht beherrscht).

| Dateien | Quelle | Version | Lizenz |
| --- | --- | --- | --- |
| `de.aff` / `de.dic` | [wooorm/dictionaries](https://github.com/wooorm/dictionaries) `dictionary-de` (igerman98, de_DE) | 3.0.0 | GPL-2.0 OR GPL-3.0 → `LICENSE-de.txt` |
| `en.aff` / `en.dic` | [wooorm/dictionaries](https://github.com/wooorm/dictionaries) `dictionary-en` (SCOWL, en_US) | 4.0.0 | MIT AND BSD → `LICENSE-en.txt` |

Aktualisieren: neue `index.aff`/`index.dic` aus den npm-Paketen
`dictionary-de`/`dictionary-en` kopieren und diese Tabelle anpassen.
