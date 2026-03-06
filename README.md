# Lead Aggregator

A tool for sports partnership teams that need to cross-reference brand target lists across multiple properties.

Upload Excel or CSV files from each property. The tool deduplicates brands automatically — "Nike Inc.", "NIKE GROUP LLC", and "Nike" all resolve to the same company. Every brand shows which properties have it on their list, and any notes you've captured about the relationship.

**[Live demo →](https://lead-aggregator-oss.vercel.app)** *(deploy your own — see instructions below)*

---

## The problem it solves

If you manage partnerships across multiple properties (teams, leagues, events), you probably have a spreadsheet per property with hundreds of target brands. Finding which brands appear on multiple lists — potential multi-property deals — means opening every file and manually cross-referencing.

This tool does that automatically.

---

## How it works

1. **Add your properties** — each team, league, or event you work with
2. **Upload a target list** for each property (Excel or CSV)
3. **Review the preview** — see exactly what's new vs. what's already in the system before saving
4. **Browse the deduplicated brand list** — click any brand to see which properties have it and what notes each has captured

### Deduplication logic

The core function is in [api/_normalize.js](api/_normalize.js). It strips legal suffixes, lowercases, and removes punctuation before comparing. "Nike, Inc." and "NIKE GROUP LLC" both normalize to `"nike"` — so they're treated as the same company.

### Two-step upload

Uploading a file doesn't immediately save anything. It returns a **preview** showing:
- **New brands**: not in the system yet — will be inserted
- **Matched brands**: already in the system under a different property — will be linked

You confirm before anything is written. This is intentional — it gives you a chance to catch bad data before it lands.

### Storage

This version uses **in-memory storage** — no database setup required. Data lives in the running server process and resets when the server restarts. That's a deliberate simplification for this demo.

One Vercel-specific detail worth knowing: because serverless functions are stateless by default, all six API routes live in a single file ([api/index.js](api/index.js)) rather than separate files. That way they share the same module scope — and the same in-memory store. If they were separate files, each would get its own isolated store object and data wouldn't persist across requests.

The production version uses Firebase Firestore. To add persistence, swap `api/_store.js` for a Firestore client — nothing else needs to change.

---

## File format

Your Excel/CSV file needs:
- A column with "company", "brand", "account", "organization", or "name" in the header
- Optionally, a column with "note", "context", "reason", "comment", or "description" in the header

For Excel files, the sheet must be named **"target list"** (case-insensitive). CSV files are read in full.

A sample file with intentional duplicates is included at [sample-data/target-list.csv](sample-data/target-list.csv).

---

## API routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/properties` | List all properties |
| POST | `/api/properties` | Create a property `{ name }` |
| DELETE | `/api/properties/:id` | Delete a property + remove its appearances from all brands |
| GET | `/api/brands` | List all brands |
| POST | `/api/upload` | Parse a file → return preview (no writes yet) |
| POST | `/api/upload/confirm` | Commit a preview to the store |

---

## Deploy it yourself

No accounts required beyond Vercel (free tier). No environment variables needed.

### Option A — GitHub fork (fastest)

1. Fork this repo on GitHub
2. Go to [vercel.com](https://vercel.com), create a free account, and import the forked repo
3. Click **Deploy** — done

### Option B — No GitHub account

1. Download the ZIP directly (no login needed):
   ```
   https://github.com/griffmak/lead-aggregator/archive/refs/heads/main.zip
   ```
2. Unzip it, then run:
   ```bash
   npm install
   npx vercel
   ```
   Follow the prompts — Vercel will give you a live URL.

---

## How this was built

I was working across three properties and realized I couldn't answer a basic question — "which brands are on every property's target list?" — without opening three separate spreadsheets and comparing manually.

I described the problem to Claude. We designed the architecture together: serverless API on Vercel, normalized deduplication, a two-step upload to prevent accidental writes. Built it one route at a time, tested each step before moving to the next. Total time: one session.

**What the AI collaboration looked like:**
- I described the problem and constraints (Vercel serverless, no heavyweight dependencies)
- Claude proposed the data model and dedup approach, explained the tradeoffs
- We built each route together — I made decisions on behavior, Claude handled implementation
- When something didn't work as expected, we diagnosed it together

The code is heavily commented throughout — both because it's an educational resource and because it reflects how the session actually went: explaining decisions as we made them.

---

## Extending it

A few natural next steps if you want to build on this:

**Add persistence** — swap `api/_store.js` for a Firebase Firestore client. The store module exports a simple `{ properties, brands }` object; replace it with Firestore reads/writes and nothing else needs to change.

**Add AI summaries** — once you have multi-property data, a language model can summarize cross-property relationship signals per brand. The production version has this using OpenAI gpt-4o-mini on a cached, invalidation-aware endpoint.

**Add authentication** — right now this is open to anyone with the URL. Adding Vercel's built-in auth or a simple token check to each API route makes it private.

---

## Stack

- **Runtime**: Node.js serverless functions (Vercel)
- **File parsing**: [xlsx](https://www.npmjs.com/package/xlsx) — handles both Excel and CSV
- **Storage**: in-memory (this version) / Firebase Firestore (production version)
- **Frontend**: plain HTML/CSS/JS — no framework, no build step
