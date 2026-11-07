/* Maqueta · El stock solo en Existencias (2026-10-27). Nada se guarda: todo vive en memoria y «Repetir» lo reinicia. */
(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const lento = () => document.documentElement.classList.contains('lento');
const K = () => (lento() ? 3 : 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * K()));
const ic = (n, c = '') => `<svg class="ic ${c}"><use href="#i-${n}"/></svg>`;
const candado = (cls = 'cerrado') =>
  `<svg class="ic cand ${cls}" viewBox="0 0 24 24"><rect x="4" y="10.5" width="16" height="10.5" rx="2.2"/><path class="grillete" d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`;
if (/sinmov/.test(location.search)) document.documentElement.classList.add('sinmov');

/* ── Datos inventados ───────────────────────────────────────────────────────────────────────────── */
const PERSONAS = ['Ana Ríos', 'Lucía Méndez', 'Felipe Álvarez'];
const COL0 = [
  { id: 'blanco', n: 'Blanco', hex: '#f1ede4' },
  { id: 'marron', n: 'Marrón', hex: '#7b5436' },
  { id: 'negro', n: 'Negro', hex: '#2a2926' },
];
const OTROS = [
  { id: 'rojo', n: 'Rojo vino', hex: '#7d2a2f' },
  { id: 'oliva', n: 'Verde oliva', hex: '#5a6240' },
  { id: 'azul', n: 'Azul noche', hex: '#26344f' },
  { id: 'arena', n: 'Arena', hex: '#cdb998' },
];
const TALLAS_EXTRA = ['XS', 'XL', 'Estándar'];
const INS = ['Nuevo', 'Artesanal', 'Tendencia', 'Rebaja'];
const k = (c, t) => `${c}|${t}`;
const PRECIO0 = { S: 89.9, M: 89.9, L: 94.9 }, COSTO0 = { S: 38, M: 38, L: 41 };

const inicial = () => {
  const colores = COL0.map((c) => ({ ...c, estado: 'activo' }));
  const tallas = ['S', 'M', 'L'].map((id) => ({ id, estado: 'activo' }));
  const stock = {
    'blanco|S': { p: 1, a: 3 }, 'blanco|M': { p: 2, a: 4 }, 'blanco|L': { p: 0, a: 2 },
    'marron|S': { p: 0, a: 0 }, 'marron|M': { p: 0, a: 0 }, 'marron|L': { p: 0, a: 0 },
    'negro|S': { p: 2, a: 3 }, 'negro|M': null, 'negro|L': { p: 1, a: 1 },
  };
  const precio = {}, costo = {};
  for (const key in stock) if (stock[key]) { const t = key.split('|')[1]; precio[key] = PRECIO0[t]; costo[key] = COSTO0[t]; }
  return { colores, tallas, stock, precio, costo, ins: { blanco: ['Artesanal'], marron: [], negro: ['Nuevo', 'Tendencia'] } };
};
const copia = (o) => JSON.parse(JSON.stringify(o));
let S = inicial(), B = copia(S);
const U = { dir: 'A', esc: 'editar', tab: 'tienda', nace: 'unidades', cajon: false, snap: null, ultimaCarga: 'hoy 8:40 · Ana Ríos' };
let N; /* borrador de «Nuevo producto» */
const nuevoBorrador = () => ({ 'blanco|S': 4, 'blanco|M': 6, 'blanco|L': 2, 'marron|S': 0, 'marron|M': 0, 'marron|L': 0, 'negro|S': 5, 'negro|M': null, 'negro|L': 2 });
N = nuevoBorrador();

/* ── Cálculos ───────────────────────────────────────────────────────────────────────────────────── */
const act = (a) => a.filter((x) => x.estado !== 'archivado');
const celda = (c, t) => S.stock[k(c, t)];
const tot = (c, t) => { const s = celda(c, t); return s ? s.p + s.a : 0; };
const totColor = (c) => act(S.tallas).reduce((a, t) => a + tot(c, t.id), 0);
const totTalla = (t) => act(S.colores).reduce((a, c) => a + tot(c.id, t), 0);
const totAll = () => act(S.colores).reduce((a, c) => a + totColor(c.id), 0);
const totLugar = (l) => act(S.colores).reduce((a, c) => a + act(S.tallas).reduce((b, t) => b + (celda(c.id, t.id)?.[l] || 0), 0), 0);
const nomColor = (id) => S.colores.find((c) => c.id === id)?.n || id;
const nVariantes = () => act(S.colores).reduce((a, c) => a + act(S.tallas).filter((t) => celda(c.id, t.id)).length, 0);
const money = (n) => `S/ ${Number(n).toFixed(2)}`;
const rango = () => { const v = Object.entries(S.precio).filter(([key]) => { const [c, t] = key.split('|'); return act(S.colores).some((x) => x.id === c) && act(S.tallas).some((x) => x.id === t); }).map(([, p]) => p); return v.length ? Math.min(...v) : 0; };

function cambios() {
  const L = [];
  for (const key in S.precio) {
    const [c, t] = key.split('|');
    if (B.precio[key] !== undefined && S.precio[key] !== B.precio[key]) L.push({ g: 'Precios', t: `${nomColor(c)} · ${t}`, d: `${money(B.precio[key])} → ${money(S.precio[key])}` });
    if (B.costo[key] !== undefined && S.costo[key] !== B.costo[key]) L.push({ g: 'Costos', t: `${nomColor(c)} · ${t}`, d: `${money(B.costo[key])} → ${money(S.costo[key])}` });
  }
  for (const c of S.colores) {
    const a = new Set(S.ins[c.id] || []), b = new Set(B.ins[c.id] || []);
    [...a].filter((x) => !b.has(x)).forEach((x) => L.push({ g: 'Insignias', t: `${c.n}`, d: `+ ${x}` }));
    [...b].filter((x) => !a.has(x)).forEach((x) => L.push({ g: 'Insignias', t: `${c.n}`, d: `− ${x}` }));
    if (c.estado === 'nuevo') L.push({ g: 'Colores y tallas', t: `Color nuevo · ${c.n}`, d: 'se crea' });
    if (c.estado === 'archivado' && B.colores.find((x) => x.id === c.id)?.estado !== 'archivado') L.push({ g: 'Colores y tallas', t: `${c.n}`, d: 'se archiva (no se borra)' });
  }
  for (const t of S.tallas) {
    if (t.estado === 'nuevo') L.push({ g: 'Colores y tallas', t: `Talla nueva · ${t.id}`, d: 'se crea' });
    if (t.estado === 'archivado' && B.tallas.find((x) => x.id === t.id)?.estado !== 'archivado') L.push({ g: 'Colores y tallas', t: `Talla ${t.id}`, d: 'se archiva (no se borra)' });
  }
  const ini = Object.values(S.stock).filter((s) => s && s.nuevo).reduce((a, s) => a + s.a, 0);
  if (Object.values(S.stock).some((s) => s && s.nuevo)) L.push({ g: 'Stock inicial', t: ini ? `${ini} ${ini === 1 ? 'unidad entra' : 'unidades entran'} al almacén` : 'Las variantes nuevas nacen en cero', d: 'se sella al guardar' });
  return L;
}

/* ── Números que ruedan ─────────────────────────────────────────────────────────────────────────── */
function rodar(el, desde, hasta, ms = 700) {
  if (document.documentElement.classList.contains('sinmov') || matchMedia('(prefers-reduced-motion:reduce)').matches) { el.textContent = hasta; return; }
  const t0 = performance.now(), dur = ms * K();
  const paso = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(desde + (hasta - desde) * e); if (p < 1) requestAnimationFrame(paso); };
  requestAnimationFrame(paso);
}
const snapNumeros = () => Object.fromEntries($$('[data-id]').map((e) => [e.dataset.id, parseInt(e.textContent, 10) || 0]));
function rodarDesde(snap) {
  if (!snap) return;
  $$('[data-id]').forEach((e) => {
    const nuevo = parseInt(e.textContent, 10) || 0, antes = snap[e.dataset.id];
    if (antes !== undefined && antes !== nuevo) {
      e.textContent = antes;
      setTimeout(() => rodar(e, antes, nuevo, 800), 450 * K());
      const caja = e.closest('.paso,.celda-e,.cifra');
      if (caja) { caja.classList.add('verde'); setTimeout(() => caja.classList.remove('verde'), 2200 * K()); }
    }
  });
}

