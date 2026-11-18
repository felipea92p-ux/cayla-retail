'use strict';
/* =====================================================================
   Maqueta · Ficha de consumo del modelo (2026-10-26) — lo que comparten A, B y C:
   los datos (Chaleco de Prueba, CHA-0001: modelo, 4 colores, tallas S y M y precio S/ 59 son REALES, de la base local;
   las cantidades, telas, avíos y órdenes cerradas son INVENTADAS), las cuentas del plan (las de lib/orden-tela-reglas.ts:
   `metrosAPedir`, `cantidadAPedir`, `veredictoTela`, copiadas tal cual para que lo que se ve sea lo que saldría),
   la barra de la maqueta, el lateral que imita al ERP, la hoja (Modal) y el BLOQUE «Tela y avíos» de una orden.
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/* ---------- datos ---------- */
const MODELO = { cod: 'CHA-0001', nombre: 'Chaleco de Prueba', precio: 59 };
const COLORES = [
  { c: 'BLA', n: 'Blanco', hex: '#F4F9FF' },
  { c: 'GRP', n: 'Gris perla', hex: '#C5C5C5' },
  { c: 'GRM', n: 'Gris melange', hex: '#A2A2A1' },
  { c: 'BEI', n: 'Beige', hex: '#D5BA98' },
];
const TALLAS = ['S', 'M'];
/** La orden que se abriría hoy (inventada): prendas por color y talla. 100 en total, 40 S y 60 M. */
const ORDEN_EJ = { BLA: { S: 12, M: 18 }, GRP: { S: 10, M: 14 }, GRM: { S: 8, M: 12 }, BEI: { S: 10, M: 16 } };
const MERMA_TELA = 0.03; // insumos.merma_pct de la tela (3 %, R-31)
/** Telas del estante (Insumos), una por color. Inventadas. `saldo` = lo que hay, en metros. */
const TELA_INS = {
  BLA: { nombre: 'Gabardina stretch blanca', saldo: 80 },
  GRP: { nombre: 'Gabardina stretch gris perla', saldo: 22 },
  GRM: { nombre: 'Gabardina stretch gris melange', saldo: 60 },
  BEI: { nombre: 'Gabardina stretch beige', saldo: 45 },
};
/** Avíos del estante. El hilo existe en tres colores de cuatro: el gris melange no está en Insumos. */
const HILO_INS = { BLA: { nombre: 'Hilo poliéster blanco', saldo: 6 }, GRP: { nombre: 'Hilo poliéster gris perla', saldo: 3 }, BEI: { nombre: 'Hilo poliéster beige', saldo: 2 }, GRM: null };
const UNIDADES = { unid: { corta: 'unid.', dec: 0 }, cono: { corta: 'conos', uno: 'cono', dec: 0 }, metro: { corta: 'm', dec: 1 } };
/** Lo que dice la ficha hoy en el ejemplo (Audaces): ADR-0400 `{"S": 1.15, "M": 1.2}`. */
const FICHA_AUDACES = {
  tela: { S: '1.150', M: '1.200' },
  avios: [
    { id: 'bot', nombre: 'Botón nácar 18 mm', unidad: 'unid', cant: '5', para: 'todas', merma: 0, saldo: 600 },
    { id: 'hilo', nombre: 'Hilo poliéster', unidad: 'cono', cant: '0.03', para: 'color', merma: 0.05 },
    { id: 'etm', nombre: 'Etiqueta de marca', unidad: 'unid', cant: '1', para: 'todas', merma: 0, saldo: 1500 },
    { id: 'ett', nombre: 'Etiqueta de talla', unidad: 'unid', cant: '1', para: 'talla', merma: 0, saldo: 400 },
  ],
};
/** Las tres órdenes cerradas del escenario «con lo medido» (inventadas): buenas y metros de tela gastados. */
const CERRADAS = [
  { op: 'OP-312', cierre: '04 sep', buenas: 48, metros: 60.1 },
  { op: 'OP-325', cierre: '29 sep', buenas: 36, metros: 44.6 },
  { op: 'OP-338', cierre: '17 oct', buenas: 60, metros: 75.5 },
];

