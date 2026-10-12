// Prueba del ayudante de etiquetas para Mac (ADR-0304): `node scripts/mac-etiquetas/servidor.prueba.mjs`.
//
// Imita a launchd (inetdCompatibility): por cada conexión arranca `servidor.sh` con el socket como stdin/stdout. La
// impresora es falsa (`CAYLA_LP`): guarda los argumentos y el PDF que recibiría la Brother, y aquí se comprueba que el
// PDF mida 62 × 40,1 mm y tenga una página por etiqueta. Chrome sí es el real: es lo que no se puede inventar.
// Solo corre en una Mac con Chrome; en otra parte sale con aviso y código 0.
import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const aqui = dirname(fileURLToPath(import.meta.url));
const SERVIDOR = join(aqui, "../../apps/web/public/mac-etiquetas/servidor.sh");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (process.platform !== "darwin" || !existsSync(CHROME)) {
  console.log("Omitida: hace falta una Mac con Google Chrome.");
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "cayla-etq-prueba-"));
const falsa = join(tmp, "lp-falso.sh");
writeFileSync(
  falsa,
  `#!/bin/sh
echo "$@" > "${tmp}/lp-args.txt"
for ultimo; do :; done
cp "$ultimo" "${tmp}/recibido.pdf"
echo "request id is Brother_QL_FALSA-7 (1 file(s))"
`,
);
chmodSync(falsa, 0o755);
writeFileSync(join(tmp, "impresora"), "Brother_QL_FALSA\n");

// El mismo @page que `globals.css` (#etiquetas-precio-print): una página de 62 × 40,1 mm por etiqueta.
const html = (n) => `<!doctype html><html><head><meta charset="utf-8"><style>
@page etiqueta-precio { size: 62mm 40.1mm; margin: 0 }
@media print { .etq-hoja { width: 62mm; height: 40.1mm; overflow: hidden; page: etiqueta-precio; break-after: page }
.etq-hoja:last-child { break-after: auto } body { margin: 0 } }
</style></head><body><div id="etiquetas-precio-print">${Array.from({ length: n }, (_, i) => `<div class="etq-hoja"><b>Etiqueta ${i + 1}</b></div>`).join("")}</div>
<script>document.body.innerHTML = "<p>si esto corre, sale UNA sola pagina</p>";</script></body></html>`;

// launchd por cada conexión: el socket es stdin/stdout.
const srv = createServer((socket) => {
  const h = spawn("/bin/sh", [SERVIDOR], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmp, CAYLA_ETIQUETAS_DIR: tmp, CAYLA_LP: falsa },
    stdio: ["pipe", "pipe", "inherit"],
  });
  socket.pipe(h.stdin);
  h.stdout.pipe(socket);
  h.stdin.on("error", () => {});
  socket.on("error", () => {});
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const puerto = srv.address().port;
const url = (p) => `http://127.0.0.1:${puerto}${p}`;

const ERP = "https://cayla-retail.vercel.app";
let n = 0;
const ok = (nombre) => console.log(`  ✓ ${++n}. ${nombre}`);

