const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, '.data'));
const DATABASE_PATH = path.join(DATA_DIR, 'attempts.sqlite');
const PORT = Number(process.env.PORT || 3000);

const PUBLIC_FILES = new Map([
  ['/', 'index (2).html'],
  ['/index (2).html', 'index (2).html'],
  ['/win/Кот смеётся футаж #cat #dance #butifyyoucloseyoureyes.mp4', 'win/Кот смеётся футаж #cat #dance #butifyyoucloseyoureyes.mp4'],
  ['/win/надо радоваться не надо напрягаться.mp4', 'win/надо радоваться не надо напрягаться.mp4'],
  ['/win/Тестовые задания.docx', 'win/Тестовые задания.docx'],
]);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mp4': 'video/mp4',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

async function start(){
  await fs.mkdir(DATA_DIR, { recursive: true });
  const database = new DatabaseSync(DATABASE_PATH);
  database.exec(`
    CREATE TABLE IF NOT EXISTS shared_stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO shared_stats (id, total) VALUES (1, 0);
  `);

  const readTotal = database.prepare('SELECT total FROM shared_stats WHERE id = 1');
  const incrementTotal = database.prepare('UPDATE shared_stats SET total = total + 1 WHERE id = 1 RETURNING total');

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');

      if(request.method === 'GET' && requestUrl.pathname === '/api/stats'){
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ total: Number(readTotal.get().total) }));
        return;
      }

      if(request.method === 'POST' && requestUrl.pathname === '/api/attempt'){
        const row = incrementTotal.get();
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ total: Number(row.total) }));
        return;
      }

      if(request.method !== 'GET'){
        response.writeHead(405, { Allow: 'GET, POST' });
        response.end();
        return;
      }

      const pathname = decodeURIComponent(requestUrl.pathname);
      const relativePath = PUBLIC_FILES.get(pathname);
      if(!relativePath){
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const file = await fs.readFile(path.join(ROOT, relativePath));
      const extension = path.extname(relativePath).toLowerCase();
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
        'Content-Length': file.length,
        'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(file);
    } catch(error){
      console.error(error);
      if(!response.headersSent){
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      response.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Shared counter available at http://localhost:${PORT}`);
    console.log('For other devices on this network, use this computer LAN address and the same port.');
  });
}

start().catch(error => {
  console.error(error);
  process.exitCode = 1;
});