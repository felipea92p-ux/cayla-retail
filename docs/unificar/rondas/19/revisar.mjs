// Página para que Felipe revise, pantalla por pantalla, cada texto de hoy y su versión corta. Sale revisar.html.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const filas = ["propuesta-a.json", "propuesta-b.json"].filter(existsSync).flatMap((f) => JSON.parse(readFileSync(f, "utf8")));
const pal = (s) => (s ? s.trim().split(/\s+/).length : 0);
const porRuta = new Map();
// Una plantilla que se repite por fila (la misma línea de código y la misma propuesta) se muestra una vez, con cuántas son.
const vistas = new Map();
for (const f of filas) {
  const clave = f.archivo && f.nuevo ? `${f.ruta}|${f.archivo}|${f.nuevo}` : null;
  if (clave && vistas.has(clave)) { vistas.get(clave).veces++; vistas.get(clave).extra += pal(f.original); continue; }
  const fila = { ...f, veces: 1, extra: 0 };
  if (clave) vistas.set(clave, fila);
  (porRuta.get(f.ruta) ?? porRuta.set(f.ruta, []).get(f.ruta)).push(fila);
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const NOMBRE = { queda: "Queda, más corta", "al ?": "Pasa al «?»", "se va": "Se va", dato: "Es un dato" };
let antes = 0, visibles = 0, alq = 0;
const bloques = [...porRuta].map(([ruta, fs]) => {
  const ui = fs.filter((f) => f.decision !== "dato");
  const a = ui.reduce((s, f) => s + pal(f.original) + f.extra, 0);
  const v = ui.filter((f) => f.decision === "queda").reduce((s, f) => s + pal(f.nuevo) * f.veces, 0);
  const q = ui.filter((f) => f.decision === "al ?").reduce((s, f) => s + pal(f.nuevo), 0);
  antes += a; visibles += v; alq += q;
  return { ruta, fs, a, v, q };
}).sort((x, y) => y.a - x.a);
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ronda 19 · texto por texto</title>
<style>
:root{--crema:#f4efe6;--papel:#faf7f1;--tinta:#1d1b18;--taupe:#7a5a48;--sand:#e4dccd;--rojo:#b3261e;--verde:#2f6b4f;--ambar:#9a6a12}
body{margin:0;background:var(--crema);color:var(--tinta);font:16px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:1500px;margin:0 auto;padding:32px 24px 120px}
h1{font:400 40px/1.1 Georgia,serif;margin:0 0 8px}h2{font:400 24px/1.2 Georgia,serif;margin:0}
.res{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0 32px}.res div{background:var(--papel);border:1px solid var(--sand);border-radius:14px;padding:14px 18px}
.res b{display:block;font:400 30px/1 Georgia,serif}
section{background:var(--papel);border:1px solid var(--sand);border-radius:16px;margin:0 0 20px;overflow:hidden}
section>header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:16px 20px;border-bottom:1px solid var(--sand);flex-wrap:wrap}
.num{color:var(--taupe);font-size:14px}
table{width:100%;border-collapse:collapse}td{padding:10px 14px;border-top:1px solid var(--sand);vertical-align:top}
tr:first-child td{border-top:0}
td.hoy{width:44%;color:var(--taupe);font-size:14px}td.hoy small{display:block;opacity:.8;font-size:12px;margin-top:2px}
td.dec{width:130px;font-size:13px;font-weight:600;white-space:nowrap}
.queda{color:var(--verde)}.alq{color:var(--ambar)}.seva{color:var(--rojo)}.dato{color:var(--taupe);font-weight:400}
td.nuevo{font-size:16px}td.nuevo small{display:block;color:var(--taupe);font-size:12px}
td.ok{width:180px}td.ok textarea{width:100%;min-height:34px;font:13px system-ui;border:1px solid var(--sand);border-radius:8px;padding:6px;background:#fff}
tr.dato td{opacity:.55}
@media (max-width:1000px){table,tbody,tr,td{display:block;width:auto!important}tr{border-top:1px solid var(--sand);padding:6px 0}td{border:0;padding:4px 14px}td.dec{padding-top:0}}
.pie{position:fixed;left:0;right:0;bottom:0;background:var(--tinta);color:var(--crema);padding:12px 24px;display:flex;gap:16px;align-items:center;justify-content:space-between}
.pie button{background:var(--crema);color:var(--tinta);border:0;border-radius:999px;padding:10px 18px;font-weight:600;cursor:pointer}
label.aprueba{font-size:14px;display:inline-flex;gap:6px;align-items:center}
</style>
<main>
<p class="num">CAYLA · /UNIFICAR · RONDA 19</p>
<h1>El texto, pantalla por pantalla</h1>
<p>Cada frase de hoy, con su versión corta. <b>Queda</b>: se ve, en una línea. <b>Pasa al «?»</b>: se lee al tocar el «?» del título de su sección. <b>Se va</b>: repetía algo de al lado o era una instrucción. Lo que es un dato (lo que escribió alguien) no se toca. Marca las pantallas que apruebas y escribe junto a la frase lo que cambiarías.</p>
<div class="res"><div><b>${antes.toLocaleString("es-PE")}</b>palabras a la vista hoy</div><div><b>${visibles.toLocaleString("es-PE")}</b>quedarían a la vista</div><div><b>${Math.round((1 - visibles / antes) * 100)} %</b>menos texto</div><div><b>${alq.toLocaleString("es-PE")}</b>palabras pasan al «?»</div></div>
${bloques.map((b) => `<section data-ruta="${esc(b.ruta)}"><header><h2>${esc(b.ruta)}</h2><span class="num">${b.a} → ${b.v} palabras a la vista${b.q ? ` · ${b.q} al «?»` : ""}</span><label class="aprueba"><input type="checkbox" class="ok-ruta"> Apruebo esta pantalla</label></header><table>
${b.fs.map((f, i) => `<tr class="${f.decision === "dato" ? "dato" : ""}" data-i="${i}"><td class="hoy">${esc(f.original)}${f.veces > 1 ? ` <b>(y ${f.veces - 1} más iguales)</b>` : ""}<small>${f.px} px · ${esc(f.tipo)}${f.archivo ? " · " + esc(f.archivo) : ""}</small></td><td class="dec ${{ queda: "queda", "al ?": "alq", "se va": "seva", dato: "dato" }[f.decision] ?? ""}">${NOMBRE[f.decision] ?? esc(f.decision)}</td><td class="nuevo">${f.nuevo ? esc(f.nuevo) : "—"}<small>${esc(f.motivo)}</small></td><td class="ok"><textarea placeholder="Cambiaría…" aria-label="Comentario"></textarea></td></tr>`).join("")}
</table></section>`).join("\n")}
</main>
<div class="pie"><span id="cuenta">0 pantallas aprobadas</span><button id="copiar">Copiar mi revisión</button></div>
<script>
const cuenta=()=>document.getElementById("cuenta").textContent=document.querySelectorAll(".ok-ruta:checked").length+" de ${bloques.length} pantallas aprobadas";
document.addEventListener("change",cuenta);
document.getElementById("copiar").onclick=async()=>{const l=["Mi revisión del texto (ronda 19):"];
for(const s of document.querySelectorAll("section")){const ok=s.querySelector(".ok-ruta").checked;const c=[...s.querySelectorAll("tr")].map(tr=>{const t=tr.querySelector("textarea").value.trim();return t?"  · «"+tr.querySelector(".hoy").firstChild.textContent.slice(0,70)+"…» → "+t:null}).filter(Boolean);
if(ok||c.length)l.push((ok?"✓ ":"· ")+s.dataset.ruta+(ok?" aprobada":""),...c)}
const txt=l.join("\\n");window.__revision=txt;try{await navigator.clipboard.writeText(txt);document.getElementById("copiar").textContent="✓ Copiada"}catch{alert(txt)}};
</script></html>`;
writeFileSync("revisar.html", html);
console.log(filas.length, "frases ·", antes, "→", visibles, "a la vista ·", alq, "al ?");