/* ── Capas: popover, hoja, avisos ───────────────────────────────────────────────────────────────── */
const capas = $('#capas');
function cerrarCapas() { $$('.catch,.pop,.hoja,.velo', capas).forEach((e) => e.remove()); }
function abrirPop(ancla, html, conservar) {
  if (conservar) $$('.catch,.pop', capas).forEach((e) => e.remove()); else cerrarCapas();
  const c = document.createElement('div'); c.className = 'catch'; c.style.cssText = 'position:fixed;inset:0'; c.onclick = cerrarCapas; capas.appendChild(c);
  const p = document.createElement('div'); p.className = 'pop'; p.innerHTML = html; p.style.visibility = 'hidden'; capas.appendChild(p);
  const r = ancla.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
  let left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  let top = r.bottom + 10; if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 10);
  p.style.left = left + 'px'; p.style.top = top + 'px'; p.style.setProperty('--ox', (r.left + r.width / 2 - left) + 'px'); p.style.visibility = '';
  return p;
}
function abrirHoja(html) {
  cerrarCapas();
  const v = document.createElement('div'); v.className = 'velo'; v.onclick = cerrarCapas; capas.appendChild(v);
  const h = document.createElement('div'); h.className = 'hoja'; h.innerHTML = `<button class="x" data-a="cerrar" aria-label="Cerrar">${ic('x')}</button>${html}`; capas.appendChild(h);
  return h;
}
function aviso(titulo, detalle, deshacer) {
  const a = document.createElement('div'); a.className = 'aviso';
  a.innerHTML = `${ic('check', 'g')}<div><b>${titulo}</b><small>${detalle || ''}</small></div>${deshacer ? '<button class="deshacer">Deshacer</button>' : ''}`;
  $$('.aviso', capas).forEach((x) => x.remove());
  capas.appendChild(a);
  const cierra = () => { a.classList.add('sale'); setTimeout(() => a.remove(), 400 * K()); };
  if (deshacer) a.querySelector('.deshacer').onclick = () => { deshacer(); cierra(); };
  setTimeout(cierra, (deshacer ? 7000 : 4600) * K());
}

/* ── Piezas de interfaz ─────────────────────────────────────────────────────────────────────────── */
const cabecera = ({ detalle, titulo = 'Productos', frase, volver }) => `
<div class="cab"><div class="linea">${volver ? `<button class="volver" data-a="${volver.a}" aria-label="${volver.t}" title="${volver.t}">${ic('back')}</button>` : ''}
<span>Tienda TRU · mar 27 oct${detalle ? ` · ${detalle}` : ''}</span><span class="hilo-t"></span></div>
<h1>${titulo}</h1>${frase ? `<p>${frase}</p>` : ''}</div>`;

const paso = ({ n, id, modo = 'bloq', k: key, extra = '', etq = '' }) => {
  const bloq = modo === 'bloq';
  return `<div class="paso ${modo} ${extra}" ${key ? `data-k="${key}"` : ''} ${bloq ? 'data-a="puerta" title="El stock se cuenta en Existencias"' : ''}>
  <button type="button" ${bloq ? 'tabindex="-1" aria-hidden="true"' : `data-a="${modo === 'puerta' ? 'c-menos' : 'ini-menos'}" aria-label="Quitar uno"`} ${key ? `data-k="${key}"` : ''}>−</button>
  <span class="n num" ${id ? `data-id="${id}"` : ''}>${n}</span>
  <button type="button" ${bloq ? 'tabindex="-1" aria-hidden="true"' : `data-a="${modo === 'puerta' ? 'c-mas' : 'ini-mas'}" aria-label="Sumar uno"`} ${key ? `data-k="${key}"` : ''}>+</button>
  ${bloq ? candado('cerrado') : ''}${etq ? `<span class="etiq-ini">${etq}</span>` : ''}</div>`;
};

/* La tabla color × talla (MatrizStockFicha). `cel(c,t)` dibuja la celda; `resumen` la columna de la derecha. */
function tablaMx({ cel, resumenTitulo, resumen, pie }) {
  const cs = act(S.colores), ts = act(S.tallas);
  const cabs = ts.map((t) => `<th><span class="th-talla">${t.id}${t.estado === 'nuevo' ? ' <span class="chip amb">Nueva</span>' : ''}
    <button class="redondo" data-a="editar-talla" data-t="${t.id}" aria-label="Corregir talla ${t.id}" title="Corregir">${ic('pencil', 'p')}</button>
    <button class="redondo peligro" data-a="quitar-talla" data-t="${t.id}" aria-label="Quitar talla ${t.id}" title="Quitar la talla">${ic('trash', 'p')}</button></span></th>`).join('');
  const filas = cs.map((c, i) => `<tr class="fila ${c.estado === 'nuevo' ? 'nuevo' : ''} ${c._recien ? 'recien' : ''}" style="--i:${i}" data-c="${c.id}">
    <th scope="row"><div class="col-color"><span class="franja" style="background:${c.hex}"></span>
      <span class="nom-color"><span class="punto" style="background:${c.hex}"></span>${c.n}</span>${c.estado === 'nuevo' ? '<span class="chip amb">Nueva</span>' : ''}
      ${U.dir === 'D' ? `<span class="tira-stock" title="El stock se ve y se cuenta en Existencias">${ic('box', 'p')}${totColor(c.id)} en tienda</span>` : ''}
      <span class="acc-color"><button class="redondo" data-a="editar-color" data-c="${c.id}" aria-label="Corregir ${c.n}" title="Corregir">${ic('pencil', 'p')}</button>
      <button class="redondo peligro" data-a="quitar-color" data-c="${c.id}" aria-label="Quitar ${c.n}" title="Quitar el color">${ic('trash', 'p')}</button></span></div></th>
    ${ts.map((t) => `<td>${cel(c, t)}</td>`).join('')}${resumen ? `<td>${resumen(c)}</td>` : ''}</tr>`).join('');
  cs.forEach((c) => delete c._recien);
  return `<div class="caja-tabla"><div class="scroll"><table class="mx"><thead><tr><th>Color</th>${cabs}${resumen ? `<th>${resumenTitulo}</th>` : ''}</tr></thead>
  <tbody>${filas}</tbody>${pie ? `<tfoot>${pie(ts)}</tfoot>` : ''}</table></div></div>`;
}

