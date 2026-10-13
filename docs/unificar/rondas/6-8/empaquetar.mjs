// Junta las rondas 6, 7 y 8 en UNA página de elegir y la deja en un solo archivo HTML que se abre sin servidor: el CSS del ERP, las
// fuentes, las demos (CSS y guion) y las fotos van adentro (data URI).
//   node empaquetar.mjs     (desde apps/web/unificar/.salida) → elegir-rondas-6-8.html
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, resolve } from "node:path";

const RONDAS = [
  ["elegir-ronda6", "Ronda 6"],
  ["elegir-ronda7", "Ronda 7"],
  ["elegir-ronda8", "Ronda 8"],
];
const TMP = "elegir-todo";
mkdirSync(TMP, { recursive: true });

// 1) Una sola especificación: las familias de las tres rondas, con sus fotos apuntando a la carpeta de su ronda.
const familias = [];
for (const [carpeta, ronda] of RONDAS) {
  const spec = JSON.parse(readFileSync(`${carpeta}/spec.json`, "utf8"));
  for (const f of spec.familias) {
    for (const g of f.grupos) for (const o of g.opciones) for (const im of o.imagenes ?? []) {
      im.src = `../${carpeta}/${im.src}`;
      if (im.vista) im.vista = `../${carpeta}/${im.vista}`;
    }
    familias.push({ ...f, nombre: `${ronda} · ${f.nombre}` });
  }
}
const base = JSON.parse(readFileSync("elegir-ronda6/spec.json", "utf8"));
const spec = {
  ...base,
  titulo: "Unificar · rondas 6, 7 y 8",
  clave: "unificar-rondas-6-8",
  css: "../elegir-ronda6/app.css",
  estilos: ["../elegir-ronda6/demo.css"],
  guion: "../elegir-ronda6/demo.js",
  nota: "Las tres rondas en una página: formularios (ronda 6), tablas y títulos (ronda 7), enlaces, paginación y caras (ronda 8). Todo lo de «Pruébalo» está VIVO y dibujado con el CSS real del ERP: escribe, abre los combos, elige con el mouse o el teclado, ordena las tablas, cambia de página, y «Ver en oscuro» (abajo) para verlo en modo oscuro. Nada se guarda. Las fotos son de las pantallas reales (censos del 6, 7 y 12 de octubre). Elige una tarjeta por pregunta —la marcada «mi recomendación» es la que propongo—, comenta si quieres mezclar, y al final «Copiar mi elección» y pégala en el chat. Tu elección se recuerda en este navegador aunque cierres la página.",
  familias,
};
writeFileSync(`${TMP}/spec.json`, JSON.stringify(spec));
execFileSync("node", ["../../elegir.mjs", "spec.json"], { cwd: TMP, stdio: "inherit" });

// 2) Todo adentro: hojas de estilo, guion, fuentes e imágenes.
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const dataUri = (ruta) => `data:${MIME[extname(ruta).toLowerCase()] ?? "application/octet-stream"};base64,${readFileSync(ruta).toString("base64")}`;
const cache = new Map();
const uriDe = (ruta) => { if (!cache.has(ruta)) cache.set(ruta, dataUri(ruta)); return cache.get(ruta); };

let html = readFileSync(`${TMP}/elegir.html`, "utf8");
// Las hojas: cada url(...) relativa (las fuentes en ../media/) se resuelve desde la carpeta de la hoja.
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  const ruta = resolve(TMP, href);
  let css = readFileSync(ruta, "utf8");
  css = css.replace(/url\((["']?)(\.\.?\/[^"')]+)\1\)/g, (m, q, rel) => {
    const archivo = resolve(dirname(ruta), rel);
    return existsSync(archivo) ? `url("${uriDe(archivo)}")` : m;
  });
  return `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${readFileSync(resolve(TMP, src), "utf8").replace(/<\/script/gi, "<\\/script")}\n</script>`);
// Las fotos: el src de cada <img> y el «Ver grande».
html = html.replace(/(src|data-grande)="(\.\.\/elegir-ronda\d\/img\/[^"]+)"/g, (_, attr, rel) => `${attr}="${uriDe(resolve(TMP, rel))}"`);

const salida = "elegir-rondas-6-8.html";
writeFileSync(salida, html);
const quedan = (html.match(/(?:src|href)="(?!data:|#|https?:)[^"]+\.(?:png|jpg|css|js|woff2)"/g) ?? []);
console.log(`${salida}: ${(html.length / 1024 / 1024).toFixed(1)} MB · ${familias.length} familias · referencias externas sin resolver: ${quedan.length}`);
if (quedan.length) console.log(quedan.slice(0, 5));
