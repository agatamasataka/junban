const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');

let nextId = 1;
const queue = [];
const history = [];
const clients = [];

function stripBase(p) {
  if (!BASE || p === BASE) return '/';
  if (BASE && p.startsWith(BASE + '/')) return p.slice(BASE.length);
  return p;
}

function computeStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const entries = history.filter(e => e.createdAt >= today.getTime()).concat(queue);
  const waits = history.filter(e => e.calledAt).map(e => e.calledAt - e.createdAt);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b) / waits.length / 60000) : 0;
  return { total: entries.length, avgWait };
}

function sendEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(payload));
}

function sendUpdate() {
  sendEvent({ type: 'update', queue, stats: computeStats() });
}

function serveStatic(pathname, res) {
  let file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!path.extname(file)) file += '.html';
  const filePath = path.join(__dirname, 'public', file);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      const ext = path.extname(filePath).toLowerCase();
      const type = ext === '.js' ? 'text/javascript' : 'text/html';
      res.writeHead(200, { 'Content-Type': type });
      res.end(content);
    }
  });
}

async function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve(null);
      }
    });
  });
}

async function handleRegister(req, res) {
  const data = await parseBody(req);
  if (!data) {
    res.writeHead(400);
    return res.end('Invalid JSON');
  }
  const entry = { id: nextId++, name: data.name || '匿名', status: 'waiting', createdAt: Date.now() };
  queue.push(entry);
  sendUpdate();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(entry));
}

function handleNext(req, res) {
  const next = queue.find(q => q.status === 'waiting');
  if (next) {
    next.status = 'calling';
    next.calledAt = Date.now();
  }
  sendUpdate();
  res.writeHead(200);
  res.end();
}

async function handleDone(req, res) {
  const data = await parseBody(req);
  if (!data || typeof data.id !== 'number') {
    res.writeHead(400);
    return res.end('Invalid JSON');
  }
  const idx = queue.findIndex(q => q.id === data.id);
  if (idx !== -1) {
    const [entry] = queue.splice(idx, 1);
    entry.status = 'done';
    entry.finishedAt = Date.now();
    history.push(entry);
  }
  sendUpdate();
  res.writeHead(200);
  res.end();
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('\n');
  clients.push(res);
  sendEvent({ type: 'update', queue, stats: computeStats() });
  req.on('close', () => {
    const idx = clients.indexOf(res);
    if (idx !== -1) clients.splice(idx, 1);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = stripBase(parsed.pathname);
  if (req.method === 'POST' && pathname === '/register') return handleRegister(req, res);
  if (req.method === 'POST' && pathname === '/next') return handleNext(req, res);
  if (req.method === 'POST' && pathname === '/done') return handleDone(req, res);
  if (req.method === 'GET' && pathname === '/events') return handleSSE(req, res);
  serveStatic(pathname, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}${BASE || ''}`));
