// Arma las páginas de la maqueta a partir de las capturas del ERP real. No hace falta para ABRIR la maqueta; sirve para ponerla al día
// cuando Recibir cambie (ver README, «Cómo se pone al día»). Solo Node, sin dependencias.
//
//   node armar.mjs <carpeta-con-capturas> <app.css-compilado-del-ERP> <carpeta-media-de-fuentes>
//
// Entra:  <capturas>/<estado>.json  (los escribe `recibe.mjs` cuando `capturar.js` corre en el navegador sobre el ERP local)
// Sale:   ../index.html (portada) y ../<estado>.html, ../app.css (el CSS REAL del ERP, sin comentarios) y ../fuentes/*.woff2
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const salida = path.resolve(aqui, "..");
const [capDir, cssEntrada, mediaDir] = process.argv.slice(2);
if (!capDir || !cssEntrada || !mediaDir) {
  console.error("Uso: node armar.mjs <carpeta-con-capturas> <app.css> <carpeta-media>");
  process.exit(1);
}

// La lista de estados vive en piezas.js (la misma que usa la barra de la maqueta).
const ventana = {};
new Function("window", fs.readFileSync(path.join(salida, "piezas.js"), "utf8"))(ventana);
const estados = ventana.PIEZAS_MAQUETA.estados;

// ── CSS: el del ERP tal cual, sin cirílico, griego ni vietnamita (CAYLA escribe en español) y sin comentarios ──────────────
let css = fs.readFileSync(cssEntrada, "utf8");
const sobran = /U\+460-52F|U\+400-45F|U\+1F\?\?|U\+370-377|U\+102-103/;
css = css.replace(/@font-face\s*\{[^}]*\}/g, (bloque) => (sobran.test(bloque) ? "" : bloque));
const usadas = new Set();
css = css.replace(/url\("\.\.\/media\/([^"]+)"\)/g, (_, nombre) => {
  usadas.add(nombre);
  return `url("fuentes/${nombre}")`;
});
css = css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .join("\n");
fs.writeFileSync(path.join(salida, "app.css"), css + "\n");
fs.mkdirSync(path.join(salida, "fuentes"), { recursive: true });
for (const f of usadas) fs.copyFileSync(path.join(mediaDir, f), path.join(salida, "fuentes", f));
console.log(`app.css: ${(css.length / 1024).toFixed(0)} KB · fuentes: ${usadas.size}`);

// ── Páginas ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const atributos = (o, quitar = []) =>
  Object.entries(o)
    .filter(([k]) => !quitar.includes(k))
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ");

for (const e of estados) {
  const origen = path.join(capDir, `${e.id}.json`);
  if (!fs.existsSync(origen)) {
    console.warn(`(sin captura de «${e.id}»: se omite)`);
    continue;
  }
  const cap = JSON.parse(fs.readFileSync(origen, "utf8"));
  // Radix deja la página «bloqueada» mientras hay una hoja abierta (no se puede tocar lo de atrás): en la maqueta no.
  const cuerpo = atributos(cap.body, ["style", "data-scroll-locked"]);
  const pagina = `<!doctype html>
<html ${atributos(cap.html, ["data-tema"])} data-tema="claro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recibir mercadería · maqueta editable · ${e.nombre}</title>
<link rel="stylesheet" href="app.css">
</head>
<body ${cuerpo}>
${cap.cuerpo}
<script>window.MAQUETA = { estado: ${JSON.stringify(e.id)}, capturado: ${JSON.stringify(cap.url)}, ancho: ${cap.ancho} };</script>
<script src="piezas.js"></script>
<script src="editor.js"></script>
</body>
</html>
`;
  const archivo = e.archivo;
  fs.writeFileSync(path.join(salida, archivo), pagina);
  console.log(`${archivo}: ${(pagina.length / 1024).toFixed(0)} KB (${cap.url}, capturada a ${cap.ancho} px)`);
}
