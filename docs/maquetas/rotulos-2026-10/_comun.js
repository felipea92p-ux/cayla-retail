'use strict';
/* =====================================================================
   Maqueta · Rótulos de anaquel (2026-10-12) — lo que comparten A, B y C:
   los datos (inventados), las reglas del rótulo (las de lib/rotulos-reglas.ts:
   armarRotulos y medidaNombre, copiadas tal cual para que lo que se ve sea lo que sale),
   el buscador, la cabecera, las copias, el aviso y la barra de la maqueta.
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinTilde = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const coma = (n) => String(n).replace('.', ',');
const EASE = 'cubic-bezier(.32,.72,.24,1)';
const SALIDA = 'cubic-bezier(.4,0,1,1)';

/* ---------- datos inventados (nombres, marcas y colores de prueba) ---------- */
const CATALOGO = [
  { id: 'p01', ref: 'Chaleco Valeria', cod: 'CHL-0012', cat: 'Chalecos', marca: 'Mias', tallas: ['S', 'M', 'L'], color: '#c9b79c' },
  { id: 'p02', ref: 'Body Bonita', cod: 'BOD-0007', cat: 'Bodies', marca: 'CAYLA', tallas: ['XS', 'S', 'M', 'L'], color: '#2a2926' },
  { id: 'p03', ref: 'Camisa crop con amarres', cod: 'CAM-0021', cat: 'Camisas', marca: 'Nativa', tallas: ['S', 'M', 'L', 'XL'], color: '#e7dfcf' },
  { id: 'p04', ref: 'Blusa Lucía', cod: 'BLU-0031', cat: 'Blusas', marca: 'CAYLA', tallas: ['S', 'M', 'L'], color: '#efe9de' },
  { id: 'p05', ref: 'Vestido Mar', cod: 'VES-0014', cat: 'Vestidos', marca: 'Lumière', tallas: ['S', 'M', 'L'], color: '#2f6b5a' },
  { id: 'p06', ref: 'Jean Baggy', cod: 'JEA-0009', cat: 'Jeans', marca: 'Denim & Co', tallas: ['26', '28', '30', '32', '34'], color: '#8aa1ba' },
  { id: 'p07', ref: 'Blazer Sol', cod: 'BLA-0004', cat: 'Blazers', marca: 'CAYLA', tallas: ['S', 'M', 'L'], color: '#d6c3a1' },
  { id: 'p08', ref: 'Pantalón Ana', cod: 'PAN-0018', cat: 'Pantalones', marca: 'Mias', tallas: ['XS', 'S', 'M', 'L', 'XL'], color: '#34322e' },
  { id: 'p09', ref: 'Polo Básico M/corta', cod: 'POL-0002', cat: 'Polos', marca: 'CAYLA', tallas: ['S', 'M', 'L', 'XL'], color: '#e3d8c5' },
  { id: 'p10', ref: 'Bailarina Alba', cod: 'BAI-0011', cat: 'Bailarinas', marca: 'Andina', tallas: ['35', '36', '37', '38', '39'], color: '#d48a72' },
  { id: 'p11', ref: 'Casaca Andes', cod: 'CAS-0006', cat: 'Casacas', marca: 'Nativa', tallas: ['M', 'L'], color: '#6b5843' },
  { id: 'p12', ref: 'Falda plisada Rocío', cod: 'FAL-0010', cat: 'Faldas', marca: 'Lumière', tallas: ['S', 'M', 'L'], color: '#b9a3c6' },
  { id: 'p13', ref: 'Cárdigan Inés', cod: 'CAR-0003', cat: 'Cárdigans', marca: 'Mias', tallas: ['Única'], color: '#8e3b33' },
  { id: 'p14', ref: 'Corset Lis', cod: 'COR-0005', cat: 'Corsets', marca: 'CAYLA', tallas: ['S', 'M'], color: '#e6d2c5' },
  { id: 'p15', ref: 'Chaleco Valentina', cod: 'CHL-0015', cat: 'Chalecos', marca: 'Mias', tallas: ['S', 'M', 'L'], color: '#7d8a6a' },
  { id: 'p16', ref: 'Bolso tejido Paz', cod: 'ACC-0008', cat: 'Accesorios', marca: 'Nativa', tallas: ['Única'], color: '#c08a4e' },
  { id: 'p17', ref: 'Short lino Brisa', cod: 'SHO-0013', cat: 'Shorts', marca: 'Lumière', tallas: ['S', 'M', 'L'], color: '#dcd2bd' },
  { id: 'p18', ref: 'Vestido midi Carmen', cod: 'VES-0019', cat: 'Vestidos', marca: 'CAYLA', tallas: ['XS', 'S', 'M', 'L'], color: '#7a2e2a' },
  { id: 'p19', ref: 'Camisa oversize Lima', cod: 'CAM-0024', cat: 'Camisas', marca: 'Mias', tallas: ['S', 'M', 'L'], color: '#a9bfd1' },
  { id: 'p20', ref: 'Mía', cod: 'TOP-0001', cat: 'Tops', marca: 'Mias', tallas: ['S', 'M', 'L'], color: '#efd5cd' },
  { id: 'p21', ref: 'Jean mom Celeste', cod: 'JEA-0016', cat: 'Jeans', marca: 'Denim & Co', tallas: ['26', '28', '30', '32'], color: '#9db5cc' },
  { id: 'p22', ref: 'Polo rib Nube', cod: 'POL-0017', cat: 'Polos', marca: 'CAYLA', tallas: ['S', 'M', 'L'], color: '#f1ede4' },
  { id: 'p23', ref: 'Blusa manga globo Iris', cod: 'BLU-0022', cat: 'Blusas', marca: 'Lumière', tallas: ['S', 'M', 'L'], color: '#d9c7e3' },
  { id: 'p24', ref: 'Pantalón palazzo Sara', cod: 'PAN-0020', cat: 'Pantalones', marca: 'Nativa', tallas: ['S', 'M', 'L', 'XL'], color: '#50535a' },
];
const POR_ID = new Map(CATALOGO.map((m) => [m.id, m]));
const INICIALES = ['p01', 'p02', 'p03'];

