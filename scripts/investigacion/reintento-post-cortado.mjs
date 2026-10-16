#!/usr/bin/env node
/**
 * ¿Chrome repite un POST cuando la conexión se corta DESPUÉS de que el servidor lo procesó? (investigación del 2026-10-15,
 * `docs/investigacion/2026-10-15-reintento-de-post-cortado.md`; nace de ADR-0411).
 *
 * Experimento local, sin base de datos: un contador cuenta cuántas veces le llega cada POST.
 *   navegador (Chrome instalado, perfil temporal de Playwright) ──► proxy que corta ──► contador
 * Hay un proxy HTTP/1.1 en claro y uno HTTP/2 con TLS. El certificado de prueba se genera con `openssl` en una carpeta
 * temporal y solo lo acepta ese Chrome de Playwright (`ignoreHTTPSErrors`): no se instala nada en el equipo.
 * HTTP/3 (QUIC) no se mide aquí: necesita un certificado de confianza; su comportamiento sale del código de Chromium.
 *
 * Uso: node scripts/investigacion/reintento-post-cortado.mjs   (necesita Google Chrome instalado y `pnpm install` hecho)
 * Imprime una tabla JSON: por escenario, cuántas veces mandó Chrome el POST, cuántas veces guardó el servidor y qué vio la página.
 */
import http from "node:http";
import http2 from "node:http2";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const { chromium } = createRequire(join(RAIZ, "apps/web/package.json"))("playwright");
const CERTS = mkdtempSync(join(tmpdir(), "reintento-post-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(CERTS, "clave.pem"), "-out", join(CERTS, "cert.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });

const P = { contador: 47100, h1: 47101, h2: 47102, pagina: 47103 };
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, apikey, x-intento",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

// ---- El contador: el «servidor» que guarda. Cada POST que llega es una escritura hecha. ----
const llegadas = new Map();
// La cabecera `x-intento` que trajo cada llegada: ¿el reenvío de Chrome repite la del envío original?
const marcas = new Map();
const contador = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return res.writeHead(204, CORS).end();
  if (req.method === "GET") return res.writeHead(200, { ...CORS, "content-type": "text/plain" }).end("ok");
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    const { id } = JSON.parse(cuerpo || "{}");
    llegadas.set(id, (llegadas.get(id) ?? 0) + 1);
    marcas.set(id, [...(marcas.get(id) ?? []), req.headers["x-intento"] ?? null]);
    res.writeHead(200, { ...CORS, "content-type": "application/json" }).end(JSON.stringify({ guardado: id, vez: llegadas.get(id) }));
  });
});
contador.keepAliveTimeout = 60_000;

// ---- El plan del escenario en curso: a qué intento se le corta y cómo. ----
let plan = { cortar: "ninguno", como: "despues" };
const intentos = new Map();
const tocaCortar = (id) => {
  const n = (intentos.get(id) ?? 0) + 1;
  intentos.set(id, n);
  return plan.cortar === "todos" || (plan.cortar === "primero" && n === 1);
};

function alContador(metodo, ruta, cabeceras, cuerpo) {
  return new Promise((ok, mal) => {
    const r = http.request({ host: "127.0.0.1", port: P.contador, method: metodo, path: ruta, headers: cabeceras }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => ok({ status: res.statusCode, headers: res.headers, cuerpo: b }));
    });
    r.on("error", mal);
    r.end(cuerpo);
  });
}

// ---- Proxy HTTP/1.1 ----
const h1 = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", async () => {
    const id = req.method === "POST" ? JSON.parse(cuerpo || "{}").id : null;
    const cortar = id !== null && tocaCortar(id);
    if (cortar && plan.como === "antes") return req.socket.destroy(); // nunca llegó al contador
    const r = await alContador(req.method, req.url, { ...req.headers, host: `127.0.0.1:${P.contador}` }, cuerpo);
    if (cortar) return req.socket.destroy(); // el contador ya guardó; la respuesta se pierde
    res.writeHead(r.status, r.headers).end(r.cuerpo);
  });
});
h1.keepAliveTimeout = 60_000;

// ---- Proxy HTTP/2 (TLS) ----
const h2 = http2.createSecureServer({ key: readFileSync(join(CERTS, "clave.pem")), cert: readFileSync(join(CERTS, "cert.pem")) });
h2.on("session", (s) => s.on("error", () => {}));
h2.on("stream", (stream, cab) => {
  stream.on("error", () => {});
  let cuerpo = "";
  stream.on("data", (c) => (cuerpo += c));
  stream.on("end", async () => {
    const metodo = cab[":method"];
    const id = metodo === "POST" ? JSON.parse(cuerpo || "{}").id : null;
    const cortar = id !== null && tocaCortar(id);
    const reenviar = Object.fromEntries(Object.entries(cab).filter(([k]) => !k.startsWith(":")));
    const r = await alContador(metodo, cab[":path"], { ...reenviar, host: `127.0.0.1:${P.contador}` }, cuerpo);
    if (cortar) {
      if (plan.como === "rst-refused") return stream.close(http2.constants.NGHTTP2_REFUSED_STREAM);
      if (plan.como === "rst-interno") return stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
      if (plan.como === "goaway") {
        const sesion = stream.session;
        sesion.goaway(http2.constants.NGHTTP2_NO_ERROR, stream.id - 2);
        return setTimeout(() => sesion.destroy(), 20);
      }
      return stream.session.socket.destroy(); // «despues»: se cae la conexión entera
    }
    const salida = { ":status": r.status };
    for (const [k, v] of Object.entries(r.headers)) if (!["connection", "keep-alive", "transfer-encoding", "date"].includes(k)) salida[k] = v;
    if (r.status === 204 || r.status === 304) return stream.respond(salida, { endStream: true });
    stream.respond(salida);
    stream.end(r.cuerpo);
  });
});

