// La LÁMINA de comparación (ADR-0358): una página HTML por corrida con cada familia, sus variantes lado a lado (captura, cuántas
// veces y dónde se usa, qué cambia frente a la más usada) y la PROPUESTA nueva si `/unificar` ya la dibujó
// (`docs/unificar/propuestas/<familia>.html`). La propuesta se dibuja con el CSS REAL del ERP (el que sirvió el `next dev` durante
// el censo), en claro y en oscuro, para que Felipe compare lo mismo que va a ver en pantalla.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Ancho y alto de un PNG, leídos de su cabecera (IHDR). */
export function medidasPng(ruta) {
  try {
    const b = readFileSync(ruta);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {
    return null;
  }
}

const NOMBRES = {
  alto: "Alto",
  radio: "Esquinas",
  radioPestana: "Esquinas de la pestaña",
  fondo: "Fondo",
  borde: "Borde",
  relleno: "Relleno (arriba·lados)",
  sombra: "Sombra",
  tam: "Letra: tamaño",
  peso: "Letra: grosor",
  fuente: "Letra: tipo",
  mayus: "Versalitas",
  espaciado: "Espaciado de letras",
  color: "Color del texto",
  icono: "Icono",
  lado: "Lado del icono",
  punto: "Punto de color",
  indicador: "Cómo marca la activa",
  activa: "Pestaña activa",
  inactiva: "Pestaña inactiva",
  contenedor: "Contenedor",
  titulos: "Fila de títulos",
  fila: "Filas",
  celda: "Celdas",
  tarjeta: "Tarjeta",
  numero: "Número",
  nombre: "Nombre de la cifra",
  lugar: "Dónde va",
  tipo: "Tipo",
  colores: "Colores",
  textos: "Textos del gráfico",
  antetitulo: "Antetítulo",
  bajada: "Bajada",
  nivel: "Nivel",
  alineado: "Alineado",
  dibujo: "Dibujo",
  accion: "Acción",
  caja: "Caja",
  letra: "Letra",
  bordeIzq: "Borde izquierdo",
  lupa: "Lupa",
  flecha: "Flecha",
  forma: "Forma",
  origen: "Origen",
  trazo: "Grosor del trazo",
  posicion: "Dónde se abre",
  ancho: "Ancho",
  titulo: "Título",
  cerrar: "Botón cerrar",
  pie: "Botones del pie",
  boton: "Botón",
  botones: "Botones",
  texto: "Texto",
  subrayado: "Subrayado",
  contenido: "Contenido",
  separador: "Separador",
  cebra: "Cebra",
};
const nombreDe = (k) => NOMBRES[k] ?? k;
const valor = (k, v) => {
  if (k === "radio" || k === "radioPestana") return v === "pleno" ? "redondas (píldora)" : v === 0 ? "rectas" : `${v} px`;
  if (["alto", "tam", "ancho", "lado"].includes(k) && typeof v === "number") return `${v} px`;
  return String(v);
};

/** La huella aplanada: `letra.tam` → 14. */
export function aplanar(o, pre = "") {
  const sal = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(sal, aplanar(v, pre ? `${pre}.${k}` : k));
    else sal[pre ? `${pre}.${k}` : k] = v;
  }
  return sal;
}

function tablaHuella(huella, base) {
  const h = aplanar(huella);
  const b = base ? aplanar(base) : null;
  return Object.entries(h)
    .map(([k, v]) => {
      const partes = k.split(".");
      const etiqueta = partes.map(nombreDe).join(" · ");
      const distinto = b && JSON.stringify(b[k]) !== JSON.stringify(v);
      return `<tr${distinto ? ' class="lam-distinto"' : ""}><th>${esc(etiqueta)}</th><td>${esc(valor(partes.at(-1), v))}</td></tr>`;
    })
    .join("");
}

const MODULO = (ruta) => ruta.split("/")[1] || "inicio";

