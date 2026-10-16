# Word Archive — Product Spec (v0.1, 29 Sep 2026)

## 1. Problem
People who receive prophetic words collect them over years from many people: voice memos, notebook pages, screenshots, chat messages. They end up scattered. You can't see them side by side, you can't see what keeps being said by different people, and you can't track what has come to pass.

## 2. Who it's for (v1)
Christians who receive prophetic words and want to keep them faithfully. First testers: 10 to 20 people from the owner's own network.

## 3. Product principle
Record, classify, tag. **AI never interprets.** It transcribes, reads text and suggests tags, and the user confirms each one. This is the main difference from competitors that sell "AI insights".

## 4. What success looks like (2 to 4 week test)
| Signal | Target |
|---|---|
| Activation: testers who save ≥ 3 words in week 1 (bulk import counts) | ≥ 70% |
| Return: testers who add or open a word in weeks 3 to 4 | ≥ 40% |
| Trust in transcription: saved transcripts needing only small edits | ≥ 80% |
| Tag usefulness: AI tag suggestions kept (as is or edited) | ≥ 60% |
| Qualitative | 5 short interviews: what they value most, what's missing, would they pay |

Metrics are counts and ratios only. No content is ever used for measurement.

## 5. Scope
**In v1**
1. **Sign up / sign in** by email link (no passwords). A separate explicit consent step (religious-belief data + AI processing) and a plain-language privacy notice.
2. **Add a word** in three ways: record or upload **audio**; take or upload **photos** (handwritten notes, screenshots); **paste or type text**.
3. **Details:** date (taken from the file's metadata, or from filenames like iPhone Voice Memos' "29 Jul, 18.12", always editable, because processed audio often loses its metadata), who spoke it (optional, default "Unnamed speaker"), context (optional).
4. **AI step:** audio becomes a transcript, photos become text. The AI then *suggests* themes (reusing the user's existing tags first), scripture the speaker explicitly cited, and the time phrase used.
5. **Review screen:** the user corrects the text, keeps or removes each suggestion, then saves. Nothing is saved without this confirmation.
6. **Bulk import:** pick many files at once. They are processed in a queue and reviewed one by one ("3 of 12").
7. **Views** (carried over from Prophetic Words): timeline, 3D constellation, theme bars, reading panel with "Shares tags with", status change, the user's own reflections, original audio or photo playback.
8. **My data:** export everything (JSON + original files), delete account (removes all rows and files).
9. **Limits for v1:** adults only (18+, stated at sign-up). Audio up to 60 minutes / 100 MB per file. Photos without readable text are kept as attachments only (no AI description, since describing an image would be interpretation).

**Not in v1:** sharing, groups or churches, payments, native iOS/Android apps, Chinese UI (Chinese *content* still works), offline mode, end-to-end encryption, AI chat or insights, notifications, any admin screen showing content, splitting one recording that contains several speakers into several words (strong candidate for v2).

## 6. Key flows
- **First run:** sign in → consent → "Bring in what you already have" (bulk import) or "Add your first word" → review → timeline.
- **Add one word:** tap **+** → choose Record / Photo / Text → processing ("Transcribing, about 30 s for a 5-minute recording") → review → save → it appears on the timeline, with links to words that share tags.
- **Errors guide the next step:** e.g. "Transcription failed. Your recording is saved. Retry, or type the words yourself." The original file is never lost.

## 7. Architecture (standard cloud, per the owner's decision on 29 Sep 2026)
- **App:** Next.js (App Router, TypeScript) on Vercel. Mobile-first web app that can be added to the home screen.
- **Backend:** Supabase in a **UK/EU region**: Auth (email links), Postgres with Row Level Security, private Storage bucket (files under `userId/…`, served by short-lived signed links).
- **AI jobs:** a server function takes a queued job, fetches the file, calls the provider, and stores a *draft* for the review screen. Long audio runs as a background job with progress polling.
- **AI providers** (one adapter interface, so a provider can be swapped):
  - speech-to-text that handles English and Chinese, accents and background music;
  - a vision + language model to read photos and suggest tags.
  - Requirements: inputs not used for training, minimal retention, DPA available, UK/EU processing preferred. **Final choice in Phase 0**, after comparing providers' current terms and prices.
  - **Decision (8 Oct 2026, owner): every AI call goes through OpenRouter.** One key and one bill. Models can be switched by a setting, without code changes. Speech-to-text model: `mistralai/voxtral-mini-transcribe` (setting `TRANSCRIBE_MODEL`).
  - **Privacy routing is mandatory.** Every OpenRouter request sends `provider: { zdr: true, data_collection: "deny" }`, so it is only served by endpoints that keep nothing and don't train. If no such endpoint exists, the request fails. It never falls back to a less private route.
  - **Trade-off accepted:** OpenRouter is a US company and an extra processor between the app and the model. Its EU-only routing (`eu.openrouter.ai`) is a paid Business-plan feature, so audio may pass through US infrastructure in transit. This goes in the DPIA as a transfer. Switching later only means changing the `OPENROUTER_BASE_URL` setting.
- **Honest privacy statement for users:** "Your words are stored encrypted by our providers in the UK/EU and are only visible to your account. They are sent to our AI providers only to transcribe and suggest tags, and are not used to train AI. The operator does not view your content, but it is not end-to-end encrypted."

## 7b. Demo mode (built first, runs without any accounts)
So the product can be tested before Phase 0 is finished, the app has two storage modes behind one interface (`lib/store`):
- **Demo mode (default until cloud keys exist):** everything is stored only in the user's own browser (IndexedDB). A visible "Demo mode" label and the My data page say so. The only exception is §7c: a recording leaves the device when the user taps **Transcribe**, and only the text comes back.
- **Cloud mode (Phase 0 onwards):** Supabase + AI providers as in §7.

Until an AI provider is connected, the app says so plainly and asks the user to paste the transcript (e.g. iPhone Voice Memos → Copy Transcript) or type the text from a photo. Suggestions come from transparent rules, labelled "Suggested from words in the text":
- **Scripture:** only explicit references with chapter numbers (e.g. "Proverbs 3:5-6", "1 Cor 14:33").
- **Timeframe:** the literal time phrase used (e.g. "this season", "in due time", "within two years").
- **Themes:** the user's existing tags first, then a small starter vocabulary matched on literal keywords (e.g. "provide", "supply" → provision).
The rules stay useful after AI is connected: explicit scripture references are detected by the rule, never by AI guesswork.

Build order: demo mode with every v1 screen and flow → Phase 0 (accounts, provider choice) → cloud adapter + AI adapters, tested live.

## 7c. Transcription (works in demo mode, added 8 Oct 2026)
**User goal:** don't type out a 10-minute memo. Get the words, check them, save.
- **Explicit and per action.** Nothing is sent until the user taps **Transcribe** on a recording. The first time, a dialog explains in one paragraph where the recording goes (OpenRouter → the speech model), that it isn't kept or used for training, that only the text comes back, and that other people's voices may be in it. The user confirms, and the choice is remembered in this browser (`transcribeConsentAt`, versioned). My data shows it and lets the user withdraw it.
- **Tester code.** The site is public, so the Transcribe button needs a tester code (setting `TESTER_CODE`). The tester enters it once in the same dialog, and the browser remembers it. A wrong code says so and asks again. Cost guard: the owner sets a credit limit on the OpenRouter key. The server also accepts at most 3.8 MB per request.
- **Long recordings are split, invisibly.** Vercel rejects request bodies over 4.5 MB. The browser decodes the recording, converts it to 16 kHz mono and cuts it at the quietest moment between 80 and 115 seconds, so words aren't cut in half. It sends the pieces (WAV, under 3.8 MB each) three at a time and joins the text in order. If the browser can't decode the file, a file under 3.8 MB is sent as it is. Otherwise the user is told to try Safari or save it as .m4a/.mp3.
- **Progress and recovery.** "Preparing the recording…", then "Transcribing… 3 of 8". A Stop button. If a piece fails, the finished pieces are kept and Retry continues from there. Brief network or busy errors are retried once automatically.
- **Verbatim only.** The model's text is inserted as returned: pieces are joined with a space, with no cleanup, summary or correction. If the words box already has text, the transcript is added after a blank line, so nothing typed is lost. The box is labelled "Machine draft. Play the recording and correct anything it misheard." If the user saves without changing it, it is stored as `transcript_quality: rough-auto`, and the reading panel keeps showing the existing "Rough machine transcript" note. Any edit makes it `verified`.
- **Server:** `POST /api/ai/transcribe` runs in London (`"regions": ["lhr1"]` in `vercel.json`, which covers every server function). It checks the tester code, size and format, forwards to OpenRouter with the privacy routing from §7, and returns `{ text }`. It never stores or logs audio, text or file names; logs hold only status codes and the model id.
- **Errors guide the next step:** a wrong code asks again; "not set up on this site yet, paste the transcript instead"; "unavailable right now, your recording is still here, try later or paste the words"; "the test budget has run out, tell the person who invited you"; "the service is busy, try again in a minute"; "no connection, Retry continues from part N".
- **Settings (Vercel → Environment Variables, entered by the owner):** `OPENROUTER_API_KEY`, `TESTER_CODE`, optional `TRANSCRIBE_MODEL`, optional `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`; tests point it at a fake server; later `https://eu.openrouter.ai/api/v1` for EU-only routing).