/* ---------- cuentas (lib/orden-tela-reglas.ts) ---------- */
const prendasColor = (c) => TALLAS.reduce((s, t) => s + ORDEN_EJ[c][t], 0);
const prendasTalla = (t) => COLORES.reduce((s, x) => s + ORDEN_EJ[x.c][t], 0);
const TOTAL = COLORES.reduce((s, x) => s + prendasColor(x.c), 0);
const aMilesimas = (n) => Math.round(Number((n * 1000).toPrecision(15))) / 1000;
const leer = (t) => (/^\d+(\.\d{0,3})?$/.test(String(t).trim()) && Number(t) > 0 ? Number(t) : null);
/** Lo que se pide: hacia ARRIBA a lo que admite la unidad (`cantidadAPedir`). */
function aPedir(n, unidad) {
  if (!(n > 0)) return 0;
  const f = 10 ** UNIDADES[unidad].dec;
  return Math.ceil(Number((n * f).toPrecision(12))) / f;
}
const planTela = (c, cons) => aMilesimas(TALLAS.reduce((s, t) => s + (cons[t] ?? 0) * ORDEN_EJ[c][t], 0) * (1 + MERMA_TELA));
const f3 = (n) => (Number.isFinite(n) ? n.toFixed(3) : '');
const f1 = (n) => n.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fq = (n, u) => `${n.toLocaleString('es-PE', { maximumFractionDigits: UNIDADES[u].dec === 0 ? 0 : 3 })} ${n === 1 && UNIDADES[u].uno ? UNIDADES[u].uno : UNIDADES[u].corta}`;
const pct = (a, b) => `${a >= b ? '+' : '−'}${(Math.abs(a / b - 1) * 100).toFixed(1).replace('.', ',')} %`;

/** Cuánto lleva un avío por cada «destino» de su regla («Para»): toda la orden, cada color (con su insumo del mismo color) o cada talla. */
function resolverAvio(a) {
  const cant = leer(a.cant) ?? 0;
  const dest = a.para === 'color'
    ? COLORES.map((x) => ({ etq: x.n, hex: x.hex, prendas: prendasColor(x.c), falta: a.id === 'hilo' && !HILO_INS[x.c] }))
    : a.para === 'talla'
      ? TALLAS.map((t) => ({ etq: `Talla ${t}`, prendas: prendasTalla(t) }))
      : [{ etq: 'Toda la orden', prendas: TOTAL }];
  const lineas = dest.map((d) => {
    const plan = aMilesimas(cant * d.prendas * (1 + a.merma));
    return { ...d, plan, pedir: aPedir(plan, a.unidad) };
  });
  return { lineas, pedir: lineas.reduce((s, l) => s + l.pedir, 0), faltantes: lineas.filter((l) => l.falta) };
}

/* ---------- iconos (lucide) ---------- */
const ICONOS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>
  <symbol id="i-mas" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5v14"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></symbol>
  <symbol id="i-abajo" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
  <symbol id="i-flecha-izq" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></symbol>
  <symbol id="i-lapiz" viewBox="0 0 24 24"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></symbol>
  <symbol id="i-alerta" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></symbol>
  <symbol id="i-historial" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></symbol>
  <symbol id="i-deshacer" viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></symbol>
  <symbol id="i-puerta" viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></symbol>
  <symbol id="i-regla" viewBox="0 0 24 24"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></symbol>
