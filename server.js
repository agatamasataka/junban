// --- server.js ここから ---------
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

let queue   = [];
let counter = 1;

function sendFile(res, file, type='text/html'){
  fs.readFile(file, (e, data)=>{
    if(e){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer((req, res)=>{
  if(req.method==='POST' && req.url==='/take'){
    let body=''; req.on('data',c=>body+=c);
    req.on('end', ()=>{
      const { name } = JSON.parse(body||'{}');
      const ticket = { no: counter++, name: name||'匿名' };
      queue.push(ticket);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify(ticket));
    });
    return;
  }

  if(req.method==='POST' && req.url==='/next'){
    const next = queue.shift()||null;
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(next));
  }

  if(req.method==='GET' && req.url==='/status'){
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(queue));
  }

  let filePath = req.url==='/' ? '/index.html' : req.url;
  const ext = path.extname(filePath);
  const types = { '.html':'text/html','.js':'text/javascript','.css':'text/css' };
  sendFile(res, path.join(__dirname,'public',filePath), types[ext]||'text/plain');
});

server.listen(3000, ()=>console.log('Server started on port 3000'));