## 8. Data model
- `profiles` (id, created_at, consent_at, consent_version)
- `words` (id, user_id, date_given, date_precision, date_note, given_by, context, verbatim, themes[], scriptures[], timeframe, status, transcript_quality, created_at, updated_at)
- `sources` (id, word_id, user_id, kind audio|image|text, storage_path, recorded_at, duration_s)
- `reflections` (id, word_id, user_id, written_on, text)
- `jobs` (id, user_id, source_id, kind, state queued|running|done|failed, error_code, draft jsonb, created_at)
All tables: RLS `user_id = auth.uid()`.

## 9. Privacy & compliance checklist (must be done before inviting testers)
- [ ] Privacy notice (plain language): what is collected, why, which processors (Vercel, Supabase, AI providers), where, how long, user rights.
- [ ] Explicit consent screen, separate from terms, versioned.
- [ ] DPIA (data protection impact assessment), draft in `docs/`.
- [ ] Data processing agreements with each processor. If an AI provider processes outside the UK/EU, document the transfer safeguard (e.g. UK IDTA / adequacy) in the DPIA.
- [ ] Retention stated honestly: data kept until the user deletes it; note how long provider backups keep deleted data.
- [ ] Breach response: who is contacted and how fast (in the DPIA).
- [ ] No content in logs or analytics (checked by a test that scans log output).
- [ ] Export and delete work end to end.
- [ ] Guidance in the app: other people's voices and names appear in recordings, so ask the speaker's permission where possible.
- [ ] Professional review of the notice and DPIA (Claude is not a lawyer).

