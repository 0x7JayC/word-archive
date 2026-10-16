# Contributing to Word Archive

Thank you for helping. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug or suggesting an idea

Open an issue on GitHub. Say what you did, what you expected and what happened, and which browser and device you used. A screenshot helps.

**Never paste real words, names, recordings or API keys into an issue.** Use made-up examples instead.

## Making a change

1. Fork the repository and create a branch.
2. Install and run it (Node.js 22.12 or later):
   ```
   npm install
   npm run dev
   ```
3. Make your change, with a test for any new behaviour.
4. Run every check before opening a pull request:
   ```
   npm run check
   ```
   This runs typecheck, lint, unit tests, the production build and the end-to-end tests.
5. Check the screens you changed at phone (375 px), tablet (768 px) and desktop (1280 px) widths, with the keyboard, and with reduced motion switched on.

## Ground rules

These keep the app trustworthy for the people whose words it holds. The full list is in `CLAUDE.md`.

- **Record, classify and tag. Never interpret.** No AI summaries, meanings, "insights" or pattern commentary anywhere. Suggestions must be confirmed by the user.
- **Words are kept exactly as given.** Status and reflections belong to the user only.
- **Privacy first.** Content leaves the device only on an explicit user action. Never log content (text, transcripts, file names, speaker names).
- **Fictional data only** in code, tests, docs and screenshots.
- **No secrets in the repository.** Settings go in `.env.example` with empty values only.
- To change what the app does, update `docs/SPEC.md` first, then the code. Record decisions in `docs/decisions.md`.

By contributing, you agree that your contribution is released under the [MIT licence](LICENSE).