// ---- La página desde la que se escribe ----
const pagina = http.createServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>prueba</title>"));

const escuchar = (s, p) => new Promise((ok) => s.listen(p, "127.0.0.1", ok));
await Promise.all([escuchar(contador, P.contador), escuchar(h1, P.h1), escuchar(h2, P.h2), escuchar(pagina, P.pagina)]);

const DESTINO = { h1: `http://127.0.0.1:${P.h1}`, h2: `https://localhost:${P.h2}` };

const ESCENARIOS = [
  // HTTP/1.1
  { n: 1, proto: "h1", calentar: 1, preflight: true, cortar: "primero", como: "despues", que: "conexión usada · se corta solo la 1.ª respuesta" },
  { n: 2, proto: "h1", calentar: 1, preflight: true, cortar: "todos", como: "despues", que: "conexión usada · se cortan todas" },
  { n: 3, proto: "h1", calentar: 4, preflight: true, cortar: "todos", como: "despues", que: "4 conexiones usadas en reserva · se cortan todas" },
  { n: 4, proto: "h1", calentar: 0, preflight: true, cortar: "primero", como: "despues", que: "primera petición, pero con preflight CORS antes" },
  { n: 5, proto: "h1", calentar: 0, preflight: false, cortar: "primero", como: "despues", que: "primera petición sin preflight (conexión nueva)" },
  { n: 6, proto: "h1", calentar: 1, preflight: true, cortar: "primero", como: "antes", que: "conexión usada · se corta ANTES de llegar al servidor" },
  // HTTP/2
  { n: 7, proto: "h2", calentar: 1, preflight: true, cortar: "primero", como: "despues", que: "se cae la conexión tras guardar (solo la 1.ª)" },
  { n: 8, proto: "h2", calentar: 1, preflight: true, cortar: "todos", como: "despues", que: "se cae la conexión tras guardar (todas)" },
  { n: 9, proto: "h2", calentar: 1, preflight: true, cortar: "todos", como: "rst-refused", que: "RST_STREAM REFUSED tras guardar (todas)" },
  { n: 10, proto: "h2", calentar: 1, preflight: true, cortar: "todos", como: "goaway", que: "GOAWAY «no la procesé» tras guardar (todas)" },
  { n: 11, proto: "h2", calentar: 1, preflight: true, cortar: "todos", como: "rst-interno", que: "RST_STREAM INTERNAL_ERROR tras guardar" },
  { n: 12, proto: "h2", calentar: 0, preflight: true, cortar: "primero", como: "despues", que: "primera petición, con preflight CORS antes" },
];

const navegador = await chromium.launch({ channel: "chrome", headless: true });
const version = navegador.version();
const filas = [];
for (const e of ESCENARIOS) {
  const ctx = await navegador.newContext({ ignoreHTTPSErrors: true });
  const pag = await ctx.newPage();
  await pag.goto(`http://localhost:${P.pagina}/`);
  plan = { cortar: "ninguno", como: e.como };
  const destino = DESTINO[e.proto];
  if (e.calentar) await pag.evaluate(({ d, k }) => Promise.all(Array.from({ length: k }, () => fetch(d + "/calentar", { cache: "no-store" }))), { d: destino, k: e.calentar });
  plan = { cortar: e.cortar, como: e.como };
  const id = `esc-${e.n}`;
  const resultado = await pag.evaluate(
    async ({ d, id, preflight }) => {
      const headers = preflight ? { "content-type": "application/json", apikey: "prueba", "x-intento": crypto.randomUUID() } : { "content-type": "text/plain" };
      try {
        const r = await fetch(d + "/escribir", { method: "POST", headers, body: JSON.stringify({ id }) });
        const proto = performance.getEntriesByType("resource").filter((x) => x.name.endsWith("/escribir")).at(-1)?.nextHopProtocol;
        return { pagina: `OK ${r.status} ${await r.text()}`, proto };
      } catch (err) {
        return { pagina: `ERROR ${err}` };
      }
    },
    { d: destino, id, preflight: e.preflight },
  );
  filas.push({ esc: e.n, proto: resultado.proto ?? e.proto, escenario: e.que, intentosDeChrome: intentos.get(id) ?? 0, guardadoEnElServidor: llegadas.get(id) ?? 0, marcasDistintas: new Set(marcas.get(id) ?? []).size, loQueVioLaPagina: resultado.pagina });
  await ctx.close();
}
await navegador.close();
console.log(JSON.stringify({ chrome: version, filas }, null, 2));
for (const s of [contador, h1, h2, pagina]) s.close();
process.exit(0);