</svg>`;

/* ---------- el marco que imita al ERP ---------- */
function lateral(activo) {
  const g = (t) => `<p class="eyebrow grupo">${t}</p>`;
  const it = (t, on, sub) => `<span class="it ${on ? 'on' : ''} ${sub ? 'sub' : ''}">${t}</span>`;
  return `<aside class="lateral" aria-hidden="true">
    <p class="logo">CAYLA</p>
    ${g('Inventario')}${it('Existencias')}${it('Traslados')}
    ${g('Catálogo')}${it('Productos', activo === 'catalogo')}${it('Colores')}
    ${g('Producción')}${it('Resumen')}${it('Órdenes', activo === 'ordenes')}${it('Insumos')}
  </aside>`;
}
function cabecera({ eyebrow, titulo, frase, volver = true, derecha = '' }) {
  return `<header class="cab"><div>
      <div class="linea">${volver ? `<span class="volver" aria-label="Volver">${ic('flecha-izq')}</span>` : ''}<span class="eyebrow">${eyebrow}</span></div>
      <h1>${titulo}</h1><p class="frase">${frase}</p></div>${derecha ? `<div class="fila-flex">${derecha}</div>` : ''}</header>`;
}

/* ---------- la barra de la maqueta y el estado por la URL (#estado,oscuro,1024) ---------- */
const NAV = { estado: null, tema: 'claro', ancho: 'libre' };
function arrancarMaqueta({ clave, titulo, estados, inicial, lateralActivo, dibujar }) {
  document.body.insertAdjacentHTML('afterbegin', ICONOS);
  const partes = location.hash.replace('#', '').split(',').filter(Boolean);
  NAV.estado = partes.find((p) => estados.some((e) => e.id === p)) ?? inicial;
  if (partes.includes('oscuro')) NAV.tema = 'oscuro';
  NAV.ancho = partes.find((p) => p === '1024' || p === '1440') ?? 'libre';
  const spk = el('<div class="spk"></div>');
  const escena = el('<div class="marco"></div>');
  const capas = el('<div id="capas"></div>');
  document.body.append(spk, escena, capas);
  const aplicar = () => {
    document.documentElement.dataset.tema = NAV.tema;
    document.body.dataset.ancho = NAV.ancho;
    history.replaceState(null, '', '#' + [NAV.estado, NAV.tema === 'oscuro' ? 'oscuro' : '', NAV.ancho !== 'libre' ? NAV.ancho : ''].filter(Boolean).join(','));
    spk.innerHTML = `<b>${titulo}</b><a href="index.html">← las 3 direcciones</a><span class="sep"></span>
      <span class="grp" role="group" aria-label="Estado">${estados.map((e) => `<button class="pil dash" type="button" data-est="${e.id}" aria-pressed="${e.id === NAV.estado}">${e.txt}</button>`).join('')}</span><span class="sep"></span>
      <span class="grp" role="group" aria-label="Tema">${['claro', 'oscuro'].map((t) => `<button class="pil" type="button" data-tema="${t}" aria-pressed="${t === NAV.tema}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</span>
      <span class="grp" role="group" aria-label="Ancho">${['1024', '1440', 'libre'].map((a) => `<button class="pil" type="button" data-ancho="${a}" aria-pressed="${a === NAV.ancho}">${a === 'libre' ? 'Ancho libre' : a}</button>`).join('')}</span>`;
    document.documentElement.style.setProperty('--spk-h', spk.offsetHeight + 'px');
    $$('[data-est]', spk).forEach((b) => b.addEventListener('click', () => { NAV.estado = b.dataset.est; cerrarHoja(); aplicar(); pintar(); }));
    $$('[data-tema]', spk).forEach((b) => b.addEventListener('click', () => { NAV.tema = b.dataset.tema; aplicar(); }));
    $$('[data-ancho]', spk).forEach((b) => b.addEventListener('click', () => { NAV.ancho = b.dataset.ancho; aplicar(); }));
  };
  const pintar = () => {
    escena.innerHTML = lateral(lateralActivo) + '<main class="contenido" id="contenido"></main>';
    dibujar(NAV.estado, $('#contenido'));
  };
  aplicar();
  pintar();
  window.addEventListener('resize', () => document.documentElement.style.setProperty('--spk-h', spk.offsetHeight + 'px'));
  return { pintar, aplicar };
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/* ---------- la hoja (Modal): velo, hoja que sube, Escape la cierra ---------- */
function abrirHoja({ ancho = 760, html, alMontar, alCerrar }) {
  cerrarHoja();
  document.documentElement.style.setProperty('--spk-h', ($('.spk') || { offsetHeight: 64 }).offsetHeight + 'px');
  const capas = $('#capas');
  capas.innerHTML = `<div class="velo" data-cierra></div><div class="hoja-wrap"><div class="hoja" role="dialog" aria-modal="true" style="--ancho:${ancho}px">
    <button class="cerrar" type="button" data-cierra aria-label="Cerrar">${ic('x')}</button>${html}</div></div>`;
  const cerrar = () => { cerrarHoja(); alCerrar && alCerrar(); };
  $$('[data-cierra]', capas).forEach((b) => b.addEventListener('click', cerrar));
  document.onkeydown = (e) => { if (e.key === 'Escape') cerrar(); };
  alMontar && alMontar($('.hoja', capas), cerrar);
}
function cerrarHoja() { const c = $('#capas'); if (c) c.innerHTML = ''; document.onkeydown = null; }

/* =====================================================================
   El BLOQUE «Tela y avíos» de una orden. Es la misma pieza en las tres direcciones; lo que cambia es de dónde salen los números,
   si se pueden escribir y qué dice la cabecera. cfg:
     modo        'lee' (A: viene de la ficha, se ajusta solo esta orden) · 'escribe' (B) · 'puerta' (C: lee y abre la hoja)
     ficha       { tela: {S,M} | {una}, avios } o null (el modelo todavía no tiene ficha)
     cabecera    (api) => html a la derecha del título
     alMontar    (host, api) => enlaza los controles de la cabecera
   La cuenta de cada fila es la de la base: Σ talla (consumo × prendas) × (1 + merma), y se pide redondeado hacia arriba.
   ===================================================================== */
function BloqueOrden(host, cfg) {
  const ficha = cfg.ficha;
  const s = {
    desbloqueado: cfg.modo === 'escribe',
    /** Lo que la persona escribió: { 'BLA:S': '1.150' }. Lo que no escribió se hereda (ver `efectivo`). */
    propio: {},
    avios: ficha ? ficha.avios.map((a) => ({ ...a })) : [],
    quitados: new Set(),
    soloEsta: false,
  };
  const deFicha = (t) => (ficha ? (ficha.tela.una !== undefined ? ficha.tela.una : ficha.tela[t]) : undefined);
  const esUna = () => !!ficha && ficha.tela.una !== undefined;
  /** El número que vale en una celda: lo escrito; si no, el de la ficha; si no, una copia del primero que se escribió (misma fila y luego cualquiera). */
  function efectivo(c, t) {
    const k = `${c}:${t}`;
    if (k in s.propio) return { v: s.propio[k], copia: false };
    const f = deFicha(t);
    if (f !== undefined) return { v: f, copia: esUna() };
    const orden = [...TALLAS.filter((x) => x !== t).map((x) => `${c}:${x}`), ...Object.keys(s.propio)];
    const origen = orden.find((x) => x in s.propio && leer(s.propio[x]) !== null);
    return { v: origen ? s.propio[origen] : '', copia: !!origen };
  }
  const editable = () => s.desbloqueado;
  const api = {
    s, desbloquear: (v) => { s.desbloqueado = v; if (!v) { s.propio = {}; s.quitados.clear(); s.avios = ficha ? ficha.avios.map((a) => ({ ...a })) : []; } render(); },
    hayCambios: () => Object.keys(s.propio).length > 0 || s.quitados.size > 0 || s.avios.length !== (ficha ? ficha.avios.length : 0) || s.avios.some((a, i) => ficha && ficha.avios[i] && ficha.avios[i].cant !== a.cant),
    agregarAvio(a) { s.quitados.delete(a.id); if (!s.avios.some((x) => x.id === a.id)) s.avios.push({ ...a }); render(); },
    aproximado: () => COLORES.some((x) => TALLAS.some((t) => efectivo(x.c, t).copia && leer(efectivo(x.c, t).v) !== null)),
    efectivo, render: () => render(),
    /** Aplica lo que escribió la hoja de la ficha: a la ficha del modelo (enFicha) o solo a esta orden. */
    poner({ tela, avios, enFicha }) {
      if (enFicha && ficha) { ficha.tela = tela; ficha.avios = avios.map((a) => ({ ...a })); s.propio = {}; s.soloEsta = false; }
      else {
        s.propio = {};
        for (const x of COLORES) for (const t of TALLAS) s.propio[`${x.c}:${t}`] = tela.una !== undefined ? tela.una : tela[t];
        s.soloEsta = true;
      }
      s.avios = avios.map((a) => ({ ...a })); s.quitados.clear(); render();
    },
  };

  function filaTela(x) {
    const cons = {}; let mal = false, vacio = true, copia = false;
    for (const t of TALLAS) {
      const e = efectivo(x.c, t);
      const n = leer(e.v);
      if (e.v !== '' && n === null) mal = true;
      if (n !== null) { cons[t] = n; vacio = false; if (e.copia) copia = true; }
    }
    const ins = TELA_INS[x.c];
    const faltaAlguna = TALLAS.some((t) => cons[t] === undefined);
    const plan = !vacio && !mal && !faltaAlguna ? planTela(x.c, cons) : null;
    const pedir = plan !== null ? aPedir(plan, 'metro') : null;
    const celdas = TALLAS.map((t) => {
      const e = efectivo(x.c, t);
      const ro = !editable();
      const clase = ['caja mono', e.copia && e.v !== '' ? 'copiado' : '', ro ? 'lectura' : '', e.v !== '' && leer(e.v) === null ? 'mal' : ''].join(' ');
      return `<div class="campo"><label for="c-${x.c}-${t}">Talla ${t}</label><div class="${clase}">
        <input id="c-${x.c}-${t}" data-k="${x.c}:${t}" inputmode="decimal" placeholder="0.000" value="${esc(e.v)}" ${ro ? 'readonly tabindex="-1"' : ''} aria-label="Metros por prenda talla ${t}, ${x.n}"><span class="suf">m</span></div></div>`;
    }).join('');
    let res;
    if (plan === null) res = `<span class="sutil">${vacio ? 'Escribe cuánto lleva cada prenda' : mal ? 'Revisa el número' : 'Falta una talla'}</span>`;
    else {
      const alcanza = pedir <= ins.saldo;
      res = `<b class="num">${copia ? '≈ ' : ''}${f1(pedir)} m</b>
        <span class="sutil">${copia ? 'Pedir, aproximado' : 'Pedir'} · hay ${f1(ins.saldo)} m</span>
        ${alcanza ? '<span class="chip verde">Alcanza</span>' : `<span class="chip ambar">Faltan ${f1(aMilesimas(pedir - ins.saldo))} m</span>`}${copia ? '<span class="chip ambar hueco sin" title="Un número para varias tallas: se afina al escribir cada talla">Aproximado</span>' : ''}`;
    }
    return `<div class="bt-fila" data-fila="${x.c}">
      <div class="bt-color"><span class="punto g" style="--hex:${x.hex}"></span><div><b>${x.n}</b><small class="num">${prendasColor(x.c)} prendas · ${ORDEN_EJ[x.c].S} S · ${ORDEN_EJ[x.c].M} M</small></div></div>
      <div class="campo"><label>Tela</label><div class="caja sel lectura"><span>${TELA_INS[x.c].nombre}</span>${ic('abajo', 's')}</div></div>
      <div class="bt-cons">${celdas}</div>
      <div class="bt-res">${res}</div></div>`;
  }

  function filaAvio(a) {
    const r = resolverAvio(a);
    const ro = !editable();
    const falta = r.faltantes.length > 0 && a.para === 'color';
    const paraTxt = { todas: 'Toda la orden', color: 'Cada color · el insumo de su color', talla: 'Cada talla' }[a.para];
    const sub = a.para === 'todas' ? '' : `<div class="bt-sub">${r.lineas.map((l) => `<span class="${l.falta ? 'falta' : ''}">${l.hex ? `<span class="punto" style="--hex:${l.hex}"></span>` : ''}${l.etq}: ${l.falta ? 'sin insumo de ese color' : `pedir ${fq(l.pedir, a.unidad)}`}</span>`).join('')}</div>`;
    return `<div class="bt-avio" data-avio="${a.id}">
      <div class="nom"><b>${esc(a.nombre)}</b><small>${paraTxt}</small></div>
      <div class="campo cant"><div class="caja mono ${ro ? 'lectura' : ''} ${a.cant !== '' && leer(a.cant) === null ? 'mal' : ''}"><input data-av="${a.id}" inputmode="decimal" value="${esc(a.cant)}" ${ro ? 'readonly tabindex="-1"' : ''} aria-label="${esc(a.nombre)}: cantidad por prenda"><span class="suf">${UNIDADES[a.unidad].corta} / prenda</span></div></div>
      <div class="sutil info">${falta ? `<span class="chip ambar">${ic('alerta', 's')}Falta en Insumos: hilo ${r.faltantes.map((f) => f.etq.toLowerCase()).join(', ')}</span>` : r.lineas.length > 1 ? `${r.lineas.length} destinos` : ''}</div>
      <div class="res">${leer(a.cant) === null ? '<span class="sutil">—</span>' : `<b class="num">${fq(r.pedir, a.unidad)}</b><div class="sutil">por pedir</div>`}${editable() ? ` <button class="btn chico sut" type="button" data-quita="${a.id}" aria-label="Quitar ${esc(a.nombre)} de esta orden" style="margin-left:8px">${ic('x', 's')}</button>` : ''}</div>
      ${sub}</div>`;
  }

  function render() {
    const foco = document.activeElement && host.contains(document.activeElement) ? { k: document.activeElement.dataset.k, av: document.activeElement.dataset.av, p: document.activeElement.selectionStart } : null;
    const avios = s.avios.filter((a) => !s.quitados.has(a.id));
    const totalMetros = COLORES.reduce((sum, x) => {
      const cons = {}; TALLAS.forEach((t) => { const n = leer(efectivo(x.c, t).v); if (n !== null) cons[t] = n; });
      return sum + (TALLAS.every((t) => cons[t] !== undefined) ? aPedir(planTela(x.c, cons), 'metro') : 0);
    }, 0);
    host.innerHTML = `<section class="bt" aria-label="Tela y avíos de la orden">
      <div class="bt-cab"><span class="etq">Tela y avíos</span><div class="fila-flex">${cfg.cabecera(api)}</div></div>
      ${cfg.aviso ? cfg.aviso(api) : ''}
      <div class="bt-lista">${COLORES.map(filaTela).join('')}
        <div class="bt-fila" style="background:color-mix(in srgb,var(--color-hueso) 45%,transparent);align-items:center"><div class="eyebrow">Tela en total</div><div></div><div></div><div class="bt-res"><b class="num">${totalMetros ? f1(totalMetros) + ' m' : '—'}</b><span class="sutil">para ${TOTAL} prendas</span></div></div></div>
      <span class="etq" style="margin-top:6px">Avíos</span>
      <div class="bt-lista">${avios.length ? avios.map(filaAvio).join('') : '<div class="bt-avio" style="grid-template-columns:1fr"><span class="sutil">Esta orden no lleva avíos. Agrégalos desde la ficha del modelo o escríbelos aquí.</span></div>'}</div>
    </section>`;
    $$('input[data-k]', host).forEach((i) => i.addEventListener('input', () => { s.propio[i.dataset.k] = i.value.trim(); render(); cfg.alCambiar && cfg.alCambiar(api); }));
    $$('input[data-av]', host).forEach((i) => i.addEventListener('input', () => { s.avios.find((a) => a.id === i.dataset.av).cant = i.value.trim(); render(); cfg.alCambiar && cfg.alCambiar(api); }));
    $$('[data-quita]', host).forEach((b) => b.addEventListener('click', () => { s.quitados.add(b.dataset.quita); render(); cfg.alCambiar && cfg.alCambiar(api); }));
    cfg.alMontar && cfg.alMontar(host, api);
    if (foco) {
      const n = foco.k ? $(`[data-k="${foco.k}"]`, host) : $(`[data-av="${foco.av}"]`, host);
      if (n && !n.readOnly) { n.focus(); try { n.setSelectionRange(foco.p, foco.p); } catch (_) { /* input sin selección */ } }
    }
  }
  render();
  return api;
}

/* ---------- repintar sin perder el cursor: los campos que lo piden llevan data-f ---------- */
function repintar(host, html, enlazar) {
  const a = document.activeElement;
  const foco = a && host.contains(a) && a.dataset.f ? { f: a.dataset.f, p: a.selectionStart } : null;
  host.innerHTML = html;
  enlazar();
  if (foco) {
    const n = $(`[data-f="${foco.f}"]`, host);
    if (n && !n.readOnly) { n.focus(); try { n.setSelectionRange(foco.p, foco.p); } catch (_) { /* sin selección */ } }
  }
}
/** Lo medido: metros gastados ÷ prendas buenas de las órdenes cerradas, y la forma S/M de Audaces se conserva (se escala el nivel, no la forma). */
function medidoDeCerradas(declarado, n = CERRADAS.length) {
  const usadas = CERRADAS.slice(0, n);
  const buenas = usadas.reduce((s, o) => s + o.buenas, 0);
  const metros = usadas.reduce((s, o) => s + o.metros, 0);
  const porPrenda = metros / buenas;
  const mezcla = { S: prendasTalla('S') / TOTAL, M: prendasTalla('M') / TOTAL };
  const promDecl = TALLAS.reduce((s, t) => s + Number(declarado[t]) * mezcla[t], 0);
  const k = porPrenda / promDecl;
  return { buenas, metros, porPrenda, promDecl, k, S: f3(Number(declarado.S) * k), M: f3(Number(declarado.M) * k) };
}
function toast(texto) {
  const t = el(`<div class="aviso exito" role="status" style="position:fixed;right:20px;top:64px;z-index:90;background:var(--color-papel);border:1px solid var(--color-sand);box-shadow:0 8px 24px -8px color-mix(in srgb,var(--color-sombra) 35%,transparent);max-width:340px">${ic('check')}<span>${texto}</span></div>`);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

/** Las cantidades de la orden de ejemplo, como las muestra la hoja de Nueva orden (color × talla), de solo lectura. */
function tablaCantidades() {
  return `<table class="tabla num" aria-label="Cantidades de la orden"><thead><tr><th>Color</th>${TALLAS.map((t) => `<th class="r">${t}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>
    ${COLORES.map((x) => `<tr><td><span class="punto" style="--hex:${x.hex}"></span> ${x.n}</td>${TALLAS.map((t) => `<td class="r">${ORDEN_EJ[x.c][t]}</td>`).join('')}<td class="r"><b>${prendasColor(x.c)}</b></td></tr>`).join('')}
    <tr><td><b>Total</b></td>${TALLAS.map((t) => `<td class="r"><b>${prendasTalla(t)}</b></td>`).join('')}<td class="r"><b>${TOTAL}</b></td></tr></tbody></table>`;
}
