/**
 * Prosty serwer Node.js do serwowania built frontendu.
 * Uruchom: node serve.js
 */
import http from "http";
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST      = path.join(__dirname, "dist");
const PORT      = process.env.PORT ?? 3000;

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".woff2":"font/woff2",
};

http.createServer((req, res) => {
  let filePath = path.join(DIST, req.url === "/" ? "/index.html" : req.url);

  // SPA fallback — każda ścieżka → index.html
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, "index.html");
  }

  const ext  = path.extname(filePath);
  const mime = MIME[ext] ?? "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Frontend: http://localhost:${PORT}`));
