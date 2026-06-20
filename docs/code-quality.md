# Code Quality Audit

## 1. Duplicated frontend logic — `bulk.html` and `template-map.html`

These are the two largest files in the project (650 and 814 lines respectively) and they independently define nearly identical implementations of the same feature:

| Function | `bulk.html` line | `template-map.html` line |
|---|---|---|
| `startSend()` | 475 | 651 |
| `connectProgress(sessionId, total)` | 565 | 729 |
| `stopSending()` | 594 | 755 |
| `refreshProgress()` | 603 | 762 |
| `startBreakBanner(data)` | 609 | 768 |
| `stopBreakBanner()` | 625 | 784 |
| `handleStopped(data, es)` | 640 | 798 |

That's ~85 lines of SSE-connection, stop/refresh, and break-banner-countdown logic, duplicated almost verbatim across two files, with only cosmetic differences (element IDs: `#progress-fill` vs `#prog-fill`, `#send-status-label` vs `#send-lbl`). Any future bug fix or feature change to "how a send's live progress works" has to be made twice, correctly, in both places, with no compiler/linter to catch drift. This should become a shared `frontend/js/sendProgress.js` module (or equivalent) that both pages import — see [refactoring-roadmap.md](refactoring-roadmap.md).

Note also `connectProgress(sessionId, total)`'s second parameter, `total`, is **never referenced inside the function body in either file** — a dead parameter, harmless but worth removing when this code is touched.

## 2. Undefined CSS custom properties — 112 references, zero definitions

`frontend/css/style.css`'s `:root` (lines 4–21) defines a real design system: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--muted`, `--accent`, `--accent-h`, `--blue`, `--blue-h`, `--yellow`, `--red`, `--red-h`, `--purple`, `--radius`, `--shadow`.

`bulk.html` and `template-map.html`'s inline `<style>` blocks instead reference a **parallel, never-defined** set: `var(--primary)`, `var(--text-muted)`, `var(--card-bg)`, `var(--input-bg, #111)`, `var(--primary-dim, #2a2d5e)`. None of `--primary`, `--text-muted`, `--card-bg`, `--input-bg`, or `--primary-dim` exist anywhere in `style.css` or any other stylesheet. A repo-wide grep confirms **112 usages, 0 definitions**. Every one of these silently resolves to either its inline fallback (where given, e.g. `#111`, `#2a2d5e`) or to nothing at all (where no fallback is given, e.g. `.step.active .step-num { background: var(--primary); }` — the intended "active step" highlight color is simply absent; only the explicit `color: #fff` next to it still applies).

On top of that, the same two files hardcode literal status colors directly (`#27ae60` green, `#e74c3c` red, `#f39c12` yellow) dozens of times in inline styles and the `<style>` block, duplicating the *meaning* of `--accent-h`/`--red-h`/`--yellow` that already exist in the shared stylesheet — so even the parts that do render correctly are doing so via copy-pasted magic hex values that won't move if the design system's palette ever changes.

**Fix:** either (a) add the missing variables to `style.css`'s `:root` so the existing inline styles resolve correctly, or (b) replace every `--primary`/`--text-muted`/`--card-bg`/`--input-bg` reference with the real `--accent`/`--muted`/`--surface`/`--surface2` names and delete the inline `<style>` blocks' redundant color definitions. Option (b) is preferable long-term — it removes ~150 lines of page-specific CSS that duplicates the shared sheet.

## 3. The "Email Preview" page doesn't do what it says (code-level root cause)

`frontend/preview.html:97-100`'s own comment:
```js
// Generate all emails by starting campaign in preview-only mode
// We call the start endpoint; the processor generates + records but the user
// can review. Actually for preview we just generate without sending. We'll poll...
```
followed immediately by:
```js
await api.startCampaign(campaignId);
```
`startCampaign()` (`frontend/js/api.js:23`) hits `POST /api/campaigns/:id/start`, which runs `processCampaign()` (`campaignProcessor.js:27`) — there is no server-side concept of "generate only, don't send yet." The comment describes intended behavior that was never implemented; the code does the opposite of what it claims. This is the most concrete documentation-vs-code mismatch found in the audit, and it's user-facing (the page literally shows an "Approve & Start Sending" button for an action that, in the current implementation, already happened).

## 4. Dead / vestigial configuration

