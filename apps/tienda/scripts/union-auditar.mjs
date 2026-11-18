// Audita la unión del probador con TODO el catálogo publicado (ADR-0449, act. 2026-11-17):
//   pnpm --filter tienda union:auditar                       (usa https://cayla.pe, sede arequipa)
//   TIENDA_UNION_AUDITAR_ORIGEN=http://localhost:3100 pnpm --filter tienda union:auditar
//
// Baja la página del probador, saca de ahí cada prenda con sus fotos de recorte, baja las fotos a una carpeta temporal y corre
// `lib/union-auditoria-catalogo.test.ts`: cada prenda de arriba contra cada prenda de abajo, midiendo en píxeles cuánto aire queda entre el
// bajo y la pretina (lo que se ve como un triángulo de fondo). Imprime cuántas combinaciones fallan y las peores. Solo lee; no escribe en la tienda.
// Dónde hacerlo: antes de publicar un cambio a `lib/union-prendas.ts`, y cuando entre un lote de prendas nuevas.
//
// Lee el catálogo del HTML de la propia página (no hay otra ruta pública que lo dé): si algún día cambia la forma de esos datos, el script se
// detiene con un mensaje claro en vez de auditar nada.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origen = (process.env.TIENDA_UNION_AUDITAR_ORIGEN ?? "https://cayla.pe").replace(/\/$/, "");
const sede = process.env.TIENDA_UNION_AUDITAR_SEDE ?? "arequipa";
const carpeta = process.argv[2] ?? join(tmpdir(), "cayla-union-auditar");

const respuesta = await fetch(`${origen}/looks/arma?sede=${encodeURIComponent(sede)}`);
if (!respuesta.ok) {
  console.error(`No se pudo leer ${origen}/looks/arma (${respuesta.status}).`);
  process.exit(1);
}
const html = (await respuesta.text()).replaceAll('\\"', '"');

const prendas = [];
const cabecera = /\{"id":"[0-9a-f-]{36}","codigo":"([A-Z]{3}-\d{4})","nombre":"([^"]*)","categoria":"([^"]*)","zona":"(\w+)","metida":(\w+),"porTorso":(\w+),"falda":(\w+),"largo":(\d+(?:\.\d+)?)/g;
for (const m of html.matchAll(cabecera)) {
  const desde = m.index + m[0].length;
  const siguiente = html.indexOf('{"id":"', desde);
  const tramo = html.slice(desde, siguiente > 0 ? siguiente : desde + 60000);
  const fotos = [...tramo.matchAll(/"codigo":"(\w+)","nombre":"[^"]*".*?"foto":\{"url":"([^"]+)","proporcion":([\d.]+)/g)].map((f) => ({ color: f[1], url: f[2], prop: Number(f[3]) }));
  prendas.push({ codigo: m[1], nombre: m[2], cat: m[3], zona: m[4], metida: m[5] === "true", porTorso: m[6] === "true", falda: m[7] === "true", largo: Number(m[8]), fotos });
}
if (prendas.length === 0) {
  console.error("No encontré prendas en la página del probador: cambió la forma de sus datos. Hay que actualizar este script (cabecera de la expresión).");
  process.exit(1);
}

mkdirSync(join(carpeta, "recortes"), { recursive: true });
const urls = [...new Set(prendas.flatMap((p) => p.fotos.map((f) => f.url)))];
let bajadas = 0;
const bajar = async (url) => {
  const destino = join(carpeta, "recortes", url.slice(url.lastIndexOf("/") + 1));
  if (existsSync(destino)) return;
  const r = await fetch(url);
  if (!r.ok) return;
  writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  bajadas++;
};
const cola = [...urls];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let u = cola.pop(); u; u = cola.pop()) await bajar(u).catch(() => undefined);
  }),
);
writeFileSync(join(carpeta, "catalogo.json"), JSON.stringify(prendas));
console.log(`${prendas.length} prendas (${prendas.filter((p) => p.zona === "arriba").length} de arriba, ${prendas.filter((p) => p.zona === "abajo").length} de abajo), ${urls.length} fotos de recorte (${bajadas} nuevas) en ${carpeta}`);

const corrida = spawnSync("pnpm", ["exec", "vitest", "run", "lib/union-auditoria-catalogo.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, TIENDA_UNION_AUDITAR_CARPETA: carpeta },
});
process.exit(corrida.status ?? 1);
