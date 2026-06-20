# Future Improvements

Ideas beyond the [refactoring-roadmap.md](refactoring-roadmap.md), grouped by theme. None of these are blockers to the roadmap; they're worth keeping on record so they aren't lost or reinvented later.

## Outreach compliance & deliverability (flagged as security in this audit, expanded here)

- Unsubscribe link + suppression list (already a roadmap Phase 5 item — restated here because it's the most consequential gap for this specific product category).
- Sender warm-up scheduling (gradually ramping send volume for a new Gmail account to avoid spam-folder placement).
- A deliverability/reputation indicator in the UI (bounce rate, spam-report rate, if obtainable from Gmail).
- GDPR-style data export/delete tooling for recipient data once any EU-resident recipients are in scope.
- Reply detection (IMAP polling or a Gmail push notification) so a recruiter's reply automatically pauses further follow-ups to that address.

## Multi-provider flexibility

- Email sending: support Outlook/SMTP-generic/Amazon SES/SendGrid in addition to Gmail, since `emailService.js` is currently hardcoded to `smtp.gmail.com:587`.
- AI provider: generalize `bulkAiService.js`'s OpenAI-compatible client (already most of the way there, since NVIDIA NIM is OpenAI-API-shaped) to let a user plug in OpenAI, Anthropic, or a local model, configured per-tenant once Phase 7 exists.

## Product features

- A real CRM-lite layer: dedupe recipients across campaigns/bulk-sends/template-map runs (today the same recruiter email could be contacted multiple times across different flows with no cross-flow awareness).
- Follow-up sequencing (send a second email automatically if no reply after N days).
- A/B testing of subject lines or templates with basic open/click tracking.
- A template library/marketplace (shareable, versioned templates beyond the current single-table `mapping_configs`).
- Calendar integration for interview scheduling once a recruiter replies positively.
- A public API + API keys, so the product could be scripted/integrated (e.g., a Zapier/Make connector) once auth exists.

## UX polish

- Resolve the `preview.html` trust issue properly (roadmap Phase 0/4 covers the mechanism; this item is the follow-up UX pass once real preview-before-send is implemented) — add a clear, unambiguous "nothing has been sent yet" state.
- An in-app guide/onboarding step explaining when to use Campaign vs. Bulk Send vs. Template Map (today there is no in-product guidance distinguishing the three).
- A light theme toggle (currently dark-only, hardcoded in `style.css`'s `:root`).
- Mobile responsiveness pass — current breakpoints (`style.css:303-308`) hide the sidebar entirely under 768px with no replacement navigation (e.g., no hamburger menu), which is a real gap if any user tries this on a phone.
- Accessibility audit (ARIA labels, keyboard navigation, color contrast) — not assessed in depth in this pass and worth a dedicated review given the heavy reliance on color-only status indication (badges/pills).

## Platform/ops

- Structured, queryable application logs (beyond the current in-memory ring buffer + SSE console) once this runs anywhere other than a developer's own machine.
- Health checks that actually verify dependencies (DB reachable, SMTP credentials valid, AI key valid) rather than the current `/api/health`'s unconditional `{status: 'ok'}` (`server.js:41`).
- A staging environment and environment-aware configuration once there's more than one deployment target.
- Backups/retention policy for `send_history` and `email_logs` once data volume grows past "fits comfortably in memory to eyeball."

## Internationalization

- All UI strings are hardcoded English throughout every `.html` file; no i18n layer exists. Worth deferring until there's an actual non-English-speaking user base, but worth listing so a future contributor doesn't assume it's already handled.