- `backend/config.js:6` — `redisUrl`. No file in the repo ever imports/reads `config.redisUrl`. `REDIS_URL` is not documented in `.env.example` either. Redis is not used anywhere; this key, and the `bull` dependency in `package.json:12`, are both vestigial — likely leftover from an earlier design that planned a real job queue (consistent with `CLAUDE.md`'s own note that "campaign processing runs in-process as a fire-and-forget async loop ... despite `bull` being in `package.json`").
- `backend/config.js:7` — `nvidiaApiKey`. Also never imported anywhere. The actual NVIDIA key lookup goes through `routes/settings.js`'s `getSetting('nvidia_api_key')` reading the `app_settings` table directly — `config.js`'s exported field is dead code that looks load-bearing but isn't.
- `package.json:9` — `"worker": "node worker.js"` npm script. `worker.js` does not exist anywhere in the repository. Running `npm run worker` today fails immediately with a module-not-found error.

## 5. `gmailSenderName` — referenced but never defined

`backend/services/emailService.js:24`:
```js
from: `"${config.gmailSenderName || 'Mittal Domadiya'}" <${config.gmailAddress}>`,
```
`config.gmailSenderName` does not exist as a key anywhere in `backend/config.js`'s exported object — it is always `undefined`, so the fallback string is always what's used. Every email sent by anyone running this codebase currently displays **"Mittal Domadiya"** as the visible sender name, regardless of who configured their own profile name in Settings. This is a real, reachable bug, not just a code-smell: the Settings page (`frontend/settings.html`) lets a user set their own `full_name`, but that value is never wired into the outgoing "From" header at all — `candidate_profiles.full_name` and the email's `From` display name are two completely disconnected pieces of data.

## 6. Inconsistent identity defaults — two different misspellings of the same name

- `backend/db.js:11`: `full_name VARCHAR(255) DEFAULT 'Mittal Domaidya'`
- `backend/services/campaignProcessor.js:15`: fallback profile `full_name: 'Mittal Domaidya'`
- `backend/services/emailService.js:24`: fallback sender name `'Mittal Domadiya'` (note: different spelling — swapped "id"/"di")
- `frontend/template-map.html:173,195`: sample bio template hardcodes `"Mittal Domadiya"` plus real biographical details (CHARUSAT, B.Tech CS) as default content that would be sent to real recruiters if not replaced
- `frontend/settings.html:25`, `frontend/bulk.html:193`: placeholder text using the same name

Beyond the portability concern already documented in [manual-configurations.md](manual-configurations.md), the fact that the **same hardcoded identity is spelled two different ways across the codebase** is itself a quality signal worth fixing — it suggests copy-paste without a single source of truth even for sample/placeholder content.

## 7. Large, monolithic frontend files with mixed concerns

`bulk.html` (650 lines) and `template-map.html` (814 lines) each contain: a full page-specific `<style>` block, three-step wizard markup, and several hundred lines of imperative DOM-manipulation JS, all in one file with no separation between markup, styling, and logic, and no code sharing with each other despite implementing the same feature twice (see #1). This isn't wrong for a no-build-step vanilla app, but it is the project's biggest single lever for maintainability improvement — every future bug fix to "how sending works" currently requires touching two large files in parallel and trusting that both edits stay in sync.

## 8. Manual SQL string building (`upload.js`) — quality issue independent of the security angle

Beyond the injection risk documented in [security-audit.md](security-audit.md) #2, `routes/upload.js:50-56`'s hand-built multi-row `INSERT` is also harder to read and maintain than the parameterized-query style used in every other route file in the project — it's the one piece of inconsistent style in an otherwise consistent codebase.

## 9. Two error-message field conventions used inconsistently

`excelService.js`'s `invalid_rows` entries store `errors: [string, string, ...]` (e.g. `'Company Name is required'`). `frontend/upload.html:202`'s rendering code does `r.errors.map(e => escHtml(e.msg || e))` — defensively handling both a plain string *and* an object with an `.msg` property, even though `excelService.js` never actually produces the object form. This is dead defensive code guarding against a shape that's never emitted — harmless, but a sign the two sides of this contract were written without checking each other.

## 10. What's good (preserve these patterns)

- Consistent `pool.query($1/$2 placeholders)` usage everywhere except the one file noted above.
- Consistent `escHtml()` usage on every dynamically-rendered string across all ten frontend pages.
- `historyService.js`'s "never let a logging failure break the real action" pattern (`try { await pool.query(...) } catch (err) { console.error(...) }`, swallowing its own errors) is the right shape for a non-critical side-effect and should be the template for any future audit-log/analytics writes.
- The interruptible-sleep pattern in `routes/bulk.js:100-107` (`pauseable()`, polling a flag every 500ms) is a clean, dependency-free way to get cancellable background work without pulling in `AbortController` plumbing or a queue library — appropriate for the current in-process architecture and worth keeping as the model for "stoppable background work" even after a real queue is introduced for durability.
