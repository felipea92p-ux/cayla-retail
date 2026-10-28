#!/usr/bin/env node
/**
 * Receptor de capturas — el instrumento con el que el navegador le entrega a `generar-guia.mjs` las pantallas reales del ERP.
 *
 * EL PROBLEMA QUE RESUELVE. La guía web se arma con el HTML y el CSS REALES de cada estado de la pantalla (así se ve idéntica y no
 * envejece por una copia a mano). Esas pantallas pesan cientos de miles de caracteres cada una: pasarlas por la conversación las
 * haría inviables. La página las manda aquí con un `fetch` y se guardan como archivos.
 *
 * QUÉ PROMETE.
 *   · Escucha SOLO en 127.0.0.1 (nadie de la red lo ve) y solo acepta `POST /guardar?nombre=<a-z0-9_-.>` (un nombre simple, sin rutas).
 *   · Escribe en `.flujo-de-negocio/capturas/<caso>/` (fuera de git) y nunca fuera de esa carpeta. Tope de 25 MB por archivo.
 *   · Devuelve el nombre y los bytes guardados. No ejecuta nada de lo que recibe.
 * QUÉ NO PROMETE. Autenticación: es una herramienta de una sesión de trabajo en tu propia máquina; se apaga al terminar.
 *
 * USO   node scripts/flujo-de-negocio/guia/receptor.mjs <caso> [puerto]      (puerto por defecto: 8977)
 *       desde la página:  fetch("http://127.0.0.1:8977/guardar?nombre=inicio.html", { method: "POST", body: texto })
 */

import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const [caso, puertoArg] = process.argv.slice(2);
if (!caso || !/^[a-z0-9-]+$/.test(caso)) {
  console.error("Uso: receptor.mjs <caso> [puerto]   (caso: minúsculas, números y guiones)");
  process.exit(2);
}
const PUERTO = Number(puertoArg ?? 8977);
const DIR = join(RAIZ, ".flujo-de-negocio/capturas", caso);
const TOPE = 25 * 1024 * 1024;
mkdirSync(DIR, { recursive: true });

const servidor = createServer((req, res) => {
  const cabeceras = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "*" };
  if (req.method === "OPTIONS") return res.writeHead(204, cabeceras).end();
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const nombre = url.searchParams.get("nombre") ?? "";
  if (req.method !== "POST" || url.pathname !== "/guardar" || !/^[a-z0-9_.-]{1,80}$/i.test(nombre) || nombre.startsWith(".")) {
    return res.writeHead(400, cabeceras).end("petición no válida");
  }
  const partes = [];
  let bytes = 0;
  req.on("data", (p) => {
    bytes += p.length;
    if (bytes > TOPE) { res.writeHead(413, cabeceras).end("demasiado grande"); req.destroy(); }
    else partes.push(p);
  });
  req.on("end", () => {
    if (bytes > TOPE) return;
    writeFileSync(join(DIR, nombre), Buffer.concat(partes));
    console.log(`✓ ${nombre} (${bytes} bytes)`);
    res.writeHead(200, cabeceras).end(JSON.stringify({ nombre, bytes }));
  });
});

servidor.listen(PUERTO, "127.0.0.1", () => console.log(`Receptor de «${caso}» en http://127.0.0.1:${PUERTO} → ${DIR}`));
process.on("SIGTERM", () => servidor.close(() => process.exit(0)));