/* ── Escena: Editar producto ────────────────────────────────────────────────────────────────────── */
const tabsDef = () => [...(U.dir === 'D' ? [] : [['tienda', 'Unidades', U.dir === 'A' ? 'lock' : U.dir === 'B' ? 'store' : 'box']]), ['precios', 'Precios'], ['costos', 'Costos'], ['insignias', 'Insignias']];
function pintarEditar() {
  if (U.dir === 'D' && U.tab === 'tienda') U.tab = 'precios';
  $('#erp').innerHTML = `<div class="escena" id="esc">
    ${cabecera({ detalle: 'Blusa Emma · Editar', volver: { a: 'volver-lista', t: 'Volver a Productos' }, frase: 'Cambia precios, costos e insignias, y suma o quita colores y tallas. El stock se cuenta en Existencias.' })}
    <div class="tarjeta animando" id="tarj">
      <div class="sec-cab"><span class="sec-n">4</span><h2>Variantes y precios</h2><span class="res" id="res"></span><span class="chev">${ic('up', 'g')}</span></div>
      ${U.dir === 'D' ? '<div id="tira-d"></div>' : ''}
      <div id="tabs"></div><p class="ayuda" id="ayuda"></p><div id="cuerpo"></div>
      <div class="agregar">
        <button class="add" data-a="add-color"><span class="mas">${ic('plus', 'g')}</span><span><b>Agregar color</b><small>Una fila nueva, con sus tallas</small></span></button>
        <button class="add" data-a="add-talla"><span class="mas">${ic('plus', 'g')}</span><span><b>Agregar talla</b><small>Una columna nueva, en cada color</small></span></button>
      </div></div><div id="isla"></div></div>`;
  pintarTabs(); pintarCuerpo(false); islaActualizar(true);
  quitarAnimando();
}
const quitarAnimando = () => setTimeout(() => $('#tarj')?.classList.remove('animando'), 1700 * K());
function pintarTabs() {
  const d = tabsDef();
  $('#tabs').innerHTML = `<div class="tabs" role="tablist"><span class="pildora"></span>${d.map(([id, n, i]) => `<button role="tab" data-tab="${id}" class="${U.tab === id ? 'on' : ''}">${i === 'lock' ? candado('cierra') : i ? ic(i) : ''}${n}</button>`).join('')}</div>`;
  moverPildora(false);
}
function moverPildora(anim = true) {
  const on = $('.tabs button.on'), p = $('.tabs .pildora'); if (!on || !p) return;
  if (!anim) p.style.transition = 'none';
  p.style.left = on.offsetLeft + 'px'; p.style.width = on.offsetWidth + 'px';
  if (!anim) { p.offsetWidth; p.style.transition = ''; }
}
const AYUDA = {
  A: 'Lo que hay hoy. Está con candado: el stock se cuenta en Existencias. Toca el candado y te llevamos a ajustar esa talla.',
  B: 'Lo que hay hoy y dónde está. Para ajustarlo, el botón te lleva a Existencias.',
  C: 'Lo que hay hoy. Toca − o + como siempre: se abre Existencias aquí mismo con tu cambio ya puesto, y lo guardas ahí.',
};
function pintarCuerpo(animar) {
  const t = U.tab, tarj = $('#tarj');
  if (animar) { tarj.classList.add('animando'); quitarAnimando(); }
  $('#res').textContent = `${nVariantes()} variantes activas · desde ${money(rango())}`;
  if (U.dir === 'D') $('#tira-d').innerHTML = tiraD();
  $('#ayuda').innerHTML = { tienda: AYUDA[U.dir], precios: 'Escribe el precio de cada talla. Se guarda con «Revisar y guardar».', costos: 'Lo que te cuesta cada talla; debajo, cuánto te queda. Se guarda con «Revisar y guardar».', insignias: 'Toca para poner o quitar una insignia de un color. Se guarda con «Revisar y guardar».' }[t];
  $('#cuerpo').innerHTML = { tienda: cuerpoTienda, precios: () => cuerpoCampos('precio'), costos: () => cuerpoCampos('costo'), insignias: cuerpoInsignias }[t]();
  if (U.dir === 'B' && t === 'tienda') $$('.barrita i').forEach((e) => (e.style.animationDelay = ''));
}
function tiraD() {
  return `<div class="tira-e" style="margin-top:18px"><span class="chip">${ic('box', 'p')}</span><div><b>${totAll()} unidades en tienda</b> · ${totLugar('p')} en el piso · ${totLugar('a')} en el almacén<br><small style="color:var(--t65)">Aquí se ven; contarlas o corregirlas se hace en Existencias.</small></div>
  <button class="enlace-ver fin-d" data-a="ir-exist" style="margin-left:auto">Ver y ajustar en Existencias ${ic('arrow')}</button></div>`;
}
function cuerpoTienda() {
  const pieTot = (ts) => `<tr><th>Total</th>${ts.map((t) => `<td class="num" data-id="tt:${t.id}">${totTalla(t.id)}</td>`).join('')}<td class="num" data-id="tg">${totAll()}</td></tr>`;
  const cel = (c, t) => {
    const key = k(c.id, t.id), s = celda(c.id, t.id);
    if (!s) return `<button class="hueco" data-a="hueco" data-c="${c.id}" data-t="${t.id}" title="Esta combinación no existe: tócala para agregarla">—</button>`;
    if (s.nuevo) return U.nace === 'unidades' ? paso({ n: s.a, id: key, modo: 'ini', k: key, etq: 'inicial' }) : `${paso({ n: 0, id: key, modo: 'bloq', k: key })}<span class="etiq-ini" style="position:static;display:block;margin-top:6px">nace en 0</span>`;
    if (U.dir === 'B') {
      const n = s.p + s.a;
      return `<button class="celda-e ${n ? '' : 'cero'}" data-a="b-celda" data-k="${key}" title="Piso ${s.p} · Almacén ${s.a}"><span class="n num" data-id="${key}">${n}</span>
      <span class="barrita">${n ? `<i class="p" style="flex:${s.p}"></i><i class="a" style="flex:${s.a}"></i>` : ''}</span></button>`;
    }
    return paso({ n: s.p + s.a, id: key, modo: U.dir === 'C' ? 'puerta' : 'bloq', k: key });
  };
  const tabla = tablaMx({ cel, resumenTitulo: 'Total', resumen: (c) => `<b class="num" data-id="tc:${c.id}">${totColor(c.id)}</b>`, pie: pieTot });
  if (U.dir !== 'B') return tabla;
  return `<div class="cifras">
    <div class="cifra" style="--i:0"><span class="lbl">En tienda</span><div class="v num" data-id="cf-t">${totAll()}</div><small>unidades, todas las tallas</small></div>
    <div class="cifra" style="--i:1"><span class="lbl">En el piso</span><div class="v num" data-id="cf-p">${totLugar('p')}</div><small>a la vista de quien compra</small></div>
    <div class="cifra" style="--i:2"><span class="lbl">En el almacén</span><div class="v num" data-id="cf-a">${totLugar('a')}</div><small>guardadas atrás</small></div>
    <div class="cifra" style="--i:3"><span class="lbl">Último conteo</span><div class="v" style="font-size:26px;margin-top:14px">${U.ultimaCarga.split(' · ')[0]}</div><small>${U.ultimaCarga.split(' · ').slice(1).join(' · ') || ''}</small></div></div>
  <div class="tira-e">${ic('info')}<span>Ajustar el stock se hace en Existencias. Aquí solo se ve.</span><button class="btn pri" data-a="ir-exist">${ic('clip')}Ajustar stock ${ic('arrow', 'avanza')}</button></div>
  ${tabla}<div class="leyenda"><span><i style="background:var(--tinta)"></i>Piso</span><span><i style="background:var(--taupe)"></i>Almacén</span><span>Pasa el mouse por un número para ver el detalle</span></div>`;
}
function cuerpoCampos(campo) {
  const cel = (c, t) => {
    const key = k(c.id, t.id), s = celda(c.id, t.id);
    if (!s) return '<span style="color:var(--t35)">—</span>';
    if (S[campo][key] === undefined) S[campo][key] = campo === 'precio' ? PRECIO0.M : COSTO0.M;
    const v = S[campo][key], cambio = B[campo][key] !== undefined && B[campo][key] !== v;
    const mg = campo === 'costo' ? (() => { const m = Math.round((1 - v / (S.precio[key] || 1)) * 100); return `<span class="margen ${m < 55 ? 'm' : ''}" data-mg="${key}">Margen ${m}%</span>`; })() : '';
    return `<div><label class="campo-p ${cambio ? 'cambio' : ''}"><span>S/</span><input inputmode="decimal" value="${Number(v).toFixed(2)}" data-campo="${campo}" data-k="${key}" aria-label="${campo === 'precio' ? 'Precio' : 'Costo'} ${nomColor(c.id)} ${t.id}"></label>${mg}</div>`;
  };
  return tablaMx({ cel });
}
function cuerpoInsignias() {
  const cs = act(S.colores);
  return `<div class="caja-tabla"><div class="scroll"><table class="mx" style="min-width:0"><thead><tr><th>Color</th><th style="text-align:left">Insignias</th></tr></thead><tbody>${cs.map((c, i) => `<tr class="fila ${c.estado === 'nuevo' ? 'nuevo' : ''} ${c._recien ? 'recien' : ''}" style="--i:${i}">
  <th scope="row"><div class="col-color"><span class="franja" style="background:${c.hex}"></span><span class="nom-color"><span class="punto" style="background:${c.hex}"></span>${c.n}</span>${c.estado === 'nuevo' ? '<span class="chip amb">Nueva</span>' : ''}
  ${U.dir === 'D' ? `<span class="tira-stock">${ic('box', 'p')}${totColor(c.id)} en tienda</span>` : ''}
  <span class="acc-color"><button class="redondo" data-a="editar-color" data-c="${c.id}" title="Corregir">${ic('pencil', 'p')}</button><button class="redondo peligro" data-a="quitar-color" data-c="${c.id}" title="Quitar el color">${ic('trash', 'p')}</button></span></div></th>
  <td><div class="chips">${INS.map((x) => { const on = (S.ins[c.id] || []).includes(x), cambio = on !== (B.ins[c.id] || []).includes(x); return `<button class="ins ${on ? 'on' : ''} ${cambio ? 'cambio' : ''}" data-a="ins" data-c="${c.id}" data-i="${x}"><i></i>${x}</button>`; }).join('')}</div></td></tr>`).join('')}</tbody></table></div></div>`;
}

/* La isla «Revisar y guardar» */
function islaActualizar(forzar) {
  const el = $('#isla'); if (!el) return;
  const n = cambios().length, hay = !!$('.isla', el);
  if (!n) { el.innerHTML = ''; return; }
  if (!hay || forzar) el.innerHTML = `<div class="isla"><b class="num" id="isla-n">${n}</b><span><span id="isla-t">${n === 1 ? 'cambio' : 'cambios'}</span> sin guardar<br><small style="opacity:.7">Nada se guarda hasta que lo revises</small></span><button class="btn" data-a="revisar">Revisar y guardar ${ic('arrow', 'avanza')}</button></div>`;
  else { $('#isla-n').textContent = n; $('#isla-t').textContent = n === 1 ? 'cambio' : 'cambios'; }
}

/* ── Escena: Existencias (la planilla del modelo, ADR-0494) ─────────────────────────────────────── */
let P;
const nuevoP = (o = {}) => ({ lugar: 'almacen', motivo: 'conteo', val: { piso: {}, almacen: {} }, foco: null, focoColor: null, resp: null, combo: false, guardado: false, guardando: false, avisoLugar: false, pre: null, ...o });
const LUG = (l) => (l === 'piso' ? 'p' : 'a');
const hoyP = (key) => { const s = S.stock[key]; return s ? s[LUG(P.lugar)] : 0; };
const valP = (key) => P.val[P.lugar][key] ?? hoyP(key);
const hayCambiosP = () => Object.keys(P.val.piso).length + Object.keys(P.val.almacen).length > 0;
const resumenP = () => { let en = 0, sa = 0, n = 0; for (const l of ['piso', 'almacen']) for (const key in P.val[l]) { const d = P.val[l][key] - S.stock[key][LUG(l)]; if (d) { n++; d > 0 ? (en += d) : (sa -= d); } } return { n, en, sa }; };
const MOTIVOS = [['conteo', 'Conté y hay otro número', 'clip'], ['reposicion', 'Encontré unidades', 'plus'], ['merma', 'No aparece', 'minus']];