function tarjeta(v, base, familia, sub) {
  const caps = v.capturas
    .map((c) => `<figure class="lam-captura"><img src="${esc(c.archivo)}" ${c.w ? `width="${Math.round(c.w / 2)}"` : ""} alt="Variante ${esc(v.letra)} en ${esc(c.ruta)}"><figcaption>${esc(c.ruta)}</figcaption></figure>`)
    .join("");
  const modulos = Object.entries(v.porModulo)
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `<span class="lam-mod">${esc(m)} ×${n}</span>`)
    .join("");
  const pantallas = v.pantallas.slice(0, 6).map((p) => `<li><code>${esc(p)}</code></li>`).join("") + (v.pantallas.length > 6 ? `<li>y ${v.pantallas.length - 6} más</li>` : "");
  const archivos = v.archivos.length ? v.archivos.map((a) => `<li><code>${esc(a)}</code></li>`).join("") : "<li>no se encontró: buscar a mano</li>";
  const nombreFamilia = `${familia.nombre}${sub ? ` (${sub})` : ""}`;
  // Una captura ancha (una barra de pestañas, una tabla) no se lee en una tarjeta de 300 px: esa tarjeta ocupa dos columnas.
  const ancha = v.capturas.some((c) => (c.w ?? 0) / 2 > 520);
  return `<article class="lam-variante${v.foco ? " lam-con-foco" : ""}${ancha ? " lam-ancha" : ""}">
  <header><span class="lam-letra">${esc(v.letra)}</span><span class="lam-usos"><b>${v.usos}</b> ${v.usos === 1 ? "uso" : "usos"} · <b>${v.pantallas.length}</b> ${v.pantallas.length === 1 ? "pantalla" : "pantallas"}</span></header>
  <div class="lam-capturas">${caps || '<p class="lam-sin">sin captura</p>'}</div>
  <div class="lam-mods">${modulos}</div>
  ${v.sistema.length ? `<p class="lam-sistema">Pieza del sistema: ${v.sistema.map((s) => `<code>${esc(s)}</code>`).join(" ")}</p>` : ""}
  <details><summary>Cómo se ve${base ? " (en rojo, lo que cambia frente a la A)" : ""}</summary><table class="lam-huella">${tablaHuella(v.huella, base)}</table></details>
  <details><summary>Dónde vive</summary><ul>${pantallas}</ul><p class="lam-sub">Código [probable]:</p><ul>${archivos}</ul>${v.ejemplos.length ? `<p class="lam-sub">Dice:</p><p class="lam-ejemplos">${v.ejemplos.map((e) => `«${esc(e)}»`).join(" · ")}</p>` : ""}</details>
  <button type="button" class="lam-elegir" data-eleccion="Me quedo con la ${esc(v.letra)} de «${esc(nombreFamilia)}»">Elegir esta</button>
</article>`;
}

