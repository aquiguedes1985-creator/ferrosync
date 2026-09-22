const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
// Los perfiles y resultados de pruebas no forman parte de los recursos HTTP.
const assets = new Set(['index.html', 'app.js', 'correcciones.css', 'manifest.json', 'icon.svg', 'sw.js']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
function createServer(root = __dirname, store = null) {
  const api=require('./backend/api.cjs').createAPI(store);
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Ruta inválida'); return; }
    if(pathname==='/api/sync') {api(req,res);return;}
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    if (!assets.has(name)) { res.writeHead(404); res.end('No encontrado'); return; }
    fs.readFile(path.join(root, name), (error, data) => {
      if (error) { res.writeHead(404); res.end('No encontrado'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 8765);
  (async()=>{const {postgresStore,fileStore}=require('./backend/store.cjs');const store=process.env.DATABASE_URL?postgresStore(process.env.DATABASE_URL):process.env.FERRO_DATA_FILE?await fileStore(process.env.FERRO_DATA_FILE):null;createServer(__dirname,store).listen(port, '127.0.0.1', () => console.log(`FerroSync: http://127.0.0.1:${port}`));})();
}
module.exports = { createServer };