## 10. Phases
| Phase | What | Who |
|---|---|---|
| 0. Set up (1 to 2 days) | Claude compares providers and recommends one. The owner creates accounts (Supabase UK/EU project, AI provider keys) and puts the keys into Vercel themselves. Claude drafts the privacy notice and DPIA. | The owner + Claude |
| 1. Core (text only) | App shell, sign-in, consent, add word by text, review, timeline / constellation / reading panel from the database, status, reflections. | Claude |
| 2. AI inputs | Audio and photo upload, transcription / reading, tag suggestions, bulk import queue. | Claude |
| 3. Ready for testers | Export / delete, onboarding, error states, accessibility pass, test with 3 people, fix. | Claude + owner |
| 4. Test (2 to 4 weeks) | Invite 10 to 20 testers, collect the §4 signals, 5 interviews, decide next step. | Owner |

## 11. Open decisions
1. Product name (the "Word Archive" name is temporary).
2. AI providers: speech-to-text decided (OpenRouter, §7). Photo reading still open (likely a vision model through the same OpenRouter key).
3. Does the owner's own journal move in? It currently stays in the separate end-to-end-encrypted setup. Moving it here would mean storing it under the standard-cloud model.
4. Hosting cost ceiling for the test (free tiers should cover 20 testers; to confirm in Phase 0).
