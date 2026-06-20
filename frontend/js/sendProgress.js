// Shared live-progress UI for any page that posts to /api/bulk/send and
// polls /api/bulk/progress/:sessionId over SSE. Used by bulk.html and
// template-map.html, which differ only in how they render each row
// (their own updateRow(index, row) must be defined before calling
// connectProgress) — everything else about a send's progress (stats,
// stop/refresh, the break-banner countdown) is identical between pages
// and lives here once instead of twice.
//
// Required element IDs on the host page:
// #send-status-label #stop-btn #refresh-btn #break-banner #break-title
// #break-sub #break-countdown #stat-total #stat-sent #stat-failed
// #stat-pending #progress-fill #send-btn

let breakTimer = null;
let activeSessionId = null;
let activeEs = null;

function updateStats(total, sent, failed) {
  const pending = total - sent - failed;
  qs('#stat-total').textContent   = total;
  qs('#stat-sent').textContent    = sent;
  qs('#stat-failed').textContent  = failed;
  qs('#stat-pending').textContent = pending;
  const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
  qs('#progress-fill').style.width = pct + '%';
}

function connectProgress(sessionId) {
  activeSessionId = sessionId;
  if (activeEs) activeEs.close();
  const es = new EventSource(`/api/bulk/progress/${sessionId}`);
  activeEs = es;

  es.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.type === 'init') {
      data.results.forEach((row, i) => window.updateRow(i, row));
      updateStats(data.total, data.sent, data.failed);
      if (data.status === 'done')    finishSend(data, es);
      if (data.status === 'stopped') handleStopped(data, es);
    }
    if (data.type === 'update') {
      window.updateRow(data.index, data.row);
      updateStats(data.total, data.sent, data.failed);
      qs('#send-status-label').textContent = `${data.sent + data.failed} / ${data.total} processed…`;
    }
    if (data.type === 'break')      startBreakBanner(data);
    if (data.type === 'break-done') stopBreakBanner();
    if (data.type === 'done')    { stopBreakBanner(); finishSend(data, es); }
    if (data.type === 'stopped') { stopBreakBanner(); handleStopped(data, es); }
  };

  es.onerror = () => { es.close(); };
}

async function stopSending() {
  if (!activeSessionId) return;
  const btn = qs('#stop-btn');
  btn.disabled = true; btn.textContent = 'Stopping…';
  try { await fetch(`/api/bulk/stop/${activeSessionId}`, { method: 'POST' }); } catch {}
}

function refreshProgress() {
  if (!activeSessionId) return;
  if (activeEs) activeEs.close();
  connectProgress(activeSessionId);
}

function startBreakBanner(data) {
  const banner = qs('#break-banner');
  banner.style.display = 'flex';
  qs('#break-title').textContent = `Batch ${data.batchNum} done — taking a break`;
  const until = new Date(data.breakUntil);
  if (breakTimer) clearInterval(breakTimer);
  breakTimer = setInterval(() => {
    const sec = Math.max(0, Math.round((until - Date.now()) / 1000));
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    qs('#break-countdown').textContent = `${m}:${s}`;
    qs('#break-sub').textContent = sec > 0 ? `Resuming in ${m}:${s}` : 'Resuming…';
    if (sec === 0) stopBreakBanner();
  }, 500);
}

function stopBreakBanner() {
  if (breakTimer) { clearInterval(breakTimer); breakTimer = null; }
  const banner = qs('#break-banner');
  if (banner) banner.style.display = 'none';
}

function finishSend(data, es) {
  es.close();
  stopBreakBanner();
  qs('#send-status-label').textContent = `Complete — ${data.sent} sent, ${data.failed} failed.`;
  qs('#stop-btn').style.display = 'none';
  qs('#send-btn').textContent = 'Send Complete';
  qs('#progress-fill').style.background = data.failed === 0 ? '#27ae60' : 'var(--primary)';
}

function handleStopped(data, es) {
  es.close();
  stopBreakBanner();
  qs('#send-status-label').textContent = `Stopped — ${data.sent} sent, ${data.failed} failed.`;
  qs('#stop-btn').style.display = 'none';
  qs('#send-btn').textContent = 'Stopped';
  qs('#progress-fill').style.background = '#e74c3c';
}

window.connectProgress = connectProgress;
window.stopSending = stopSending;
window.refreshProgress = refreshProgress;
window.updateStats = updateStats;