/* ---------- reglas del rótulo (lib/rotulos-reglas.ts) ---------- */
const MAX_JUNTOS = 4;
const MAX_COPIAS = 20;
const ORDEN_LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const esUnica = (t) => ['unica', 'unico', 'u'].includes(sinTilde(t.trim()));
function ordenTalla(a, b) {
  const ra = esUnica(a) ? 2 : /^\d+$/.test(a) ? 0 : 1, rb = esUnica(b) ? 2 : /^\d+$/.test(b) ? 0 : 1;
  if (ra !== rb) return ra - rb;
  if (ra === 0) return Number(a) - Number(b);
  const ia = ORDEN_LETRAS.indexOf(a.toUpperCase()), ib = ORDEN_LETRAS.indexOf(b.toUpperCase());
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es');
}
function unicos(valores) {
  const vistos = new Set(); const salida = [];
  for (const v of valores) { const k = v.trim().toLocaleLowerCase('es'); if (!k || vistos.has(k)) continue; vistos.add(k); salida.push(v.trim()); }
  return salida;
}
function unRotulo(ms) {
  return {
    clave: ms.map((m) => m.id).join('+'),
    modelos: ms.map((m) => m.ref.trim()),
    marcas: unicos(ms.flatMap((m) => (m.marca ? [m.marca] : []))),
    tallas: unicos(ms.flatMap((m) => m.tallas)).sort(ordenTalla),
    prendas: ms,
  };
}
const ANCHO_NOMBRE_MM = 57, ALTO_NOMBRE_MM = 23.5, MAX_NOMBRE_MM = 14, INTERLINEA_NOMBRE = 1.02, MAX_LINEAS = 3, HOLGURA = 0.96;
const ANCHO_LETRA = {
  A: 0.703, B: 0.632, C: 0.73, D: 0.699, E: 0.575, F: 0.548, G: 0.769, H: 0.708, I: 0.267, J: 0.535, K: 0.65, L: 0.552, M: 0.88,
  N: 0.724, Ñ: 0.724, O: 0.774, P: 0.607, Q: 0.774, R: 0.624, S: 0.596, T: 0.591, U: 0.677, V: 0.7, W: 1.013, X: 0.667, Y: 0.631,
  Z: 0.572, 0: 0.696, 1: 0.359, 2: 0.567, 3: 0.595, 4: 0.645, 5: 0.612, 6: 0.624, 7: 0.527, 8: 0.624, 9: 0.624,
  ' ': 0.25, '·': 0.247, '-': 0.569, '.': 0.25, ',': 0.25, "'": 0.25, '/': 0.4, '&': 0.75,
};
function anchoEm(texto) {
  let total = 0;
  for (const c of texto.toLocaleUpperCase('es')) {
    const base = c === 'Ñ' ? c : c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    total += ANCHO_LETRA[base] ?? 0.78;
  }
  return total;
}
function lineasConAncho(palabras, ancho) {
  let lineas = 1, actual = 0;
  for (const p of palabras) {
    const w = anchoEm(p); const con = actual === 0 ? w : actual + ANCHO_LETRA[' '] + w;
    if (con <= ancho + 1e-9) actual = con; else { lineas++; actual = w; }
  }
  return lineas;
}
function medidaNombre(nombres) {
  const palabras = nombres.flatMap((n, i) => { const p = n.trim().split(/\s+/).filter(Boolean); if (i < nombres.length - 1 && p.length) p[p.length - 1] += ' ·'; return p; });
  if (!palabras.length) return { mm: MAX_NOMBRE_MM, lineas: 1 };
  const cand = new Set();
  for (let i = 0; i < palabras.length; i++) for (let j = i; j < palabras.length; j++) cand.add(anchoEm(palabras.slice(i, j + 1).join(' ')));
  const anchos = [...cand].sort((a, b) => a - b);
  let mejor = { mm: 0, lineas: 1 };
  for (let lineas = 1; lineas <= MAX_LINEAS; lineas++) {
    const ancho = anchos.find((w) => lineasConAncho(palabras, w) <= lineas);
    if (ancho === undefined) continue;
    const mm = Math.floor(Math.min((ANCHO_NOMBRE_MM * HOLGURA) / ancho, (ALTO_NOMBRE_MM * HOLGURA) / (lineas * INTERLINEA_NOMBRE), MAX_NOMBRE_MM) * 10) / 10;
    if (mm > mejor.mm) mejor = { mm, lineas: lineasConAncho(palabras, ANCHO_NOMBRE_MM / mm) };
  }
  return mejor;
}
/** Hasta dónde se lee el nombre, en metros. Regla de rotulación: la mayúscula (≈ 0,7 de la letra) se lee bien hasta unas
 *  350 veces su alto. Es una estimación: la vara de verdad es un rótulo impreso pegado en el almacén. */
