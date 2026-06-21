// Central API client — all pages import this
const API_BASE = window.location.origin + '/api';

// Pages that must never redirect-on-401 themselves — they're what a 401
// redirects TO, so redirecting again would loop.
const PUBLIC_PAGES = ['/login.html', '/signup.html'];

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 401 && !PUBLIC_PAGES.includes(window.location.pathname)) {
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const api = {
  // Auth
  signup: (email, password) => apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login:  (email, password) => apiFetch('/auth/login',  { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: ()                => apiFetch('/auth/logout', { method: 'POST' }),
  getMe:  ()                => apiFetch('/auth/me'),
  googleEnabled: ()         => apiFetch('/auth/google-enabled'),

  // Profile
  getProfile: ()         => apiFetch('/profile'),
  saveProfile: (body)    => apiFetch('/profile', { method: 'PUT', body: JSON.stringify(body) }),

  // Campaigns
  getCampaigns: ()       => apiFetch('/campaigns'),
  getStats: ()           => apiFetch('/campaigns/stats'),
  getCampaign: (id)      => apiFetch(`/campaigns/${id}`),
  startCampaign: (id)    => apiFetch(`/campaigns/${id}/start`, { method: 'POST' }),
  retryCampaign: (id, emailIds) =>
    apiFetch(`/campaigns/${id}/retry`, { method: 'POST', body: JSON.stringify({ email_ids: emailIds || null }) }),
  deleteCampaign: (id)   => apiFetch(`/campaigns/${id}`, { method: 'DELETE' }),

  // Emails
  getEmails: (params)    => apiFetch(`/emails?${new URLSearchParams(params)}`),
  getEmail: (id)         => apiFetch(`/emails/${id}`),
  exportUrl: (campaignId, format) => `${API_BASE}/emails/export/${campaignId}?format=${format}`,

  // Upload (multipart)
  uploadCampaign: (formData) => fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
    .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error); return d; })),

  // History — unified record of every email sent from any section
  getHistory: (params)      => apiFetch(`/history?${new URLSearchParams(params)}`),
  getHistoryStats: ()       => apiFetch('/history/stats'),
  deleteHistoryItem: (id)   => apiFetch(`/history/${id}`, { method: 'DELETE' }),

  health: () => apiFetch('/health'),
};

// ── Shared UI helpers ────────────────────────────────────────────────────────

function showAlert(container, type, message) {
  container.innerHTML = `<div class="alert alert-${type}">${escHtml(message)}</div>`;
}

function badge(status) {
  const s = (status || '').toLowerCase();
  return `<span class="badge badge-${s}">${s}</span>`;
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function urlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function spinner(text = 'Loading…') {
  return `<div class="flex items-center gap-8" style="padding:24px;color:var(--muted)"><span class="spinner"></span> ${escHtml(text)}</div>`;
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><h3>${escHtml(title)}</h3><p>${escHtml(sub)}</p></div>`;
}

function markActive() {
  const cur = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(el => {
    const href = el.getAttribute('href') || '';
    el.classList.toggle('active', href === cur || (href !== '/' && cur.startsWith(href)));
  });
}

window.api = api;
window.showAlert = showAlert;
window.badge = badge;
window.fmt = fmt;
window.escHtml = escHtml;
window.qs = qs;
window.qsa = qsa;
window.urlParam = urlParam;
window.spinner = spinner;
window.emptyState = emptyState;
window.markActive = markActive;
