# Retention release candidate — 13 November 2026

This file records the frontend candidate. Production status is authoritative in the backend repository's `RELEASE-STATUS.md`.

## Confirmed friction

- Production Quiz required a second setup/Start screen after choosing the method. A synthetic written answer took 1,866ms from click to feedback, including browser-control overhead. Starting that Quiz took 2,168ms.
- Today hid continuation inside a disclosure. Unit and Quiz preferences did not persist across reloads.
- At 375px the fixed two-row navigation occupied 117px. At 390×360 it competed with the answer input and pushed Check answer out of view. The owner's precise native-device submenu failure has not been reproduced; device/browser/menu clarification is still pending.

## Candidate behavior

- Known class/unit/assessment intent enters practice directly. Missing assessment links still ask the student to select scope. Study methods start immediately, with editable preferences available from Study home.
- Continue studying is visible on Today and Study. UI preferences contain only allowlisted choices and opaque IDs, keyed by both authenticated actor and student workspace.
- A modal mobile navigation sheet uses the browser's top layer and viewport bounds. Focused study hides unrelated navigation and retains Pause. Desktop navigation remains available outside study.
- Deterministic feedback renders before persistence. The server still assigns attempts, history, Boxes and review dates. Next waits for confirmation. An interrupted save retains its exact request key; a rejected/stale save exposes recovery. An overview refresh no longer delays a confirmed answer.
- The local checker mirrors the existing PostgreSQL checker for verified cases. Unverified Unicode/collation cases defer to the server. Loose keyword coverage stays explicitly separate from semantic correctness; typed-answer correction remains available after a rejected saved answer.
- Open Admit Strategy leads signed-out visitors to temporary sample Quiz/Flashcards/Learn; authenticated visitors enter the existing portal. Guest practice reads no academic backend data, writes no backend data, and does not save into an account. Its limits are stated in the interface.

## Verification and remaining release gates

Targeted study, guest, account/workspace isolation, build/security and performance checks passed. Run `node scripts/check-study-grading-parity.mjs` with the sibling backend checkout and existing local Supabase stack for read-only parity; it cannot connect to hosted Supabase.

Local browser checks: one-click continuation/Quiz, automatic feedback, typed correction, saved Quiz/unit preferences, guest question/Flashcard interactions and returning-account routing. Measured local feedback DOM rendering: 3.4ms choice / 40.9ms written; next question: 2.7ms. These are local browser measurements, not production/network or native-phone benchmarks.

Mobile menu checks passed at 375×667, 390×360 and 430×700 after scrolling roughly 1,900px: no page overflow, all destinations inside the viewport, 44–52px controls, Escape restores focus. Native phone keyboards and the exact owner-reported state remain a separate coverage gate.

Required next: reviewed production build, exact Pages deployment/hash comparison, real-domain guest/returning-user/typed-choice-Model workflows, persistence and production timings. No Supabase deployment is required for this frontend-only candidate. Keep the previous Pages artifact as rollback; retain all additive data and later student writes.