const seLeeHasta = (mm) => Math.round(mm * 0.7 * 0.35 * 2) / 2;
/** «unos 2,5 m», «un metro», «medio metro»: la distancia dicha como en la tienda. */
const distancia = (m) => (m <= 0.5 ? 'medio metro' : m === 1 ? 'un metro' : `unos ${coma(m)} m`);

/* ---------- estado ---------- */
const S = { maq: 'A', vista: 'escritorio', tema: 'light', inicio: 'vacio', bucle: true, rm: false, ids: [], juntar: false, copias: {} };
const T = (ms) => (S.rm ? 1 : ms);
let timers = [];
const luego = (f, ms) => { const t = setTimeout(f, T(ms)); timers.push(t); return t; };
const limpiarTimers = () => { timers.forEach(clearTimeout); timers = []; };
const MAQ = {};
const M = () => MAQ[S.maq];

const modelos = () => S.ids.map((id) => POR_ID.get(id)).filter(Boolean);
const puedeJuntar = () => S.ids.length >= 2 && S.ids.length <= MAX_JUNTOS;
const juntas = () => S.juntar && puedeJuntar();
function rotulos() { const ms = modelos(); if (!ms.length) return []; return juntas() ? [unRotulo(ms)] : ms.map((m) => unRotulo([m])); }
const copiasDe = (clave) => (S.copias[clave] ?? 1);
const totalCopias = () => rotulos().reduce((a, r) => a + copiasDe(r.clave), 0);

function agregar(id) { if (S.ids.includes(id)) return; S.ids = [...S.ids, id]; render('agregar', { id }); }
function quitar(id) { if (!S.ids.includes(id)) return; S.ids = S.ids.filter((x) => x !== id); render('quitar', { id }); const i = $('.pag .buscador input'); if (document.activeElement === document.body || !document.activeElement) i?.focus({ preventScroll: true }); }
function setJuntar(v) { if (v && !puedeJuntar()) return; if (S.juntar === v) return; S.juntar = v; render('juntar'); }
function setCopias(clave, n) { const v = Math.max(0, Math.min(MAX_COPIAS, n)); if (v === copiasDe(clave)) return; S.copias[clave] = v; render('copias', { clave }); }
function render(motivo, datos) { M().render(motivo, datos || {}); actualizarCabecera(); $$('.pag .buscador').forEach((b) => b.refrescar?.()); }

