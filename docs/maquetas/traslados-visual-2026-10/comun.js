/* ====================================================================
   TRASLADOS · VISUAL · datos inventados + piezas comunes (2026-10-06)
   Una mañana de martes (6 de octubre, 10:40) entre las cuatro sedes. Mismas prendas que la maqueta de
   Movimientos (docs/maquetas/movimientos-rediseno-2026-10/): allá el Traslado 31 salía de TRU y el 29
   llegaba de LIM; aquí son los mismos. Nada viene de la base.
   Las palabras salen de lib/traslados-reglas.ts: se lee lo que le TOCA a quien mira, no el estado interno.
   Regla que se respeta en todo: quien recibe cuenta A CIEGAS (ADR-0239 D-130) — mientras la caja viene
   hacia tu sede no ves cuántas prendas trae, solo cuáles.
   Script clásico (sin módulos) para que abra también con doble clic.
   ==================================================================== */
(function(){
"use strict";
const M = window.M = {};
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
M.$ = $; M.$$ = $$;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
M.el = el;
/* `?sinmov` hace lo mismo que «reducir movimiento» del sistema: sirve para revisar la maqueta quieta */
if (new URLSearchParams(location.search).has('sinmov')) document.documentElement.classList.add('sin-mov');
const reducir = () => document.documentElement.classList.contains('sin-mov') || matchMedia('(prefers-reduced-motion: reduce)').matches;
M.reducir = reducir;

/* ── Íconos de SITUACIÓN: cada uno con piezas con nombre para animarse ─────── */
const CAM = '<g class="cam"><path d="M2.8 6.6h10.7v9.7H2.8z"/><path d="M13.5 9.8h4l3.2 3.4v3.1h-7.2"/><circle cx="7" cy="17.7" r="1.8"/><circle cx="17" cy="17.7" r="1.8"/></g>';
const CAJA = '<path d="M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2V8.2Z"/>';
const GL = {
  llega:    CAM + '<path class="ray" d="M1.2 9.5H.2M1.6 12.4H0"/>',
  sale:     CAM + '<path class="ray" d="M1.4 9.5h-3M1.8 12.4h-3.4"/>',
  camino:   CAM,
  contando: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9.2 4.5V3.5h5.6v1"/><path class="l1" d="M8.5 10h7"/><path class="l2" d="M8.5 13.5h7"/><path class="l3" d="M8.5 17h4"/>',
  revisar:  '<g class="lente"><circle cx="10.5" cy="10.5" r="6.2"/><path d="M8 10.5h5"/></g><path class="mango" d="m15.2 15.2 4.8 4.8"/>',
  cerrado:  '<g class="paq">' + CAJA + '</g><path class="vis" d="M8.6 12.4l2.4 2.4 4.4-4.8"/>',
  dif:      '<g class="paq">' + CAJA + '</g><path class="men" d="M9.2 12.6h5.6"/>',
  anulado:  '<path class="giro" d="M9.5 4.5 4.5 9l5 4.5"/><path class="giro" d="M4.5 9H14a5.5 5.5 0 0 1 0 11h-3"/>',
  pedido:   '<path d="M12 2.2v1.3"/><g class="eti"><path d="M12 3.5 7.5 8v11.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8L12 3.5Z"/><circle cx="12" cy="8.6" r="1.1"/><path d="M10 13.6h4M10 16.4h3"/></g>',
  ciega:    '<g class="paq">' + CAJA + '<path d="M4 8.2 12 12.5l8-4.3M12 12.5V21"/></g><path class="cinta" d="M8 6.1l8 4.2"/>',
  escanear: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path class="rayo" d="M5 12h14"/>',
  piso:     '<path d="M3.5 3.6h17"/><g class="perch"><path d="M12 3.6v2.6a2.3 2.3 0 1 1-2.3 2.3"/><path d="M12 10.6 3.9 16.3a1.2 1.2 0 0 0 .7 2.2h14.8a1.2 1.2 0 0 0 .7-2.2L12 10.6Z"/></g>',
  etiqueta: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  existencias:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
};
M.glifo = id => `<svg class="gl g-${id}" viewBox="0 0 24 24" aria-hidden="true">${GL[id]}</svg>`;
M.GL = GL;

/* Íconos chicos de interfaz */
const IC = {
  buscar: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  abajo:  '<path d="m6 9 6 6 6-6"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu:   '<path d="M4 7h16M4 12h16M4 17h16"/>',
  reloj:  '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  repetir:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  mas:    '<path d="M12 5v14M5 12h14"/>',
  menos:  '<path d="M5 12h14"/>',
  check:  '<path d="m5 12.5 4.2 4.2L19 7"/>',
  sol:    '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  luna:   '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  msj:    '<path d="M4 18.5V6.5A2 2 0 0 1 6 4.5h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8L4 18.5Z"/>',
  imprimir:'<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  pedir:  '<path d="M4 12h11M11 6l6 6-6 6"/><path d="M20 5v14"/>',
};
M.ic = (id, extra='') => `<svg class="ic ${extra}" viewBox="0 0 24 24" aria-hidden="true">${IC[id]}</svg>`;

/* Prendas dibujadas (silueta sobre el color de la prenda: «La prenda sin foto», ADR-0333) */
const SIL = {
  top:     '<path d="M8 4 3.5 7.5 6 11l2-1.2V20h8V9.8l2 1.2 2.5-3.5L16 4c-.6 1.3-2 2-4 2S8.6 5.3 8 4Z"/>',
  vestido: '<path d="M9.4 3h5.2l.4 5.4L18.4 20H5.6L9 8.4 9.4 3Z"/>',
  pantalon:'<path d="M7 3h10l1 18h-4.2L12 9.5 10.2 21H6L7 3Z"/>',
  casaca:  '<path d="M9 3 3 6.5 4.5 20h5V9.2l2.5 2.2 2.5-2.2V20h5L21 6.5 15 3c-.6 1.6-1.7 2.4-3 2.4S9.6 4.6 9 3Z"/>',
  falda:   '<path d="M8 4h8l4 16H4L8 4Z"/>',
};
/* Los únicos hex sueltos son los COLORES DE PRENDA: en el ERP vienen de la base y son dato (ADR-0336 regla 3). */
const PRENDAS = M.PRENDAS = {
  blusa:   { n:'Blusa Aurora',    cat:'top',     cols:{ terracota:['Terracota','#b9694a'], crudo:['Crudo','#e6dcc8'], oliva:['Verde oliva','#7b8660'] } },
  vestido: { n:'Vestido Lúcuma',  cat:'vestido', cols:{ mostaza:['Mostaza','#c79a3e'], negro:['Negro','#2c2926'] } },
  pantalon:{ n:'Pantalón Chala',  cat:'pantalon',cols:{ arena:['Arena','#cdb592'], noche:['Azul noche','#2f3a4f'] } },
  casaca:  { n:'Casaca Pampa',    cat:'casaca',  cols:{ cacao:['Cacao','#6b4a3a'], piedra:['Gris piedra','#8f8c85'] } },
  polera:  { n:'Polera Misti',    cat:'top',     cols:{ rosa:['Rosa palo','#d9a8a0'], crema:['Crema','#efe6d6'] } },
  falda:   { n:'Falda Sauce',     cat:'falda',   cols:{ salvia:['Verde salvia','#9bab8d'], marfil:['Marfil','#efe8d8'] } },
};
function luz(hex){ const n = parseInt(hex.slice(1),16); const r=n>>16, g=(n>>8)&255, b=n&255; return (0.299*r+0.587*g+0.114*b)/255; }
M.mos = (l, m=38) => {
  const p = PRENDAS[l.p], [nom, hex] = p.cols[l.c];
  const fg = luz(hex) > .6 ? 'var(--tinta-fija)' : 'var(--crema-fija)';
  return `<span class="mos" data-color-dato style="--m:${m}px;background:${hex};color:${fg}" title="${p.n} · ${nom}"><svg viewBox="0 0 24 24">${SIL[p.cat]}</svg></span>`;
};
M.pila = (lineas, m=38, max=3) => {
  const vistos = []; lineas.forEach(l => { if (!vistos.some(v => v.p === l.p && v.c === l.c)) vistos.push(l); });
  const mostrar = vistos.slice(0, max), resto = vistos.length - mostrar.length;
  return `<span class="pila" style="--m:${m}px">${mostrar.map(l => M.mos(l, m)).join('')}${resto > 0 ? `<span class="mas">+${resto}</span>` : ''}</span>`;
};
M.nombrePrenda = l => `${PRENDAS[l.p].n}`;
M.detallePrenda = l => `${PRENDAS[l.p].cols[l.c][0]} · talla ${l.t}`;
/* «Blusa Aurora y Falda Sauce» / «Blusa Aurora y 2 más» */
M.queVa = t => {
  const ns = [...new Set(t.lineas.map(l => PRENDAS[l.p].n))];
  return ns.length === 1 ? ns[0] : ns.length === 2 ? `${ns[0]} y ${ns[1]}` : `${ns[0]} y ${ns.length - 1} más`;
};

/* ── Sedes ────────────────────────────────────────────────────────────────── */
const PT = {
  tienda:  '<path d="M4 20V9l8-5 8 5v11"/><path d="M9.5 20v-6h5v6"/>',
  taller:  '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.3 15.7 17 4M15.7 15.7 7 4"/>',
  piso:    '<path d="M4 4h16"/><path d="M12 4v2a1.8 1.8 0 1 1-1.8 1.8"/><path d="M12 9.6 5.6 14a1 1 0 0 0 .6 1.8h11.6a1 1 0 0 0 .6-1.8L12 9.6Z"/>',
  almacen: '<path d="M4.5 10v8.5h15V10"/><path d="M3.5 6.5h17V10h-17z"/><path d="M10 13.5h4"/>',
};
M.PT = PT;
const SEDES = M.SEDES = {
  tru:    { id:'tru',    cod:'TRU', n:'Tienda TRU', corto:'TRU',    ciudad:'Trujillo', tipo:'tienda', del:'de TRU' },
  lim:    { id:'lim',    cod:'LIM', n:'Tienda LIM', corto:'LIM',    ciudad:'Lima',     tipo:'tienda', del:'de LIM' },
  aqp:    { id:'aqp',    cod:'AQP', n:'Tienda AQP', corto:'AQP',    ciudad:'Arequipa', tipo:'tienda', del:'de AQP' },
  taller: { id:'taller', cod:'TAL', n:'Taller',     corto:'Taller', ciudad:'Lima',     tipo:'taller', del:'del Taller' },
};
M.ptSede = (id, mio) => `<span class="pt ${mio ? 'mio' : ''}" data-sede="${id}"><svg viewBox="0 0 24 24">${PT[SEDES[id].tipo]}</svg>${SEDES[id].corto}</span>`;
M.sede = new URLSearchParams(location.search).get('sede') || 'tru';
if (!SEDES[M.sede]) M.sede = 'tru';

/* ── Personas ─────────────────────────────────────────────────────────────── */
const PERSONAS = M.PERSONAS = { rosa:'Rosa M.', camila:'Camila T.', luis:'Luis P.', sandra:'Sandra V.', diego:'Diego R.', marco:'Marco A.', felipe:'Felipe A.' };
const RESPONSABLE = { tru:'rosa', lim:'sandra', aqp:'diego', taller:'marco' };
M.persona = id => PERSONAS[id] || '';

/* ── El tiempo: «ahora» es fijo para que la maqueta diga siempre lo mismo ─── */
const T = (d, h) => { const [hh, mm] = h.split(':').map(Number); return new Date(Date.UTC(2026, 9, 6 + d, hh + 5, mm)); };
M.T = T;
M.AHORA = T(0, '10:40');
const DIAS = ['dom','lun','mar','mié','jue','vie','sáb'];
const DIAS_LARGOS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const local = d => new Date(d.getTime() - 5 * 3600e3);
const diaN = d => Math.floor(local(d).getTime() / 864e5);
M.hora = d => { const x = local(d); return String(x.getUTCHours()).padStart(2,'0') + ':' + String(x.getUTCMinutes()).padStart(2,'0'); };
M.dia = d => {
  const k = diaN(d) - diaN(M.AHORA);
  if (k === 0) return 'hoy'; if (k === -1) return 'ayer'; if (k === 1) return 'mañana';
  const x = local(d); return `${DIAS[x.getUTCDay()]} ${x.getUTCDate()}`;
};
M.diaLargo = d => { const x = local(d); return `${DIAS_LARGOS[x.getUTCDay()]} ${x.getUTCDate()}`; };
M.cuando = d => `${M.dia(d)} ${M.hora(d)}`;
M.dur = min => {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) { const h = Math.floor(min / 60), m = Math.round((min % 60) / 5) * 5; return m ? `${h} h ${m}` : `${h} h`; }
  return `${Math.round(min / 1440)} días`;
};
const minEntre = (a, b) => (b - a) / 6e4;

/* ── Los traslados (12) ───────────────────────────────────────────────────── */
const L = (p, c, t, n, cont) => ({ p, c, t, n, cont: cont == null ? null : cont });
const ORIGINAL = () => [
  { num:27, de:'aqp', a:'tru', estado:'anulada', salio:T(-3,'10:00'), eta:T(-1,'12:00'), por:'diego', anulado:T(-3,'10:30'), motivo:'Se envió por error: la caja nunca salió.',
    lineas:[L('polera','crema','S',2),L('polera','crema','M',2)] },
  { num:28, de:'taller', a:'tru', estado:'cerrada', salio:T(-4,'09:00'), eta:T(-3,'12:00'), por:'marco', cerrado:T(-3,'11:40'), recibio:'camila', lugar:'almacen',
    lineas:[L('blusa','oliva','S',6,6),L('blusa','oliva','M',6,6),L('pantalon','noche','36',6,6),L('pantalon','noche','38',6,6)] },
  { num:29, de:'lim', a:'tru', estado:'cerrada', salio:T(-3,'17:00'), eta:T(-2,'16:00'), por:'sandra', cerrado:T(-2,'16:15'), recibio:'luis', lugar:'almacen',
    lineas:[L('vestido','negro','S',4,4),L('vestido','negro','M',4,4),L('falda','marfil','M',4,4)] },
  { num:30, de:'tru', a:'aqp', estado:'cerrada', salio:T(-3,'09:00'), eta:T(-1,'10:00'), por:'luis', confirmado:T(-1,'10:20'), recibio:'diego', cerrado:T(-1,'18:00'), cerro:'felipe', lugar:'piso',
    notaCierre:'Una Casaca Pampa M no vino en la caja; se buscó en TRU y no aparece.',
    lineas:[L('casaca','cacao','S',2,2),L('casaca','cacao','M',3,2),L('casaca','cacao','L',2,2)] },
  { num:31, de:'tru', a:'lim', estado:'en_transito', salio:T(-1,'12:15'), eta:T(0,'16:00'), por:'luis',
    lineas:[L('vestido','mostaza','M',6),L('falda','marfil','S',4)] },
  { num:32, de:'taller', a:'tru', estado:'en_transito', salio:T(-1,'16:00'), eta:T(0,'09:30'), por:'marco', nota:'Va por agencia Shalom, guía 0045-118.',
    lineas:[L('pantalon','arena','38',2),L('pantalon','arena','40',2),L('vestido','mostaza','S',2),L('vestido','mostaza','M',2)] },
  { num:33, de:'lim', a:'tru', estado:'en_transito', salio:T(-1,'11:20'), eta:T(0,'10:00'), por:'sandra', cuenta:'rosa', inicioConteo:T(0,'10:25'),
    lineas:[L('polera','rosa','M',3,3),L('polera','rosa','L',3,3),L('casaca','cacao','S',2)] },
  { num:34, de:'lim', a:'tru', estado:'recibido_con_diferencia', salio:T(-2,'15:00'), eta:T(-1,'12:00'), por:'sandra', recibio:'camila', confirmado:T(0,'09:12'), lugar:'piso',
    nota:'Rebalanceo: lo que en Lima no rota.',
    lineas:[L('pantalon','noche','38',3,3),L('falda','marfil','S',4,3),L('vestido','negro','L',2,2)] },
  { num:35, de:'taller', a:'tru', estado:'en_transito', salio:T(0,'08:10'), eta:T(1,'11:00'), por:'marco', nota:'Reposición de la semana.',
    lineas:[L('blusa','terracota','S',4),L('blusa','terracota','M',4),L('blusa','terracota','L',3),L('falda','salvia','S',3),L('falda','salvia','M',3)] },
  { num:36, de:'tru', a:'aqp', estado:'en_transito', salio:T(0,'09:40'), eta:T(2,'12:00'), por:'rosa',
    lineas:[L('casaca','piedra','M',2),L('casaca','piedra','L',2),L('blusa','oliva','S',2),L('blusa','oliva','M',2)] },
  { num:37, de:'lim', a:'aqp', estado:'en_transito', salio:T(-1,'18:00'), eta:T(1,'10:00'), por:'sandra',
    lineas:[L('blusa','crudo','S',3),L('blusa','crudo','M',3)] },
  { num:38, de:'taller', a:'lim', estado:'en_transito', salio:T(0,'07:30'), eta:T(0,'13:00'), por:'marco',
    lineas:[L('vestido','negro','S',3),L('vestido','negro','M',3),L('casaca','cacao','M',2)] },
];
/* Pedidos entre sedes (ADR-0233 / ADR-0242 D-7): «LIM te pide…» aparece en «Hoy te toca» de quien tiene que enviar. */
const PEDIDOS0 = () => [
  { id:'p1', pide:'lim', envia:'tru', linea:L('casaca','cacao','M',1), cliente:true, cuando:T(0,'08:55') },
  { id:'p2', pide:'aqp', envia:'lim', linea:L('vestido','mostaza','M',1), cliente:false, cuando:T(0,'09:20') },
];
const CLAVE = 'traslados-visual-2026-10';
function cargar(){
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (crudo) return JSON.parse(crudo, (k, v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v);
  } catch (e) {}
  return { tr: ORIGINAL(), pe: PEDIDOS0() };
}
let datos = cargar();
M.TR = datos.tr; M.PEDIDOS = datos.pe;
M.guardar = () => { try { sessionStorage.setItem(CLAVE, JSON.stringify({ tr: M.TR, pe: M.PEDIDOS })); } catch (e) {} };
M.reiniciar = () => { try { sessionStorage.removeItem(CLAVE); } catch (e) {} datos = { tr: ORIGINAL(), pe: PEDIDOS0() }; M.TR = datos.tr; M.PEDIDOS = datos.pe; };
M.porNumero = n => M.TR.find(t => t.num === n);

/* ── Lectura de un traslado desde MI sede ─────────────────────────────────── */
M.unidades = t => t.lineas.reduce((s, l) => s + l.n, 0);
M.contadas = t => t.lineas.filter(l => l.cont != null).length;
M.empezoConteo = t => t.estado === 'en_transito' && M.contadas(t) > 0;
M.faltan = t => t.lineas.reduce((s, l) => s + Math.max(0, l.n - (l.cont ?? 0)), 0);
M.sobran = t => t.lineas.reduce((s, l) => s + Math.max(0, (l.cont ?? 0) - l.n), 0);
M.difiere = t => t.lineas.some(l => (l.cont ?? 0) !== l.n);
M.meToca = (t, s = M.sede) => t.de === s || t.a === s;
M.ciego = (t, s = M.sede) => t.a === s && t.estado === 'en_transito';
M.atrasado = (t, at = M.AHORA) => t.estado === 'en_transito' && !M.empezoConteo(t) && at > t.eta;
/* llega · sale · camino (entre otras sedes) · contando · revisar · cerrado · dif · anulado */
M.situacion = (t, s = M.sede) => {
  if (t.estado === 'anulada') return 'anulado';
  if (t.estado === 'recibido_con_diferencia') return 'revisar';
  if (t.estado === 'cerrada') return M.difiere(t) ? 'dif' : 'cerrado';
  if (M.empezoConteo(t)) return 'contando';
  return t.a === s ? 'llega' : t.de === s ? 'sale' : 'camino';
};
/* ¿Dónde va la caja? 0 = acaba de salir, 1 = en la puerta. Lo que pasó del tiempo estimado. */
M.progreso = (t, at = M.AHORA) => {
  if (t.estado === 'anulada') return 0;
  if (t.estado !== 'en_transito' || M.empezoConteo(t)) return 1;
  const p = (at - t.salio) / (t.eta - t.salio);
  return Math.max(0.04, Math.min(1, p));
};
M.abierto = t => t.estado === 'en_transito' || t.estado === 'recibido_con_diferencia';

/* El nombre corto de lo que le toca a quien mira (una o dos palabras, nunca un párrafo) */
M.nombreSit = (t, s = M.sede) => {
  const sit = M.situacion(t, s), otra = SEDES[t.a === s ? t.de : t.a];
  return {
    llega: M.atrasado(t) ? 'Atrasado' : 'Viene hacia ti',
    sale: 'Enviado',
    camino: 'En camino',
    contando: t.a === s ? 'Contando' : `${SEDES[t.a].corto} lo está contando`,
    revisar: t.a === s ? 'Falta revisar' : `Con diferencia · espera a ${SEDES[t.a].corto}`,
    cerrado: 'Recibido completo',
    dif: 'Cerrado con diferencia',
    anulado: 'Anulado',
  }[sit];
};
/* La cifra grande de cada traslado: lo que más importa de él, en un número */
M.cifra = (t, s = M.sede) => {
  const sit = M.situacion(t, s), u = M.unidades(t);
  if (sit === 'llega' || sit === 'sale' || sit === 'camino') {
    if (M.atrasado(t)) return { big: M.dur(minEntre(t.eta, M.AHORA)), small: 'de atraso', atraso: true };
    return { big: M.hora(t.eta), small: 'llega ' + M.dia(t.eta) };
  }
  if (sit === 'contando') return { big: `${M.contadas(t)}/${t.lineas.length}`, small: 'contadas' };
  if (sit === 'revisar') { const f = M.faltan(t), so = M.sobran(t); return f ? { big: `−${f}`, small: f === 1 ? 'faltó' : 'faltaron' } : { big: `+${so}`, small: 'sobró' }; }
  if (sit === 'dif') return { big: `−${M.faltan(t)}`, small: 'cerrado con nota' };
  if (sit === 'anulado') return { big: '0', small: 'volvió todo' };
  return { big: (t.a === s ? '+' : '') + u, small: t.a === s ? 'entraron' : 'llegaron' };
};
/* Lo que se puede decir de las prendas sin romper el conteo a ciegas */
M.prendasTexto = (t, s = M.sede) => {
  const d = t.lineas.length;
  if (M.ciego(t, s)) return `${d} ${d === 1 ? 'tipo de prenda' : 'tipos de prenda'} · las cuentas al llegar`;
  const u = M.unidades(t); return `${u} ${u === 1 ? 'prenda' : 'prendas'}`;
};
M.GRUPOS = [
  { id:'llegan',    n:'Llegan',      s:'llega',    sits:['llega'],              vacio:'Nada viene hacia ti' },
  { id:'contando',  n:'Contando',    s:'contando', sits:['contando'],           vacio:'Nadie está contando' },
  { id:'revisar',   n:'Por revisar', s:'revisar',  sits:['revisar'],            vacio:'Ninguna diferencia' },
  { id:'salen',     n:'Enviados',    s:'sale',     sits:['sale'],               vacio:'Nada enviado en camino' },
  { id:'terminados',n:'Terminados',  s:'cerrado',  sits:['cerrado','dif','anulado'], vacio:'Todavía nada' },
];
M.grupoDe = sit => M.GRUPOS.find(g => g.sits.includes(sit));
M.mios = (s = M.sede) => M.TR.filter(t => M.meToca(t, s));
/* Orden: primero lo que te pide algo (atrasado → contando → por revisar → llega), después lo enviado, al final lo terminado */
M.ordenar = (ts, s = M.sede) => {
  const peso = t => { const sit = M.situacion(t, s);
    if (sit === 'llega') return M.atrasado(t) ? 0 : 3;
    return { contando:1, revisar:2, sale:4, camino:5, cerrado:6, dif:6, anulado:7 }[sit]; };
  return [...ts].sort((a, b) => peso(a) - peso(b) || (M.abierto(a) ? a.eta - b.eta : b.num - a.num));
};

/* ── «Hoy te toca» (ADR-0242 D-1): una tarjeta, una cosa, un verbo ───────── */
M.tareas = (s = M.sede) => {
  const out = [];
  M.TR.forEach(t => {
    if (t.a !== s) return;
    const sit = M.situacion(t, s);
    if (sit === 'llega') out.push({ t, tipo: M.atrasado(t) ? 'atraso' : 'llega', prio: M.atrasado(t) ? 0 : 4 });
    if (sit === 'contando') out.push({ t, tipo:'contando', prio:1 });
    if (sit === 'revisar') out.push({ t, tipo:'revisar', prio:2 });
  });
  M.PEDIDOS.filter(p => p.envia === s && !p.hecho).forEach(p => out.push({ p, tipo:'pedido', prio:3 }));
  return out.sort((a, b) => a.prio - b.prio || ((a.t && b.t) ? a.t.eta - b.t.eta : 0));
};
M.tareaHTML = (x, i = 0) => {
  if (x.tipo === 'pedido') {
    const p = x.p, pide = SEDES[p.pide];
    return `<button class="tarea s-pedido rev" style="--i:${i}" data-pedido="${p.id}" data-go-hover>
      <span class="tt"><span class="sello" data-go>${M.glifo('pedido')}</span>${M.mos(p.linea, 46)}</span>
      <h3>${pide.corto} te pide ${p.linea.n} prenda${p.cliente ? '<br><small style="font-family:DM Sans;font-size:12px;color:var(--t65)">para una cliente</small>' : ''}</h3>
      <span class="pie"><span class="verbo">Enviar ${M.ic('flecha')}</span></span>
      <span class="fondo">${M.glifo('pedido')}</span></button>`;
  }
  const t = x.t, de = SEDES[t.de];
  const cfg = {
    atraso:  { s:'s-atraso',  g:'llega',    h:`Caja ${de.del}`,                    big:M.dur(minEntre(t.eta, M.AHORA)), sm:'de atraso',           v:'Contar la caja' },
    llega:   { s:'s-llega',   g:'llega',    h:`Caja ${de.del}`,                    big:M.hora(t.eta),                    sm:'llega ' + M.dia(t.eta), v:'Contar al llegar' },
    contando:{ s:'s-contando',g:'contando', h:`Termina de contar la caja ${de.del}`, big:`${M.contadas(t)}/${t.lineas.length}`, sm:'contadas',   v:'Seguir contando' },
    revisar: { s:'s-revisar', g:'revisar',  h:`${M.faltan(t) === 1 ? 'Faltó 1 prenda' : 'Faltaron ' + M.faltan(t)} en la caja ${de.del}`, big:'−' + M.faltan(t), sm:'por revisar', v:'Revisar y cerrar' },
  }[x.tipo];
  return `<button class="tarea ${cfg.s} rev" style="--i:${i}" data-num="${t.num}" data-go-hover>
    <span class="tt"><span class="sello" data-go>${M.glifo(cfg.g)}</span><span class="cuando num">${cfg.big}<small>${cfg.sm}</small></span></span>
    <h3>${cfg.h}</h3>
    <span class="pie">${M.pila(t.lineas, 28, 3)}<span class="verbo">${cfg.v} ${M.ic('flecha')}</span></span>
    <span class="fondo">${M.glifo(cfg.g)}</span></button>`;
};
/* abre el cajón de la primera ronda; las zonas marcadas `data-propio` manejan sus propios clics (opciones D, E, F) */
M.conectarTareas = raiz => {
  M.$$('[data-num]', raiz).forEach(b => { if (!b.closest('[data-propio]')) b.onclick = () => M.cajon(M.porNumero(+b.dataset.num)); });
  M.$$('[data-pedido]', raiz).forEach(b => { if (!b.closest('[data-propio]')) b.onclick = () => M.cajonPedido(M.PEDIDOS.find(p => p.id === b.dataset.pedido)); });
};

/* ── El viaje (de qué sede a cuál, y dónde va la caja) ────────────────────── */
M.viaje = (t, s = M.sede, { at } = {}) => {
  const sit = M.situacion(t, s), p = M.progreso(t, at), tarde = M.atrasado(t, at);
  const fin = sit === 'cerrado' ? M.ic('check') : sit === 'dif' ? M.ic('menos') : sit === 'contando' ? M.glifo('contando') : sit === 'revisar' ? M.ic('menos') : null;
  const conCamion = sit === 'llega' || sit === 'sale' || sit === 'camino';
  return `<span class="viaje s-${sit} ${sit === 'cerrado' || sit === 'dif' ? 'cerrado' : ''}" data-go style="--p:${sit === 'anulado' ? 0 : p}">
    ${M.ptSede(t.de, t.de === s)}
    <span class="via"><i class="base"></i><i class="hecho"></i><i class="meta"></i>
      ${conCamion ? `<span class="cam ${tarde ? 'atraso' : ''}"><svg class="gl" viewBox="0 0 24 24">${CAM}</svg></span>` : ''}
      ${fin ? `<span class="fin">${fin}</span>` : ''}</span>
    ${M.ptSede(t.a, t.a === s)}</span>`;
};

/* ── Movimiento: contar hasta, revelar al entrar, repetir ─────────────────── */
M.contar = (e, hasta, ms = 900, pref = '') => {
  if (reducir() || !hasta) { e.textContent = pref + hasta; return; }
  const t0 = performance.now();
  const paso = t => { const k = Math.min(1, (t - t0) / ms), v = Math.round(hasta * (1 - Math.pow(1 - k, 3))); e.textContent = pref + v; if (k < 1) requestAnimationFrame(paso); };
  requestAnimationFrame(paso);
};
M.quieto = false;
let observador = null;
function crearObservador(){
  return new IntersectionObserver(entradas => {
    let k = 0;
    entradas.filter(e => e.isIntersecting).forEach(e => {
      const n = e.target; observador.unobserve(n);
      n.style.setProperty('--i', Math.min(k++, 9));
      n.classList.add('in');
      const anim = () => (n.matches('.sello,[data-go]') ? [n] : []).concat($$('.sello,[data-go]', n)).forEach(x => x.classList.add('go'));
      setTimeout(anim, 140 + k * 45);
      $$('[data-cuenta]', n).forEach(c => { if (!c.dataset.hecho) { c.dataset.hecho = 1; M.contar(c, +c.dataset.cuenta, 900, c.dataset.pref || ''); } });
    });
  }, { root: $('.cuerpo'), threshold: .12, rootMargin: '0px 0px -4% 0px' });
}
M.revelar = raiz => {
  if (M.quieto || reducir()) {
    $$('.sello,[data-go]', raiz || document).forEach(x => x.classList.add('go'));
    $$('.rev', raiz || document).forEach(n => n.classList.add('in'));
    $$('.viaje', raiz || document).forEach(v => v.classList.add('quieto'));
    $$('[data-cuenta]', raiz || document).forEach(c => c.textContent = (c.dataset.pref || '') + c.dataset.cuenta);
    return;
  }
  if (!observador || observador.root !== $('.cuerpo')) observador = crearObservador();
  $$('.rev', raiz || document).forEach(n => { if (!n.classList.contains('in')) observador.observe(n); });
};
M.repetir = e => { e.classList.remove('go', 'quieto'); void e.offsetWidth; e.classList.add('go'); };
document.addEventListener('pointerover', ev => {
  const x = ev.target.closest && ev.target.closest('[data-go-hover]');
  if (!x || x.dataset.espera) return;
  x.dataset.espera = 1; setTimeout(() => delete x.dataset.espera, 1200);
  (x.matches('.sello,[data-go]') ? [x] : $$('.sello,[data-go]', x)).forEach(M.repetir);
});

/* ── Aviso (sale después de la acción, esquina superior derecha) ─────────── */
let avisoT = null;
M.avisar = (txt, glifo = 'cerrado') => {
  $('.aviso')?.remove(); clearTimeout(avisoT);
  const a = el('div', 'aviso', `${M.ic(glifo === 'info' ? 'reloj' : 'check')}<span>${txt}</span>`);
  $('.vista').appendChild(a);
  requestAnimationFrame(() => requestAnimationFrame(() => a.classList.add('in')));
  avisoT = setTimeout(() => { a.classList.remove('in'); setTimeout(() => a.remove(), 300); }, 3600);
};
M.noEnMaqueta = que => M.avisar(`En la maqueta esto no se abre: ${que}.`, 'info');

/* ── Cabecera de página (EncabezadoPagina) ────────────────────────────────── */
M.encabezado = ({ frase, derecha } = {}) => `
  <header class="enc">
    <div>
      <div class="hilo">${SEDES[M.sede].n} · Martes 6 de octubre · ${M.hora(M.AHORA)}</div>
      <h1>Traslados</h1>
      <p class="frase">${frase || 'Lo que llega a tu sede y lo que sale de ella.'}</p>
    </div>
    ${derecha || `<div class="acciones"><button class="btn" data-no="Pedir a otra sede">${M.ic('pedir')}Pedir a otra sede</button><button class="btn pri" data-no="Nuevo traslado (ADR-0242 D-2)">${M.ic('mas')}Nuevo traslado</button></div>`}
  </header>`;

/* ====================================================================
   EL CAJÓN DEL TRASLADO — lo comparten las tres opciones.
   Quien RECIBE cuenta a ciegas (−/+ o escaneando); «Terminé de contar» recién muestra lo enviado;
   lo que coincide entra al instante y lo que no espera a un líder (ADR-0239 D-129). Al confirmar,
   las prendas vuelan a su lugar y aparece «Lo siguiente» (ADR-0242 D-6).
   ==================================================================== */
let cierraCajon = null;
M.alCambiar = null;          // cada opción se registra: qué repintar cuando el cajón cambió algo
let cambio = null;

function pasos(t, s) {
  const de = SEDES[t.de], a = SEDES[t.a], sit = M.situacion(t, s);
  const P = [];
  P.push({ b:`Salió ${de.del}`, sp:`${M.cuando(t.salio)} · ${M.persona(t.por)}`, hecho:true });
  if (sit === 'anulado') { P.push({ b:'Se anuló', sp:`${M.cuando(t.anulado)} · ${t.motivo}`, hecho:true }); return P; }
  const enCamino = sit === 'llega' || sit === 'sale' || sit === 'camino';
  P.push({ b: enCamino ? (M.atrasado(t) ? `Atrasado · llegaba ${M.cuando(t.eta)}` : `En camino · llega ${M.cuando(t.eta)}`) : 'Llegó', sp: enCamino ? (M.atrasado(t) ? `Hace ${M.dur(minEntre(t.eta, M.AHORA))} que debía estar` : `Faltan ${M.dur(minEntre(M.AHORA, t.eta))}`) : `Esperada ${M.cuando(t.eta)}`, hecho:!enCamino, ahora:enCamino });
  const contado = t.estado !== 'en_transito';
  P.push({ b: contado ? `Contada en ${a.corto}` : sit === 'contando' ? `Contando en ${a.corto}` : `Se cuenta en ${a.corto}`, sp: contado ? `${M.persona(t.recibio)}${t.confirmado ? ' · ' + M.cuando(t.confirmado) : ''}` : sit === 'contando' ? `${M.contadas(t)} de ${t.lineas.length} prendas · ${M.persona(t.cuenta)}` : 'a ciegas: sin saber cuántas vienen', hecho:contado, ahora: sit === 'contando' });
  if (sit === 'revisar') P.push({ b:'Un líder revisa la diferencia', sp:'Lo que coincidió ya está en el stock', ahora:true });
  else if (sit === 'dif') P.push({ b:'Cerrado con nota', sp:`${M.persona(t.cerro)} · ${M.cuando(t.cerrado)}`, hecho:true });
  else P.push({ b: sit === 'cerrado' ? `Entró al ${t.lugar === 'piso' ? 'piso de venta' : 'almacén'}` : 'Entra al stock', sp: sit === 'cerrado' ? M.cuando(t.cerrado) : 'al confirmar', hecho: sit === 'cerrado' });
  return P;
}
const pasosHTML = (t, s) => pasos(t, s).map((p, i) => `<div class="paso ${p.hecho ? 'hecho' : ''} ${p.ahora ? 'ahora' : ''}" style="--i:${i}"><span class="pn">${p.hecho ? M.ic('check') : i + 1}</span><div><b>${p.b}</b><span>${p.sp}</span></div></div>`).join('');

function lineaHTML(t, l, k, modo) {
  const nom = `<div class="n"><b>${M.nombrePrenda(l)}</b><span>${M.detallePrenda(l)}</span></div>`;
  if (modo === 'contar') {
    return `<div class="lin ${(l.cont ?? 0) !== l.n ? 'difiere' : ''}" style="--k:${k}" data-k="${k}">${M.mos(l, 40)}${nom}
      <div class="cmp"><span class="env">enviadas<b class="num">${l.n}</b></span>
        <span class="marca ${(l.cont ?? 0) === l.n ? 'ok' : 'no'}">${M.ic((l.cont ?? 0) === l.n ? 'check' : 'menos')}</span>
        <span class="paso-num"><button data-menos aria-label="Una menos">${M.ic('menos')}</button><output class="num ${l.cont == null ? 'sin-contar' : ''}">${l.cont ?? '—'}</output><button data-mas aria-label="Una más">${M.ic('mas')}</button></span></div></div>`;
  }
  if (modo === 'comparar') {
    const ok = (l.cont ?? 0) === l.n;
    return `<div class="lin ${ok ? '' : 'difiere'}" style="--k:${k}">${M.mos(l, 40)}${nom}
      <div class="cmp"><span class="env">enviadas<b class="num">${l.n}</b></span><span class="marca ${ok ? 'ok' : 'no'}">${M.ic(ok ? 'check' : 'menos')}</span><span class="q num">${l.cont ?? 0}<small>llegaron</small></span></div></div>`;
  }
  return `<div class="lin" style="--k:${k}">${M.mos(l, 40)}${nom}<span class="q num">${l.n}</span></div>`;
}

M.cajon = (t, { abrirEn } = {}) => {
  if (!t) return;
  if (cierraCajon) cierraCajon(true);
  const s = M.sede, host = $('.vista');
  const velo = el('div', 'velo');
  host.appendChild(velo);

  /* modo del cuerpo según lo que le toca a quien mira */
  const modoDe = () => {
    const sit = M.situacion(t, s);
    if (t.a === s && t.estado === 'en_transito') return 'contar';
    if (sit === 'revisar' || sit === 'dif' || sit === 'cerrado') return 'comparar';
    return 'ver';
  };
  let revelado = false, lugar = 'almacen', confirmandoAnular = false;

  function pintar(primera) {
    const sit = M.situacion(t, s), modo = modoDe();
    velo.className = `velo s-${sit === 'llega' && M.atrasado(t) ? 'atraso' : sit} ${primera ? '' : 'in ya'}`;
    const de = SEDES[t.de];
    const cab = `
      <div class="cab">
        <button class="x" aria-label="Cerrar">${M.ic('cerrar')}</button>
        <div class="fila1 casc" style="--i:0"><span class="sello" data-go>${M.glifo(sit === 'camino' ? 'sale' : sit)}</span>
          <div><div class="que">${M.nombreSit(t, s)}</div><h2>Traslado ${t.num}</h2></div></div>
        <div class="casc" style="--i:1">${M.viaje(t, s)}</div>
        <p class="casc" style="--i:2">${M.queVa(t)} · ${M.ciego(t, s) && !revelado ? `${t.lineas.length} prendas distintas` : M.unidades(t) + ' prendas'}</p>
      </div>`;
    let cuerpo = '', pie = '';
    if (modo === 'contar') {
      const hechas = M.contadas(t), total = t.lineas.length, listas = hechas === total;
      cuerpo = `
        ${!revelado ? `<section class="casc" style="--i:3"><div class="aviso-ciego s-contando"><span class="sello" data-go>${M.glifo('ciega')}</span><span><b>Cuenta lo que ves en la caja.</b><br>Lo enviado aparece cuando termines: así nadie cuenta «de memoria».</span></div></section>` : ''}
        <section class="casc" style="--i:4"><h4>Prendas <span class="num">${revelado ? (M.difiere(t) ? 'Revisa lo marcado' : 'Todo coincide') : `${hechas} de ${total} contadas`}</span></h4>
          ${!revelado ? `<div class="barra-conteo s-contando" style="margin-bottom:8px"><i style="--w:${Math.round(hechas / total * 100)}%"></i></div>` : ''}
          <div class="lista-lin" data-revelar="${revelado ? 1 : ''}">${t.lineas.map((l, k) => lineaHTML(t, l, k, revelado ? 'comparar' : 'contar')).join('')}</div></section>
        ${revelado ? `<section class="casc" style="--i:5"><h4>¿Dónde la dejas?</h4><div class="destino-sel">
            <button data-lugar="almacen" aria-pressed="${lugar === 'almacen'}"><svg viewBox="0 0 24 24">${PT.almacen}</svg>Almacén</button>
            <button data-lugar="piso" aria-pressed="${lugar === 'piso'}"><svg viewBox="0 0 24 24">${PT.piso}</svg>Piso de venta</button></div></section>` : ''}
        <section class="casc" style="--i:6"><h4>Qué pasó</h4><div class="hist">${pasosHTML(t, s)}</div></section>
        ${t.nota ? `<section class="casc" style="--i:7"><h4>Nota de quien envió</h4><div class="nota-op">“${t.nota}”<cite>${M.persona(t.por)}</cite></div></section>` : ''}`;
      pie = !revelado
        ? `<div class="fila"><button class="btn s-contando" data-escanear>${M.glifo('escanear').replace('class="gl', 'class="gl ic')}Escanear</button>
             <button class="btn pri grande" data-termine ${listas ? '' : 'disabled'}>${listas ? 'Terminé de contar' : `${total - hechas === 1 ? 'Falta 1' : `Faltan ${total - hechas}`} por contar`}</button></div>`
        : `<div class="fila"><button class="btn" data-recontar>Volver a contar</button>
             <button class="btn pri grande" data-confirmar>${M.difiere(t) ? 'Confirmar lo que llegó' : 'Confirmar recepción'}</button></div>`;
    } else if (modo === 'comparar') {
      cuerpo = `
        ${sit === 'revisar' ? `<section class="casc" style="--i:3"><div class="aviso-ciego s-revisar"><span class="sello" data-go>${M.glifo('revisar')}</span><span><b>${M.faltan(t) ? `Faltó ${M.faltan(t)} ${M.faltan(t) === 1 ? 'prenda' : 'prendas'}.` : `Sobró ${M.sobran(t)}.`}</b> Lo demás ya entró al ${t.lugar === 'piso' ? 'piso' : 'almacén'} ${SEDES[t.a].del}.</span></div></section>` : ''}
        <section class="casc" style="--i:4"><h4>Prendas <span>enviadas → llegaron</span></h4><div class="lista-lin revelado">${t.lineas.map((l, k) => lineaHTML(t, l, k, 'comparar')).join('')}</div></section>
        ${sit === 'dif' ? `<section class="casc" style="--i:5"><h4>Nota del cierre</h4><div class="nota-op">“${t.notaCierre}”<cite>${M.persona(t.cerro)}</cite></div></section>` : ''}
        ${sit === 'revisar' && t.a === s ? `<section class="casc" style="--i:5"><h4>¿Qué pasó con lo que falta?</h4><textarea class="campo-nota" data-nota placeholder="Ej. La falda no vino en la caja; Lima la va a buscar"></textarea></section>` : ''}
        <section class="casc" style="--i:6"><h4>Qué pasó</h4><div class="hist">${pasosHTML(t, s)}</div></section>`;
      if (sit === 'revisar' && t.a === s) pie = `<div class="fila"><button class="btn pri grande s-revisar" data-cerrar disabled>Cerrar con diferencia</button></div>`;
      if (sit === 'cerrado' && t.a === s) pie = siguiente(t);
    } else {
      const puedeAnular = t.de === s && t.estado === 'en_transito' && !M.empezoConteo(t);
      cuerpo = `
        <section class="casc" style="--i:3"><h4>Prendas <span class="num">${M.unidades(t)} en total</span></h4><div class="lista-lin">${t.lineas.map((l, k) => lineaHTML(t, l, k, 'ver')).join('')}</div></section>
        ${t.nota ? `<section class="casc" style="--i:4"><h4>Nota</h4><div class="nota-op">“${t.nota}”<cite>${M.persona(t.por)}</cite></div></section>` : ''}
        ${sit === 'anulado' ? '' : ''}
        <section class="casc" style="--i:5"><h4>Qué pasó</h4><div class="hist">${pasosHTML(t, s)}</div></section>
        ${confirmandoAnular ? `<section class="casc" style="--i:6"><h4>¿Por qué lo anulas?</h4><textarea class="campo-nota" data-motivo placeholder="Ej. La caja no salió: se armó con la talla equivocada"></textarea></section>` : ''}`;
      if (sit === 'sale') pie = confirmandoAnular
        ? `<div class="fila"><button class="btn" data-no-anular>No anular</button><button class="btn pri grande" data-anular-si disabled>Anular · todo vuelve a tu almacén</button></div>`
        : `<div class="fila"><button class="btn" data-no="la guía con QR (ADR-0242 D-3)">${M.ic('imprimir')}Guía</button><button class="btn" data-no="el mensaje para la otra sede (ADR-0242 D-3)">${M.ic('msj')}WhatsApp</button>${puedeAnular ? '<button class="btn" data-anular style="margin-left:auto">Anular</button>' : ''}</div>`;
    }
    velo.innerHTML = `<aside class="hoja" role="dialog" aria-label="Traslado ${t.num}">${cab}<div class="cue">${cuerpo}</div>${pie ? `<div class="pie-hoja">${pie}</div>` : ''}</aside>`;
    conectar();
    /* lo enviado aparece recién ahora: se agrega la clase un cuadro después para que se vea entrar */
    const rv = $('[data-revelar="1"]', velo); if (rv) requestAnimationFrame(() => requestAnimationFrame(() => rv.classList.add('revelado')));
    if (!primera) requestAnimationFrame(() => $$('.sello,.viaje', velo).forEach(M.repetir));
  }
  const siguiente = t => `<div class="siguiente">
      ${t.lugar === 'almacen' ? `<button class="s-cerrado" data-no="Bajar al piso, con estas prendas ya cargadas"><span class="sello">${M.glifo('piso')}</span><span><b>Colgarlas en el piso</b><small>Entraron al almacén: así se pueden vender</small></span></button>` : ''}
      <button class="s-sale" data-no="Etiquetas de precio de estas prendas"><span class="sello">${M.glifo('etiqueta')}</span><span><b>Imprimir etiquetas</b><small>${M.unidades(t)} prendas</small></span></button>
      <button class="s-contando" data-no="Existencias"><span class="sello">${M.glifo('existencias')}</span><span><b>Ver en Existencias</b><small>Dónde quedó cada talla</small></span></button></div>`;

  function conectar() {
    const sit = M.situacion(t, s);
    $('.x', velo).onclick = () => cerrar();
    $$('[data-no]', velo).forEach(b => b.onclick = () => M.noEnMaqueta(b.dataset.no));
    $$('.lin[data-k]', velo).forEach(row => {
      const k = +row.dataset.k, l = t.lineas[k], out = $('output', row);
      const poner = v => {
        const antes = M.contadas(t);
        l.cont = Math.max(0, v); out.textContent = l.cont; out.classList.remove('sin-contar', 'salta'); void out.offsetWidth; out.classList.add('salta');
        if (!t.cuenta) { t.cuenta = RESPONSABLE[s]; t.inicioConteo = M.AHORA; }
        cambio = t.num; M.guardar();
        if (M.contadas(t) !== antes) pintar(); else actualizarBarra();
      };
      $('[data-mas]', row).onclick = () => poner((l.cont ?? 0) + 1);
      $('[data-menos]', row).onclick = () => poner((l.cont ?? 1) - 1);
    });
    const esc = $('[data-escanear]', velo);
    if (esc) esc.onclick = () => {
      /* la pistola suma de a una: va a la primera prenda que todavía no llega a su cantidad (la maqueta «sabe» qué hay en la caja) */
      const k = t.lineas.findIndex(l => (l.cont ?? 0) < l.n), l = t.lineas[k < 0 ? 0 : k];
      const row = $$('.lin[data-k]', velo)[k < 0 ? 0 : k];
      row.scrollIntoView({ block:'nearest', behavior: reducir() ? 'auto' : 'smooth' });
      $('[data-mas]', row).click();
      row.animate && !reducir() && row.animate([{ background:'color-mix(in srgb,var(--pizarra) 14%,transparent)' }, { background:'transparent' }], { duration:700, easing:'cubic-bezier(.32,.72,.24,1)' });
      M.repetir($('.sello', esc.closest('.btn')) || esc);
    };
    const termine = $('[data-termine]', velo);
    if (termine) termine.onclick = () => { revelado = true; pintar(); };
    const recontar = $('[data-recontar]', velo);
    if (recontar) recontar.onclick = () => { revelado = false; pintar(); };
    $$('[data-lugar]', velo).forEach(b => b.onclick = () => { lugar = b.dataset.lugar; $$('[data-lugar]', velo).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    const conf = $('[data-confirmar]', velo);
    if (conf) conf.onclick = () => confirmar();
    const nota = $('[data-nota]', velo), cerrarDif = $('[data-cerrar]', velo);
    if (nota) nota.oninput = () => { cerrarDif.disabled = nota.value.trim().length < 6; };
    if (cerrarDif) cerrarDif.onclick = () => {
      t.estado = 'cerrada'; t.notaCierre = nota.value.trim(); t.cerrado = M.AHORA; t.cerro = RESPONSABLE[s];
      cambio = t.num; M.guardar(); pintar(); M.avisar(`Traslado ${t.num} cerrado con su nota.`);
    };
    const anular = $('[data-anular]', velo);
    if (anular) anular.onclick = () => { confirmandoAnular = true; pintar(); $('[data-motivo]', velo)?.focus(); };
    const noAn = $('[data-no-anular]', velo);
    if (noAn) noAn.onclick = () => { confirmandoAnular = false; pintar(); };
    const motivo = $('[data-motivo]', velo), siAn = $('[data-anular-si]', velo);
    if (motivo) motivo.oninput = () => { siAn.disabled = motivo.value.trim().length < 6; };
    if (siAn) siAn.onclick = () => {
      t.estado = 'anulada'; t.anulado = M.AHORA; t.motivo = motivo.value.trim(); confirmandoAnular = false;
      cambio = t.num; M.guardar(); pintar(); M.avisar(`Traslado ${t.num} anulado: las prendas volvieron a tu almacén.`);
    };
  }
  function actualizarBarra() {
    const hechas = M.contadas(t), total = t.lineas.length;
    const b = $('.barra-conteo i', velo); if (b) b.style.setProperty('--w', Math.round(hechas / total * 100) + '%');
  }
  function confirmar() {
    /* las prendas vuelan de su fila a la sede de destino del viaje (como se ve la caja vaciándose) */
    const destino = $$('.cab .pt', velo).pop(), base = host.getBoundingClientRect();
    if (destino && !reducir()) {
      const r2 = destino.getBoundingClientRect();
      $$('.lin .mos', velo).forEach((m, i) => {
        const r = m.getBoundingClientRect(), c = m.cloneNode(true);
        c.classList.add('vuela'); c.style.left = (r.left - base.left) + 'px'; c.style.top = (r.top - base.top) + 'px';
        host.appendChild(c);
        setTimeout(() => { c.style.transform = `translate(${r2.left - r.left + r2.width / 2 - r.width / 2}px,${r2.top - r.top}px) scale(.35)`; c.style.opacity = '0'; }, 30 + i * 70);
        setTimeout(() => c.remove(), 900 + i * 70);
      });
    }
    const dif = M.difiere(t);
    t.lugar = lugar; t.recibio = RESPONSABLE[s]; t.confirmado = M.AHORA;
    if (dif) t.estado = 'recibido_con_diferencia'; else { t.estado = 'cerrada'; t.cerrado = M.AHORA; }
    cambio = t.num; M.guardar();
    setTimeout(() => {
      revelado = false; pintar();
      M.avisar(dif ? `Entró lo que coincidió. ${M.faltan(t) ? 'Lo que falta' : 'Lo que sobró'} espera tu revisión.` : `Traslado ${t.num} recibido: ${M.unidades(t)} prendas en el ${lugar === 'piso' ? 'piso' : 'almacén'}.`);
    }, reducir() ? 0 : 520);
  }
  const cerrar = rapido => {
    cierraCajon = null; document.removeEventListener('keydown', tecla);
    const huboCambio = cambio; cambio = null;
    if (rapido) { velo.remove(); return; }
    velo.classList.remove('in'); velo.classList.add('sale');
    setTimeout(() => { velo.remove(); if (huboCambio && M.alCambiar) M.alCambiar(huboCambio); }, 200);
  };
  const tecla = e => { if (e.key === 'Escape' && !e.target.closest('textarea')) cerrar(); };
  document.addEventListener('keydown', tecla);
  velo.addEventListener('click', e => { if (e.target === velo) cerrar(); });
  cierraCajon = cerrar;
  pintar(true);
  requestAnimationFrame(() => requestAnimationFrame(() => { velo.classList.add('in'); $$('.sello,[data-go]', velo).forEach(x => x.classList.add('go')); }));
};

/* Pedido de otra sede: hoja corta con «Enviar» / «No la tengo» */
M.cajonPedido = p => {
  if (!p) return;
  if (cierraCajon) cierraCajon(true);
  const host = $('.vista'), velo = el('div', 'velo s-pedido');
  const pide = SEDES[p.pide];
  velo.innerHTML = `<aside class="hoja" role="dialog" aria-label="Pedido de ${pide.corto}">
    <div class="cab"><button class="x" aria-label="Cerrar">${M.ic('cerrar')}</button>
      <div class="fila1 casc" style="--i:0"><span class="sello" data-go>${M.glifo('pedido')}</span><div><div class="que">${pide.corto} te pide</div><h2>${M.nombrePrenda(p.linea)}</h2></div></div>
      <p class="casc" style="--i:1">${M.persona(RESPONSABLE[p.pide])} · ${M.cuando(p.cuando)}${p.cliente ? ' · para apartarla a una cliente' : ' · para reponer'}</p></div>
    <div class="cue">
      <section class="casc" style="--i:2"><h4>La prenda</h4><div class="lista-lin">${lineaHTML(null, p.linea, 0, 'ver')}</div></section>
      <section class="casc" style="--i:3"><h4>Se envía así</h4>${M.viaje({ de:p.envia, a:p.pide, estado:'en_transito', salio:M.AHORA, eta:T(1,'12:00'), lineas:[p.linea] }, M.sede, { at: M.AHORA })}</section>
    </div>
    <div class="pie-hoja"><div class="fila"><button class="btn" data-no-tengo>No la tengo</button><button class="btn pri grande" data-enviar>Enviar a ${pide.corto}</button></div></div></aside>`;
  host.appendChild(velo);
  const cerrar = (rapido, hubo) => { cierraCajon = null; if (rapido) return velo.remove(); velo.classList.remove('in'); velo.classList.add('sale'); setTimeout(() => { velo.remove(); if (hubo && M.alCambiar) M.alCambiar(hubo); }, 200); };
  cierraCajon = cerrar;
  $('.x', velo).onclick = () => cerrar();
  velo.addEventListener('click', e => { if (e.target === velo) cerrar(); });
  $('[data-no-tengo]', velo).onclick = () => { p.hecho = true; M.guardar(); cerrar(false, 'pedido'); M.avisar(`Le avisamos a ${pide.corto} que no la tienes.`, 'info'); };
  $('[data-enviar]', velo).onclick = () => {
    const num = Math.max(...M.TR.map(x => x.num)) + 1;
    M.TR.push({ num, de:p.envia, a:p.pide, estado:'en_transito', salio:M.AHORA, eta:T(1,'12:00'), por:RESPONSABLE[p.envia], nota: p.cliente ? 'Pedido para apartar a una cliente.' : 'Reposición pedida.', lineas:[{ ...p.linea, cont:null }] });
    p.hecho = true; M.guardar(); cerrar(false, num); M.avisar(`Traslado ${num} enviado a ${pide.corto}.`);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => { velo.classList.add('in'); $$('.sello,[data-go]', velo).forEach(x => x.classList.add('go')); }));
};

/* ====================================================================
   SEGUNDA RONDA (D · Pases, E · La puerta, F · Conversaciones) — piezas que comparten.
   Las ACCIONES cambian los datos con las mismas reglas que la base (ADR-0239): lo que coincide entra
   al instante y lo que no espera a un líder; anular solo si nadie empezó a contar.
   ==================================================================== */
M.yo = () => RESPONSABLE[M.sede];
M.hechas = (() => { try { return +(sessionStorage.getItem(CLAVE + ':hechas') || 0); } catch (e) { return 0; } })();
const sumarHecha = () => { M.hechas++; try { sessionStorage.setItem(CLAVE + ':hechas', M.hechas); } catch (e) {} };
const reinicioOriginal = M.reiniciar;
M.reiniciar = () => { reinicioOriginal(); M.hechas = 0; try { sessionStorage.removeItem(CLAVE + ':hechas'); } catch (e) {} };
M.acc = {
  contar(t, k, v) {
    t.lineas[k].cont = Math.max(0, v);
    if (!t.cuenta) { t.cuenta = M.yo(); t.inicioConteo = M.AHORA; }
    M.guardar();
  },
  sumar(t, k, d) { M.acc.contar(t, k, (t.lineas[k].cont ?? 0) + d); },
  todoContado: t => t.lineas.every(l => l.cont != null),
  totalContado: t => t.lineas.reduce((a, l) => a + (l.cont ?? 0), 0),
  /* devuelve true si quedó con diferencia */
  confirmar(t, lugar) {
    const dif = M.difiere(t);
    t.lugar = lugar; t.recibio = M.yo(); t.confirmado = M.AHORA;
    if (dif) t.estado = 'recibido_con_diferencia'; else { t.estado = 'cerrada'; t.cerrado = M.AHORA; sumarHecha(); }
    M.guardar(); return dif;
  },
  cerrarDif(t, nota) { t.estado = 'cerrada'; t.notaCierre = nota; t.cerrado = M.AHORA; t.cerro = M.yo(); sumarHecha(); M.guardar(); },
  anular(t, motivo) { t.estado = 'anulada'; t.anulado = M.AHORA; t.motivo = motivo; M.guardar(); },
  enviarPedido(p) {
    const num = Math.max(...M.TR.map(x => x.num)) + 1;
    M.TR.push({ num, de:p.envia, a:p.pide, estado:'en_transito', salio:M.AHORA, eta:T(1,'12:00'), por:RESPONSABLE[p.envia],
      nota: p.cliente ? 'Pedido para apartar a una cliente.' : 'Reposición pedida.', lineas:[{ ...p.linea, cont:null }], dePedido:p.id });
    p.hecho = true; p.respuesta = 'enviado'; p.num = num; sumarHecha(); M.guardar(); return num;
  },
  noTengo(p) { p.hecho = true; p.respuesta = 'no'; p.respondido = M.AHORA; sumarHecha(); M.guardar(); },
};
/* La historia de una caja, en orden: lo que la base guarda y nada más (salida, inicio del conteo, confirmación, cierre, anulación) */
M.eventos = t => {
  const E = [{ k:'salio', cuando:t.salio, quien:t.por, sede:t.de }];
  if (t.estado === 'anulada') { E.push({ k:'anulado', cuando:t.anulado, quien:t.por, sede:t.de }); return E; }
  if (t.inicioConteo && !(t.confirmado && +t.confirmado === +t.inicioConteo)) E.push({ k:'conteo', cuando:t.inicioConteo, quien:t.cuenta, sede:t.a });
  if (t.confirmado) E.push({ k: M.difiere(t) ? 'dif' : 'recibido', cuando:t.confirmado, quien:t.recibio, sede:t.a });
  else if (t.estado === 'cerrada') E.push({ k:'recibido', cuando:t.cerrado, quien:t.recibio, sede:t.a });
  if (t.estado === 'cerrada' && M.difiere(t)) E.push({ k:'cierre', cuando:t.cerrado, quien:t.cerro, sede:t.a });
  return E;
};
/* El QR de la guía (ADR-0242 D-3): abre el conteo de ESA caja. Es papel: no se oscurece (ADR-0336). Dibujo de muestra, no se lee. */
M.qr = (seed, px = 64) => {
  const n = 21; let x = (seed * 7919) % 233280;
  const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  const esq = (r, c, m) => (r < m && c < m) || (r < m && c >= n - m) || (r >= n - m && c < m);
  let q = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    let on;
    if (esq(r, c, 7)) { const rr = r < 7 ? r : r - (n - 7), cc = c < 7 ? c : c - (n - 7), d = Math.max(Math.abs(rr - 3), Math.abs(cc - 3)); on = d !== 2; }
    else if (esq(r, c, 8)) on = false;
    else on = rnd() > 0.5;
    if (on) q += `M${c} ${r}h1v1h-1z`;
  }
  return `<svg class="qr" data-papel viewBox="-1.5 -1.5 ${n + 3} ${n + 3}" width="${px}" height="${px}" aria-hidden="true"><rect x="-1.5" y="-1.5" width="${n + 3}" height="${n + 3}" rx="1.5" fill="var(--crema-fija)"/><path d="${q}" fill="var(--tinta-fija)"/></svg>`;
};
/* Letras que giran como en un tablero de aeropuerto y se quedan quietas (una vez) */
M.flap = (e, final, ms = 420) => {
  if (reducir()) { e.textContent = final; return; }
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  e.innerHTML = [...final].map(ch => `<span class="fl">${ch}</span>`).join('');
  const sp = [...e.children], t0 = performance.now();
  const paso = () => {
    const now = performance.now(); let vivo = false;
    sp.forEach((x, i) => { if (now - t0 < ms + i * 120) { vivo = true; x.textContent = L[Math.floor(Math.random() * 26)]; x.classList.add('gira'); } else if (x.classList.contains('gira')) { x.textContent = final[i]; x.classList.remove('gira'); } });
    if (vivo) setTimeout(paso, 60);
  };
  paso();
};
/* FLIP: un elemento parece venir desde donde estaba otro (rect de origen) */
M.flip = (e, desde, ms = 560) => {
  if (!desde || reducir()) return;
  const a = e.getBoundingClientRect(); if (!a.width) return;
  const dx = desde.left - a.left, dy = desde.top - a.top, sx = desde.width / a.width, sy = desde.height / a.height;
  e.animate([{ transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`, transformOrigin:'0 0', opacity:.6 }, { transform:'none', transformOrigin:'0 0', opacity:1 }], { duration:ms, easing:'cubic-bezier(.32,.72,.24,1)' });
};
/* Una copia que vuela de un lugar a otro y desaparece (prendas que entran al almacén, una caja que se va) */
M.volar = (nodo, haciaRect, { ms = 700, demora = 0, escala = .3 } = {}) => {
  if (reducir()) return;
  const host = $('.vista'), base = host.getBoundingClientRect(), r = nodo.getBoundingClientRect();
  const c = nodo.cloneNode(true); c.classList.add('vuela');
  Object.assign(c.style, { left:(r.left - base.left) + 'px', top:(r.top - base.top) + 'px', width:r.width + 'px', height:r.height + 'px', margin:0 });
  host.appendChild(c);
  const dx = haciaRect.left + haciaRect.width / 2 - (r.left + r.width / 2), dy = haciaRect.top + haciaRect.height / 2 - (r.top + r.height / 2);
  c.animate([{ transform:'none', opacity:1 }, { transform:`translate(${dx}px,${dy}px) scale(${escala})`, opacity:0 }], { duration:ms, delay:demora, easing:'cubic-bezier(.32,.72,.24,1)', fill:'forwards' }).onfinish = () => c.remove();
};
M.hayPendientes = () => M.tareas().length;
/* Pedidos que me tocan responder, y los ya respondidos (para la historia) */
M.pedidosDe = (s = M.sede) => M.PEDIDOS.filter(p => p.envia === s || p.pide === s);

/* El taller se escribe entero: «TAL» no se entendió en la prueba ciega; TRU, LIM y AQP sí */
M.codigo = id => id === 'taller' ? 'Taller' : SEDES[id].cod;
/* Cómo se nombra una CAJA (femenino) según lo que le toca a quien mira */
M.nombreCaja = (t, s = M.sede) => ({
  llega: M.atrasado(t) ? 'Atrasada' : 'Viene hacia ti', sale: 'Enviada', camino: 'En camino',
  contando: t.a === s ? 'Contando' : `${SEDES[t.a].corto} la está contando`,
  revisar: t.a === s ? 'Falta revisar' : `Faltó algo · lo revisa ${SEDES[t.a].corto}`,
  cerrado: 'Recibida completa', dif: 'Cerrada con nota', anulado: 'Anulada',
}[M.situacion(t, s)]);
/* Qué faltó o sobró, con nombre, color y talla (la prueba ciega pidió saber CUÁL prenda) */
M.faltaQue = t => {
  const ls = t.lineas.filter(l => (l.cont ?? 0) !== l.n); if (!ls.length) return '';
  const l = ls[0], d = (l.cont ?? 0) - l.n, que = `${M.nombrePrenda(l)} ${PRENDAS[l.p].cols[l.c][0]} ${l.t}`;
  const base = d < 0 ? `${-d === 1 ? 'Faltó' : 'Faltaron'} ${-d} ${que}` : `${d === 1 ? 'Sobró' : 'Sobraron'} ${d} ${que}`;
  return ls.length > 1 ? `${base} y ${ls.length - 1} más` : base;
};

/* ── Marco de la página: barra del demo + la app ──────────────────────────── */
M.montar = ({ opcion, nombre, dibujar }) => {
  document.title = `Traslados · ${opcion} · ${nombre}`;
  const tema = (() => { try { return localStorage.getItem('cayla-tema-maqueta') || 'claro'; } catch (e) { return 'claro'; } })();
  if (tema === 'oscuro') document.documentElement.dataset.tema = 'oscuro';
  document.body.innerHTML = `
    <div class="spk">
      <span class="tit">Traslados<small>Opción ${opcion} · ${nombre}</small></span>
      <span class="sp"></span>
      <div class="seg" role="group" aria-label="Vista"><button data-modo="escritorio" aria-pressed="true">Escritorio</button><button data-modo="celular" aria-pressed="false">Celular</button></div>
      <div class="seg" role="group" aria-label="Tema"><button data-tema="claro" aria-pressed="${tema !== 'oscuro'}">${M.ic('sol')}</button><button data-tema="oscuro" aria-pressed="${tema === 'oscuro'}">${M.ic('luna')}</button></div>
      <button class="acc" id="repetir">${M.ic('repetir')}Repetir animaciones</button>
      <button class="acc" id="reiniciar">Volver a empezar</button>
      <a class="acc" href="index.html">Todas las opciones</a>
    </div>
    <div class="escena"><div class="vista" data-modo="escritorio">
      <div class="app">
        <aside class="lat">
          <div class="logo"><i></i>CAYLA</div>
          <a href="#">Inicio</a><a href="#">Vender</a><a href="#">Caja</a>
          <div class="g">Inventario</div>
          <a class="sub" href="#">Existencias</a><a class="sub" href="../movimientos-rediseno-2026-10/a-ruta.html">Movimientos</a><a class="sub on" href="#">Traslados<span class="bd" id="bd"></span></a><a class="sub" href="#">Conteo</a><a class="sub" href="#">Análisis</a>
          <div class="g">Más</div>
          <a href="#">Catálogo</a><a href="#">Compras</a><a href="#">Finanzas</a><a href="#">Colaboradores</a>
        </aside>
        <div class="cuerpo">
          <div class="top"><span class="marca"><i></i>CAYLA</span><span class="act">${M.ic('reloj')}ACTIVIDAD</span>
            <div class="sede-sel"><button aria-haspopup="listbox" aria-expanded="false"><span id="sede-n"></span>${M.ic('abajo')}</button>
              <ul role="listbox">${Object.values(SEDES).map(x => `<li><button data-sede="${x.id}">${M.ptSede(x.id)}<span>${x.n}</span><small>${x.ciudad}</small></button></li>`).join('')}</ul></div></div>
          <div class="main" id="raiz"></div>
        </div>
      </div>
    </div></div>`;
  const vista = $('.vista'), raiz = $('#raiz'), sel = $('.sede-sel');
  const pintar = ({ quieto = false, foco = null } = {}) => {
    if (cierraCajon) cierraCajon(true);
    const scroll = $('.cuerpo').scrollTop;
    $('#sede-n').textContent = SEDES[M.sede].n;
    $$('[data-sede]', sel).forEach(b => b.setAttribute('aria-current', b.dataset.sede === M.sede));
    const n = M.tareas().length; $('#bd').textContent = n || ''; $('#bd').style.display = n ? '' : 'none';
    M.quieto = quieto;
    raiz.innerHTML = '';
    dibujar(raiz);
    $$('[data-no]', raiz).forEach(b => b.onclick = e => { e.stopPropagation(); M.noEnMaqueta(b.dataset.no); });
    M.conectarTareas(raiz);
    M.revelar(raiz);
    M.quieto = false;
    if (quieto) $('.cuerpo').scrollTop = scroll; else $('.cuerpo').scrollTop = 0;
    if (foco != null) {
      const f = raiz.querySelector(`[data-foco="${foco}"]`);
      if (f) { f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash'); $$('.sello,[data-go]', f).forEach(M.repetir); }
    }
  };
  M.repintar = pintar;
  M.alCambiar = foco => pintar({ quieto:true, foco });
  $$('.seg [data-modo]').forEach(b => b.addEventListener('click', () => {
    $$('.seg [data-modo]').forEach(x => x.setAttribute('aria-pressed', x === b));
    vista.dataset.modo = b.dataset.modo; setTimeout(() => pintar(), 80);
  }));
  $$('.seg [data-tema]').forEach(b => b.addEventListener('click', () => {
    $$('.seg [data-tema]').forEach(x => x.setAttribute('aria-pressed', x === b));
    if (b.dataset.tema === 'oscuro') document.documentElement.dataset.tema = 'oscuro'; else delete document.documentElement.dataset.tema;
    try { localStorage.setItem('cayla-tema-maqueta', b.dataset.tema); } catch (e) {}
    if (M.alTema) M.alTema();
  }));
  $('#repetir').addEventListener('click', () => pintar());
  $('#reiniciar').addEventListener('click', () => { M.reiniciar(); pintar(); M.avisar('Volvió todo a como estaba esta mañana.', 'info'); });
  sel.firstElementChild.onclick = e => { e.stopPropagation(); const ab = sel.classList.toggle('abierto'); sel.firstElementChild.setAttribute('aria-expanded', ab); };
  document.addEventListener('click', () => sel.classList.remove('abierto'));
  $$('[data-sede]', sel).forEach(b => b.onclick = () => { M.cambiarSede(b.dataset.sede); sel.classList.remove('abierto'); });
  M.cambiarSede = id => {
    M.sede = id;
    const u = new URL(location.href); u.searchParams.set('sede', id); history.replaceState(null, '', u);
    pintar();
  };
  const param = new URLSearchParams(location.search).get('vista');
  if (param === 'celular') { vista.dataset.modo = 'celular'; $$('.seg [data-modo]').forEach(x => x.setAttribute('aria-pressed', x.dataset.modo === 'celular')); }
  pintar();
  const abrir = new URLSearchParams(location.search).get('abrir');
  if (abrir) setTimeout(() => M.cajon(M.porNumero(+abrir)), 400);
};
})();
