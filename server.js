const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

let nextId = 1;
const queue = [];
const clients = [];

function sendEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(payload));
}

function serveStatic(req, res) {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      const ext = path.extname(filePath).toLowerCase();
      const type = ext === '.js' ? 'text/javascript' : 'text/html';
      res.writeHead(200, {'Content-Type': type});
      res.end(content);
    }
  });
}

function handleRegister(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const { name } = JSON.parse(body);
    const entry = { id: nextId++, name: name || '匿名', status: 'waiting', createdAt: Date.now() };
    queue.push(entry);
    sendEvent({ type: 'update', queue });
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(entry));
  });
}

function handleNext(req, res) {
  const next = queue.find(q => q.status === 'waiting');
  if (next) {
    next.status = 'calling';
    next.calledAt = Date.now();
  }
  sendEvent({ type: 'update', queue });
  res.writeHead(200);
  res.end();
}

function handleDone(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const { id } = JSON.parse(body);
    const entry = queue.find(q => q.id === id);
    if (entry) {
      entry.status = 'done';
      entry.finishedAt = Date.now();
    }
    sendEvent({ type: 'update', queue });
    res.writeHead(200);
    res.end();
  });
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('\n');
  clients.push(res);
  req.on('close', () => {
    const idx = clients.indexOf(res);
    if (idx !== -1) clients.splice(idx, 1);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (req.method === 'POST' && parsed.pathname === '/register') return handleRegister(req, res);
  if (req.method === 'POST' && parsed.pathname === '/next') return handleNext(req, res);
  if (req.method === 'POST' && parsed.pathname === '/done') return handleDone(req, res);
  if (req.method === 'GET' && parsed.pathname === '/events') return handleSSE(req, res);
  serveStatic(req, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