/* ---------- el rótulo (RotuloAnaquel.tsx) ---------- */
function rotuloHTML(r, { fantasma = false } = {}) {
  const { mm } = medidaNombre(r.modelos);
  const unica = r.tallas.length === 1 && esUnica(r.tallas[0]);
  const nombre = r.modelos.map((n, i) => (i < r.modelos.length - 1 ? `${esc(n)}&nbsp;· ` : esc(n))).join('');
  const marca = r.marcas.length ? `<p class="rot-marca">Marca: ${esc(r.marcas.join(' / '))}</p>` : '';
  const tallas = r.tallas.length ? `<p class="rot-tallas">${unica ? '<span>Talla única</span>' : r.tallas.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : '';
  return `<article class="rotulo-anaquel ${fantasma ? 'fantasma' : ''}" aria-label="Rótulo de ${esc(r.modelos.join(', '))}"><p class="rot-nombre" style="font-size:${mm}mm;line-height:${INTERLINEA_NOMBRE}"><span>${nombre}</span></p>${marca}${tallas}</article>`;
}
const EJEMPLO = { clave: 'ejemplo', modelos: ['Nombre de la prenda'], marcas: ['de la prenda'], tallas: ['S', 'M', 'L'], prendas: [] };

/* ---------- piezas chicas ---------- */
function tintaSobre(hex) { const n = parseInt(hex.slice(1), 16); const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.62 ? 'var(--tinta-fija)' : 'var(--crema-fija)'; }
const mini = (m) => `<span class="mini" data-color-dato style="--c:${m.color};color:${tintaSobre(m.color)}">${ic('prenda')}</span>`;
const chipHTML = (m) => `<span class="chip" data-k="${m.id}"><span class="punto" data-color-dato style="background:${m.color}"></span><span class="chip-t">${esc(m.ref)}</span><button type="button" class="x" data-quitar="${m.id}" aria-label="Quitar ${esc(m.ref)}">${ic('x')}</button></span>`;
const tallasTexto = (ts) => (ts.length === 1 && esUnica(ts[0]) ? 'Talla única' : ts.join(' · '));
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); }

function pasoHTML(clave, { etiqueta = true } = {}) {
  const n = copiasDe(clave);
  return `<div class="paso-c">${etiqueta ? '<span class="et">Copias</span>' : ''}<div class="paso" role="spinbutton" tabindex="0" aria-label="Copias" aria-valuemin="0" aria-valuemax="${MAX_COPIAS}" aria-valuenow="${n}" data-paso="${esc(clave)}">`
    + `<button type="button" tabindex="-1" data-menos="${esc(clave)}" aria-label="Una copia menos" ${n <= 0 ? 'disabled' : ''}>${ic('menos')}</button>`
    + `<span class="n"><span class="odo" data-v="${n}"><span>${n}</span></span></span>`
    + `<button type="button" tabindex="-1" data-mas="${esc(clave)}" aria-label="Una copia más" ${n >= MAX_COPIAS ? 'disabled' : ''}>${ic('mas')}</button></div></div>`;
}
function actualizarPasos(clave) {
  const n = copiasDe(clave);
  $$(`[data-paso="${CSS.escape(clave)}"]`).forEach((p) => { p.setAttribute('aria-valuenow', n); odo($('.odo', p), n); $('[data-menos]', p).disabled = n <= 0; $('[data-mas]', p).disabled = n >= MAX_COPIAS; });
}
function modoHTML() { return `<div class="modo" role="group" aria-label="Cómo salen"><span class="pulgar" aria-hidden="true"></span><button type="button" data-juntar="0">Uno por prenda</button><button type="button" data-juntar="1">Todas en uno</button></div>`; }
function pintarModo(cont) {
  if (!cont) return;
  if (!$('.modo', cont)) cont.innerHTML = modoHTML();
  const v = juntas() ? 1 : 0; const m = $('.modo', cont); m.dataset.v = v;
  $$('button', m).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.juntar) === v)));
  $('[data-juntar="1"]', m).disabled = !puedeJuntar();
}

/* contador que gira: la cifra vieja sale por un lado y la nueva entra por el otro */
function odo(e, v) {
  if (!e) return; v = String(v); const prev = e.dataset.v; if (prev === v && e.children.length) return; e.dataset.v = v;
  const n = document.createElement('span'); n.textContent = v;
  if (prev == null || S.rm || !e.children.length) { e.replaceChildren(n); return; }
  const dir = Number(v) >= Number(prev) ? 1 : -1;
  n.style.transform = `translateY(${dir * 100}%)`; n.style.opacity = '0';
  const viejos = [...e.children]; e.append(n); void n.offsetWidth;
  n.style.transform = ''; n.style.opacity = '';
  viejos.forEach((o) => { o.style.transform = `translateY(${-dir * 100}%)`; o.style.opacity = '0'; setTimeout(() => o.remove(), 360); });
}
/* cifra que cuenta de una a otra (con decimales si hace falta) */
function contar(e, desde, hasta, ms = 600, dec = 0) {
  if (!e) return; const fmt = (x) => coma(String(Number(x.toFixed(dec))));
  if (S.rm || desde === hasta) { e.textContent = fmt(hasta); return; }
  const t0 = performance.now(); const dur = T(ms); const tok = (e._tok = (e._tok || 0) + 1);
  const paso = (t) => { if (e._tok !== tok) return; const k = Math.min(1, (t - t0) / dur); const ease = 1 - Math.pow(1 - k, 3); e.textContent = fmt(desde + (hasta - desde) * ease); if (k < 1) requestAnimationFrame(paso); };
  requestAnimationFrame(paso);
}

/**
 * Rehace el contenido de `cont` y anima el cambio: lo que sigue se desliza a su nuevo lugar (FLIP), lo nuevo se entrega a
 * `entra` y lo que se fue queda como un fantasma en su lugar viejo para que `sale` lo despida. `escala` corrige el FLIP
 * cuando el contenedor está achicado con transform (el anaquel visto de lejos).
 */
function rehacer(cont, html, { entra, sale, escala = 1, dur = 480 } = {}) {
  const antes = new Map($$('[data-k]', cont).filter((n) => !n.classList.contains('fantasma')).map((n) => [n.dataset.k, { n, r: n.getBoundingClientRect() }]));
  cont.innerHTML = html;
  const base = cont.getBoundingClientRect();
  const nuevos = [];
  $$('[data-k]', cont).forEach((n) => {
    const a = antes.get(n.dataset.k);
    if (!a) { nuevos.push(n); return; }
    antes.delete(n.dataset.k);
    const r = n.getBoundingClientRect();
    const dx = (a.r.left - r.left) / escala, dy = (a.r.top - r.top) / escala;
    if (!S.rm && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) n.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: dur, easing: EASE });
  });
  antes.forEach(({ n, r }) => {
    if (!sale || S.rm) return;
    const g = n.cloneNode(true); g.removeAttribute('data-k'); $$('[data-k]', g).forEach((x) => x.removeAttribute('data-k'));
    g.classList.add('fantasma'); g.setAttribute('aria-hidden', 'true'); g.inert = true;
    Object.assign(g.style, { position: 'absolute', left: `${(r.left - base.left) / escala}px`, top: `${(r.top - base.top) / escala}px`, width: `${r.width / escala}px`, height: `${r.height / escala}px`, margin: '0', pointerEvents: 'none', zIndex: '5' });
    cont.append(g); sale(g, () => g.remove());
  });
  nuevos.forEach((n, i) => entra?.(n, i));
  return nuevos;
}

/* ---------- buscador (Buscador / ComboBuscable: busca mientras se escribe, sin tildes ni mayúsculas) ---------- */
function crearBuscador({ grande = false, fichas = false, alElegir }) {
  const raiz = el(`<div class="buscador ${grande ? 'grande' : ''} ${fichas ? 'con-fichas' : ''}">
    <div class="caja">${ic('lupa', 'lupa')}${fichas ? '<div class="fichas" data-chips></div>' : ''}
      <input type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-label="Buscar una prenda para el rótulo">
      <button type="button" class="limpiar" aria-label="Borrar la búsqueda" hidden>${ic('x')}</button><kbd aria-hidden="true" title="Atajo: /">/</kbd></div>
    <div class="lista" role="listbox" aria-label="Prendas" hidden></div></div>`);
  const inp = $('input', raiz), lista = $('.lista', raiz), limpiar = $('.limpiar', raiz), kbd = $('kbd', raiz);
  let activa = 0, opciones = [], abierta = false;
  const resultados = (q) => {
    const n = sinTilde(q.trim()); const libres = CATALOGO.filter((m) => !S.ids.includes(m.id));
    if (!n) return libres;
    // primero lo que empieza con lo escrito, después el nombre que lo contiene, el código, la categoría y al final la marca
    const puntaje = (m) => { const r = sinTilde(m.ref); return r.startsWith(n) || r.includes(` ${n}`) ? 0 : r.includes(n) ? 1 : sinTilde(m.cod).includes(n) ? 2 : sinTilde(m.cat).includes(n) ? 3 : sinTilde(m.marca).includes(n) ? 4 : 9; };
    return libres.map((m) => [puntaje(m), m]).filter(([p]) => p < 9).sort((a, b) => a[0] - b[0]).map(([, m]) => m);
  };
  const resaltar = (t, q) => { const n = sinTilde(q.trim()); const i = n ? sinTilde(t).indexOf(n) : -1; return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + n.length))}</mark>${esc(t.slice(i + n.length))}`; };
  function pintar(recien) {
    const q = inp.value; opciones = resultados(q); activa = Math.max(0, Math.min(activa, opciones.length - 1));
    inp.placeholder = fichas && S.ids.length ? 'Suma otra prenda…' : 'Busca por nombre o código';
    limpiar.hidden = !q; kbd.hidden = !!q || document.activeElement === inp;
    if (!abierta) { lista.hidden = true; inp.setAttribute('aria-expanded', 'false'); return; }
    lista.hidden = false; inp.setAttribute('aria-expanded', 'true');
    if (recien) { lista.classList.remove('revela'); void lista.offsetWidth; lista.classList.add('revela'); }
    if (!opciones.length) {
      lista.innerHTML = q.trim()
        ? `<div class="nada">${ic('lupa-x')}<b>Ninguna prenda se llama «${esc(q.trim())}»</b><span>Prueba con una parte del nombre o con el código de la etiqueta.</span><button type="button" class="btn-enlace" data-borrar>Borrar la búsqueda</button></div>`
        : `<div class="nada">${ic('check')}<b>Ya elegiste todas las prendas</b><span>Quita alguna para cambiarla.</span></div>`;
      return;
    }
    lista.innerHTML = opciones.map((m, i) => `<div class="opc ${recien ? 'cae' : ''}" role="option" id="opc-${m.id}" data-id="${m.id}" aria-selected="${i === activa}" style="--i:${Math.min(i, 9)}">${mini(m)}<div class="opc-t"><span class="t">${resaltar(m.ref, q)}</span><span class="d">${esc(m.cat)} · ${resaltar(m.cod, q)} · ${esc(m.marca)}</span></div><span class="enter">Enter ↵</span></div>`).join('')
      + `<div class="lista-pie">${plural(opciones.length, 'prenda', 'prendas')} · ↑ ↓ para moverte, Enter para sumarla</div>`;
    inp.setAttribute('aria-activedescendant', opciones[activa] ? `opc-${opciones[activa].id}` : '');
  }
  const marcar = () => { $$('.opc', lista).forEach((n, j) => n.setAttribute('aria-selected', String(j === activa))); inp.setAttribute('aria-activedescendant', opciones[activa] ? `opc-${opciones[activa].id}` : ''); $('.opc[aria-selected="true"]', lista)?.scrollIntoView({ block: 'nearest' }); };
  function elegir(id) { inp.value = ''; activa = 0; abierta = false; alElegir(id); inp.focus({ preventScroll: true }); pintar(false); }
  const abrir = () => { if (!abierta) { abierta = true; pintar(true); } };
  inp.addEventListener('click', abrir);
  inp.addEventListener('focus', () => pintar(false));
  inp.addEventListener('input', () => { activa = 0; if (!abierta) { abierta = true; pintar(true); } else pintar(false); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!abierta) return abrir(); activa = Math.min(activa + 1, opciones.length - 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activa = Math.max(activa - 1, 0); marcar(); }
    else if (e.key === 'Enter') { if (abierta && opciones[activa]) { e.preventDefault(); elegir(opciones[activa].id); } else abrir(); }
    else if (e.key === 'Escape') { if (abierta || inp.value) { e.stopPropagation(); if (inp.value) inp.value = ''; else abierta = false; pintar(false); } }
    else if (e.key === 'Backspace' && !inp.value && fichas && S.ids.length) { quitar(S.ids[S.ids.length - 1]); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) { abierta = false; pintar(false); } }, 140));
  lista.addEventListener('mousedown', (e) => e.preventDefault());
  lista.addEventListener('click', (e) => { const o = e.target.closest('.opc'); if (o) return elegir(o.dataset.id); if (e.target.closest('[data-borrar]')) { inp.value = ''; inp.focus(); pintar(false); } });
  lista.addEventListener('mousemove', (e) => { const o = e.target.closest('.opc'); if (!o) return; const i = opciones.findIndex((m) => m.id === o.dataset.id); if (i !== activa && i >= 0) { activa = i; $$('.opc', lista).forEach((n, j) => n.setAttribute('aria-selected', String(j === i))); } });
  $('.caja', raiz).addEventListener('mousedown', (e) => { if (e.target === e.currentTarget) { e.preventDefault(); inp.focus(); abrir(); } });
  limpiar.addEventListener('click', () => { inp.value = ''; inp.focus(); pintar(false); });
  raiz.refrescar = () => pintar(false);
  pintar(false);
  return raiz;
}

