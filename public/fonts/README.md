# Self-hosted fonts

The site serves its fonts from this folder by default (`FONT_PROVIDER=local`),
so no request goes to third-party font CDNs.

| Family | Files | License |
| --- | --- | --- |
| Oswald (variable, 200–700) | `oswald-*-wght-normal.woff2` | SIL OFL 1.1 |
| IBM Plex Sans 400/500/600/700 | `ibm-plex-sans-*.woff2` | SIL OFL 1.1 |
| IBM Plex Mono 400/500/600 | `ibm-plex-mono-*.woff2` | SIL OFL 1.1 |

Files come from the Fontsource npm packages (`@fontsource-variable/oswald`,
`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`), Latin, Latin
Extended (Uzbek ʻ ʼ) and Cyrillic subsets; `fonts.css` loads each subset only
when a page needs it (`unicode-range`).

Other options: `FONT_PROVIDER=google` (Google Fonts CDN; the CSP is relaxed
for it automatically) or `FONT_PROVIDER=system` (no web fonts; falls back to
Bahnschrift / Segoe UI / Roboto / DejaVu).
