// Receptor local de capturas: el navegador le manda el HTML y él lo escribe en ./captura (solo 127.0.0.1).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "captura");
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, "http://x");
  const nombre = (u.searchParams.get("nombre") || "sin-nombre").replace(/[^a-z0-9._-]/gi, "_");
  const trozos = [];
  req.on("data", (t) => trozos.push(t));
  req.on("end", () => {
    const buf = Buffer.concat(trozos);
    fs.writeFileSync(path.join(dir, nombre), buf);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok " + buf.length);
  });
}).listen(8899, "127.0.0.1", () => console.log("receptor en 8899"));