/* ---------- cabecera ---------- */
function cabecera() {
  const f = new Date();
  const dia = f.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const hora = f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  return el(`<header class="cab" data-voz="cabecera">
    <div class="cab-izq">
      <div class="linea sube"><a class="volver" href="#" aria-label="Volver a Inicio" title="Volver a Inicio">${ic('flecha-izq')}</a>
        <p class="sede"><span class="hilo" aria-hidden="true"></span><span>Tienda TRU · ${dia} · ${hora}</span></p></div>
      <h1 class="sube" style="--i:1">Rótulos de anaquel</h1>
      <p class="frase sube" style="--i:2">Para el canto del anaquel o el frente de las bolsas: dice de lejos qué prenda hay ahí, con su marca y sus tallas.</p>
    </div>
    <div class="acciones oculto" data-acciones>
      <button class="btn btn-secundario" type="button" data-guia>${ic('libro')}Guía de impresión</button>
      <button class="btn btn-primario" type="button" data-imprimir>${ic('impresora')}<span data-imp-txt></span></button>
    </div></header>`);
}
function actualizarCabecera() {
  const acc = $('[data-acciones]'); if (!acc) return;
  acc.classList.toggle('oculto', !S.ids.length);
  const b = $('[data-imprimir]', acc); if (b.dataset.ocupado) return;
  const total = totalCopias(); b.disabled = total === 0;
  const t = $('[data-imp-txt]', b);
  if (total === 0) { t.textContent = 'Nada que imprimir'; return; }
  if (!$('.odo', t)) t.innerHTML = 'Imprimir <span class="odo"></span> <span data-u></span>';
  odo($('.odo', t), total); $('[data-u]', t).textContent = total === 1 ? 'rótulo' : 'rótulos';
}
async function imprimir() {
  const b = $('[data-imprimir]'); if (!b || b.disabled || b.dataset.ocupado) return;
  const total = totalCopias(); if (!total) return;
  b.dataset.ocupado = '1'; b.classList.add('ocupado'); b.setAttribute('aria-busy', 'true');
  const t = $('[data-imp-txt]', b); const icono = $('svg', b);
  const giro = el('<span class="giro" aria-hidden="true"></span>'); icono.replaceWith(giro);
  t.innerHTML = `Imprimiendo <span data-prog>0</span> de ${total}`;
  await M().imprimir(total, (n) => { const p = $('[data-prog]', b); if (p) p.textContent = Math.min(n, total); });
  giro.replaceWith(icono); delete b.dataset.ocupado; b.classList.remove('ocupado'); b.removeAttribute('aria-busy');
  t.innerHTML = ''; actualizarCabecera();
  avisar(`<b>Listo:</b> ${total === 1 ? '1 rótulo enviado' : `${total} rótulos enviados`} a la Brother.`);
}
function avisar(html) {
  let pila = $('.avisos'); if (!pila) { pila = el('<div class="avisos" role="status" aria-live="polite"></div>'); document.body.append(pila); }
  const a = el(`<div class="aviso"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>${html}</span></div>`);
  pila.append(a); setTimeout(() => { a.classList.add('sale'); setTimeout(() => a.remove(), 260); }, 3400);
}
const nota = (i) => el(`<div class="nota sube" style="--i:${i}"><span class="i" aria-hidden="true">i</span><span><b>Sale en el mismo papel que las etiquetas de precio</b> (62 × 40,1 mm): no hay que cambiar nada en la Brother. Si sale corto o girado, la guía de impresión lo muestra paso a paso.</span></div>`);

