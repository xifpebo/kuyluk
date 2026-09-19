# Self-hosted fonts

Set `FONT_PROVIDER=local` to serve fonts from this folder instead of Google Fonts
(useful for strict privacy requirements or offline intranets).

Download the Latin + Latin-ext + Cyrillic subsets (all SIL OFL 1.1) and save them as:

| File | Family / weight |
| --- | --- |
| `oswald-variable.woff2` | Oswald, variable 500–700 |
| `ibm-plex-sans-400.woff2` | IBM Plex Sans 400 |
| `ibm-plex-sans-600.woff2` | IBM Plex Sans 600 |
| `ibm-plex-sans-700.woff2` | IBM Plex Sans 700 |
| `ibm-plex-mono-400.woff2` | IBM Plex Mono 400 |

Sources: https://fonts.google.com/specimen/Oswald, https://github.com/IBM/plex

With `FONT_PROVIDER=system` no web fonts are loaded; the CSS falls back to
Bahnschrift / Segoe UI / Roboto / DejaVu, which still covers Uzbek (ʻ ʼ) and Cyrillic.
