/* ====================================================================
   MOVIMIENTOS · REDISEÑO · datos inventados + piezas comunes (2026-10-05)
   Un día de la Tienda TRU contado con las mismas palabras que usa la pantalla real
   (lib/movimientos-reglas.ts). Nada de esto viene de la base: son 26 operaciones
   inventadas para mostrar cada tipo. Script clásico (sin módulos) para que el
   archivo abra también con doble clic.
   ==================================================================== */
(function(){
"use strict";
const M = window.M = {};
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
M.$ = $; M.$$ = $$;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
M.el = el;

/* ── Íconos de TIPO: cada uno con piezas con nombre para animarse ───────────── */
const GL = {
  venta:      '<g class="bolsa"><path d="M5.2 8.5h13.6l-1 11.5H6.2L5.2 8.5Z"/></g><path class="asa" d="M9 8.5V7.4a3 3 0 0 1 6 0v1.1"/>',
  colgada:    '<path d="M3.5 3.6h17"/><g class="perch"><path d="M12 3.6v2.6a2.3 2.3 0 1 1-2.3 2.3"/><path d="M12 10.6 3.9 16.3a1.2 1.2 0 0 0 .7 2.2h14.8a1.2 1.2 0 0 0 .7-2.2L12 10.6Z"/></g>',
  subida:     '<path d="M4.5 10.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-8.5"/><g class="tapa"><path d="M3.5 7h17v3.5h-17z"/></g><path class="fl" d="M12 17.6v-5M9.8 14.6 12 12.4l2.2 2.2"/>',
  llegada:    '<g class="paq"><path d="M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2V8.2Z"/><path d="M4 8.2 12 12.5l8-4.3M12 12.5V21"/></g>',
  traslado:   '<g class="cam"><path d="M2.8 6.6h10.7v9.7H2.8z"/><path d="M13.5 9.8h4l3.2 3.4v3.1h-7.2"/><circle cx="7" cy="17.7" r="1.8"/><circle cx="17" cy="17.7" r="1.8"/></g><path class="ray" d="M1.6 9.5h-.4M2.2 12.4h-1"/>',
  devolucion: '<path class="giro" d="M9.5 4.5 4.5 9l5 4.5"/><path class="giro" d="M4.5 9H14a5.5 5.5 0 0 1 0 11h-3"/>',
  cambio:     '<path class="a1" d="M4 8.5h14l-3.2-3.2"/><path class="a2" d="M20 15.5H6l3.2 3.2"/>',
  ajuste:     '<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle class="k1" cx="15" cy="7.5" r="2"/><circle class="k2" cx="9" cy="16.5" r="2"/>',
  conteo:     '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9.2 4.5V3.5h5.6v1"/><path class="vis" d="M9 13l2.2 2.2 3.8-4.4"/>',
};
M.glifo = id => `<svg class="gl g-${id}" viewBox="0 0 24 24" aria-hidden="true">${GL[id]}</svg>`;

/* Íconos chicos de interfaz */
const IC = {
  buscar: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  abajo:  '<path d="m6 9 6 6 6-6"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  bajar:  '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  escaner:'<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  menu:   '<path d="M4 7h16M4 12h16M4 17h16"/>',
  play:   '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>',
  pausa:  '<path d="M8 5v14M16 5v14"/>',
  reloj:  '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  doc:    '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/>',
  repetir:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  ojo:    '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  puntos: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
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
const PRENDAS = {
  blusa:   { n:'Blusa Aurora',    cat:'top',     cols:{ terracota:['Terracota','#b9694a'], crudo:['Crudo','#e6dcc8'], oliva:['Verde oliva','#7b8660'] } },
  vestido: { n:'Vestido Lúcuma',  cat:'vestido', cols:{ mostaza:['Mostaza','#c79a3e'], negro:['Negro','#2c2926'] } },
  pantalon:{ n:'Pantalón Chala',  cat:'pantalon',cols:{ arena:['Arena','#cdb592'], noche:['Azul noche','#2f3a4f'] } },
  casaca:  { n:'Casaca Pampa',    cat:'casaca',  cols:{ cacao:['Cacao','#6b4a3a'], piedra:['Gris piedra','#8f8c85'] } },
  polera:  { n:'Polera Misti',    cat:'top',     cols:{ rosa:['Rosa palo','#d9a8a0'], crema:['Crema','#efe6d6'] } },
  falda:   { n:'Falda Sauce',     cat:'falda',   cols:{ salvia:['Verde salvia','#9bab8d'], marfil:['Marfil','#efe8d8'] } },
};
function luz(hex){ const n = parseInt(hex.slice(1),16); const r=n>>16, g=(n>>8)&255, b=n&255; return (0.299*r+0.587*g+0.114*b)/255; }
M.mos = (l, m=38) => {
  const p = PRENDAS[l.p], [, hex] = p.cols[l.c];
  const fg = luz(hex) > .6 ? '#1a1a18' : '#fbf8f2';
  return `<span class="mos" style="--m:${m}px;background:${hex};color:${fg}" title="${p.n} · ${p.cols[l.c][0]}"><svg viewBox="0 0 24 24">${SIL[p.cat]}</svg></span>`;
};
M.pila = (lineas, m=38, max=3) => {
  const vistos = []; lineas.forEach(l => { if (!vistos.some(v => v.p === l.p && v.c === l.c)) vistos.push(l); });
  const mostrar = vistos.slice(0, max), resto = vistos.length - mostrar.length;
  return `<span class="pila" style="--m:${m}px">${mostrar.map(l => M.mos(l, m)).join('')}${resto > 0 ? `<span class="mas">+${resto}</span>` : ''}</span>`;
};

/* ── Tipos y grupos de filtro ─────────────────────────────────────────────── */
const TIPOS = M.TIPOS = {
  venta:      { n:'Venta',               pl:'Ventas',                 flujo:'sale',   frase:'Salió de la tienda' },
  colgada:    { n:'Colgada en piso',     pl:'Colgadas en piso',       flujo:'dentro', frase:'Bajó del almacén al piso' },
  subida:     { n:'Guardada en almacén', pl:'Guardadas en almacén',   flujo:'dentro', frase:'Se guardó en el almacén' },
  llegada:    { n:'Llegada',             pl:'Llegadas',               flujo:'entra',  frase:'Llegó a la tienda' },
  traslado:   { n:'Traslado enviado',    pl:'Traslados enviados',     flujo:'sale',   frase:'Salió hacia otra sede' },
  devolucion: { n:'Devolución',          pl:'Devoluciones',           flujo:'entra',  frase:'Volvió al piso' },
  cambio:     { n:'Cambio',              pl:'Cambios',                flujo:'mixto',  frase:'Entró una prenda y salió otra' },
  ajuste:     { n:'Ajuste a mano',       pl:'Ajustes a mano',         flujo:'ajuste', frase:'Se corrigió el stock' },
  conteo:     { n:'Conteo',              pl:'Conteos',                flujo:'ajuste', frase:'Se corrigió tras contar' },
};
M.GRUPOS = [
  { id:'venta',   n:'Ventas',               tipos:['venta'],                gl:'venta',      corto:'se vendió' },
  { id:'colgada', n:'Colgadas en piso',     tipos:['colgada'],              gl:'colgada',    corto:'bajaron al piso' },
  { id:'subida',  n:'Guardadas en almacén', tipos:['subida'],               gl:'subida',     corto:'se guardaron' },
  { id:'llegada', n:'Llegadas',             tipos:['llegada'],              gl:'llegada',    corto:'llegaron' },
  { id:'traslado',n:'Traslados enviados',   tipos:['traslado'],             gl:'traslado',   corto:'se enviaron' },
  { id:'cliente', n:'Cambios y devoluciones',tipos:['devolucion','cambio'], gl:'devolucion', corto:'volvieron de clientes' },
  { id:'ajuste',  n:'Ajustes y conteos',    tipos:['ajuste','conteo'],      gl:'ajuste',     corto:'se corrigieron' },
];
M.grupoDe = tipo => M.GRUPOS.find(g => g.tipos.includes(tipo));

/* ── Datos: un lunes en la Tienda TRU ─────────────────────────────────────── */
const PERSONAS = M.PERSONAS = { rosa:'Rosa M.', camila:'Camila T.', luis:'Luis P.' };
const P = (p, c, t, n, lado) => ({ p, c, t, n, lado });
const D = { hoy:'2026-10-05', ayer:'2026-10-04' };
M.DIA = { hoy:{ etiqueta:'Hoy', largo:'lunes 5 de octubre' }, ayer:{ etiqueta:'Ayer', largo:'domingo 4 de octubre' } };

const RAW = [
  // ── HOY ──
  ['hoy','17:12','venta','rosa',[P('blusa','terracota','M',1),P('pantalon','arena','38',1)],{ ref:['Boleta B001-000412'] }],
  ['hoy','16:48','colgada','camila',[P('vestido','mostaza','S',2),P('vestido','mostaza','M',3),P('vestido','mostaza','L',2)],{}],
  ['hoy','16:20','venta','rosa',[P('casaca','cacao','M',1)],{ ref:['Boleta B001-000411'] }],
  ['hoy','15:55','devolucion','rosa',[P('blusa','crudo','S',1)],{ ref:['Boleta B001-000398','Venta de ayer'], nota:'Le quedó chica; la clienta prefirió el dinero.' }],
  ['hoy','15:31','subida','luis',[P('polera','rosa','S',1),P('polera','rosa','M',1)],{ nota:'Casi no salían del perchero.' }],
  ['hoy','14:40','venta','camila',[P('falda','salvia','M',1),P('polera','crema','M',1),P('vestido','negro','S',1)],{ ref:['Factura F001-000067'] }],
  ['hoy','14:05','llegada','luis',[P('blusa','oliva','S',12),P('blusa','oliva','M',12),P('pantalon','noche','36',12),P('pantalon','noche','38',12)],{ desde:'Textiles Andinos', ref:['Guía T001-00231','Textiles Andinos SAC'] }],
  ['hoy','13:22','ajuste','rosa',[P('casaca','piedra','L',2,'entra')],{ lugar:'Piso', motivo:'Encontré prendas', nota:'Estaban en el probador.' }],
  ['hoy','12:50','venta','rosa',[P('pantalon','noche','38',1)],{ ref:['Boleta B001-000410'] }],
  ['hoy','12:15','traslado','luis',[P('vestido','mostaza','M',6),P('falda','marfil','S',4)],{ hacia:'Tienda LIM', ref:['Traslado 31','En camino'] }],
  ['hoy','11:42','colgada','camila',[P('blusa','terracota','S',3),P('blusa','terracota','M',4),P('blusa','terracota','L',2)],{}],
  ['hoy','11:10','venta','camila',[P('polera','rosa','M',1),P('polera','rosa','S',1)],{ ref:['Boleta B001-000409'] }],
  ['hoy','10:36','conteo','luis',[P('casaca','cacao','S',1,'sale')],{ lugar:'Piso', ref:['Conteo 14','Sistema 4 · contó 3'] }],
  ['hoy','10:05','cambio','rosa',[P('pantalon','arena','38',1,'entra'),P('pantalon','arena','40',1,'sale')],{ ref:['Boleta B001-000390','Diferencia S/ 0.00'] }],
  ['hoy','09:48','venta','camila',[P('falda','salvia','S',1)],{ ref:['Boleta B001-000408'] }],
  ['hoy','09:31','venta','rosa',[P('blusa','oliva','M',1)],{ ref:['Boleta B001-000407'] }],
  ['hoy','09:20','colgada','camila',[P('pantalon','arena','38',4),P('pantalon','arena','40',4),P('pantalon','noche','38',3)],{}],
  // ── AYER ──
  ['ayer','19:02','venta','rosa',[P('vestido','mostaza','M',1)],{ ref:['Boleta B001-000406'] }],
  ['ayer','18:30','subida','luis',[P('blusa','terracota','S',2),P('blusa','terracota','L',1)],{}],
  ['ayer','17:40','venta','camila',[P('casaca','piedra','M',1),P('polera','crema','S',1)],{ ref:['Boleta B001-000405'] }],
  ['ayer','16:15','llegada','luis',[P('vestido','negro','S',4),P('vestido','negro','M',4),P('falda','marfil','M',4)],{ desde:'Tienda LIM', ref:['Traslado 29','Recibido de Tienda LIM'] }],
  ['ayer','15:05','colgada','camila',[P('casaca','cacao','S',3),P('casaca','cacao','M',3),P('casaca','cacao','L',3)],{}],
  ['ayer','13:40','ajuste','luis',[P('blusa','crudo','M',1,'sale')],{ lugar:'Almacén', motivo:'Merma', nota:'Se manchó con aceite en el almacén.' }],
  ['ayer','12:20','venta','rosa',[P('blusa','crudo','S',1),P('pantalon','arena','40',1)],{ ref:['Boleta B001-000398'] }],
  ['ayer','11:05','venta','camila',[P('polera','rosa','S',1)],{ ref:['Boleta B001-000397'] }],
  ['ayer','10:10','colgada','luis',[P('blusa','oliva','S',3),P('blusa','oliva','L',3)],{}],
];
const ORIGEN = {
  venta:['piso','Piso'], colgada:['almacen','Almacén'], subida:['piso','Piso'], devolucion:['cliente','Cliente'],
  traslado:['almacen','Almacén'],
};
const DESTINO = {
  venta:['cliente','Cliente'], colgada:['piso','Piso'], subida:['almacen','Almacén'], devolucion:['piso','Piso'],
  llegada:['almacen','Almacén'],
};
M.OPS = RAW.map((r, i) => {
  const [dia, h, tipo, quien, l, x] = r;
  const lineas = l.map(o => ({ ...o }));
  const u = lineas.reduce((s, o) => s + o.n, 0);
  const t = TIPOS[tipo];
  let delta = 0;
  if (tipo === 'venta' || tipo === 'traslado') delta = -u;
  else if (tipo === 'llegada' || tipo === 'devolucion') delta = u;
  else if (tipo === 'ajuste' || tipo === 'conteo') delta = lineas.reduce((s, o) => s + (o.lado === 'sale' ? -o.n : o.n), 0);
  else if (tipo === 'cambio') delta = 0;
  const entran = lineas.filter(o => tipo === 'cambio' ? o.lado === 'entra' : delta > 0).reduce((s, o) => s + o.n, 0);
  const salen = lineas.filter(o => tipo === 'cambio' ? o.lado === 'sale' : delta < 0).reduce((s, o) => s + o.n, 0);
  let origen = ORIGEN[tipo], destino = DESTINO[tipo];
  if (tipo === 'llegada') origen = ['ext', x.desde || 'Proveedor'];
  if (tipo === 'traslado') destino = ['sede', x.hacia || 'Otra sede'];
  if (tipo === 'cambio') { origen = ['cliente', 'Cliente']; destino = ['piso', 'Piso']; }
  if (tipo === 'ajuste' || tipo === 'conteo') { origen = [x.lugar === 'Almacén' ? 'almacen' : 'piso', x.lugar || 'Piso']; destino = null; }
  const [hh, mm] = h.split(':').map(Number);
  return {
    id:'op'+(i+1), dia, fecha:D[dia], hora:h, min:hh*60+mm, tipo, quien, lineas, u, delta, entran, salen,
    origen, destino, ref: x.ref ? { t:x.ref[0], d:x.ref[1] || null } : null, nota: x.nota || null, motivo: x.motivo || null, lugar: x.lugar || null,
    desde: x.desde || null, hacia: x.hacia || null,
  };
});
M.opsDe = dia => M.OPS.filter(o => !dia || dia === 'todo' || o.dia === dia);

/* Cifras de un conjunto de operaciones, por grupo de filtro */
M.cifrasPorGrupo = ops => M.GRUPOS.map(g => {
  const mias = ops.filter(o => g.tipos.includes(o.tipo));
  return { ...g, ops: mias.length, u: mias.reduce((s, o) => s + o.u, 0), entran: mias.reduce((s, o) => s + o.entran, 0), salen: mias.reduce((s, o) => s + o.salen, 0) };
});
M.textoDelta = o => {
  if (o.tipo === 'colgada' || o.tipo === 'subida') return String(o.u);
  if (o.tipo === 'cambio') return '+1 / −1';
  return o.delta > 0 ? '+' + o.delta : o.delta < 0 ? '−' + Math.abs(o.delta) : '0';
};
M.plural = (n, s, p) => n === 1 ? s : p;
M.persona = o => PERSONAS[o.quien];
M.inicial = o => PERSONAS[o.quien][0];

/* «Vestido Lúcuma · Mostaza · S M L» + «y 1 más»: lo que cabe en una fila */
M.resumenPrendas = o => {
  const g = []; o.lineas.forEach(l => { let x = g.find(y => y.p === l.p && y.c === l.c); if (!x) g.push(x = { p:l.p, c:l.c, tallas:[] }); if (!x.tallas.includes(l.t)) x.tallas.push(l.t); });
  const a = g[0], P = PRENDAS[a.p];
  return { principal: `${P.n} · ${P.cols[a.c][0]}`, tallas: (a.tallas.length > 1 ? 'tallas ' : 'talla ') + a.tallas.join(' '), mas: g.length - 1 };
};
const sinTilde = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
M.coincide = (o, q) => {
  if (!q) return true;
  const hay = [TIPOS[o.tipo].n, PERSONAS[o.quien], o.ref && o.ref.t, o.ref && o.ref.d, o.nota, o.motivo, o.desde, o.hacia, ...o.lineas.flatMap(l => [PRENDAS[l.p].n, PRENDAS[l.p].cols[l.c][0]])].filter(Boolean).map(sinTilde).join(' ');
  return sinTilde(q).split(/\s+/).every(w => hay.includes(w));
};

/* ── Ruta: «Piso → Cliente» con sus íconos ────────────────────────────────── */
const PT = {
  piso:    '<path d="M4 4h16"/><path d="M12 4v2a1.8 1.8 0 1 1-1.8 1.8"/><path d="M12 9.6 5.6 14a1 1 0 0 0 .6 1.8h11.6a1 1 0 0 0 .6-1.8L12 9.6Z"/>',
  almacen: '<path d="M4.5 10v8.5h15V10"/><path d="M3.5 6.5h17V10h-17z"/><path d="M10 13.5h4"/>',
  cliente: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  ext:     '<path d="M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2V8.2Z"/><path d="M4 8.2 12 12.5l8-4.3"/>',
  sede:    '<path d="M4 20V9l8-5 8 5v11"/><path d="M9.5 20v-6h5v6"/>',
};
M.pt = (par) => par ? `<span class="pt ${par[0] === 'ext' || par[0] === 'sede' || par[0] === 'cliente' ? 'ext' : ''}"><svg viewBox="0 0 24 24">${PT[par[0]]}</svg>${par[1]}</span>` : '';
M.PT = PT;
M.ruta = o => {
  if (!o.destino) return `<span class="ruta una">${M.pt(o.origen)}<span class="solo">${o.tipo === 'conteo' ? 'se corrigió tras contar' : 'se corrigió aquí'}</span></span>`;
  return `<span class="ruta" data-go>${M.pt(o.origen)}<span class="rail"><i class="fill"></i><i class="dot"></i></span>${M.pt(o.destino)}</span>`;
};

/* ── Líneas de una operación, para el cajón y las filas que se despliegan ─── */
M.lineasHTML = (o, m=40) => o.lineas.map(l => {
  const p = PRENDAS[l.p], col = p.cols[l.c][0];
  const signo = o.tipo === 'cambio' ? (l.lado === 'entra' ? '+' : '−') : (o.tipo === 'colgada' || o.tipo === 'subida') ? '' : o.delta > 0 ? '+' : o.delta < 0 ? '−' : (l.lado === 'sale' ? '−' : '+');
  const s2 = (o.tipo === 'ajuste' || o.tipo === 'conteo') ? (l.lado === 'sale' ? '−' : '+') : signo;
  return `<div class="lin">${M.mos(l, m)}<div class="n"><b>${p.n}</b><span>${col} · talla ${l.t}</span></div><div class="q num">${s2}${l.n}</div></div>`;
}).join('');

/* ── Movimiento: contar hasta, revelar al entrar, repetir un ícono ────────── */
M.contar = (e, hasta, ms=900, pref='') => {
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducir || !hasta) { e.textContent = pref + hasta; return; }
  const t0 = performance.now();
  const paso = t => {
    const k = Math.min(1, (t - t0) / ms), v = Math.round(hasta * (1 - Math.pow(1 - k, 3)));
    e.textContent = pref + v;
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
};
let observador = null;
function crearObservador(){
  return new IntersectionObserver(entradas => {
    let k = 0;
    entradas.filter(e => e.isIntersecting).forEach(e => {
      const n = e.target; observador.unobserve(n);
      n.style.setProperty('--i', Math.min(k++, 9));
      n.classList.add('in');
      setTimeout(() => (n.matches('.sello,[data-go]') ? [n] : []).concat($$('.sello,[data-go]', n)).forEach(s => s.classList.add('go')), 140 + k * 45);
      const c = n.querySelector('[data-cuenta]'); if (c && !c.dataset.hecho) { c.dataset.hecho = 1; M.contar(c, +c.dataset.cuenta, 900, c.dataset.pref || ''); }
    });
  }, { root: $('.cuerpo'), threshold: .12, rootMargin: '0px 0px -4% 0px' });
}
M.revelar = (raiz) => {
  if (!observador || observador.root !== $('.cuerpo')) observador = crearObservador();
  $$('.rev', raiz || document).forEach(n => { if (!n.classList.contains('in')) observador.observe(n); });
};
M.repetir = e => { e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); };
document.addEventListener('pointerover', ev => {
  const x = ev.target.closest && ev.target.closest('[data-go-hover]');
  if (!x || x.dataset.espera) return;
  x.dataset.espera = 1; setTimeout(() => delete x.dataset.espera, 1100);
  (x.matches('.sello,[data-go]') ? [x] : $$('.sello,[data-go]', x)).forEach(M.repetir);
});

/* ── Cabecera de página (EncabezadoPagina) ────────────────────────────────── */
M.encabezado = ({ frase, acciones } = {}) => `
  <header class="enc">
    <div>
      <div class="hilo">Tienda TRU · Lunes 5 de octubre</div>
      <h1>Movimientos</h1>
      <p class="frase">${frase || 'Todo lo que entró, salió o se movió en tu tienda, y quién lo hizo.'}</p>
    </div>
    <div class="acciones">${acciones || `<button class="btn">${M.ic('bajar')}Exportar</button><button class="btn pri">Ajustar stock</button>`}</div>
  </header>`;

/* ── Cajón de detalle (lo comparten las tres maquetas) ────────────────────── */
function pasos(o) {
  const u = o.u, n = M.plural(u, 'prenda', 'prendas');
  const por = {
    venta:      [`Cobrada en caja${o.ref ? ' · ' + o.ref.t : ''}`, `Salió del piso: ${u} ${n}`, 'Entregada al cliente'],
    colgada:    ['Sacadas del almacén', `Llevadas al piso: ${u} ${n}`, 'Colgadas en el perchero · ya se pueden vender'],
    subida:     ['Retiradas del piso', `Guardadas en el almacén: ${u} ${n}`, 'Ya no se ven en el piso'],
    llegada:    [`Llegaron de ${o.desde || 'el proveedor'}`, `Contadas y registradas: ${u} ${n}`, 'Guardadas en el almacén'],
    traslado:   ['Preparadas en el almacén', `Enviadas a ${o.hacia}: ${u} ${n}`, `Falta que ${o.hacia} las cuente`],
    devolucion: ['El cliente trajo la prenda', 'Revisada y aprobada', 'Volvió al piso · otra vez a la venta'],
    cambio:     ['El cliente trajo la prenda', 'Se le entregó la nueva', 'Diferencia cobrada: S/ 0.00'],
    ajuste:     ['Alguien notó una diferencia', 'Se corrigió a mano', 'Queda con su nota y sin documento'],
    conteo:     [`Se contó el ${o.lugar === 'Almacén' ? 'almacén' : 'piso'}`, o.ref && o.ref.d ? o.ref.d : 'El sistema y lo contado no coincidían', 'Se corrigió el stock'],
  }[o.tipo];
  return por.map((t, i) => ({ t, hecho: !(o.tipo === 'traslado' && i === 2) }));
}
const ATAJOS = {
  venta:['Hacer un cambio','Hacer una devolución','Ver en Existencias'],
  colgada:['Imprimir etiquetas','Ver en Existencias'],
  subida:['Ver en Existencias','Contar el piso'],
  llegada:['Colgar en el piso','Imprimir etiquetas'],
  traslado:['Ver el Traslado'],
  devolucion:['Ver en Existencias','Colgar en el piso'],
  cambio:['Ver en Existencias'],
  ajuste:['Contar la zona','Ver en Existencias'],
  conteo:['Ver el Conteo','Ver en Existencias'],
};
let cierraCajon = null;
M.cajon = (o) => {
  if (cierraCajon) cierraCajon(true);
  const t = TIPOS[o.tipo], host = $('.vista');
  const velo = el('div', 'velo t-' + o.tipo);
  const quien = M.persona(o);
  velo.innerHTML = `
    <aside class="hoja" role="dialog" aria-label="${t.n}">
      <div class="cab">
        <button class="x" aria-label="Cerrar">${M.ic('cerrar')}</button>
        <div class="casc" style="--i:0"><span class="sello" data-go style="--sz:56px">${M.glifo(o.tipo)}</span></div>
        <h2 class="casc" style="--i:1">${t.n}</h2>
        <p class="casc" style="--i:2">${M.DIA[o.dia].etiqueta} · ${o.hora} · ${quien}${o.motivo ? ' · ' + o.motivo : ''}</p>
      </div>
      <div class="cue">
        <section class="casc" style="--i:3"><h4>Ruta</h4>${M.ruta(o)}</section>
        <section class="casc" style="--i:4"><h4>Qué pasó</h4><div class="hist">${pasos(o).map((p, i) => `<div class="paso ${p.hecho ? 'hecho' : ''}" style="--i:${i}"><span class="pn">${p.hecho ? '✓' : i + 1}</span><div><b>${p.t}</b></div></div>`).join('')}</div></section>
        <section class="casc" style="--i:5"><h4>${o.u} ${M.plural(o.u, 'prenda', 'prendas')}</h4>${M.lineasHTML(o)}</section>
        ${o.ref ? `<section class="casc" style="--i:6"><h4>Documento</h4><div class="caja-ref">${M.ic('doc')}<div><b>${o.ref.t}</b>${o.ref.d ? `<small>${o.ref.d}</small>` : ''}</div></div></section>` : ''}
        ${o.nota ? `<section class="casc" style="--i:6"><h4>Nota de ${quien}</h4><div class="nota-op">“${o.nota}”</div></section>` : ''}
        <section class="casc" style="--i:7"><h4>Seguir con esta prenda</h4><div class="atajos">${(ATAJOS[o.tipo] || []).map(a => `<button class="btn">${a}</button>`).join('')}</div></section>
      </div>
    </aside>`;
  host.appendChild(velo);
  requestAnimationFrame(() => requestAnimationFrame(() => { velo.classList.add('in'); $('.ruta', velo)?.classList.add('go'); }));
  const cerrar = (rapido) => {
    cierraCajon = null; document.removeEventListener('keydown', tecla);
    if (rapido) return velo.remove();
    velo.classList.remove('in'); velo.classList.add('sale'); setTimeout(() => velo.remove(), 200);
  };
  const tecla = e => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', tecla);
  velo.addEventListener('click', e => { if (e.target === velo || e.target.closest('.x')) cerrar(); });
  cierraCajon = cerrar;
};

/* ── Marco de la página: barra del demo + sede ficticia de la app ─────────── */
M.montar = ({ opcion, nombre, dibujar }) => {
  document.title = `Movimientos · ${opcion} · maqueta`;
  document.body.innerHTML = `
    <div class="spk">
      <span class="tit">Movimientos<small>Opción ${opcion} · ${nombre}</small></span>
      <span class="sp"></span>
      <div class="seg" role="group" aria-label="Vista"><button data-modo="escritorio" aria-pressed="true">Escritorio</button><button data-modo="celular" aria-pressed="false">Celular</button></div>
      <button class="acc" id="repetir">${M.ic('repetir')}Repetir animaciones</button>
      <a class="acc" href="index.html">Las tres opciones</a>
    </div>
    <div class="escena"><div class="vista" data-modo="escritorio">
      <div class="app">
        <aside class="lat">
          <div class="logo"><i></i>CAYLA</div>
          <a href="#">Inicio</a><a href="#">Vender</a><a href="#">Caja</a>
          <div class="g">Inventario</div>
          <a class="sub" href="#">Existencias</a><a class="sub on" href="#">Movimientos</a><a class="sub" href="#">Traslados</a><a class="sub" href="#">Conteo</a><a class="sub" href="#">Análisis</a>
          <div class="g">Más</div>
          <a href="#">Catálogo</a><a href="#">Compras</a><a href="#">Finanzas</a><a href="#">Colaboradores</a>
        </aside>
        <div class="cuerpo">
          <div class="top"><span class="marca"><i></i>CAYLA</span><span class="act">${M.ic('reloj')}ACTIVIDAD</span><span class="sede">TIENDA TRU</span></div>
          <div class="main" id="raiz"></div>
        </div>
      </div>
    </div></div>`;
  const vista = $('.vista'), raiz = $('#raiz');
  const pintar = () => { if (cierraCajon) cierraCajon(true); raiz.innerHTML = ''; dibujar(raiz); M.revelar(raiz); $('.cuerpo').scrollTop = 0; };
  $$('.seg button').forEach(b => b.addEventListener('click', () => {
    $$('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    vista.dataset.modo = b.dataset.modo; setTimeout(pintar, 60);
  }));
  $('#repetir').addEventListener('click', pintar);
  const param = new URLSearchParams(location.search).get('vista');
  if (param === 'celular') { vista.dataset.modo = 'celular'; $$('.seg button').forEach(x => x.setAttribute('aria-pressed', x.dataset.modo === 'celular')); }
  pintar();
};
})();
