// Intercepts console.* and broadcasts to SSE clients
const MAX_BUFFER = 500;
const buffer = [];
const clients = new Set();

let _id = 0;

function broadcast(entry) {
  const data = `data: ${JSON.stringify(entry)}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch { clients.delete(res); }
  }
}

function record(level, args) {
  const message = args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
    return String(a);
  }).join(' ');

  const entry = { id: ++_id, ts: new Date().toISOString(), level, message };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  broadcast(entry);
  return message;
}

// Patch console
const _log   = console.log.bind(console);
const _info  = console.info.bind(console);
const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.log   = (...a) => { _log(...a);   record('log',   a); };
console.info  = (...a) => { _info(...a);  record('info',  a); };
console.warn  = (...a) => { _warn(...a);  record('warn',  a); };
console.error = (...a) => { _error(...a); record('error', a); };

// Capture unhandled errors
process.on('uncaughtException',      err => record('error', [`[uncaughtException] ${err.stack || err.message}`]));
process.on('unhandledRejection',     err => record('error', [`[unhandledRejection] ${err?.stack || err}`]));

function addClient(res) {
  clients.add(res);
  // Send last 100 entries on connect
  const recent = buffer.slice(-100);
  res.write(`data: ${JSON.stringify({ type: 'history', entries: recent })}\n\n`);
}

function removeClient(res) { clients.delete(res); }

function getBuffer() { return buffer.slice(); }

module.exports = { addClient, removeClient, getBuffer };
