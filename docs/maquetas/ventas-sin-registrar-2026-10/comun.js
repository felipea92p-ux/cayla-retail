/* ====================================================================
   VENTAS SIN REGISTRAR · datos inventados + piezas comunes (2026-10-06)
   Un martes 6 de octubre a las 19:04 en la Tienda TRU. Las cuatro primeras ventas son las de la pantalla de hoy
   (Casacas Celeste S, Lentes de sol Negro, Relojes Plateado, Camisas y Blusas Blanco); el resto se inventó para mostrar
   las tres edades: de hoy, de ayer y vencidas (más de 2 días, DIAS_PARA_VENCER de lib/por-regularizar-reglas.ts).
   Las reglas son las del ERP: el precio oficial manda y la diferencia es cobrado − oficial (negativa = descuento no
   planificado); «Ya estaba registrada» descuenta 1 del stock; «Llegó nueva» no lo mueve; las sugerencias solo existen
   si hay UNA sola prenda que calza en categoría, talla y color con stock, y NACEN SIN MARCAR (ADR-0334).
   Script clásico (sin módulos) para que abra también con doble clic.
   ==================================================================== */
(function(){
"use strict";
const V = window.V = {};
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
V.$ = $; V.$$ = $$;
const q = new URLSearchParams(location.search);
if (q.has('sinmov')) document.documentElement.classList.add('sin-mov');
V.reducir = () => document.documentElement.classList.contains('sin-mov') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const esperar = ms => new Promise(r => setTimeout(r, V.reducir() ? 0 : ms));
V.esperar = esperar;

/* ── Íconos de interfaz ───────────────────────────────────────────────────── */
const IC = {
  buscar:'<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>', flecha:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  atras:'<path d="M19 12H5M11 6l-6 6 6 6"/>', abajo:'<path d="m6 9 6 6 6-6"/>', cerrar:'<path d="M6 6l12 12M18 6 6 18"/>',
  check:'<path d="m5 12.5 4.2 4.2L19 7"/>', sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  luna:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>', repetir:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  reloj:'<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>', varita:'<path d="m5 19 9-9M13 4l.8 2.2L16 7l-2.2.8L13 10l-.8-2.2L10 7l2.2-.8L13 4ZM18 12l.6 1.4L20 14l-1.4.6L18 16l-.6-1.4L16 14l1.4-.6L18 12Z"/>',
  cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>', etiqueta:'<path d="M3.5 12.2V4.5h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-5.6 5.6a1.5 1.5 0 0 1-2.1 0l-8.3-8.3Z"/><circle cx="8" cy="9" r="1.2"/>',
  caja:'<path d="M4 8.2 12 4l8 4.2v8.6L12 21l-8-4.2V8.2Z"/><path d="m4 8.2 8 4.3 8-4.3M12 12.5V21"/>',
  izq:'<path d="m15 6-6 6 6 6"/>', der:'<path d="m9 6 6 6-6 6"/>', hilo:'<path d="M4 17c5 0 3-10 8-10s3 10 8 10"/>',
};
V.ic = (id, extra='') => `<svg class="ic ${extra}" viewBox="0 0 24 24" aria-hidden="true">${IC[id]}</svg>`;
V.visto = () => '<svg class="visto" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>';

/* ── Prendas dibujadas: silueta sobre el color de la prenda (ADR-0333) ─────── */
const SIL = {
  'Camisas y Blusas':'<path class="cuerpo-p" d="M8 4 3.5 7.5 6 11l2-1.2V20h8V9.8l2 1.2 2.5-3.5L16 4c-.6 1.3-2 2-4 2S8.6 5.3 8 4Z"/><path class="det" d="M12 6v14M10.4 9.4h.01M10.4 12.4h.01M10.4 15.4h.01"/>',
  'Blusas':'<path class="cuerpo-p" d="M8 4 3.5 7.5 6 11l2-1.2V20h8V9.8l2 1.2 2.5-3.5L16 4c-.6 1.3-2 2-4 2S8.6 5.3 8 4Z"/><path class="det" d="M9.5 4.6c.7 1 1.4 1.4 2.5 1.4s1.8-.4 2.5-1.4"/>',
  'Polos':'<path class="cuerpo-p" d="M8.3 4 3.8 7.2 5.6 10.4l2.4-1V20h8V9.4l2.4 1 1.8-3.2L15.7 4c-.4 1.4-1.8 2.2-3.7 2.2S8.7 5.4 8.3 4Z"/><path class="det" d="M12 6.2V9"/>',
  'Vestidos':'<path class="cuerpo-p" d="M9.4 3h5.2l.4 5.4L18.4 20H5.6L9 8.4 9.4 3Z"/><path class="det" d="M9.4 8.4h5.2"/>',
  'Pantalones':'<path class="cuerpo-p" d="M7 3h10l1 18h-4.2L12 9.5 10.2 21H6L7 3Z"/><path class="det" d="M7.2 6h9.6"/>',
  'Casacas':'<path class="cuerpo-p" d="M9 3 3 6.5 4.5 20h5V9.2l2.5 2.2 2.5-2.2V20h5L21 6.5 15 3c-.6 1.6-1.7 2.4-3 2.4S9.6 4.6 9 3Z"/><path class="det" d="M12 11.4V20"/>',
  'Faldas':'<path class="cuerpo-p" d="M8 4h8l4 16H4L8 4Z"/><path class="det" d="M8.2 7.5h7.6"/>',
  'Lentes de sol':'<path class="cuerpo-p" d="M2.6 9.2h7.4v4a3.6 3.6 0 0 1-3.6 3.6h-.2a3.6 3.6 0 0 1-3.6-3.6v-4Zm11.4 0h7.4v4a3.6 3.6 0 0 1-3.6 3.6h-.2a3.6 3.6 0 0 1-3.6-3.6v-4Z"/><path class="det" d="M10 10.4c.7-.5 1.3-.5 2 0M2.6 9.2 1.6 7.6M21.4 9.2l1-1.6"/>',
  'Relojes':'<path class="cuerpo-p" d="M9 2.4h6l.7 4.2H8.3L9 2.4Zm-.7 15h7.4l-.7 4.2H9l-.7-4.2Z"/><circle class="cuerpo-p" cx="12" cy="12" r="5.4"/><path class="det" d="M12 9v3l2 1.4"/>',
};
/* La claridad del color de la prenda decide el color del texto que se escribe encima (tinta o crema FIJAS, ADR-0336) */
const lum = hex => { const n = parseInt(hex.slice(1),16), c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
V.tx = hex => lum(hex) > .34 ? 'var(--tinta-fija)' : 'var(--crema-fija)';
V.arte = cat => `<svg class="arte" viewBox="0 0 24 24" aria-hidden="true">${SIL[cat] || SIL['Camisas y Blusas']}</svg>`;
/* La baldosa: color de la prenda + su silueta. `ar` = qué tanto del cuadro ocupa la silueta */
V.baldosa = (cat, hex, cls='', ar='62%') => `<div class="baldosa ${cls}" style="--h:${hex};--tx:${V.tx(hex)};--ar:${ar}">${V.arte(cat)}</div>`;

/* ── Utilidades ───────────────────────────────────────────────────────────── */
V.soles = n => 'S/ ' + Number(n).toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2});
V.AHORA = new Date('2026-10-06T19:04:00-05:00');
V.DIAS_PARA_VENCER = 2;
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
V.hora = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
V.fechaCorta = d => String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
V.hace = min => min < 2 ? 'hace un momento' : min < 60 ? `hace ${min} min` : min < 60*24 ? `hace ${Math.floor(min/60)} h` : `hace ${Math.floor(min/1440)} días`;
V.ini = n => n.split(' ').map(p => p[0]).slice(0,2).join('');
V.dia = d => DIAS[d.getDay()];

/* ── Catálogo (las prendas reales entre las que se elige) ─────────────────── */
const P = (id,nombre,cat,talla,color,hex,codigo,precio,stock) => ({id,nombre,cat,talla,color,hex,codigo,precio,stock});
V.catalogo = [
  P('c1','Casaca Pampa','Casacas','S','Celeste','#8fb4cf','CAS-014',129,3),
  P('c2','Casaca Andina','Casacas','S','Celeste','#7ea6c4','CAS-021',139,1),
  P('c3','Casaca Pampa','Casacas','M','Celeste','#8fb4cf','CAS-014',129,4),
  P('c4','Casaca Pampa','Casacas','M','Cacao','#6b4a3a','CAS-015',199.9,2),
  P('c5','Casaca Pampa','Casacas','L','Gris piedra','#8f8c85','CAS-016',189.9,2),
  P('c6','Casaca Pampa','Casacas','L','Cacao','#6b4a3a','CAS-015',199.9,1),
  P('c7','Lentes Aviador','Lentes de sol','Única','Negro','#2c2926','LEN-004',39.9,6),
  P('c8','Lentes Wayfarer','Lentes de sol','Única','Carey','#8a5a2e','LEN-009',49.9,2),
  P('c9','Reloj Clásico','Relojes','Única','Plateado','#bfc3c7','REL-002',45,2),
  P('c10','Reloj Clásico','Relojes','Única','Dorado','#c9a24d','REL-003',45,3),
  P('c11','Blusa Lino','Camisas y Blusas','Estándar','Blanco','#f2eee6','BLU-031',59.9,4),
  P('c12','Camisa Oxford','Camisas y Blusas','Estándar','Blanco','#efebe2','CAM-007',69.9,2),
  P('c13','Camisa Oxford','Camisas y Blusas','Estándar','Celeste','#a9c3d6','CAM-008',69.9,3),
  P('c14','Vestido Lúcuma','Vestidos','M','Mostaza','#c79a3e','VES-011',149,2),
  P('c15','Vestido Lúcuma','Vestidos','S','Mostaza','#c79a3e','VES-011',149,1),
  P('c16','Vestido Lúcuma','Vestidos','S','Negro','#2c2926','VES-012',159,1),
  P('c17','Pantalón Chala','Pantalones','30','Azul noche','#2f3a4f','PAN-020',129,3),
  P('c18','Pantalón Chala','Pantalones','32','Arena','#cdb592','PAN-021',129,2),
  P('c19','Pantalón Chala','Pantalones','30','Arena','#cdb592','PAN-021',129,2),
  P('c20','Falda Brisa','Faldas','S','Arena','#cdb592','FAL-005',89.9,2),
  P('c21','Falda Brisa','Faldas','S','Crudo','#e6dcc8','FAL-006',89.9,3),
  P('c22','Polo Básico','Polos','M','Rosa palo','#d9a8a0','POL-040',45.9,5),
  P('c23','Polo Básico','Polos','S','Rosa palo','#d9a8a0','POL-040',45.9,4),
  P('c24','Blusa Aurora','Blusas','S','Crudo','#e6dcc8','BLU-044',89.9,3),
  P('c25','Blusa Aurora','Blusas','M','Terracota','#b9694a','BLU-045',89.9,2),
];
/* ── Ventas sin registrar (lo que anotó caja) ─────────────────────────────── */
const VE = (id,cat,talla,color,hex,precio,por,min) => ({id,cat,talla,color,hex,precio,por,min,vendidoEn:new Date(V.AHORA.getTime()-min*60000),estado:'pendiente',sede:'TRU',
  desc:`${cat} · ${color} · Talla ${talla}`.replace('Talla Única','Talla Única')});
V.ventas = [
  VE('v1','Casacas','S','Celeste','#8fb4cf',119,'Pamela Burgos',1),
  VE('v2','Lentes de sol','Única','Negro','#2c2926',39.9,'Pamela Burgos',1),
  VE('v3','Relojes','Única','Plateado','#bfc3c7',35,'Diana Palacios',5),
  VE('v4','Camisas y Blusas','Estándar','Blanco','#f2eee6',59.9,'Diana Palacios',5),
  VE('v5','Vestidos','M','Mostaza','#c79a3e',149,'Diana Palacios',23),
  VE('v6','Pantalones','30','Azul noche','#2f3a4f',129,'Pamela Burgos',44),
  VE('v7','Casacas','M','Cacao','#6b4a3a',189.9,'Pamela Burgos',72),
  VE('v8','Faldas','S','Arena','#cdb592',89.9,'Diana Palacios',1330),
  VE('v9','Polos','M','Rosa palo','#d9a8a0',49.9,'Diana Palacios',1450),
  VE('v10','Blusas','S','Crudo','#e6dcc8',79.9,'Pamela Burgos',1700),
  VE('v11','Vestidos','S','Negro','#2c2926',159,'Diana Palacios',3010),
  VE('v12','Pantalones','32','Arena','#cdb592',119,'Pamela Burgos',4300),
  VE('v13','Casacas','L','Gris piedra','#8f8c85',179.9,'Diana Palacios',5800),
];
/* Resueltas del mes, para los filtros «Regularizadas» y «Cerradas» */
V.resueltasIniciales = [
  {id:'r1',cat:'Faldas',talla:'M',color:'Crudo',hex:'#e6dcc8',precio:89.9,por:'Pamela Burgos',min:2900,estado:'regularizada',prendaNombre:'Falda Brisa · M · Crudo',dif:0,forma:'ya_registrada'},
  {id:'r2',cat:'Polos',talla:'S',color:'Rosa palo',hex:'#d9a8a0',precio:39.9,por:'Diana Palacios',min:3300,estado:'regularizada',prendaNombre:'Polo Básico · S · Rosa palo',dif:-6,forma:'llego_nueva'},
  {id:'r3',cat:'Vestidos',talla:'L',color:'Mostaza',hex:'#c79a3e',precio:149,por:'Pamela Burgos',min:6200,estado:'cerrada',prendaNombre:'Cerrada sin prenda',dif:null,forma:null,motivo:'Nadie recuerda cuál era'},
].map(r => ({...r, vendidoEn:new Date(V.AHORA.getTime()-r.min*60000), sede:'TRU', desc:`${r.cat} · ${r.color} · Talla ${r.talla}`}));
V.reiniciar = () => {
  V.ventas.forEach(v => { v.estado='pendiente'; delete v.prendaId; delete v.forma; delete v.dif; });
  V.catalogo.forEach(p => p.stock = p.stock0 ?? p.stock);
};
V.catalogo.forEach(p => p.stock0 = p.stock);
V.vencida = v => v.estado==='pendiente' && V.AHORA - v.vendidoEn >= V.DIAS_PARA_VENCER*86400000;
V.edad = v => V.vencida(v) ? 'venc' : (V.AHORA.getDate() === v.vendidoEn.getDate() ? 'hoy' : 'ayer');
V.todas = () => [...V.ventas, ...V.resueltasIniciales];
V.pendientes = () => V.ventas.filter(v => v.estado === 'pendiente');

/* ── El cálculo del negocio ───────────────────────────────────────────────── */
V.calce = (v, p) => (p.cat===v.cat) + (p.talla===v.talla) + (v.color.toLowerCase()===p.color.toLowerCase() || (v.color==='Negro' && p.color==='Negro'));
V.candidatas = (v, n=6) => V.catalogo.map(p => ({p, calce:V.calce(v,p)})).sort((a,b) => b.calce-a.calce || (b.p.stock>0)-(a.p.stock>0) || a.p.nombre.localeCompare(b.p.nombre)).slice(0,n);
/* La sugerencia solo existe si UNA sola prenda calza en los tres datos y tiene stock (ADR-0334) */
V.sugerida = v => { const x = V.catalogo.filter(p => V.calce(v,p)===3 && p.stock>0); return x.length===1 ? x[0] : null; };
V.dif = (v, p) => Math.round((v.precio - p.precio)*100)/100;
V.textoDif = d => d===0 ? 'Se cobró el precio oficial' : d<0 ? `Se cobró ${V.soles(-d)} menos que el oficial` : `Se cobró ${V.soles(d)} más que el oficial`;
V.tipoDif = d => d===0 ? 'exacto' : d<0 ? 'descuento' : 'sobreprecio';
V.regularizar = (id, prendaId, forma) => {
  const v = V.ventas.find(x => x.id===id), p = V.catalogo.find(x => x.id===prendaId);
  v.estado='regularizada'; v.prendaId=prendaId; v.forma=forma; v.dif=V.dif(v,p);
  if (forma==='ya_registrada') p.stock = Math.max(0, p.stock-1);
  return v.dif;
};
V.cifras = () => {
  const pend = V.pendientes(), reg = V.todas().filter(v => v.estado==='regularizada' && v.dif!=null);
  return {
    pend: pend.length, venc: pend.filter(V.vencida).length,
    desc: Math.round(-reg.filter(v => v.dif<0).reduce((s,v)=>s+v.dif,0)*100)/100,
    sobre: Math.round(reg.filter(v => v.dif>0).reduce((s,v)=>s+v.dif,0)*100)/100,
  };
};
V.FORMAS = {
  ya_registrada:{t:'Ya estaba registrada, solo perdió la etiqueta', c:'Se descuenta 1 del stock de esta tienda.', corto:'Perdió la etiqueta'},
  llego_nueva:{t:'Llegó nueva y no se contó en el lote', c:'Se anota que llegó y que se vendió: el stock no cambia.', corto:'Llegó nueva'},
};

/* ── Números que cuentan (una vez) ────────────────────────────────────────── */
V.cuenta = (el, hasta, {dec=0, dur=800, pref='', delay=0}={}) => {
  const fmt = n => pref + (dec ? n.toLocaleString('es-PE',{minimumFractionDigits:dec,maximumFractionDigits:dec}) : Math.round(n));
  const desde = parseFloat(el.dataset.v ?? '0') || 0; el.dataset.v = hasta;
  if (V.reducir() || desde===hasta) { el.textContent = fmt(hasta); return; }
  const t0 = performance.now()+delay;
  const paso = t => { const k = Math.min(1, Math.max(0,(t-t0)/dur)), e = 1-Math.pow(1-k,3); el.textContent = fmt(desde+(hasta-desde)*e); if (k<1) requestAnimationFrame(paso); };
  requestAnimationFrame(paso);
};

/* ── Aviso «listo, se guardó» (esquina de la vista) ───────────────────────── */
V.avisar = (titulo, detalle) => {
  const host = $('.avisos') || (() => { const d=document.createElement('div'); d.className='avisos'; $('.vista').appendChild(d); return d; })();
  const a = document.createElement('div'); a.className='aviso'; a.innerHTML = `${V.visto()}<div><b>${titulo}</b><small>${detalle||''}</small></div>`;
  host.appendChild(a); setTimeout(()=>a.remove(), 3700);
};

/* ── Marco: barra del demo + cabecera de página ───────────────────────────── */
const PAGINAS = [['a-emparejar.html','A'],['a2-puente.html','A2 Puente'],['a3-arrastrar.html','A3 Arrastrar'],['a4-perchero.html','A4 Perchero'],['b-una-por-una.html','B'],['c-galeria.html','C']];
V.marco = ({activa, titulo, frase, onRepetir, onReiniciar}) => {
  const html = document.documentElement;
  try { const t = sessionStorage.getItem('vsr-tema'); if (t) html.dataset.tema = t; } catch(e){}
  document.body.insertAdjacentHTML('afterbegin', `
  <div class="spk">
    <div class="tit">Ventas sin registrar<small>maqueta</small></div>
    <div class="seg" id="seg-pag">${PAGINAS.map(([h,t]) => `<a href="${h}" ${h===activa?'aria-current="page"':''}>${t}</a>`).join('')}</div>
    <div class="sp"></div>
    <div class="seg" id="seg-modo"><button data-m="escritorio" aria-pressed="true">Escritorio</button><button data-m="celular" aria-pressed="false">Celular</button></div>
    <div class="seg" id="seg-tema"><button data-t="claro" aria-pressed="true">${V.ic('sol')}</button><button data-t="oscuro" aria-pressed="false">${V.ic('luna')}</button></div>
    <button class="acc" id="b-rep">${V.ic('repetir')} Repetir animaciones</button>
    <button class="acc" id="b-ini">Volver a empezar</button>
    <a class="acc" href="index.html">Todas</a>
  </div>
  <div class="escena"><div class="vista" id="vista" data-modo="escritorio"><div class="cuerpo" id="cuerpo">
    <div class="top"><div class="marca"><i></i>CAYLA</div><div class="der"><span>ACTIVIDAD</span><span class="sede">Tienda TRU ${V.ic('abajo')}</span></div></div>
    <div class="main">
      <div class="enc"><div>
        <div class="hilo"><button class="vol" aria-label="Volver a Existencias">${V.ic('atras')}</button><span class="raya"></span><span>Tienda TRU · ${V.dia(V.AHORA)}, ${V.AHORA.getDate()} de octubre · ${V.hora(V.AHORA)}</span></div>
        <h1>${titulo||'Ventas sin registrar'}</h1>
        <p class="frase">${frase||'Prendas que caja vendió antes de estar en el sistema. Dile al sistema qué prenda era cada una y el stock queda cuadrado.'}</p>
      </div><div id="enc-der"></div></div>
      <div id="contenido"></div>
    </div></div></div></div>`);
  const dt = html.dataset.tema || 'claro';
  $$('#seg-tema button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t===dt));
  $('#seg-tema').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; html.dataset.tema = b.dataset.t; try{sessionStorage.setItem('vsr-tema', b.dataset.t)}catch(x){} $$('#seg-tema button').forEach(x => x.setAttribute('aria-pressed', x===b)); });
  $('#seg-modo').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; $('#vista').dataset.modo = b.dataset.m; $$('#seg-modo button').forEach(x => x.setAttribute('aria-pressed', x===b)); });
  $('#b-rep').onclick = () => onRepetir && onRepetir();
  $('#b-ini').onclick = () => { V.reiniciar(); onReiniciar && onReiniciar(); };
  if (q.get('vista')==='celular') { $('#vista').dataset.modo='celular'; $$('#seg-modo button').forEach(x => x.setAttribute('aria-pressed', x.dataset.m==='celular')); }
  return $('#contenido');
};
/* Un combo de «quién vendió» que filtra de verdad */
V.vendedoras = () => [...new Set(V.todas().map(v => v.por))].sort();
})();
