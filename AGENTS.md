# Admit Strategy repository rules

Admit Strategy is the execution layer for a student's academic life: understand what matters, plan the week, study effectively, track weak points, review intelligently, and improve. Preserve the purple/teal brand and the static HTML/CSS/JavaScript architecture unless measured evidence and product-owner approval justify a migration.

## Product and plan boundaries

- Free must remain a useful manual student workspace: Today, Classes, Calendar, Materials, Progress, and Settings.
- Each class owns Overview, Topics, Tests, Materials, and Study Strategy. The compact review queue is the default; the five-column board is optional.
- Plus should sell automation: calendar-aware planning, automatic reprioritization/rescheduling, advanced progress insight, and the completed course library. Do not put core organization behind a paywall.
- Human meetings belong in a future high-touch tier or separately scoped support, not as the only reason to buy Plus.
- Do not change prices, billing cadence, or checkout state without the exact product-owner decision. Never imply that an unavailable paid feature is live.
- Treat UI plan badges as presentation only. Before Plus launches, define one server-side entitlement registry and enforce Plus-only operations in the backend; never rely on hidden buttons for authorization.
- Do not add paid AI, file processing, college-planning scope, or a major framework migration without explicit approval.

## Privacy and data integrity

- Students may be minors. Treat portal URLs and tokens like passwords.
- Never expose tokens, credentials, spreadsheet IDs, private calendar feeds, student notes, or real student data in code, logs, screenshots, tests, or responses.
- Browser QA may use the fictional `portal.html?demo=1` flow or synthetic accounts against the explicitly authorized local Supabase stack. Never use real beta tokens or academic data for exploratory browser testing.
- Keep the visible promise: "Parent-approved. Private student data. Delete your data anytime."
- Preserve guardian approval, access/correction/deletion paths, and the rule that guardian and student emails must differ.
- Keep Google Apps Script credentials and OAuth tokens server-side. Never fake OAuth, AI processing, testimonials, results, or compliance.

## Portal UX contracts

- Saving must not scroll, reload the portal, rebuild all of `#app`, change the active view/class/tab/review mode, or close unrelated UI.
- After a successful mutation, update `currentData`, render only affected views, show the fixed `Saved ✓` toast, and reconcile only when required.
- Main navigation must open the target view at its heading on first visit and restore that view's prior scroll position on return.
- Keep normal navigation immediate on desktop and mobile. Avoid horizontal page overflow.

## Backend compatibility

- Preserve existing Sheets columns, IDs, legacy values, and `portalToken` compatibility.
- Batch Sheets work, cache portal responses with hashed keys, invalidate after writes, avoid migrations during reads, and keep global locks short.
- Mutation responses must return the changed record without tokens or private URLs.
- Booking duration is 60 minutes. Overlap rules, Qatar GMT+3 time formatting, the exact booking-status recovery route, and current availability windows must not regress.

## Change workflow

1. Read repository documentation and tests; inspect status, branches, remotes, and the live fictional demo.
2. Make the smallest complete change and add a regression test.
3. Run JavaScript syntax checks, the portal performance contract, relevant backend suites, `git diff --check`, desktop/mobile fictional-demo QA, overflow checks, and browser-console checks.
4. Keep frontend and backend changes in focused branches and pull requests. Deploy backend contract changes first, verify them, then publish the frontend.
5. Never claim a change is live until the matching workflow succeeds and the exact production URL is checked.