/* ---------- eventos comunes ---------- */
document.addEventListener('click', (e) => {
  const q = e.target.closest('[data-quitar]'); if (q) { quitar(q.dataset.quitar); return; }
  const mas = e.target.closest('[data-mas]'); if (mas && !mas.disabled) { setCopias(mas.dataset.mas, copiasDe(mas.dataset.mas) + 1); return; }
  const menos = e.target.closest('[data-menos]'); if (menos && !menos.disabled) { setCopias(menos.dataset.menos, copiasDe(menos.dataset.menos) - 1); return; }
  const j = e.target.closest('[data-juntar]'); if (j && !j.disabled) { setJuntar(j.dataset.juntar === '1'); return; }
  if (e.target.closest('[data-imprimir]')) { imprimir(); return; }
  if (e.target.closest('[data-guia]')) { avisar('En la maqueta no abre: es la misma guía de impresión de hoy.'); return; }
  if (e.target.closest('.volver')) { e.preventDefault(); avisar('«Volver» lleva a la pantalla de donde llegaste (Productos, Existencias o Inicio).'); }
});
document.addEventListener('keydown', (e) => {
  const p = e.target.closest?.('[data-paso]');
  if (p) {
    const k = p.dataset.paso; const n = copiasDe(k);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === '+') { e.preventDefault(); setCopias(k, n + 1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === '-') { e.preventDefault(); setCopias(k, n - 1); }
    else if (/^\d$/.test(e.key)) { e.preventDefault(); setCopias(k, Number(e.key)); }
    return;
  }
  if (e.key === '/' && !/^(input|textarea)$/i.test(e.target.tagName)) { const i = $('.pag .buscador input'); if (i) { e.preventDefault(); i.focus(); i.click(); } }
});
/* la onda nace donde tocaste (OndaBotones) */
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn'); if (!b || b.disabled) return;
  const r = b.getBoundingClientRect();
  b.style.setProperty('--onda-x', `${e.clientX - r.left}px`); b.style.setProperty('--onda-y', `${e.clientY - r.top}px`);
  b.style.setProperty('--onda-d', `${Math.hypot(r.width, r.height) * 2}px`);
  b.removeAttribute('data-onda'); void b.offsetWidth; b.setAttribute('data-onda', ''); setTimeout(() => b.removeAttribute('data-onda'), 470);
});

