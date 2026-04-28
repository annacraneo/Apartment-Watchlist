# Buy + Rent Local Architecture

This app is local-first and manual-entry-first:

- You paste a listing URL.
- The API fetches and parses one listing page.
- Parsed data is stored in `listings`.
- Periodic checks re-fetch those same URLs and create change history.

## Buy vs Rent

- `buy` keeps source-aware parsing behavior.
- `rent` uses a source-agnostic extraction pipeline:
  - fetch HTML
  - extract readable text
  - apply generic schema heuristics
  - normalize to listing fields

## Rent Review Workflow

- After adding a rent URL, the app shows a review step.
- Any fields edited during review are stored in `lockedFields`.
- Scheduler checks preserve locked values and create a notification if newly extracted values differ.

## Local Setup Notes

- Use `.env` for secrets and DB URL (never commit `.env`).
- Run API and frontend in separate dev processes.
- If `listing_type` and rent columns are missing in DB, run schema migration before testing.
