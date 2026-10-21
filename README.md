# Linked Quran for Obsidian

Read and study the Quran in your Obsidian vault the way you do on [linkedquran.com](https://linkedquran.com):
each verse as a card with your own note, translation tabs, word by word, and the site's study layers
(related verses, rulings, topics, prayers and more). Notes you publish sync with your account on the site;
drafts you write in the vault stay there.

## What it does

- Shows Linked Quran surah pages as verse cards: your note inside the verse box, a **Publish** button,
  translation tabs, and `/2:255` to insert a verse.
- Draws the site's public layers under each verse; the buttons in the **Layers** box turn them on and off.
- Syncs the notes you publish with linkedquran.com both ways. Drafts and your own translation written on the site
  come down to the vault too (a draft is marked **Draft on site**); if one later changes on the site, the site's text
  arrives as a separate **On site now** block next to yours and you decide which to keep. With your key you can also
  agree, report, vote and suggest from the layers, as on the site.
- Sets up your vault without a download: choose translations, word by word and Arabic in the settings and close
  them, and the surahs missing from your vault (all 114) are written from the site, with your favourites,
  bookmarks and collections.
- **Refresh site text** rewrites the Arabic, word by word and translations on your surah pages from the site
  without touching your notes; **Add missing surahs** writes the surahs that aren't in your vault yet.
- A surah navigator in the left sidebar.

## Account

Surah pages come from your linkedquran.com account: generate a sync key at **linkedquran.com/hesap → Sync** and
paste it into the plugin settings, or open an `obsidian://linkedquran?key=…` link with it (if the vault already has
a different key, the plugin asks before replacing it). Syncing, publishing, actions on layers, setting up surahs,
**Refresh site text** and **Add missing surahs** all need the key. Without a key the plugin only draws the
site's public layers on surah pages already in your vault.

## Installation

1. In Obsidian, open **Settings → Community plugins** and turn off restricted mode.
2. Select **Browse**, search for **Linked Quran**, install and enable it.
3. Paste your sync key into **Settings → Linked Quran**, choose your translations and close the settings.

Manual install: copy `main.js`, `manifest.json` and `styles.css` from the latest release into
`<vault>/.obsidian/plugins/linkedquran/`, then enable the plugin. Requires Obsidian 1.8.7 or newer.

## Network use

Every request goes to the site address in the plugin settings (default `https://linkedquran.com`).
There is no telemetry and no other server.

| Request | Key | What is sent | Why |
| --- | --- | --- | --- |
| `POST /api/kasa-senkron` | yes | Only the Publish area of each Linked Quran surah page (with its path and sync state); drafts and other files are never sent | Sync published notes both ways |
| `GET /api/lq/v1/kasa/{surah}` | yes | Surah number, the text you chose in the settings (translations, word by word, Arabic) and the neighbouring surahs | Setting up missing surahs, Refresh site text; the first request of a setup also returns your index and collections (favourites, bookmarks, last position) |
| `POST /api/lq/v1/eylem` | yes | The action (agree, report, vote, suggest), the layer item it is about, and any reason or note you type into it | Actions on layers |
| `GET /api/lq/v1/en/{surah}` | no | Surah number only | The site's public layers |
| `GET /kuran/dizin.json?v=…` | no | Nothing (`v` is a timestamp, so the catalog is never stale) | Translation and word-by-word catalog for the settings |
| `GET /kuran/kelime/{surah}.json` | no | Nothing | The words of a verse, for the suggestion form |
| `GET /obsidian/linkedquran/linkedquran.css` | no | Nothing | On startup, if your vault has the `linkedquran.css` snippet, it is updated to the site's current copy; your two size values are kept and the old file is saved as `linkedquran.css.bak`. When missing surahs are set up and the vault has no such snippet, it is written and turned on |

To find Linked Quran surah pages, the plugin goes through the vault's list of Markdown files and checks each file's
path and `type: linkedquran/surah` property (from Obsidian's metadata cache). It reads the contents of surah pages only,
never of other notes.

The plugin writes only inside your vault: Linked Quran surah pages (and, when it sets up surahs in a vault without them, the `Linked Quran` folder with its index files and `Collections`, only where those files don't exist yet) and, as above, `.obsidian/snippets/linkedquran.css`. Pending actions and per-device timestamps are kept in Obsidian's local storage on that device.

Privacy policy: [linkedquran.com/datenschutz](https://linkedquran.com/datenschutz).

## Source

This repository holds the released plugin files. The plugin is plain JavaScript without a build step; `main.js`
is the source.

Each release is published by `.github/workflows/release.yml` with a GitHub artifact attestation for `main.js`,
`manifest.json` and `styles.css`. To check a downloaded file:
`gh attestation verify main.js --repo qurancentered/linkedquran-obsidian`.

## License

[MIT](LICENSE)