function seccionFamilia(f, propuestas) {
  const subs = f.subgrupos.filter((s) => s.variantes.length);
  if (!subs.length) return "";
  const conVarias = subs.filter((s) => s.variantes.length > 1);
  const totalVar = subs.reduce((a, s) => a + s.variantes.length, 0);
  const usos = subs.reduce((a, s) => a + s.variantes.reduce((b, v) => b + v.usos, 0), 0);
  const pantallas = new Set(subs.flatMap((s) => s.variantes.flatMap((v) => v.pantallas)));
  const cuerpoSub = (s) => {
    const MAX = 12;
    const vs = s.variantes;
    const visibles = vs.slice(0, MAX).map((v) => tarjeta(v, v === vs[0] ? null : vs[0].huella, f, s.sub)).join("");
    const resto = vs.length > MAX ? `<details class="lam-resto"><summary>Ver las otras ${vs.length - MAX} variantes</summary><div class="lam-grilla">${vs.slice(MAX).map((v) => tarjeta(v, vs[0].huella, f, s.sub)).join("")}</div></details>` : "";
    return `${s.sub ? `<h3 class="lam-subtitulo">${esc(s.sub)} <span>${vs.length} ${vs.length === 1 ? "variante" : "variantes"}</span></h3>` : ""}<div class="lam-grilla">${visibles}</div>${resto}`;
  };
  const unicos = subs.filter((s) => s.variantes.length === 1);
  const prop = propuestas[f.id]
    ? `<div class="lam-propuesta"><h3>Propuesta nueva <span>(diseño extra de /unificar)</span></h3><div class="lam-dos-temas"><figure><figcaption>Claro</figcaption><div class="lam-tema lam-tema-claro">${propuestas[f.id]}</div></figure><figure><figcaption>Oscuro</figcaption><div class="lam-tema lam-tema-oscuro">${propuestas[f.id]}</div></figure></div><button type="button" class="lam-elegir" data-eleccion="Me quedo con la propuesta nueva de «${esc(f.nombre)}»">Elegir la propuesta</button></div>`
    : "";
  const decision = f.decision ? `<p class="lam-decidida">Ya decidida el ${esc(f.decision.fecha)}: <b>${esc(f.decision.elegida)}</b> (<code>${esc(f.decision.pieza)}</code>). Lo que no es esa pieza es deuda.</p>` : "";
  return `<section class="lam-familia" id="f-${esc(f.id)}" data-familia="${esc(f.id)}" data-varias="${conVarias.length ? "si" : "no"}">
  <p class="lam-grupo">${esc(f.grupo)}</p>
  <h2>${esc(f.nombre)}</h2>
  <p class="lam-funcion">${esc(f.funcion)}</p>
  <p class="lam-cifras"><b>${totalVar}</b> ${totalVar === 1 ? "forma" : "formas distintas"} · <b>${usos}</b> usos · <b>${pantallas.size}</b> ${pantallas.size === 1 ? "pantalla" : "pantallas"}${f.pieza ? ` · hoy el sistema ofrece ${esc(f.pieza).replace(/`([^`]+)`/g, "<code>$1</code>")}` : " · el sistema no tiene una pieza para esto"}</p>
  ${f.gobierna.length ? `<p class="lam-gobierna">Reglas que ya decidieron algo aquí: ${f.gobierna.map(esc).join(", ")}. Una variante que existe POR una de ellas no es un descuido: se le pregunta a Felipe.</p>` : ""}
  ${decision}
  ${conVarias.map(cuerpoSub).join("")}
  ${unicos.length && conVarias.length ? `<details class="lam-resto"><summary>${unicos.length} ${unicos.length === 1 ? "grupo que ya se ve igual" : "grupos que ya se ven igual"} en todo el ERP</summary>${unicos.map(cuerpoSub).join("")}</details>` : ""}
  ${!conVarias.length ? unicos.map(cuerpoSub).join("") : ""}
  ${prop}