function planillaHTML(modo) {
  const cs = act(S.colores), ts = act(S.tallas), r = resumenP();
  const piso = P.lugar === 'piso';
  const pils = (items, sel, a) => items.map(([id, n, i, off, why]) => `<button class="pil ${sel === id ? 'on' : ''} ${off ? 'off' : ''}" data-a="${a}" data-v="${id}" ${off ? `title="${why}"` : ''}>${i ? ic(i) : ''}${n}</button>`).join('');
  const filas = cs.map((c) => `<tr class="fila" data-c="${c.id}"><th scope="row"><div class="col-color"><span class="franja" style="background:${c.hex}"></span><span class="nom-color"><span class="punto" style="background:${c.hex}"></span>${c.n}</span></div></th>
  ${ts.map((t) => {
    const key = k(c.id, t.id), s = S.stock[key];
    if (!s || s.nuevo) return `<td><span style="color:var(--t35)" title="${s ? 'Guarda la ficha primero: todavía no existe' : 'No se vende'}">—</span></td>`;
    const hoy = hoyP(key), v = valP(key), d = v - hoy, foco = P.foco === key || (P.focoColor === c.id);
    const minOff = P.motivo === 'reposicion' ? v <= hoy : v <= 0, maxOff = P.motivo === 'merma' ? v >= hoy : v >= 99;
    const sellado = P.guardado && P._guardadas?.includes(key);
    return `<td class="${foco ? 'foco-c' : ''} ${P._visto ? 'v' : ''}"><div class="paso ${d ? 'cambio' : ''} ${sellado ? 'verde' : ''}" style="position:relative">
      <button data-a="p-menos" data-k="${key}" ${minOff || P.guardado ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''} aria-label="Quitar uno">−</button><span class="n num">${v}</span>
      <button data-a="p-mas" data-k="${key}" ${maxOff || P.guardado ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''} aria-label="Sumar uno">+</button>${sellado ? `<span class="sello-c">${ic('check')}</span>` : ''}</div>
      ${d ? `<span class="delta num">${d > 0 ? '+' : '−'}${Math.abs(d)} · hoy ${hoy}</span>` : `<span class="hoy num">hoy ${hoy}</span>`}</td>`;
  }).join('')}</tr>`).join('');
  const pie = P.guardado
    ? `<div><b style="display:flex;gap:8px;align-items:center;color:var(--verde)">${ic('check')}Guardado en Existencias</b><small style="color:var(--t65)">Quedó en Movimientos como conteo, a nombre de ${P.resp}. Una sola llamada: o entró todo o nada.</small></div>
       <div class="pie-acc">${modo === 'cajon' ? '' : `<button class="btn pri" data-a="volver-editar">${ic('back')}Volver a Editar producto</button>`}</div>`
    : `<div class="resp"><span class="lbl">Responsable <span style="color:var(--rojo)">*</span></span>
        <div class="combo"><button data-a="combo" class="${P.resp ? 'ok' : ''}">${ic('user')}<span style="flex:1">${P.resp || '¿Quién hace esta operación?'}</span>${ic('down')}</button>
        ${P.combo ? `<ul>${PERSONAS.map((n) => `<li><button data-a="resp" data-v="${n}"><span class="av">${n[0]}</span>${n}</button></li>`).join('')}</ul>` : ''}</div>
        ${!r.n ? '<span class="hoy" style="margin-top:2px">Toca − o + en una talla para empezar.</span>' : !P.resp ? `<button class="falta" data-a="combo">${ic('arrow', 'p')}Falta: quién lo hace</button>` : `<span class="hoy" style="color:var(--t80)">${r.n} ${r.n === 1 ? 'cambio' : 'cambios'} · entran ${r.en} · salen ${r.sa}</span>`}</div>
       <div class="pie-acc"><button class="btn" data-a="p-cancel">Cancelar</button>
       <button class="btn pri ${!r.n || !P.resp ? 'off' : ''} ${P.guardando ? 'guardando' : ''}" data-a="p-guardar" ${!r.n || !P.resp ? 'aria-disabled="true"' : ''}>${P.guardando ? 'Guardando…' : 'Guardar'}</button></div>`;
  return `<div class="plan">
    <div class="plan-cab"><span class="mosaico">${ic('hanger', 'g')}</span><div style="flex:1"><h3>Blusa Emma · Ajustar stock</h3><small>BLU-0142 · Tienda TRU · todo el modelo, un lugar a la vez</small></div><span class="hilo ${P._visto ? 'quieto' : ''}"></span></div>
    <div class="banda"><span class="lbl">Dónde contaste</span><div class="pils">${pils([['piso', 'En el piso', 'store'], ['almacen', 'En el almacén', 'box']], P.lugar, 'lugar')}</div>
    <span class="lbl">Qué pasó</span><div class="pils">${pils(MOTIVOS.map(([id, n, i]) => [id, n, i, id === 'reposicion' && piso, 'El piso se llena bajando del almacén: «Encontré unidades» solo va al almacén.']), P.motivo, 'motivo')}</div></div>
    ${P.pre ? `<div class="nota aviso-l ${P._visto ? 'v' : ''}">${ic('info')}<span>${P.pre}</span></div>` : ''}
    ${P.focoColor && !P.pre ? `<div class="nota amb aviso-l ${P._visto ? 'v' : ''}">${ic('info')}<span>Para archivar <b>${nomColor(P.focoColor)}</b>, llévalo a 0 en el piso y en el almacén. Así no queda stock escondido.</span></div>` : ''}
    ${P.avisoLugar ? `<div class="nota amb aviso-l">${ic('info')}<span>Tienes cambios sin guardar en ${piso ? 'el almacén' : 'el piso'}. <b>Guárdalos o descártalos</b> antes de pasar.&nbsp; <button class="falta" data-a="descartar-pasar">Descartar y pasar</button></span></div>` : ''}
    <div class="caja-tabla pm-tabla"><div class="scroll"><table class="mx"><thead><tr><th>Color</th>${ts.map((t) => `<th>${t.id}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table></div></div>
    <div class="plan-pie">${pie}</div></div>`;
}
function pintarExistencias() {
  setTimeout(() => { if (P) P._visto = true; }, 1500 * K());
  $('#erp').innerHTML = `<div class="escena" id="esc">${cabecera({ titulo: 'Existencias', detalle: 'Blusa Emma · Ajustar stock', volver: { a: 'volver-editar', t: 'Volver a Editar producto' } })}<div id="plan">${planillaHTML('pagina')}</div></div>`;
}
const repintarP = () => { const t = $('#plan'); if (t) t.innerHTML = planillaHTML('pagina'); const c = $('#cajon-c'); if (c) c.innerHTML = planillaHTML('cajon'); P._visto = true; };

async function irAExistencias(o = {}) {
  cerrarCapas(); U.snap = snapNumeros();
  const key = o.foco; let lugar = 'almacen';
  if (key && S.stock[key]) lugar = S.stock[key].p > S.stock[key].a ? 'piso' : 'almacen';
  P = nuevoP({ lugar, foco: key || null, focoColor: o.focoColor || null, pre: o.pre || null });
  if (U.esc === 'existencias' && !o.desdeBarra) { pintarExistencias(); return; }
  const e = $('#esc'); if (e) { e.classList.add('sale'); await sleep(300); }
  U.esc = 'existencias'; sincBarra(); pintarExistencias();
}
async function volverAEditar() {
  const e = $('#esc'); if (e) { e.classList.add('sale'); await sleep(300); }
  U.esc = 'editar'; sincBarra(); pintarEditar(); rodarDesde(U.snap); U.snap = null;
}
/* El cajón (C): la planilla de Existencias montada dentro de Editar */
function abrirCajon(key, precarga) {
  cerrarCapas(); U.snap = snapNumeros();
  const s = S.stock[key]; const lugar = s.p > s.a ? 'piso' : 'almacen';
  P = nuevoP({ lugar, foco: key, pre: `Tu <b>${precarga > 0 ? '+' : '−'}</b> ya está puesto en ${nomColor(key.split('|')[0])} · ${key.split('|')[1]}. Revísalo y guarda aquí.` });
  const nv = Math.max(0, s[LUG(lugar)] + precarga); if (nv !== s[LUG(lugar)]) P.val[lugar][key] = nv;
  setTimeout(() => { if (P) P._visto = true; }, 1500 * K());
  const v = document.createElement('div'); v.className = 'cajon-v'; v.id = 'cajon-v'; v.onclick = cerrarCajon;
  const c = document.createElement('aside'); c.className = 'cajon'; c.id = 'cajon';
  c.innerHTML = `<div class="cajon-cab"><span class="mosaico">${ic('box', 'g')}</span><div style="flex:1"><span class="lbl">Existencias · dentro de Editar</span><h3>Ajustar stock · Blusa Emma</h3></div><button class="volver" data-a="cerrar-cajon" aria-label="Cerrar">${ic('x')}</button></div><div class="cajon-c" id="cajon-c">${planillaHTML('cajon')}</div>`;
  const r = $('#erp').getBoundingClientRect(), top = $('.barra').offsetHeight;
  v.style.cssText = `top:${top}px;left:${r.left}px;right:${innerWidth - r.right}px;bottom:0;border-radius:0`;
  c.style.cssText = `top:${top}px;right:${innerWidth - r.right}px;width:${Math.min(520, r.width)}px`;
  capas.append(v, c); U.cajon = true;
}
async function cerrarCajon(rodarLuego) {
  const c = $('#cajon'); if (!c) return;
  c.classList.add('sale'); $('#cajon-v')?.remove(); await sleep(420); c.remove(); U.cajon = false;
  if (rodarLuego === true) { repintarTodoEditar(); rodarDesde(U.snap); }
  U.snap = null;
}
function repintarTodoEditar() { pintarCuerpo(false); islaActualizar(); }

async function guardarP() {
  const r = resumenP(); if (!r.n || !P.resp || P.guardando) return;
  P.guardando = true; repintarP(); await sleep(950);
  P._guardadas = [];
  for (const l of ['piso', 'almacen']) for (const key in P.val[l]) { const nv = P.val[l][key]; if (nv !== S.stock[key][LUG(l)]) { S.stock[key][LUG(l)] = nv; B.stock[key] = copia(S.stock[key]); P._guardadas.push(key); } }
  P.val = { piso: {}, almacen: {} }; P.guardando = false; P.guardado = true; U.ultimaCarga = `hoy ${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')} · ${P.resp}`;
  repintarP(); aviso('Guardado en Existencias', `${r.n} ${r.n === 1 ? 'talla' : 'tallas'} · a nombre de ${P.resp}`);
  if (U.cajon) { await sleep(1300); cerrarCajon(true); }
}

/* ── Escena: Nuevo producto ─────────────────────────────────────────────────────────────────────── */
function pintarNuevo() {
  const cs = COL0, ts = ['S', 'M', 'L'];
  const tot = Object.values(N).reduce((a, v) => a + (v || 0), 0);
  const filas = cs.map((c, i) => `<tr class="fila" style="--i:${i}"><th scope="row"><div class="col-color"><span class="franja" style="background:${c.hex}"></span><span class="nom-color"><span class="punto" style="background:${c.hex}"></span>${c.n}</span></div></th>
  ${ts.map((t) => { const key = k(c.id, t), v = N[key]; return `<td>${v === null ? `<button class="hueco" data-a="n-hueco" data-k="${key}" title="Esta combinación no existe: tócala para agregarla">—</button>` : `<div class="paso" data-k="${key}"><button data-a="n-menos" data-k="${key}">−</button><span class="n num" data-nk="${key}">${v}</span><button data-a="n-mas" data-k="${key}">+</button>${candado('')}</div>`}</td>`; }).join('')}
  <td><b class="num" data-nt="${c.id}">${ts.reduce((a, t) => a + (N[k(c.id, t)] || 0), 0)}</b></td></tr>`).join('');
  $('#erp').innerHTML = `<div class="escena" id="esc">${cabecera({ detalle: 'Nuevo producto', volver: { a: 'volver-lista', t: 'Volver a Productos' }, frase: 'Aquí nace la prenda. Es la única vez que se ponen sus unidades de partida.' })}
  <div class="tarjeta animando" id="tarj-n"><div class="sec-cab"><span class="sec-n">3</span><h2>Variantes y unidades</h2><span class="res">3 colores · 3 tallas · desde S/ 89.90</span></div>
  <div class="tabs" style="margin-bottom:14px"><span class="pildora"></span><button class="on" data-a="n-tab">${ic('box')}Unidades de hoy</button><button data-a="n-tab-x">Precios</button><button data-a="n-tab-x">Costos</button><button data-a="n-tab-x">Insignias</button></div>
  <p class="ayuda">Escribe lo que hay hoy en el almacén. Toca − / + o escribe el número. <b>Al crear el producto, esto se sella:</b> después solo se cambia contando en Existencias.</p>
  <div class="caja-tabla"><div class="scroll"><table class="mx"><thead><tr><th>Color</th>${ts.map((t) => `<th>${t}</th>`).join('')}<th>Total</th></tr></thead><tbody>${filas}</tbody>
  <tfoot><tr><th>Total</th>${ts.map((t) => `<td class="num" data-ntt="${t}">${cs.reduce((a, c) => a + (N[k(c.id, t)] || 0), 0)}</td>`).join('')}<td class="num" id="n-g">${tot}</td></tr></tfoot></table></div></div>
  <div class="nota nuevo-nota">${ic('info')}<span>Estas unidades entran al <b>almacén de Tienda TRU</b> como carga inicial. Tienda TRU cerró su carga inicial el 18-oct: lo que aparezca después entra por «Encontré unidades» en Existencias.</span></div>
  <div class="pie-acc" style="margin-top:20px"><button class="btn" data-a="volver-lista">Cancelar</button><button class="btn pri" data-a="n-crear" id="n-crear">Crear producto ${ic('arrow', 'avanza')}</button></div>
  </div></div>`;
  $$('.tabs').forEach((t) => { const on = $('button.on', t), p = $('.pildora', t); if (on && p) { p.style.left = on.offsetLeft + 'px'; p.style.width = on.offsetWidth + 'px'; } });
  setTimeout(() => $('#tarj-n')?.classList.remove('animando'), 1700 * K());
}
function nActualizar(key) {
  const v = N[key]; const e = $(`[data-nk="${key}"]`); if (e) e.textContent = v;
  const [c, t] = key.split('|');
  const tc = $(`[data-nt="${c}"]`); if (tc) tc.textContent = ['S', 'M', 'L'].reduce((a, x) => a + (N[k(c, x)] || 0), 0);
  const tt = $(`[data-ntt="${t}"]`); if (tt) tt.textContent = COL0.reduce((a, x) => a + (N[k(x.id, t)] || 0), 0);
  $('#n-g').textContent = Object.values(N).reduce((a, x) => a + (x || 0), 0);
}
async function crearProducto() {
  const btn = $('#n-crear'); if (btn.classList.contains('carga')) return;
  btn.classList.add('carga'); btn.firstChild.textContent = 'Creando… '; await sleep(800); btn.classList.remove('carga');
  const tot = Object.values(N).reduce((a, v) => a + (v || 0), 0), tarj = $('#tarj-n');
  const pasos = $$('.paso', tarj); pasos.forEach((p, i) => setTimeout(() => { p.classList.add('sellado'); const cd = $('.cand', p); cd.classList.remove('cerrado'); cd.classList.add('cierra'); }, i * 90 * K()));
  const sv = document.createElement('div'); sv.className = 'sellado-vel';
  sv.innerHTML = `<div class="sello"><div>Stock inicial<b>${tot} u.</b>sellado · 27 oct</div></div>`; tarj.appendChild(sv);
  await sleep(2300);
  S = inicial(); for (const key in N) { S.stock[key] = N[key] === null ? null : { p: 0, a: N[key] }; } B = copia(S);
  U.esc = 'editar'; U.tab = U.dir === 'D' ? 'precios' : 'tienda'; sincBarra(); pintarEditar();
  aviso('Blusa Emma creada', `${tot} unidades de stock inicial, selladas. Desde ahora se cuentan en Existencias.`);
}

/* ── Hojas: agregar color / talla, revisar y guardar ────────────────────────────────────────────── */
function hojaAgregar(tipo) {
  const esColor = tipo === 'color';
  const existentes = esColor ? act(S.colores) : act(S.tallas);
  const libres = esColor ? OTROS.filter((o) => !S.colores.some((c) => c.id === o.id)) : TALLAS_EXTRA.filter((t) => !S.tallas.some((x) => x.id === t));
  if (!libres.length) { aviso(esColor ? 'Ya están todos los colores de la maqueta' : 'Ya están todas las tallas de la maqueta'); return; }
  const otros = esColor ? act(S.tallas) : act(S.colores);
  const est = { sel: null, selPrev: null, ini: {}, tot: 0 };
  otros.forEach((o) => (est.ini[o.id] = 0));
  const unidades = U.nace === 'unidades';
  const h = abrirHoja(`<div id="h-in">
    <div class="cas" style="--i:0"><span class="lbl">Variantes y precios</span><h3>${esColor ? 'Agregar color' : 'Agregar talla'}</h3><p class="baj">${esColor ? 'Una fila nueva, con todas sus tallas.' : 'Una columna nueva, en cada color.'}</p></div>
    <ol class="pasos cas" style="--i:1" id="h-pasos"></ol>
    <section class="cas" style="--i:2" id="h-s1"></section>
    <section class="cas bloque" style="--i:3" id="h-s2"></section>
    <div class="cas pv" style="--i:4" id="h-pv"></div>
    <div class="cas pie-guia" style="--i:5" id="h-pie"></div></div>`);
  h.classList.add('ancha');
  const nombreSel = () => (esColor ? OTROS.find((o) => o.id === est.sel)?.n : `la talla ${est.sel}`) || '';
  const pintar = () => {
    const prevTot = est.tot; est.tot = otros.reduce((a, o) => a + (est.ini[o.id] || 0), 0);
    const hay = !!est.sel;
    /* pasos */
    $('#h-pasos', h).innerHTML = `<li class="${hay ? 'hecho' : 'ahora'}"><i>${hay ? ic('check') : 1}</i>${esColor ? 'Elige el color' : 'Elige la talla'}</li><span class="hilo-p ${hay ? 'on' : ''}"></span><li class="${hay ? 'ahora' : ''}"><i>2</i>${unidades ? 'Unidades de partida' : 'Cómo nace'}</li>`;
    /* 1 · qué se agrega */
    const libresH = libres.map((o) => {
      const id = esColor ? o.id : o, on = est.sel === id;
      return esColor
        ? `<button class="muestra ${on ? 'on' : ''}" data-a="h-sel" data-v="${id}"><span class="bola" style="background:${o.hex}">${on ? ic('check') : ''}</span>${o.n}</button>`
        : `<button class="muestra tl ${on ? 'on' : ''}" data-a="h-sel" data-v="${id}"><b>${id}</b>${on ? `<span class="tick">${ic('check')}</span>` : ''}</button>`;
    }).join('');
    const yaH = `<div class="ya-fila"><span>Ya están en esta prenda</span>${existentes.map((o) => `<span class="ya-chip">${esColor ? `<i class="punto" style="background:${o.hex}"></i>${o.n}` : o.id}</span>`).join('')}</div>`;
    $('#h-s1', h).innerHTML = `<div class="s-tit"><b>${esColor ? 'Color' : 'Talla'}</b>${hay ? '' : '<span class="sigue">Sigue aquí</span>'}</div><div class="muestras ${hay ? '' : 'luz'} ${est.destello ? 'destello' : ''}" id="h-sw">${libresH}</div>${yaH}`;
    /* 2 · con cuántas unidades */
    const s2 = $('#h-s2', h); s2.classList.toggle('espera', !hay);
    const celdas = otros.map((o) => `<div class="u-c"><span class="u-l">${esColor ? `Talla <b>${o.id}</b>` : `<i class="punto" style="background:${o.hex}"></i>${o.n}`}</span>
      <div class="paso ${est.ini[o.id] ? 'cambio' : ''}"><button data-a="h-menos" data-v="${o.id}" aria-label="Quitar uno">−</button><span class="n num">${est.ini[o.id]}</span><button data-a="h-mas" data-v="${o.id}" aria-label="Sumar uno">+</button></div></div>`).join('');
    s2.innerHTML = unidades
      ? `<div class="s-tit"><b>¿Con cuántas unidades nace?</b>${hay ? '<span class="sigue">Sigue aquí</span>' : '<span class="sigue off">Primero lo de arriba</span>'}</div>
         <div class="u-grid ${hay ? 'luz' : ''}">${celdas}</div>
         <div class="u-pie"><span>Entran <b class="num" id="h-tot">${prevTot}</b> ${est.tot === 1 ? 'unidad' : 'unidades'} al <b>almacén</b></span><span class="u-acc"><button class="btn sut chico" data-a="h-todas">${ic('plus', 'p')}1 a todas</button><button class="btn sut chico" data-a="h-ceros">En 0</button></span></div>
         <div class="nota">${ic('info')}<span>Es la <b>única vez</b> que se escriben unidades aquí: al guardar, el número se sella y después solo se cuenta en Existencias.</span></div>`
      : `<div class="s-tit"><b>Cómo nace</b></div><div class="nota">${ic('info')}<span>Nace <b>en cero</b>. Cuando llegue mercadería se registra al recibirla o contando en Existencias. Así no hay números sin dueño.</span></div>`;
    if (unidades && est.tot !== prevTot) rodar($('#h-tot', h), prevTot, est.tot, 380);
    /* vista previa de la tabla */
    const cols = act(S.tallas).map((t) => t.id).concat(!esColor && hay ? [est.sel] : []);
    const nuevaFila = esColor && hay ? OTROS.find((o) => o.id === est.sel) : null;
    const fila = (c, nuevo) => `<tr class="${nuevo ? 'pv-nuevo ' + (est.selPrev !== est.sel ? 'pv-in' : '') : ''}"><th><span class="punto" style="background:${c.hex}"></span>${c.n}${nuevo ? '<span class="chip amb">Nueva</span>' : ''}</th>
      ${cols.map((t) => { const esN = nuevo || (!esColor && t === est.sel); const v = nuevo ? est.ini[t] || 0 : esN ? est.ini[c.id] || 0 : tot(c.id, t);
        return `<td class="${esN ? 'pv-n ' + (!esColor && est.selPrev !== est.sel ? 'pv-in' : '') : ''}">${esN ? v : celda(c.id, t) === null ? '—' : v}</td>`; }).join('')}</tr>`;
    $('#h-pv', h).innerHTML = `<div class="s-tit"><b>Así quedará en la tabla</b></div><div class="caja-tabla"><table class="pv-t"><thead><tr><th></th>${cols.map((t) => `<th class="${!esColor && t === est.sel ? 'pv-n' : ''}">${t}</th>`).join('')}${!esColor && !hay ? '<th class="fantasma">?</th>' : ''}</tr></thead>
      <tbody>${act(S.colores).map((c) => fila(c, false)).join('')}${nuevaFila ? fila(nuevaFila, true) : esColor ? `<tr class="fantasma"><th>Aquí irá el color nuevo</th>${cols.map(() => '<td>·</td>').join('')}</tr>` : ''}</tbody></table></div>`;
    est.selPrev = est.sel;
    /* pie con la guía: qué falta */
    $('#h-pie', h).innerHTML = `${hay ? `<span class="listo">${ic('check', 'p')}Listo: ${esColor ? nombreSel() : nombreSel()}${unidades ? ` · ${est.tot} ${est.tot === 1 ? 'unidad' : 'unidades'}` : ' · nace en 0'}</span>` : `<button class="falta" data-a="h-falta">${ic('arrow', 'p')}Falta: elige ${esColor ? 'un color' : 'una talla'}</button>`}
      <div class="pie-acc"><button class="btn" data-a="cerrar">Cancelar</button><button class="btn pri ${hay ? '' : 'off'}" data-a="h-ok">${esColor ? 'Agregar color' : 'Agregar talla'}</button></div>`;
  };
  est.tot = 0; pintar();
  h._est = est; h._tipo = tipo; h._pintar = pintar;
}
function agregarVariante(h) {
  const est = h._est; if (!est.sel) return;
  if (h._tipo === 'color') {
    const o = OTROS.find((x) => x.id === est.sel); S.colores.push({ ...o, estado: 'nuevo', _recien: true }); S.ins[o.id] = [];
    act(S.tallas).forEach((t) => { const key = k(o.id, t.id); S.stock[key] = { p: 0, a: U.nace === 'unidades' ? est.ini[t.id] || 0 : 0, nuevo: true }; S.precio[key] = PRECIO0[t.id] ?? PRECIO0.M; S.costo[key] = COSTO0[t.id] ?? COSTO0.M; });
    aviso(`${o.n} agregado`, 'Se guarda con «Revisar y guardar».');
  } else {
    const id = est.sel; S.tallas.push({ id, estado: 'nuevo' });
    act(S.colores).forEach((c) => { const key = k(c.id, id); if (c.estado === 'archivado') return; S.stock[key] = { p: 0, a: U.nace === 'unidades' ? est.ini[c.id] || 0 : 0, nuevo: true }; S.precio[key] = PRECIO0.M; S.costo[key] = COSTO0.M; });
    aviso(`Talla ${id} agregada`, 'Se guarda con «Revisar y guardar».');
  }
  cerrarCapas(); pintarCuerpo(false); islaActualizar();
}
function hojaRevisar() {
  const L = cambios(), grupos = [...new Set(L.map((x) => x.g))];
  const h = abrirHoja(`<div class="cas" style="--i:0"><span class="lbl">Antes de guardar</span><h3>Revisa lo que cambia</h3><p class="baj">${L.length} ${L.length === 1 ? 'cambio' : 'cambios'}. <b>El stock no está aquí:</b> eso se cuenta en Existencias.</p></div>
  <ul class="lista-c cas" style="--i:1">${grupos.map((g) => `<li class="tit">${g}</li>${L.filter((x) => x.g === g).map((x) => `<li><b>${x.t}</b><small>${x.d}</small></li>`).join('')}`).join('')}</ul>
  <div class="cas" style="--i:2"><span class="lbl">Responsable <span style="color:var(--rojo)">*</span></span><div class="combo" style="margin:6px 0 4px"><button data-a="h-resp" id="h-resp-b">${ic('user')}<span style="flex:1" id="h-resp-t">¿Quién hace esta operación?</span>${ic('down')}</button></div></div>
  <div class="pie-acc cas" style="margin-top:18px;--i:3"><button class="btn" data-a="cerrar">Seguir editando</button><button class="btn pri off" id="h-guardar" data-a="h-guardar">Guardar cambios</button></div>`);
  h._resp = null;
}
async function guardarCambios(h) {
  const b = $('#h-guardar', h); b.classList.add('guardando'); b.textContent = 'Guardando…'; await sleep(1000);
  const nuevos = Object.entries(S.stock).filter(([, s]) => s && s.nuevo).map(([key]) => key);
  S.colores.forEach((c) => { if (c.estado === 'nuevo') c.estado = 'activo'; });
  S.tallas.forEach((t) => { if (t.estado === 'nuevo') t.estado = 'activo'; });
  nuevos.forEach((key) => { delete S.stock[key].nuevo; });
  B = copia(S); cerrarCapas(); pintarCuerpo(false); islaActualizar();
  if (nuevos.length) nuevos.forEach((kk) => $$(`[data-k="${kk}"]`).forEach((e) => { e.classList.add('sellado'); $$('.cand', e).forEach((c) => { c.classList.remove('cerrado'); void c.getBoundingClientRect(); c.classList.add('cierra'); }); }));
  aviso('Cambios guardados', nuevos.length ? 'El stock inicial quedó sellado: ahora solo se cuenta en Existencias.' : 'Precios, costos e insignias al día.');
}

/* ── Quitar color / talla ───────────────────────────────────────────────────────────────────────── */
function quitar(tipo, id, ancla) {
  const esC = tipo === 'color', obj = (esC ? S.colores : S.tallas).find((x) => x.id === id), nombre = esC ? obj.n : `la talla ${obj.id}`;
  const total = esC ? totColor(id) : totTalla(id);
  if (obj.estado === 'nuevo') { removerNuevo(tipo, id); return; }
  if (total === 0) {
    const p = abrirPop(ancla, `<span class="ic-g al">${ic('archive', 'g')}</span><h4>¿Archivar ${nombre}?</h4><p>Deja de venderse. <b>No se borra</b>: sus ventas, etiquetas y movimientos se quedan.</p>
      <div class="pie-acc"><button class="btn" data-a="cerrar">Cancelar</button><button class="btn pel" data-a="archivar" data-tipo="${tipo}" data-id="${id}">Archivar</button></div>`);
  } else {
    abrirPop(ancla, `<span class="ic-g">${candado('cerrado')}</span><h4>${esC ? obj.n : 'La talla ' + obj.id} tiene ${total} ${total === 1 ? 'unidad' : 'unidades'}</h4><p>Para archivarlo, primero llévalo a 0 contando en Existencias. Así <b>no queda stock escondido</b> en algo que ya no se vende.</p>
      <div class="pie-acc"><button class="btn" data-a="cerrar">Entendido</button><button class="btn pri" data-a="a-cero" data-tipo="${tipo}" data-id="${id}">Llevarlo a 0 en Existencias ${ic('arrow', 'avanza')}</button></div>`);
  }
}
function removerNuevo(tipo, id) {
  const esC = tipo === 'color';
  if (esC) { S.colores = S.colores.filter((c) => c.id !== id); Object.keys(S.stock).filter((x) => x.startsWith(id + '|')).forEach((x) => { delete S.stock[x]; delete S.precio[x]; delete S.costo[x]; }); }
  else { S.tallas = S.tallas.filter((t) => t.id !== id); Object.keys(S.stock).filter((x) => x.endsWith('|' + id)).forEach((x) => { delete S.stock[x]; delete S.precio[x]; delete S.costo[x]; }); }
  pintarCuerpo(false); islaActualizar(); aviso('Quitado', 'Todavía no estaba guardado: no deja rastro.');
}
async function archivar(tipo, id) {
  cerrarCapas();
  const esC = tipo === 'color', fila = esC ? $(`tr.fila[data-c="${id}"]`) : null;
  const obj = (esC ? S.colores : S.tallas).find((x) => x.id === id);
  if (fila) { fila.classList.add('se-va'); await sleep(520); }
  obj.estado = 'archivado'; pintarCuerpo(false); islaActualizar();
  aviso(`${esC ? obj.n : 'Talla ' + obj.id} archivado`, 'No se borra. Se confirma con «Revisar y guardar».', () => { obj.estado = B[esC ? 'colores' : 'tallas'].find((x) => x.id === id)?.estado || 'activo'; pintarCuerpo(false); islaActualizar(); });
}

/* ── Notas de cada dirección ────────────────────────────────────────────────────────────────────── */
const NOTAS = {
  A: { t: 'A · Candado y puerta', f: 'Todo sigue en su lugar, pero con candado. Y cada número es una puerta.', h: 4, pasos: '3 toques: el candado → «Ajustar stock» → Guardar',
    q: 'La pestaña «Unidades» queda primera, con la misma tabla. Los − N + se ven apagados con su candado; al tocar el candado aparece «Ajustar stock» y te lleva a esa talla, ya enfocada, en la planilla de Existencias.',
    g: 'Nada que reaprender: la tabla es la misma y está donde estaba. El número que miraban sigue ahí.', p: 'Una pantalla de ida y vuelta por cada conteo. Quien cuenta muchas tallas va y viene.', c: 'Quien entra a Editar para mirar cuánto queda.' },
  B: { t: 'B · El espejo', f: 'Editar pierde el botón, pero gana información que antes no tenía.', h: 3, pasos: '3 toques: «Ajustar stock» → talla → Guardar',
    q: '«Unidades» pasa a ser una lectura rica: unidades en total, en el piso y en el almacén, quién y cuándo contó por última vez, y cada número con su barrita piso/almacén. Un botón grande lleva a contar.',
    g: 'Lo que se pierde (tocar +) se paga con datos útiles. Se entiende en 5 segundos que esto es para mirar.', p: 'Hay que construir «último conteo» y el reparto piso/almacén en la ficha (una lectura nueva a movimientos).', c: 'Quien necesita saber dónde está la prenda sin ir a Existencias.' },
  C: { t: 'C · El cajón', f: 'Sigues tocando + y −. Lo que cambia es dónde queda escrito.', h: 5, pasos: '2 toques: + → Guardar (con responsable)',
    q: 'Los − N + siguen vivos. Al tocarlos se abre Existencias en un cajón lateral con tu cambio ya puesto, con el motivo, el lugar y el responsable que Existencias pide. Guardas ahí; el cajón se cierra y los números de Editar cuentan hasta el valor nuevo.',
    g: 'Es lo más parecido al hábito de hoy y sin cambiar de pantalla. Se aprende solo.', p: 'Es el componente de Existencias montado dentro de Editar: hay que cuidar que respete el módulo (quien no ve Existencias no lo abre). Y puede hacer creer que se ajusta «en Editar».', c: 'Quien cuenta seguido desde Editar. Ideal como puente (ola 2).' },
  D: { t: 'D · Sin pestaña', f: 'Editar es de dinero y de estructura. El stock vive en un solo lugar.', h: 1, pasos: '3 toques: «Ver y ajustar» → talla → Guardar',
    q: 'Se va la pestaña. En cada color queda un dato chico («12 en tienda») y arriba una tira con el total y «Ver y ajustar en Existencias». La pantalla queda con tres pestañas: Precios, Costos e Insignias.',
    g: 'La pantalla más simple y la regla más clara: imposible ajustar stock por error desde aquí.', p: 'El choque más fuerte: quien abría Editar para contar no encuentra nada. Pide aviso previo de una semana.', c: 'Cuando ya todas cuentan en Existencias.' },
};
function pintarNotas() {
  const n = NOTAS[U.dir];
  $('#notas').innerHTML = `<div class="animando-n" style="display:contents">
  <div style="--i:0"><span class="lbl">Dirección elegida</span><h2>${n.t}</h2></div>
  <p class="frase" style="--i:1">${n.f}</p>
  <dl style="--i:2"><div><dt>Qué cambia</dt><dd>${n.q}</dd></div><div><dt>Ganas</dt><dd>${n.g}</dd></div><div><dt>Pagas</dt><dd>${n.p}</dd></div><div><dt>Le sirve a</dt><dd>${n.c}</dd></div></dl>
  <div style="--i:3"><div class="lbl">Hábito de hoy que se conserva</div><div class="medidor">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n.h ? 'on' : ''}"></i>`).join('')}</div><div style="font-size:12.5px;color:var(--t65);margin-top:6px">${n.pasos} <i>(contados en esta maqueta, no medidos en producción)</i></div></div>
  <div style="--i:4"><div class="lbl" style="margin-bottom:8px">Cómo llega sin perjudicar a nadie</div><div class="olas">
    <div class="ola"><span class="pt">1</span><div><b>Aviso · 1.ª semana</b><small>Editar sigue igual. Al tocar el stock dice «Desde el lunes 3 se cuenta en Existencias» y ofrece «Probarlo ahora».</small></div></div>
    <div class="ola"><span class="pt">2</span><div><b>Puerta · 2.ª semana</b><small>− y + abren Existencias con lo tocado (la idea C) mientras se aprende.</small></div></div>
    <div class="ola"><span class="pt">3</span><div><b>Candado</b><small>Queda la dirección elegida. Stock inicial solo al nacer una prenda o una variante.</small></div></div></div></div></div></div>`;
}

/* ── Interacción ────────────────────────────────────────────────────────────────────────────────── */
function sincBarra() {
  $$('#g-dir button').forEach((b) => b.classList.toggle('on', b.dataset.dir === U.dir));
  $$('#g-esc button').forEach((b) => b.classList.toggle('on', b.dataset.esc === U.esc));
  $$('#g-nace button').forEach((b) => b.classList.toggle('on', b.dataset.nace === U.nace));
}
function pintarEscena() {
  cerrarCapas(); U.cajon = false;
  if (U.esc === 'editar') pintarEditar(); else if (U.esc === 'nuevo') pintarNuevo(); else { P = nuevoP(); pintarExistencias(); }
  pintarNotas();
}
function reiniciar() { S = inicial(); B = copia(S); N = nuevoBorrador(); U.tab = U.dir === 'D' ? 'precios' : 'tienda'; U.ultimaCarga = 'hoy 8:40 · Ana Ríos'; pintarEscena(); }

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-a],[data-dir],[data-esc],[data-nace],[data-tema],[data-w],[data-tab],#b-lento,#b-rep'); if (!t) return;
  const d = t.dataset;
  if (d.dir) { U.dir = d.dir; if (U.dir === 'D' && U.tab === 'tienda') U.tab = 'precios'; else if (U.dir !== 'D' && U.esc === 'editar') U.tab = 'tienda'; sincBarra(); pintarEscena(); return; }
  if (d.esc) { U.esc = d.esc; sincBarra(); pintarEscena(); return; }
  if (d.nace) { U.nace = d.nace; sincBarra(); return; }
  if (d.tema) { document.documentElement.dataset.tema = d.tema; $$('#g-fin [data-tema]').forEach((b) => b.classList.toggle('on', b === t)); return; }
  if (d.w) { $('#estrado').style.setProperty('--w', d.w); setTimeout(recolocar, 700); setTimeout(recolocar, 1300); $$('#g-fin [data-w]').forEach((b) => b.classList.toggle('on', b === t)); return; }
  if (t.id === 'b-lento') { document.documentElement.classList.toggle('lento'); t.classList.toggle('on', lento()); return; }
  if (t.id === 'b-rep') { reiniciar(); return; }
  if (d.tab) { U.tab = d.tab; $$('.tabs button').forEach((b) => b.classList.toggle('on', b === t)); moverPildora(true); pintarCuerpo(true); return; }
  const a = d.a;
  switch (a) {
    case 'cerrar': cerrarCapas(); break;
    case 'volver-lista': aviso('Volverías a Productos', 'En la maqueta no hay lista: usa la barra de arriba.'); break;
    case 'volver-editar': volverAEditar(); break;
    case 'ir-exist': irAExistencias({ desdeBarra: true }); break;
    /* A · la puerta */
    case 'puerta': case 'b-celda': {
      const key = (t.closest('[data-k]') || t).dataset.k, [c, ta] = key.split('|');
      abrirPop(t, `<span class="ic-g">${candado('cierra')}</span><h4>Ajustar stock</h4><p>Este número tiene candado${U.dir === 'B' ? ` (piso ${celda(c, ta).p}, almacén ${celda(c, ta).a})` : ''}: el stock se ajusta en <b>Existencias</b>, con su motivo y su responsable. Te llevamos directo a <b>${nomColor(c)} · ${ta}</b>.</p>
        <div class="pie-acc"><button class="btn" data-a="cerrar">Ahora no</button><button class="btn pri" data-a="contar" data-k="${key}">${ic('clip')}Ajustar stock ${ic('arrow', 'avanza')}</button></div>`); break; }
    case 'contar': irAExistencias({ foco: d.k }); break;
    /* C · el cajón */
    case 'c-mas': abrirCajon(d.k, +1); break;
    case 'c-menos': abrirCajon(d.k, -1); break;
    case 'cerrar-cajon': cerrarCajon(false); break;
    /* stock inicial de una variante nueva (solo mientras no se guarda) */
    case 'ini-mas': case 'ini-menos': { const s = S.stock[d.k]; s.a = Math.max(0, s.a + (a === 'ini-mas' ? 1 : -1)); const e = $(`.paso[data-k="${d.k}"] .n`); e.textContent = s.a; $('.paso[data-k="' + d.k + '"]').classList.add('cambio'); const [c, ta] = d.k.split('|'); const tc = $(`[data-id="tc:${c}"]`); if (tc) tc.textContent = totColor(c); const tt = $(`[data-id="tt:${ta}"]`); if (tt) tt.textContent = totTalla(ta); const tg = $('[data-id="tg"]'); if (tg) tg.textContent = totAll(); islaActualizar(); break; }
    case 'hueco': { const key = k(d.c, d.t); S.stock[key] = { p: 0, a: 0, nuevo: true }; S.precio[key] = PRECIO0.M; S.costo[key] = COSTO0.M; pintarCuerpo(false); islaActualizar(); break; }
    /* insignias */
    case 'ins': { const l = S.ins[d.c] || (S.ins[d.c] = []); const i = l.indexOf(d.i); i < 0 ? l.push(d.i) : l.splice(i, 1); t.classList.toggle('on'); t.classList.toggle('cambio', (S.ins[d.c].includes(d.i)) !== (B.ins[d.c] || []).includes(d.i)); islaActualizar(); break; }
    /* estructura */
    case 'add-color': hojaAgregar('color'); break;
    case 'add-talla': hojaAgregar('talla'); break;
    case 'h-sel': { const h = t.closest('.hoja'); h._est.sel = d.v; h._pintar(); break; }
    case 'h-mas': case 'h-menos': { const h = t.closest('.hoja'); h._est.ini[d.v] = Math.max(0, (h._est.ini[d.v] || 0) + (a === 'h-mas' ? 1 : -1)); h._pintar(false); break; }
    case 'h-ok': { const h = t.closest('.hoja'); if (h._est.sel) agregarVariante(h); break; }
    case 'h-todas': { const h = t.closest('.hoja'); Object.keys(h._est.ini).forEach((x) => h._est.ini[x]++); h._pintar(); break; }
    case 'h-ceros': { const h = t.closest('.hoja'); Object.keys(h._est.ini).forEach((x) => (h._est.ini[x] = 0)); h._pintar(); break; }
    case 'h-falta': { const h = t.closest('.hoja'); h._est.destello = true; h._pintar(); setTimeout(() => { h._est.destello = false; h._pintar(); }, 1100 * K()); break; }
    case 'quitar-color': quitar('color', d.c, t); break;
    case 'quitar-talla': quitar('talla', d.t, t); break;
    case 'editar-color': case 'editar-talla': abrirPop(t, `<span class="ic-g">${ic('pencil', 'g')}</span><h4>Corregir nombre o código</h4><p>Esto no cambia con la maqueta: sigue como hoy.</p><div class="pie-acc"><button class="btn" data-a="cerrar">Entendido</button></div>`); break;
    case 'archivar': archivar(d.tipo, d.id); break;
    case 'a-cero': irAExistencias({ focoColor: d.tipo === 'color' ? d.id : null, foco: null, desdeBarra: true }); break;
    case 'revisar': hojaRevisar(); break;
    case 'h-resp': { const h = t.closest('.hoja'); abrirPop(t, `<h4 style="margin-top:0">¿Quién guarda?</h4><div style="display:grid;gap:4px;margin-top:8px">${PERSONAS.map((n) => `<button class="btn sut" data-a="h-resp-ok" data-v="${n}" style="justify-content:flex-start">${ic('user')}${n}</button>`).join('')}</div>`, true); break; }
    case 'h-resp-ok': { const hoja = $('.hoja'); const pop = $('.pop'); pop?.remove(); $('.catch')?.remove(); $('#h-resp-t').textContent = d.v; $('#h-resp-b').classList.add('ok'); const g = $('#h-guardar'); g.classList.remove('off'); break; }
    case 'h-guardar': { if ($('#h-guardar').classList.contains('off')) { $('#h-resp-b').click(); break; } guardarCambios($('.hoja')); break; }
    /* Nuevo producto */
    case 'n-mas': case 'n-menos': { N[d.k] = Math.max(0, N[d.k] + (a === 'n-mas' ? 1 : -1)); nActualizar(d.k); break; }
    case 'n-hueco': { N[d.k] = 0; pintarNuevo(); break; }
    case 'n-tab-x': aviso('Solo esta pestaña se muestra', 'La maqueta se concentra en «Unidades de hoy».'); break;
    case 'n-crear': crearProducto(); break;
    /* Planilla de Existencias */
    case 'p-mas': case 'p-menos': {
      const key = d.k, hoy = hoyP(key), v = valP(key) + (a === 'p-mas' ? 1 : -1);
      if (v === hoy) delete P.val[P.lugar][key]; else P.val[P.lugar][key] = v; P.avisoLugar = false; P.pre = P.pre; repintarP(); break; }
    case 'lugar': { if (d.v === P.lugar) break; if (hayCambiosP()) { P.avisoLugar = true; repintarP(); break; } P.lugar = d.v; if (P.lugar === 'piso' && P.motivo === 'reposicion') P.motivo = 'conteo'; repintarP(); break; }
    case 'descartar-pasar': P.val = { piso: {}, almacen: {} }; P.lugar = P.lugar === 'piso' ? 'almacen' : 'piso'; P.avisoLugar = false; repintarP(); break;
    case 'motivo': { if (t.classList.contains('off')) break; P.motivo = d.v; for (const key in P.val[P.lugar]) { const hoy = hoyP(key), v = P.val[P.lugar][key]; if ((d.v === 'reposicion' && v < hoy) || (d.v === 'merma' && v > hoy)) delete P.val[P.lugar][key]; } repintarP(); break; }
    case 'combo': P.combo = !P.combo; repintarP(); break;
    case 'resp': P.resp = d.v; P.combo = false; repintarP(); break;
    case 'p-cancel': if (U.cajon) cerrarCajon(false); else if (hayCambiosP()) { P.val = { piso: {}, almacen: {} }; repintarP(); } else volverAEditar(); break;
    case 'p-guardar': if (!t.classList.contains('off')) guardarP(); else if (!P.resp) { P.combo = true; repintarP(); } break;
  }
});
/* Precios y costos: se escriben y se confirman al salir del campo (sin repintar, para no perder el foco) */
document.addEventListener('change', (ev) => {
  const i = ev.target.closest('input[data-campo]'); if (!i) return;
  const v = Math.max(0, parseFloat(String(i.value).replace(',', '.')) || 0), key = i.dataset.k, campo = i.dataset.campo;
  S[campo][key] = v; i.value = v.toFixed(2); i.closest('.campo-p').classList.toggle('cambio', B[campo][key] !== undefined && B[campo][key] !== v);
  if (campo === 'costo') { const m = Math.round((1 - v / (S.precio[key] || 1)) * 100), e = $(`[data-mg="${key}"]`); if (e) { e.textContent = `Margen ${m}%`; e.classList.toggle('m', m < 55); } }
  islaActualizar();
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { if ($('.pop,.hoja')) cerrarCapas(); else if (U.cajon) cerrarCajon(false); } });
const recolocar = () => $$('.tabs').forEach((t) => { const on = $('button.on', t), p = $('.pildora', t); if (on && p) { p.style.transition = 'none'; p.style.left = on.offsetLeft + 'px'; p.style.width = on.offsetWidth + 'px'; p.offsetWidth; p.style.transition = ''; } });
window.addEventListener('resize', recolocar);

sincBarra(); pintarEscena();
document.fonts?.ready.then(recolocar);
})();
