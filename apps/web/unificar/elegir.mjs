#!/usr/bin/env node
/**
 * La página para ELEGIR mirando (ADR-0358, paso 5 de `/unificar`): cada familia con sus opciones en tarjetas grandes —las formas que
 * ya existen, lo que está aplicado y las propuestas dibujadas—, cada una con su captura. Felipe toca la que quiere para todo el ERP,
 * puede dejar un comentario, y al final copia su elección para pegarla en el chat. Si la abrió en el navegador de la app, la sesión la
 * lee sola (`window.__unificarEleccion` y localStorage).
 *
 *   node unificar/elegir.mjs <especificacion.json>      escribe elegir.html junto a la especificación
 *
 * La especificación (rutas de imagen relativas a su carpeta):
 *   { titulo, nota, clave, css?, familias: [{ id, nombre, pregunta, ayuda?, grupos: [{ id, nombre, pregunta, ayuda?, opciones: [
 *     { id, nombre, detalle, tipo: "hoy" | "aplicada" | "propuesta", donde?, decidida?, movimiento?, ancha?, imagenes: [{ src, vista?, pie? }] } ] }] }] }
 *   `demo` (opcional) es HTML que se dibuja VIVO con el CSS del ERP (`css`): botones que Felipe puede pasar con el mouse y presionar
 *   para sentir su movimiento; tocarlos no elige la opción. `claseHtml` (opcional) va en el <html> para que carguen las fuentes del ERP.
 *   `movimiento` dice lo que la foto no muestra: qué hace la opción al pasar el mouse, al presionar y mientras trabaja (Felipe 2026-10-07).
 *   `estilos` (lista de hojas) y `guion` (un .js) se cargan después del CSS del ERP: las demos vivas de una ronda los comparten, y un
 *   «Repetir» de la demo vuelve a correr sus animaciones de entrada (ronda 5). La barra trae «Ver en oscuro»: cambia `data-tema` del
 *   <html>, así las demos y la página se ven con los tokens del modo oscuro del ERP (ADR-0336).
 *   `fotosAlFinal: true` pone las fotos después de la demo y del movimiento (cuando la demo viva es lo principal).
 *   `vista` es un recorte para la tarjeta (la foto completa se abre con «Ver grande»); `ancha` hace que la tarjeta ocupe dos columnas.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ruta = resolve(process.argv[2] ?? "");
const spec = JSON.parse(readFileSync(ruta, "utf8"));
const TIPO = { hoy: "Existe hoy", aplicada: "Lo aplicado ahora", propuesta: "Propuesta dibujada" };

const fotos = (o) => `<span class="op-fotos">${o.imagenes
    .map((im) => `<span class="op-foto"><img src="${esc(im.vista ?? im.src)}" alt="${esc(o.nombre)}${im.pie ? ` en ${esc(im.pie)}` : ""}"></span><span class="op-pie">${im.pie ? esc(im.pie) : ""}<button type="button" class="op-ver" data-grande="${esc(im.src)}">Ver grande</button></span>`)
    .join("")}</span>`;
const tarjeta = (f, g, o) => `<label class="op op-${esc(o.tipo)}${o.ancha ? " op-ancha" : ""}" data-op="${esc(o.id)}">
  <input type="radio" name="${esc(f.id)}::${esc(g.id)}" value="${esc(o.id)}" data-nombre="${esc(o.nombre)}">
  <span class="op-cabeza"><span class="op-tipo">${esc(TIPO[o.tipo] ?? o.tipo)}</span><span class="op-marca" aria-hidden="true">Elegida</span></span>
  ${spec.fotosAlFinal ? "" : fotos(o)}
  <span class="op-nombre">${esc(o.nombre)}</span>
  <span class="op-detalle">${esc(o.detalle)}</span>
  ${o.demo ? `<span class="op-demo" onclick="event.preventDefault()"><span class="op-demo-et">Pruébalo: pasa el mouse y presiona</span><span class="op-demo-fila">${o.demo}</span></span>` : ""}
  ${o.movimiento ? `<span class="op-mov"><b>Movimiento:</b> ${esc(o.movimiento)}</span>` : ""}
  ${o.donde ? `<span class="op-donde">${esc(o.donde)}</span>` : ""}
  ${spec.fotosAlFinal && o.imagenes.length ? `<span class="op-fotos-et">En las pantallas reales</span>${fotos(o)}` : ""}
  ${o.decidida ? `<span class="op-decidida">${esc(o.decidida)}</span>` : ""}
</label>`;

const grupo = (f, g) => `<fieldset class="grupo" data-grupo="${esc(f.id)}::${esc(g.id)}">
  <legend><span class="g-nombre">${esc(g.nombre)}</span><span class="g-pregunta">${esc(g.pregunta)}</span></legend>
  ${g.ayuda ? `<p class="g-ayuda">${esc(g.ayuda)}</p>` : ""}
  <div class="ops">${g.opciones.map((o) => tarjeta(f, g, o)).join("")}</div>
  <label class="comentario">Si ninguna te convence, o quieres mezclar dos, dilo aquí (opcional):
    <textarea name="${esc(f.id)}::${esc(g.id)}::comentario" rows="2" placeholder="Por ejemplo: la B, pero sin mayúsculas"></textarea></label>
</fieldset>`;

const familias = spec.familias
  .map((f) => `<section class="familia" id="f-${esc(f.id)}"><h2>${esc(f.nombre)}</h2><p class="f-pregunta">${esc(f.pregunta)}</p>${f.ayuda ? `<p class="f-ayuda">${esc(f.ayuda)}</p>` : ""}${f.grupos.map((g) => grupo(f, g)).join("")}</section>`)
  .join("");
const totalGrupos = spec.familias.reduce((a, f) => a + f.grupos.filter((g) => !g.opcional).length, 0);

const html = `<!doctype html>
<html lang="es" data-tema="claro" class="${esc(spec.claseHtml ?? "")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unificar · elige tú</title>
${spec.css ? `<link rel="stylesheet" href="${esc(spec.css)}">` : ""}
${(spec.estilos ?? []).map((h) => `<link rel="stylesheet" href="${esc(h)}">`).join("")}
<style>
:root { color-scheme: light; } :root[data-tema="oscuro"] { color-scheme: dark; }
body { margin: 0; background: var(--color-crema, #f5f0e8); color: var(--color-tinta, #1a1a18); font-family: var(--font-dm-sans), system-ui, sans-serif; font-size: 15px; line-height: 1.5; }
main { max-width: 1480px; margin: 0 auto; padding: 28px 20px 140px; }
h1 { font-family: var(--font-eb-garamond), Georgia, serif; font-weight: 500; font-size: 44px; line-height: 1.05; margin: 6px 0 10px; }
.ante { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--color-taupe, #805c4c); margin: 0; }
.nota { max-width: 80ch; margin: 0 0 6px; }
nav.saltos { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }
nav.saltos a { font-size: 13px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--color-sand, #e8e0d0); background: var(--color-papel, #fbf8f2); color: inherit; text-decoration: none; }
.familia { margin-top: 44px; padding-top: 20px; border-top: 1px solid var(--color-sand, #e8e0d0); }
.familia h2 { font-family: var(--font-eb-garamond), Georgia, serif; font-weight: 500; font-size: 34px; margin: 0 0 4px; }
.f-pregunta { font-size: 17px; margin: 0 0 4px; } .f-ayuda, .g-ayuda { color: var(--color-taupe, #805c4c); margin: 0 0 10px; max-width: 90ch; }
.grupo { border: 0; padding: 0; margin: 28px 0 0; }
legend { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; padding: 0; }
.g-nombre { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--color-taupe, #805c4c); font-weight: 600; }
.g-pregunta { font-size: 18px; font-weight: 600; }
.ops { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.op { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 16px; border: 2px solid var(--color-sand, #e8e0d0); background: var(--color-papel, #fbf8f2); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.op:hover { border-color: var(--color-taupe, #805c4c); }
.op-ancha { grid-column: span 2; } @media (max-width: 760px) { .op-ancha { grid-column: auto; } }
.op > input { position: absolute; opacity: 0; pointer-events: none; }
.op:has(> input:focus-visible) { outline: 2px solid var(--color-tinta, #1a1a18); outline-offset: 3px; }
.op:has(> input:checked) { border-color: var(--color-tinta, #1a1a18); box-shadow: inset 0 0 0 1px var(--color-tinta, #1a1a18); }
.op-cabeza { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.op-demo { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 12px; background: var(--color-crema, #f5f0e8); cursor: default; }
.op-demo-et { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--color-taupe, #805c4c); font-weight: 600; }
.op-demo-fila { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.op-mov { font-size: 13px; padding: 6px 10px; border-radius: 10px; background: var(--color-hueso, #efe7da); }
.op-tipo { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--color-taupe, #805c4c); font-weight: 600; }
.op-aplicada .op-tipo { color: var(--color-pizarra, #4c5d6e); } .op-propuesta .op-tipo { color: var(--color-verde, #48603f); }
.op-marca { display: none; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: var(--color-tinta, #1a1a18); color: var(--color-crema, #f5f0e8); }
.op:has(> input:checked) .op-marca { display: inline-block; }
.op-fotos-et { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--color-taupe, #805c4c); font-weight: 600; margin-top: 4px; }
.op-fotos { display: flex; flex-direction: column; gap: 6px; }
.op-foto { display: block; padding: 8px; border-radius: 10px; background: var(--color-hueso, #eae1d2); max-height: 300px; overflow: hidden; }
.op-foto img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.op-pie { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; color: var(--color-taupe, #805c4c); margin-top: -2px; }
.op-ver { font: inherit; font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--color-sand, #e8e0d0); background: var(--color-crema, #f5f0e8); color: var(--color-tinta, #1a1a18); cursor: zoom-in; }
.op-nombre { font-size: 16px; font-weight: 600; } .op-detalle { font-size: 14px; } .op-donde { font-size: 13px; color: var(--color-taupe, #805c4c); }
.op-decidida { font-size: 12px; color: var(--color-taupe, #805c4c); padding: 4px 8px; border-radius: 8px; background: var(--color-hueso, #eae1d2); align-self: flex-start; }
.comentario { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 13px; color: var(--color-taupe, #805c4c); max-width: 720px; }
.comentario textarea { font: inherit; font-size: 14px; color: var(--color-tinta, #1a1a18); padding: 8px 10px; border-radius: 10px; border: 1px solid var(--color-sand, #e8e0d0); background: var(--color-papel, #fbf8f2); resize: vertical; }
.barra { position: fixed; left: 0; right: 0; bottom: 0; z-index: 5; background: var(--color-papel, #fbf8f2); border-top: 1px solid var(--color-sand, #e8e0d0); }
.barra-in { max-width: 1480px; margin: 0 auto; padding: 12px 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.barra-cuenta { font-weight: 600; } .barra-resumen { flex: 1; min-width: 240px; font-size: 13px; color: var(--color-taupe, #805c4c); }
.barra button { font: inherit; font-weight: 600; padding: 10px 18px; border-radius: 10px; border: 0; background: var(--color-tinta, #1a1a18); color: var(--color-crema, #f5f0e8); cursor: pointer; }
.barra button.sec { background: transparent; color: var(--color-tinta, #1a1a18); box-shadow: inset 0 0 0 1px var(--color-sand, #e8e0d0); }
.barra button.copiado { background: var(--color-verde, #48603f); }
.grande { position: fixed; inset: 0; z-index: 10; display: none; align-items: flex-start; justify-content: center; overflow: auto; padding: 24px; background: color-mix(in srgb, var(--color-sombra, #000) 70%, transparent); cursor: zoom-out; }
.grande.abierta { display: flex; } .grande img { max-width: min(1400px, 100%); height: auto; background: var(--color-papel, #fbf8f2); border-radius: 8px; }
@media (max-width: 640px) { h1 { font-size: 32px; } .ops { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <p class="ante">CAYLA · /unificar · ${esc(spec.fecha ?? "")}</p>
  <h1>${esc(spec.titulo)}</h1>
  <p class="nota">${esc(spec.nota)}</p>
  <nav class="saltos" aria-label="Ir a una familia">${spec.familias.map((f) => `<a href="#f-${esc(f.id)}">${esc(f.nombre)}</a>`).join("")}</nav>
  <form id="eleccion">${familias}</form>
</main>
<div class="barra"><div class="barra-in">
  <span class="barra-cuenta" id="cuenta">Elegiste 0 de ${totalGrupos}</span>
  <span class="barra-resumen" id="resumen">Toca una tarjeta en cada pregunta. «Ver grande» abre la foto completa.</span>
  <button type="button" id="tema" class="sec">Ver en oscuro</button>
  <button type="button" id="copiar">Copiar mi elección</button>
</div></div>
<div class="grande" id="grande" role="dialog" aria-label="Foto en grande"><img alt=""></div>
<script>
const CLAVE = ${JSON.stringify(spec.clave ?? "unificar-eleccion")};
const TOTAL = ${totalGrupos};
const form = document.getElementById("eleccion");
const familiaDe = ${JSON.stringify(Object.fromEntries(spec.familias.flatMap((f) => f.grupos.map((g) => [`${f.id}::${g.id}`, `${f.nombre}${f.grupos.length > 1 ? " · " + g.nombre : ""}`]))))};
function leer() {
  const sal = {};
  for (const g of form.querySelectorAll(".grupo")) {
    const k = g.dataset.grupo, r = g.querySelector("input[type=radio]:checked"), c = g.querySelector("textarea").value.trim();
    if (r || c) sal[k] = { opcion: r ? r.value : null, nombre: r ? r.dataset.nombre : null, comentario: c || null };
  }
  return sal;
}
function texto(e) {
  const l = ["Mi elección en /unificar:"];
  for (const [k, v] of Object.entries(e)) l.push("- " + familiaDe[k] + ": " + (v.nombre ? v.nombre + " [" + v.opcion + "]" : "ninguna") + (v.comentario ? " — " + v.comentario : ""));
  return l.join("\\n");
}
function pintar() {
  const e = leer();
  window.__unificarEleccion = e;
  try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch {}
  const n = Object.entries(e).filter(([k, v]) => v.opcion && !k.endsWith("::propuestas")).length;
  document.getElementById("cuenta").textContent = "Elegiste " + Math.min(n, TOTAL) + " de " + TOTAL;
  const nombres = Object.values(e).filter((v) => v.nombre).map((v) => v.nombre);
  document.getElementById("resumen").textContent = nombres.length ? nombres.join(" · ") : "Toca una tarjeta en cada pregunta. «Ver grande» abre la foto completa.";
}
try {
  const prev = JSON.parse(localStorage.getItem(CLAVE) || "{}");
  for (const [k, v] of Object.entries(prev)) {
    if (v.opcion) { const r = form.querySelector('input[name="' + k + '"][value="' + v.opcion + '"]'); if (r) r.checked = true; }
    if (v.comentario) { const t = form.querySelector('textarea[name="' + k + '::comentario"]'); if (t) t.value = v.comentario; }
  }
} catch {}
form.addEventListener("change", pintar);
form.addEventListener("input", pintar);
pintar();
const grande = document.getElementById("grande");
document.addEventListener("click", (ev) => {
  const b = ev.target.closest(".op-ver");
  if (b) { ev.preventDefault(); grande.querySelector("img").src = b.dataset.grande; grande.classList.add("abierta"); return; }
  if (ev.target.closest("#grande")) grande.classList.remove("abierta");
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") grande.classList.remove("abierta"); });
document.getElementById("tema").addEventListener("click", (ev) => {
  const raiz = document.documentElement, oscuro = raiz.dataset.tema !== "oscuro";
  raiz.dataset.tema = oscuro ? "oscuro" : "claro";
  ev.target.textContent = oscuro ? "Ver en claro" : "Ver en oscuro";
});
document.getElementById("copiar").addEventListener("click", async (ev) => {
  const t = texto(leer());
  try { await navigator.clipboard.writeText(t); } catch { prompt("Copia este texto y pégalo en el chat:", t); }
  ev.target.textContent = "Copiado: pégalo en el chat"; ev.target.classList.add("copiado");
  setTimeout(() => { ev.target.textContent = "Copiar mi elección"; ev.target.classList.remove("copiado"); }, 3000);
});
</script>
${spec.guion ? `<script src="${esc(spec.guion)}"></script>` : ""}
</body>
</html>`;
const salida = join(dirname(ruta), "elegir.html");
writeFileSync(salida, html);
console.log(`Página para elegir: ${salida}`);