</section>`;
}

const CSS = `
:root { color-scheme: light; }
:root[data-tema="oscuro"] { color-scheme: dark; }
body.lam { margin: 0; background: var(--color-crema); color: var(--color-tinta); font-family: var(--font-dm-sans), system-ui, sans-serif; }
.lam-envoltura { max-width: 1480px; margin: 0 auto; padding: 32px 24px 96px; }
.lam-cabeza h1 { font-family: var(--font-eb-garamond), Georgia, serif; font-weight: 500; font-size: 46px; line-height: 1; margin: 6px 0 10px; }
.lam-cabeza .lam-ante { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--color-taupe); margin: 0; }
.lam-cabeza p { max-width: 80ch; margin: 0 0 8px; }
.lam-barra { position: sticky; top: 0; z-index: 3; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 0; background: var(--color-crema); border-bottom: 1px solid var(--color-sand); margin-bottom: 24px; }
.lam-barra button, .lam-elegir { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--color-sand); background: var(--color-papel); color: var(--color-tinta); cursor: pointer; }
.lam-barra button[aria-pressed="true"] { background: var(--color-tinta); color: var(--color-crema); border-color: var(--color-tinta); }
.lam-resumen { width: 100%; border-collapse: collapse; font-size: 14px; background: var(--color-papel); border: 1px solid var(--color-sand); border-radius: 12px; overflow: hidden; margin-bottom: 40px; }
.lam-resumen th, .lam-resumen td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--color-sand); vertical-align: top; }
.lam-resumen th { font-weight: 400; color: var(--color-taupe); font-size: 12px; }
.lam-resumen td.n { text-align: right; font-variant-numeric: tabular-nums; }
.lam-resumen a { color: inherit; }
.lam-familia { padding: 32px 0; border-top: 1px solid var(--color-sand); }
.lam-familia h2 { font-family: var(--font-eb-garamond), Georgia, serif; font-weight: 500; font-size: 32px; margin: 2px 0 6px; }
.lam-grupo { margin: 0; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--color-taupe); }
.lam-funcion { margin: 0 0 6px; max-width: 80ch; }
.lam-cifras, .lam-gobierna, .lam-decidida { margin: 0 0 6px; font-size: 14px; color: var(--color-taupe); }
.lam-decidida { color: var(--color-verde); }
.lam-subtitulo { font-size: 15px; font-weight: 600; margin: 22px 0 8px; }
.lam-subtitulo span { font-weight: 400; color: var(--color-taupe); }
.lam-grilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 14px; }
.lam-variante { background: var(--color-papel); border: 1px solid var(--color-sand); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.lam-variante.lam-con-foco { border-color: var(--color-rojo); }
.lam-variante.lam-ancha { grid-column: span 2; }
@media (max-width: 760px) { .lam-variante.lam-ancha { grid-column: auto; } }
.lam-variante header { display: flex; align-items: baseline; gap: 10px; }
.lam-letra { font-family: var(--font-eb-garamond), Georgia, serif; font-size: 30px; line-height: 1; }
.lam-usos { font-size: 13px; color: var(--color-taupe); }
.lam-usos b { color: var(--color-tinta); font-weight: 600; }
.lam-capturas { display: flex; flex-direction: column; gap: 8px; }
.lam-captura { margin: 0; padding: 10px; background: var(--color-hueso); border-radius: 10px; overflow: auto; }
.lam-captura img { display: block; max-width: 100%; height: auto; }
.lam-captura figcaption { font-size: 11px; color: var(--color-taupe); margin-top: 6px; }
.lam-mods { display: flex; flex-wrap: wrap; gap: 4px; }
.lam-mod { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--color-hueso); color: var(--color-taupe); }
.lam-sistema, .lam-sub { font-size: 12px; margin: 0; color: var(--color-taupe); }
.lam-variante details { font-size: 13px; }
.lam-variante summary { cursor: pointer; color: var(--color-taupe); }
.lam-variante ul { margin: 6px 0; padding-left: 18px; }
.lam-huella { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
.lam-huella th { text-align: left; font-weight: 400; color: var(--color-taupe); padding: 2px 8px 2px 0; width: 52%; }
.lam-huella td { padding: 2px 0; }
.lam-huella tr.lam-distinto td, .lam-huella tr.lam-distinto th { color: var(--color-rojo); font-weight: 600; }
.lam-ejemplos { margin: 0; color: var(--color-tinta); }
.lam-elegir { align-self: flex-start; margin-top: auto; }
.lam-elegir.lam-copiado { background: var(--color-verde); color: var(--color-crema); border-color: var(--color-verde); }
.lam-resto { margin-top: 14px; }
.lam-resto > summary { cursor: pointer; color: var(--color-taupe); font-size: 14px; }
.lam-propuesta { margin-top: 24px; padding: 16px; border: 2px solid var(--color-tinta); border-radius: 16px; background: var(--color-papel); }
.lam-propuesta h3 { margin: 0 0 10px; font-size: 18px; }
.lam-propuesta h3 span { font-weight: 400; color: var(--color-taupe); font-size: 14px; }
.lam-dos-temas { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.lam-dos-temas figure { margin: 0; }
.lam-dos-temas figcaption { font-size: 12px; color: var(--color-taupe); margin-bottom: 4px; }
.lam-tema { padding: 20px; border: 1px solid var(--color-sand); border-radius: 12px; background: var(--color-crema); color: var(--color-tinta); overflow: auto; }
.lam-sin { font-size: 12px; color: var(--color-taupe); }
.lam-nota { font-size: 13px; color: var(--color-taupe); max-width: 80ch; }
body.lam-solo-varias .lam-familia[data-varias="no"] { display: none; }
@media (max-width: 760px) { .lam-dos-temas { grid-template-columns: 1fr; } .lam-cabeza h1 { font-size: 34px; } }
`;

const JS = `
document.querySelectorAll('[data-accion="tema"]').forEach((b) => b.addEventListener('click', () => {
  const r = document.documentElement; r.dataset.tema = r.dataset.tema === 'oscuro' ? 'claro' : 'oscuro'; b.setAttribute('aria-pressed', String(r.dataset.tema === 'oscuro'));
}));
document.querySelectorAll('[data-accion="varias"]').forEach((b) => b.addEventListener('click', () => {
  const on = document.body.classList.toggle('lam-solo-varias'); b.setAttribute('aria-pressed', String(on));
}));
document.querySelectorAll('.lam-elegir').forEach((b) => b.addEventListener('click', async () => {
  const t = b.dataset.eleccion; try { await navigator.clipboard.writeText(t); } catch {}
  const antes = b.textContent; b.textContent = 'Copiado: pégalo en el chat'; b.classList.add('lam-copiado');
  setTimeout(() => { b.textContent = antes; b.classList.remove('lam-copiado'); }, 2600);
}));
`;

/**
 * Los tokens de color de cada tema, sacados del CSS que sirvió el ERP: los claros del bloque `:root, :host` (el `@theme` de
 * globals.css) y los oscuros del bloque `:root[data-tema="oscuro"]` (tema.css). Se vuelven a declarar en el recuadro de cada tema,
 * así la propuesta se ve en claro y en oscuro una al lado de la otra, sin iframes (que Playwright no fotografía bien).
 */
function tokensPorTema(dirSalida) {
  let css = "";
  try {
    css = readFileSync(join(dirSalida, "recursos", "app.css"), "utf8");
  } catch {
    return { claro: "", oscuro: "" };
  }
  const declaraciones = (bloques) => {
    const vistos = new Map();
    for (const b of bloques) for (const m of b.matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g)) if (!vistos.has(m[1])) vistos.set(m[1], m[2].trim());
    return [...vistos.entries()].map(([k, v]) => `${k}: ${v};`).join(" ");
  };
  const claro = declaraciones([...css.matchAll(/:root,\s*:host\s*\{([^{}]*)\}/g)].map((m) => m[1]));
  const oscuro = declaraciones([...css.matchAll(/:root\[data-tema=["']?oscuro["']?\]\s*\{([^{}]*)\}/g)].map((m) => m[1]));
  // `--foco-color` se resuelve en :root; dentro de cada recuadro tiene que seguir a SU tinta.
  return { claro: `${claro} --foco-color: var(--color-tinta); color-scheme: light;`, oscuro: `${oscuro} --foco-color: var(--color-tinta); color-scheme: dark;` };
}

/**
 * Escribe la lámina. `censo` es lo que arma la CLI; `propuestasDir`, la carpeta de las propuestas (`docs/unificar/propuestas`).
 * Devuelve la ruta del HTML.
 */
export function escribirLamina(dirSalida, censo, { propuestasDir, foco } = {}) {
  const propuestas = {};
  if (propuestasDir && existsSync(propuestasDir)) {
    for (const f of censo.familias) {
      const archivo = join(propuestasDir, `${f.id}.html`);
      if (existsSync(archivo)) propuestas[f.id] = readFileSync(archivo, "utf8");
    }
  }
  const temas = tokensPorTema(dirSalida);
  const filas = censo.familias
    .filter((f) => f.subgrupos.some((s) => s.variantes.length))
    .map((f) => {
      const vs = f.subgrupos.flatMap((s) => s.variantes);
      const varias = f.subgrupos.filter((s) => s.variantes.length > 1).length;
      const pantallas = new Set(vs.flatMap((v) => v.pantallas));
      return { f, variantes: vs.length, varias, usos: vs.reduce((a, v) => a + v.usos, 0), pantallas: pantallas.size };
    })
    .sort((a, b) => b.variantes - a.variantes);
  const resumen = `<table class="lam-resumen"><thead><tr><th>Familia</th><th>Qué hace</th><th class="n">Formas distintas</th><th class="n">Usos</th><th class="n">Pantallas</th><th>Decisión</th></tr></thead><tbody>${filas
    .map(({ f, variantes, usos, pantallas, varias }) => `<tr><td><a href="#f-${esc(f.id)}">${esc(f.nombre)}</a></td><td>${esc(f.funcion)}</td><td class="n">${variantes}${f.subgrupos.length > 1 ? ` <small>(${varias} con más de una)</small>` : ""}</td><td class="n">${usos}</td><td class="n">${pantallas}</td><td>${f.decision ? `decidida: ${esc(f.decision.elegida)}` : propuestas[f.id] ? "con propuesta" : "—"}</td></tr>`)
    .join("")}</tbody></table>`;
  const html = `<!doctype html>
<html lang="es" class="${esc(censo.estilos.claseHtml)}" data-tema="claro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unificar · lámina</title>
<link rel="stylesheet" href="recursos/app.css">
<style>${CSS}
.lam-tema-claro { ${temas.claro} }
.lam-tema-oscuro { ${temas.oscuro} }</style>
</head>
<body class="lam lam-solo-varias ${esc(censo.estilos.claseBody)}">
<div class="lam-envoltura">
<header class="lam-cabeza">
  <p class="lam-ante">CAYLA · /unificar · ${esc(censo.cuando)}</p>
  <h1>Una función, una pieza</h1>
  <p>Cada familia junta lo que hace lo mismo para quien usa el ERP. Cada letra es una forma distinta de dibujarla que hoy convive en el sistema: la <b>A</b> es la más usada. Elige con cuál te quedas (o con la propuesta nueva) y esa será la única de aquí en adelante, en todos los módulos y en las pantallas que vengan.</p>
  <p class="lam-nota">Censo de ${censo.visitas} vistas (${esc(censo.cuentas.join(", "))}) contra ${esc(censo.baseUrl)}${foco ? `, con foco en <b>${esc(foco)}</b> (borde rojo: la variante aparece en ese módulo)` : ""}. Las capturas son del tema claro y del seed local: nombres largos y listas de cientos de filas no se probaron.</p>
</header>
<nav class="lam-barra" aria-label="Opciones de la lámina">
  <button type="button" data-accion="varias" aria-pressed="true">Solo familias con más de una forma</button>
  <button type="button" data-accion="tema" aria-pressed="false">Modo oscuro</button>
</nav>
${resumen}
${censo.familias.map((f) => seccionFamilia(f, propuestas)).join("\n")}
</div>
<script>${JS}</script>
</body>
</html>`;
  const ruta = join(dirSalida, "lamina.html");
  writeFileSync(ruta, html);
  return ruta;
}

/** Guarda el CSS que sirvió el ERP (y sus fuentes) junto a la lámina, para que se vea igual sin el servidor. */
export async function guardarEstilos(dirSalida, estilos, baseUrl) {
  const dir = join(dirSalida, "recursos");
  mkdirSync(join(dir, "fuentes"), { recursive: true });
  const partes = [];
  for (const href of estilos.hojas) {
    try {
      const r = await fetch(href);
      if (r.ok) partes.push({ base: href, css: await r.text() });
    } catch {
      /* una hoja que no responde: la lámina se ve con menos estilo, no se cae */
    }
  }
  for (const css of estilos.enLinea) partes.push({ base: baseUrl + "/", css });
  const bajadas = new Map();
  let todo = "";
  for (const { base, css } of partes) {
    let salida = css;
    for (const m of [...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)]) {
      const original = m[2];
      if (original.startsWith("data:") || original.startsWith("#")) continue;
      const absoluta = new URL(original, base).href;
      if (!bajadas.has(absoluta)) {
        const nombre = `${bajadas.size}-${basename(new URL(absoluta).pathname)}`.replace(/[^a-z0-9._-]/gi, "_");
        try {
          const r = await fetch(absoluta);
          if (r.ok) writeFileSync(join(dir, "fuentes", nombre), Buffer.from(await r.arrayBuffer()));
          bajadas.set(absoluta, `fuentes/${nombre}`);
        } catch {
          bajadas.set(absoluta, absoluta);
        }
      }
      salida = salida.split(m[0]).join(`url("${bajadas.get(absoluta)}")`);
    }
    todo += `\n/* ${base} */\n${salida}`;
  }
  writeFileSync(join(dir, "app.css"), todo);
}
