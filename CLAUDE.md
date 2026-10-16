# Word Archive (working name) — Project Rules

**What this is:** a web app where people keep the prophetic words spoken over them — from voice memos, photos of notes and typed text — and see them on a timeline and a map of shared themes.
**Source of truth for scope:** `docs/SPEC.md`. To change behaviour, update the spec first, then the code.

## 1. Working with the project owner

- Personal working preferences live in each contributor's own private (global) instructions, not in this public repo.
- Explain decisions by **why** and **impact on the user**, in plain language.
- Never ask anyone to type a password, API key or token into a chat. Secrets go only into the Vercel / Supabase dashboards, entered by the owner.

## 2. Product principle (non-negotiable)

The app **records, classifies and tags. AI never interprets.**
- Store words exactly as given. AI may transcribe (audio), read text (photos), and **suggest** themes, explicitly cited scripture references and the time phrase used. The user confirms every suggestion.
- No AI summaries, meanings, "insights", reflection prompts or pattern commentary — in the UI, in emails, anywhere.
- Status (pending / unfolding / fulfilled / unclear) and reflections belong to the user only.

## 3. Privacy & compliance rules

Chosen architecture: standard cloud (see spec §7). The content is religious-belief data = **UK GDPR special category**.
- Explicit, separate consent at sign-up (not bundled with terms). Record `consent_at` + `consent_version`.
- Data stays in UK/EU regions. Every table has Row Level Security: a user can only ever read their own rows.
- **Never log content** (verbatim text, transcripts, file names, speaker names) — not in server logs, analytics, error trackers or AI prompts' debug output.
- No admin screen that shows user content. Operator database access is for maintenance only and is documented.
- AI providers: only those whose terms say inputs are not used for training; minimal retention; data processing agreement in place.
- AI calls go through OpenRouter (the owner's decision, spec §7) and only through the adapters in `lib/ai/`. **Every** OpenRouter request includes `provider: { zdr: true, data_collection: "deny" }`, enforced by a unit test. Never add a fallback that drops these.
- Content leaves the user's device only on an explicit user action (e.g. tapping Transcribe) after the transcription consent (spec §7c). AI server routes never store or log request bodies, provider responses, text or file names. Log status codes and model ids only.
- Paid AI routes on the public site need the tester code (`TESTER_CODE`) and must fail closed if it isn't configured.
- Users can export everything and delete their account (hard delete of rows and files).
- Development and tests use **fictional data only**. Claude never reads real users' production content.
- Secrets live only in environment variables (Vercel / Supabase). Never in the repo, docs, logs or chat.

## 4. Folder structure & naming

- `app/` Next.js App Router routes (TypeScript). `components/` React components (PascalCase files).
- `lib/` domain logic: `lib/store/` (storage behind one interface: `local` = IndexedDB demo mode, `cloud` = Supabase), `lib/suggest.ts` (rule-based suggestions), `lib/dates.ts`, `lib/ai/` (provider adapters behind one interface: `openrouter.ts` is server-only, `client.ts` runs in the browser), `lib/audio/` (browser-side decoding, WAV encoding and splitting of recordings), `lib/roadmap/` (timeline + constellation UI, owned by this project).
- `supabase/migrations/` SQL migrations, numbered `NNNN_description.sql`. Never edit an applied migration; add a new one.
- `docs/` spec, privacy notice draft, DPIA draft, decisions log (`docs/decisions.md`, one entry per decision: date, decision, why).
- `tests/` unit + end-to-end tests with fictional fixtures only.
- Temporary/local files: `.private/` (git-ignored). Clean it at the end of each work session.

## 5. Engineering rules

- Stack: Next.js (App Router, TypeScript), Supabase (Auth, Postgres, Storage), Vercel. Design system carried over from Prophetic Words: dark theme, one warm-gold accent, Plus Jakarta Sans, no em dashes in UI text.
- UI language: English only for v1 (content in any language must still work).
- Definition of done for any change: typecheck, lint, tests and build all pass; new behaviour covered by a test; UI checked at 375 / 768 / 1280 px; keyboard and reduced-motion usable.
- Root-cause fixes only; never silence an error to make something pass.
- **Open source (decided 16 Oct 2026):** the code is public on GitHub under the MIT licence. The repo holds code, docs and fictional test data only. Never commit keys, `.env` files, real words, real names, account or deployment IDs. Before every publish, Claude runs a leak scan of all tracked files. Settings go in `.env.example` with empty values only.
- Git: commit messages in English, describing intent. Claude never pushes automatically. Deployment only via the command documented in the README (run by the owner), never via git push.
- Exception: when the owner explicitly asks, Claude may create a **preview** deployment (never production) in the owner's Vercel account through the Vercel connector. The upload contains source code only (no user data exists server-side in demo mode) and pins dependency versions to the ones that passed `npm run check`. Every file is integrity-checked (SHA-1) on upload.
  - Platform fact (learned 2026-09-29): Vercel always makes a **new project's first deployment production**, with a public `<project>.vercel.app` address, even when no target is given. Before deploying a new project, tell the owner this in one line. Later deployments without a target are previews.
  - Demo mode only: a public address is acceptable because the server holds no user data. Before cloud mode (Phase 1), turn on Vercel Deployment Protection or put the app behind sign-in. Server functions are pinned to London by `"regions": ["lhr1"]` in `vercel.json` (the first deploy, before that file existed, ran in iad1, US). Don't use Next's `preferredRegion` export; it is deprecated.