try {
  // 1. Estado desde la pantalla de CAYLA: responde y deja pasar a ese origen (y solo a ese).
  let r = await fetch(url("/estado"), { headers: { Origin: ERP } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), ERP);
  assert.equal(r.headers.get("access-control-allow-private-network"), "true");
  const estado = await r.json();
  assert.equal(estado.ok, true);
  assert.equal(estado.chrome, true);
  ok("/estado responde y avisa con CORS a la pantalla de CAYLA");

  // 2. Otro sitio no recibe permiso de lectura.
  r = await fetch(url("/estado"), { headers: { Origin: "https://otro.example" } });
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  ok("otro sitio no recibe permiso CORS");

  // 3. El preflight del navegador (OPTIONS) pasa para CAYLA y se rechaza para otro sitio.
  r = await fetch(url("/imprimir"), { method: "OPTIONS", headers: { Origin: ERP, "Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true" } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-private-network"), "true");
  r = await fetch(url("/imprimir"), { method: "OPTIONS", headers: { Origin: "https://otro.example" } });
  assert.equal(r.status, 403);
  ok("preflight: pasa para CAYLA, 403 para otro sitio");

  // 4. Un POST de otro sitio o sin origen NO imprime nada.
  for (const headers of [{ Origin: "https://otro.example" }, {}]) {
    r = await fetch(url("/imprimir"), { method: "POST", headers, body: html(1) });
    assert.equal(r.status, 403);
  }
  assert.equal(existsSync(join(tmp, "lp-args.txt")), false);
  ok("POST de otro sitio o sin Origin: 403 y no se imprimió nada");

  // 5. Host distinto de localhost (rebinding de DNS) se rechaza.
  // (`fetch` no deja cambiar el Host: se habla con el socket a mano.)
  const respuesta = await new Promise((resolver, rechazar) => {
    const s = connect(puerto, "127.0.0.1", () => s.write(`GET /estado HTTP/1.1\r\nHost: malo.example\r\nOrigin: ${ERP}\r\n\r\n`));
    let texto = "";
    s.on("data", (d) => (texto += d));
    s.on("end", () => resolver(texto));
    s.on("error", rechazar);
  });
  assert.match(respuesta, /^HTTP\/1\.1 403/);
  ok("Host que no es localhost: se rechaza");

  // 6. Impresión real: 3 etiquetas → un PDF de 3 páginas de 62 × 40,1 mm, mandado a la Brother con el tamaño y el corte.
  r = await fetch(url("/imprimir"), { method: "POST", headers: { Origin: ERP, "Content-Type": "text/html" }, body: html(3) });
  const cuerpo = await r.json();
  assert.equal(r.status, 200, JSON.stringify(cuerpo));
  assert.equal(cuerpo.ok, true);
  assert.equal(cuerpo.trabajo, "Brother_QL_FALSA-7");
  const args = readFileSync(join(tmp, "lp-args.txt"), "utf8");
  assert.match(args, /-d Brother_QL_FALSA/);
  assert.match(args, /media=Custom\.62x40\.1mm/);
  assert.match(args, /CutMedia=EndOfPage/);
  const pdf = readFileSync(join(tmp, "recibido.pdf"), "latin1");
  const paginas = [...pdf.matchAll(/\/Type\s*\/Page\b(?!s)/g)].length;
  assert.equal(paginas, 3, `páginas: ${paginas}`);
  const caja = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  assert.ok(caja, "el PDF no declara MediaBox");
  const [ancho, alto] = [Number(caja[1]) / 72 * 25.4, Number(caja[2]) / 72 * 25.4];
  assert.ok(Math.abs(ancho - 62) < 0.3 && Math.abs(alto - 40.1) < 0.3, `hoja de ${ancho.toFixed(2)} × ${alto.toFixed(2)} mm`);
  ok(`3 etiquetas → PDF de 3 páginas de ${ancho.toFixed(1)} × ${alto.toFixed(1)} mm, con -o media=Custom.62x40.1mm y corte por página`);
  ok("el <script> del documento no corrió (si corría, salía 1 página)");

  // Un documento que no empieza con el prefijo esperado no se imprime (la CSP iría en el lugar equivocado).
  r = await fetch(url("/imprimir"), { method: "POST", headers: { Origin: ERP }, body: `<html>${html(1)}` });
  assert.equal(r.status, 400);
  ok("documento con otro comienzo: 400");

  // 6b. Rótulos de anaquel (ADR-0366): con `?medida=62x100mm` va a la Brother con ese papel; una medida que no está en la
  // lista del ayudante no se imprime (nunca llega a `lp` un texto de la petición).
  assert.equal(estado.version, 2);
  const rotulo = `<!doctype html><html><head><meta charset="utf-8"><style>
@page rotulo { size: 62mm 100mm; margin: 0 }
@media print { .rot-hoja { width: 62mm; height: 100mm; overflow: hidden; page: rotulo; break-after: page }
.rot-hoja:last-child { break-after: auto } body { margin: 0 } }
</style></head><body><div class="rot-hoja"><b>Rótulo 1</b></div><div class="rot-hoja"><b>Rótulo 2</b></div></body></html>`;
  r = await fetch(url("/imprimir?medida=62x100mm"), { method: "POST", headers: { Origin: ERP, "Content-Type": "text/html" }, body: rotulo });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  assert.match(readFileSync(join(tmp, "lp-args.txt"), "utf8"), /media=Custom\.62x100mm/);
  const pdfRotulo = readFileSync(join(tmp, "recibido.pdf"), "latin1");
  const cajaRotulo = pdfRotulo.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  const [anchoR, altoR] = [Number(cajaRotulo[1]) / 72 * 25.4, Number(cajaRotulo[2]) / 72 * 25.4];
  assert.ok(Math.abs(anchoR - 62) < 0.3 && Math.abs(altoR - 100) < 0.3, `rótulo de ${anchoR.toFixed(2)} × ${altoR.toFixed(2)} mm`);
  ok(`2 rótulos con ?medida=62x100mm → PDF de ${anchoR.toFixed(1)} × ${altoR.toFixed(1)} mm y -o media=Custom.62x100mm`);
  for (const mala of ["62x999mm", "62x100mm%3Brm", "62x100mm;rm"]) {
    r = await fetch(url(`/imprimir?medida=${mala}`), { method: "POST", headers: { Origin: ERP }, body: rotulo });
    assert.equal(r.status, 400, mala);
  }
  r = await fetch(url("/imprimir?otra=1"), { method: "POST", headers: { Origin: ERP }, body: rotulo });
  assert.equal(r.status, 400);
  ok("una medida fuera de la lista, o una consulta desconocida: 400");

  // 7. Un cuerpo vacío o gigante no arranca Chrome.
  r = await fetch(url("/imprimir"), { method: "POST", headers: { Origin: ERP }, body: "" });
  assert.equal(r.status, 413);
  ok("cuerpo vacío: 413");

  console.log(`\nTodo en orden (${n} comprobaciones). Archivos de la prueba: ${tmp}`);
} catch (e) {
  console.error("\nFALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  srv.close();
}