/* ---------- barra de la maqueta y leyenda ---------- */
let leyAbierta = false;
function barra() {
  const seg = (k, o) => `<div class="seg" role="group">${o.map(([v, t]) => `<button type="button" class="${String(S[k]) === v ? 'on' : ''}" data-spk="${k}" data-val="${v}" aria-pressed="${String(S[k]) === v}">${t}</button>`).join('')}</div>`;
  $('#spk').innerHTML = `<span class="tag">Maqueta · Rótulos</span>
    ${seg('maq', [['A', 'A · Rollo'], ['B', 'B · Anaquel'], ['C', 'C · Molde']])}
    ${seg('vista', [['escritorio', 'Escritorio'], ['celular', 'Celular 375']])}
    ${seg('tema', [['light', 'Claro'], ['dark', 'Oscuro']])}
    ${seg('inicio', [['vacio', 'Vacía'], ['lleno', 'Con 3 prendas']])}
    <label><input type="checkbox" data-chk="bucle" ${S.bucle ? 'checked' : ''}> Movimiento continuo</label>
    <label><input type="checkbox" data-chk="rm" ${S.rm ? 'checked' : ''}> Movimiento reducido</label>
    <button class="acc" type="button" data-otra>↺ Ver la entrada otra vez</button>`;
}
function ley() {
  const m = M();
  $('#ley').innerHTML = `<details ${leyAbierta ? 'open' : ''}><summary><h2>${m.nombre}</h2><span class="idea">${m.idea}</span><span class="ver">Cómo se mueve ▾</span></summary>
    <ol>${m.mov.map((x) => `<li>${x}</li>`).join('')}</ol>
    <p class="igual" style="margin-bottom:6px"><b>En bucle (interruptor «Movimiento continuo»):</b> ${m.bucle}</p>
    <p class="igual"><b>Igual en las tres:</b> lo que hace la pantalla no cambia (buscar y sumar prendas, quitarlas, «uno por prenda» o «todas en uno» hasta 4, copias de 0 a 20, imprimir en la Brother con la forma A o B de esa computadora). La cabecera pasa a la de Productos y Existencias (EncabezadoPagina, la flecha de volver junto a la sede). El rótulo se dibuja con las mismas reglas que la impresión: lo que ves es lo que sale. Escribir «/» lleva al buscador; Enter suma la prenda marcada; las copias se cambian con las flechas.</p></details>`;
  $('#ley details').addEventListener('toggle', (e) => { leyAbierta = e.target.open; });
}
function montar() {
  limpiarTimers();
  $$('.avisos').forEach((a) => a.remove());
  const raiz = document.documentElement;
  raiz.dataset.theme = S.tema; raiz.classList.toggle('rm', S.rm); raiz.classList.toggle('sin-bucle', !S.bucle);
  Object.values(MAQ).forEach((m) => m.desmontar?.());
  barra(); ley();
  const escena = $('#escena'); escena.innerHTML = '';
  const marco = el(`<div class="marco ${S.vista}"><div class="pag" data-pag></div></div>`);
  escena.append(marco);
  M().montar($('[data-pag]', marco));
  actualizarCabecera();
}
function arrancar() {
  $('#spk').addEventListener('click', (e) => {
    const b = e.target.closest('[data-spk]');
    if (b) {
      const k = b.dataset.spk, v = b.dataset.val;
      if (k === 'tema') { S.tema = v; document.documentElement.dataset.theme = v; barra(); return; }
      S[k] = v;
      if (k === 'inicio') { S.ids = v === 'lleno' ? [...INICIALES] : []; S.juntar = false; S.copias = v === 'lleno' ? { p02: 2 } : {}; }
      montar(); return;
    }
    if (e.target.closest('[data-otra]')) montar();
  });
  $('#spk').addEventListener('change', (e) => {
    const c = e.target.closest('[data-chk]'); if (!c) return;
    S[c.dataset.chk] = c.checked;
    if (c.dataset.chk === 'bucle') document.documentElement.classList.toggle('sin-bucle', !S.bucle); else montar();
  });
  // arranca en el tema de quien mira (el ERP arranca en claro; aquí manda la barra)
  const r = document.documentElement.dataset.theme;
  S.tema = r === 'dark' || r === 'light' ? r : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const q = new URLSearchParams(location.search);
  if (/^[ABC]$/.test(q.get('m') || '')) S.maq = q.get('m');
  if (q.get('inicio') === 'lleno') { S.inicio = 'lleno'; S.ids = [...INICIALES]; S.copias = { p02: 2 }; }
  if (q.get('tema') === 'dark') S.tema = 'dark';
  if (q.get('vista') === 'celular') S.vista = 'celular';
  montar();
}
