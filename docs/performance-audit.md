# Performance Audit

The app is low-traffic by design today (one operator, sequential sends with deliberate multi-second delays), so nothing here is an active incident — these are the things that will hurt first as usage grows or as this becomes multi-tenant.

## 1. Polling instead of push, in three different places

- `frontend/index.html:91-95` — `setInterval(..., 15000)` re-fetches `/api/campaigns/stats` + `/api/campaigns` every 15s whenever any campaign is pending, for as long as the dashboard tab stays open.
- `frontend/campaign.html:130-133` — re-fetches campaign + email list every 8s while `status === 'PROCESSING'`.
- `frontend/preview.html:125-152` — polls campaign + email list every 5s during generation.

Meanwhile, **Bulk Send and Template Map already use Server-Sent Events** (`routes/bulk.js:172-189`) for live progress — proving the team knows the better pattern and simply hasn't back-ported it to the Campaign flow. This is inconsistent architecture more than a raw performance problem at current scale, but every open dashboard/campaign/preview tab is an unconditional DB round-trip every 5–15 seconds regardless of whether anything changed.

**Fix:** extend the SSE pattern (or a shared `/api/campaigns/:id/stream`) to the Campaign flow and retire the three polling loops.

## 2. Unbounded pagination `size` parameter

`routes/emails.js:8` and `routes/history.js:6` both do `const { ..., size = 25 } = req.query;` and pass `parseInt(size, 10)` straight into a `LIMIT` clause with **no upper bound**. A client (malicious or just buggy) requesting `?size=5000000` will have Postgres attempt to materialize and serialize that many rows in one response. Low risk today (no auth means anyone could do this trivially, which is also a security note — see [security-audit.md](security-audit.md) #1/#8), but should be capped (e.g., `Math.min(parseInt(size,10), 200)`) regardless of who can call it.

## 3. Bulk/Template-Map flows hold the entire dataset in memory, twice

For an N-recipient send, the full `results` array (subject + body text for every row) lives simultaneously in: the browser's `generatedItems` JS variable, the server's `session.results` array inside the in-memory `Map` (`routes/bulk.js:81-96`), and is then individually echoed back over SSE per update. For very large lists (hundreds–thousands of rows) this is `O(N)` memory held in three places for the life of the send, with no streaming/pagination of the preview UI itself (`bulk.html`'s `renderPreview()` renders every row's full editable subject+body textarea into the DOM at once — `frontend/bulk.html:430-458` — no virtualization). This will visibly degrade (slow render, high memory) well before it becomes a backend scaling concern, since the practical ceiling here is "how many recipients fit in one paste box," but it's worth flagging before someone tries to bulk-send a 5,000-row list through this page.

## 4. Sequential, single-threaded sending by design

All three flows send one email at a time with deliberate delays (`campaignProcessor.js:83-85`, `routes/bulk.js:131-146`). This is *intentional* (Gmail rate-limit avoidance), not a bug — flagged here only so it isn't "fixed" by parallelizing in a future pass without understanding why it's sequential. Any future move to a real job queue (see [refactoring-roadmap.md](refactoring-roadmap.md)) must preserve per-sender-account serialization even if multiple campaigns from different tenants run concurrently.

## 5. In-memory session cleanup is a fixed 1-hour timer, not LRU/size-bounded

`routes/bulk.js:155`: every completed session is deleted exactly 3,600,000ms after it finishes, regardless of how many sessions are in flight or how large each one's `results` array is. Under current single-operator usage this is harmless; if multiple sends could ever happen concurrently (multi-tenant), this `Map` has no overall size cap and no memory-pressure-aware eviction — a burst of large concurrent sends could grow process memory until the hour elapses.

## 6. No response compression

`backend/server.js` never registers the `compression` middleware. `/api/emails` and `/api/history` can return up to `size` (currently unbounded — see #2) rows of JSON including full email bodies; `/api/template-map/parse` returns every parsed Excel row plus a preview. None of this is gzipped/brotli'd over the wire today.

## 7. No HTTP caching headers on static frontend assets

`express.static(path.join(__dirname, '../frontend'))` (`server.js:28`) uses Express defaults — no explicit `maxAge`/`immutable` cache headers, no content hashing of filenames. Every page load re-fetches `style.css`, `api.js`, `layout.js` fresh (or relies on browser heuristic caching). Low impact at current asset sizes (`style.css` is 308 lines, `api.js` 98 lines) but worth setting explicit cache headers once the app has more than a handful of static assets.

## 8. Database indexing — mostly fine, one gap

`db.js:58-60` and the newer `send_history` indexes correctly cover the actual filter/sort columns used by `routes/emails.js` and `routes/history.js` (`campaign_id`, `status`, `email`, `source`, `created_at`). The one gap: `mapping_configs` (`db.js:67-74`) has no index beyond the implicit primary key, and `routes/template-map.js:83` does `SELECT * FROM mapping_configs ORDER BY created_at DESC` on every load — fine at current scale (this table will likely never exceed a few dozen rows for one operator), but worth an index on `created_at` if this table ever becomes multi-tenant and shared.

## 9. AI calls are not cached or batched

`bulkAiService.js:59-66` makes one full LLM completion call **per recipient** when a template needs AI-based company-name substitution, with no caching of identical prompts (e.g., two recipients at the same company would still trigger two separate LLM calls) and no batching API usage. At current single-operator scale this is a cost/latency question, not a correctness one (`max_tokens: 1500` per call, sequential, with the existing inter-email delay absorbing most of the latency anyway) — worth revisiting if AI-personalization usage grows, by caching on `(template_hash, company)`.

## 10. File upload size limit is global, not per-purpose

`server.js:25`: `fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } })` applies the same 50MB ceiling to both Excel recipient lists and resume PDF/DOC attachments. A 50MB Excel file would take meaningfully longer to parse synchronously with `XLSX.read()` (a blocking, CPU-bound call on the Node event loop — `excelService.js:28`, `routes/template-map.js:13`) than a 50MB resume takes to just `mv()` to disk. Splitting these limits (e.g., 5MB for Excel, 15MB for resumes) would both fail faster on mistaken uploads and reduce worst-case event-loop blocking time.
