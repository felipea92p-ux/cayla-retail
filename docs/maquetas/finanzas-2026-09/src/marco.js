// ============ Marco: estado, formato, carcasa, ventanas, loader y avisos ============
const E = {
  rol: 'lider',          // 'lider' | 'encargada' (Rosa Quispe, TRU, con los módulos Gastos y Cuentas y dinero)
  ruta: 'resumen', tab: {},
  fuentes: false, descuadre: false,
  mesResultados: '2026-08', comparar: false,
  mesCierre: '2026-08',
  seleccion: new Set(),
  conciliado: {},        // id cuenta -> saldo del banco escrito
};

// ---------- Formato ----------
const nf0 = new Intl.NumberFormat('es-PE', {maximumFractionDigits:0});
const nf2 = new Intl.NumberFormat('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2});
const S = (n, dec) => (n < 0 ? '−' : '') + 'S/ ' + (dec ? nf2 : nf0).format(Math.abs(n));
const pct = n => (n*100).toFixed(1).replace('.', ',') + ' %';
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const fecha = s => { const [y,m,d] = s.split('-'); return `${+d} ${MESES[+m-1]}`; };
const mesLargo = s => { const [y,m] = s.split('-'); return `${MESES_L[+m-1]} ${y}`; };
const dias = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $ = s => document.querySelector(s);

// Etiqueta «de dónde sale este dato» (se ve con el botón de la barra de la demo).
// k: existe (tabla que ya existe en producción) · deriva (se calcula) · nuevo (hay que construirlo)
const F = (k, txt) => `<span class="fuente" data-k="${k}"><b>${{existe:'Existe', deriva:'Se calcula', nuevo:'Nuevo'}[k]}</b> ${esc(txt)}</span>`;

// ---------- Quién mira ----------
const esLider = () => E.rol === 'lider';
const unidadPropia = () => esLider() ? null : 'TRU';
const veUnidad = u => esLider() || u === unidadPropia();
const responsableDefecto = () => esLider() ? 'Felipe Alvarez' : 'Rosa Quispe';

// ---------- Menú (6 hijas: cumple el tope de lib/menu.ts) ----------
const ICON = {
  resumen:'<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  gastos:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  dinero:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  reportes:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  impuestos:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 16l4-4M10 12h.01M14 16h.01"/>',
  cierre:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
};
const MENU = [
  {r:'resumen',  n:'Resumen',        mod:'reportes_financieros'},
  {r:'gastos',   n:'Gastos',         mod:'gastos'},
  {r:'dinero',   n:'Cuentas y dinero', mod:'cuentas_dinero'},
  {r:'reportes', n:'Reportes',       mod:'reportes_financieros'},
  {r:'impuestos',n:'Impuestos',      mod:'impuestos'},
  {r:'cierre',   n:'Cierre de mes',  mod:'cierre_mes'},
];
const MODULOS_ENCARGADA = ['gastos','cuentas_dinero'];
const puedeVer = r => { const m = MENU.find(x=>x.r===r); return esLider() || MODULOS_ENCARGADA.includes(m.mod); };

function pintarLateral(){
  const svg = k => `<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;
  $('#nav').innerHTML = `
    <a href="#"><svg viewBox="0 0 24 24">${ICON.resumen}</svg>Inicio</a>
    <a href="#"><svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 016 0"/></svg>Ventas<span class="flecha">›</span></a>
    <a href="#"><svg viewBox="0 0 24 24"><path d="M3 5h3l2 10h11l2-7H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="18" cy="19" r="1.3"/></svg>Compras<span class="flecha">›</span></a>
    <a href="#"><svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/></svg>Inventario<span class="flecha">›</span></a>
    <a href="#" class="grupo-activo"><svg viewBox="0 0 24 24"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>Finanzas<span class="flecha">⌄</span></a>
    ${MENU.filter(m=>puedeVer(m.r)).map(m=>`<a href="#${m.r}" class="hijo${E.ruta===m.r?' activo':''}" data-ir="${m.r}">${svg(m.r)}${m.n}</a>`).join('')}`;
  $('#irMovil').innerHTML = MENU.filter(m=>puedeVer(m.r)).map(m=>`<option value="${m.r}"${E.ruta===m.r?' selected':''}>${m.n}</option>`).join('');
  $('#pieNombre').textContent = esLider() ? 'Felipe Alvarez' : 'Rosa Quispe';
  $('#pieRol').textContent = esLider() ? 'Líder · Todas las sedes' : 'Encargada · Tienda TRU';
  $('#pieAvatar').textContent = esLider() ? 'FA' : 'RQ';
  $('#chipSede').innerHTML = (esLider() ? 'Todas las sedes' : 'Tienda TRU') + ' <span aria-hidden="true">⌄</span>';
}

// ---------- Pantalla ----------
const VISTAS = {};
function cabecera({sobre, titulo, bajada, acciones=''}){
  return `<header class="encabezado"><div>
      <p class="etq" style="color:var(--rojo); margin:0">${sobre}</p>
      <h1>${titulo}</h1>${bajada?`<p class="sub">${bajada}</p>`:''}
    </div>${acciones?`<div class="acciones">${acciones}</div>`:''}</header>`;
}
function pestanas(ruta, lista){
  const act = E.tab[ruta] || lista[0][0];
  return `<div class="pestanas" role="tablist">${lista.map(([k,n,extra])=>`<button role="tab" type="button" data-tab="${ruta}:${k}" aria-selected="${k===act}">${n}${extra?` <span class="cuenta-tab">${extra}</span>`:''}</button>`).join('')}</div>`;
}
const tabActual = (ruta, def) => E.tab[ruta] || def;
function sinAcceso(){
  return `${cabecera({sobre:'Finanzas', titulo:'Sin acceso'})}
    <div class="nota-cayla">Tu rol no incluye este módulo. Lo decide el líder en <b>Colaboradores ▸ Roles y accesos</b> (ADR-0161).</div>`;
}
function render(){
  document.body.classList.toggle('ver-fuentes', E.fuentes);
  pintarLateral();
  const v = puedeVer(E.ruta) ? (VISTAS[E.ruta] || (()=>cabecera({sobre:'Finanzas', titulo:'En construcción'})))() : sinAcceso();
  $('#pagina').innerHTML = v;
  $('#pagina').querySelectorAll('.anim-sube').forEach((el,i)=>el.style.setProperty('--i', i));
  notaDemo();
}
function ir(r){ E.ruta = r; location.hash = r; render(); window.scrollTo({top:0}); }

function notaDemo(){
  const n = {
    resumen:'Todo lo de esta pantalla sale de otros módulos: <b>nadie tipea un número aquí</b>. Toca un aviso de «Para decidir».',
    gastos:'Prueba <b>Registrar gasto</b> con factura a crédito: aparece en Cuentas y dinero ▸ Por pagar. En «Egresos de caja» clasifica el depósito de LIM: destraba el cierre de agosto.',
    dinero:'Yape y Plin no son cuentas: caen al banco que dice «A qué cuenta entra cada cobro». Concilia Interbank para destrabar el cierre.',
    reportes:'Cambia de mes y toca cualquier cifra del estado de resultados para ver de qué filas sale.',
    impuestos:'El IGV sale de los comprobantes emitidos y de las facturas de proveedor (mercadería, gastos, activos e insumos).',
    cierre:'Agosto: TRU y AQP ya cerraron. Resuelve lo pendiente de LIM y cierra; el consolidado se habilita cuando cierran todas.',
  }[E.ruta];
  $('#nota').innerHTML = (esLider() ? '' : '<b>Viendo como Rosa (encargada de TRU)</b>, con los módulos Gastos y Cuentas y dinero: solo ve su tienda. ') + (n||'');
}

// ---------- Ventana (ADR-0136) ----------
function ventana(html, {ancho=520, alCerrar}={}){
  cerrarVentana(true);
  const velo = document.createElement('div');
  velo.className = 'velo'; velo.id = 'velo';
  velo.innerHTML = `<div class="hoja" role="dialog" aria-modal="true" style="width:min(${ancho}px,100%)">${html}</div>`;
  document.body.appendChild(velo);
  velo.querySelectorAll('.hoja > *').forEach((el,i)=>el.style.setProperty('--i', i));
  velo.addEventListener('click', e => { if (e.target === velo || e.target.closest('[data-cerrar]')) cerrarVentana(); });
  const primero = velo.querySelector('input, select, textarea, button:not([data-cerrar])'); primero && setTimeout(()=>primero.focus(), 60);
  return velo;
}
function cerrarVentana(inmediato){
  const v = $('#velo'); if (!v) return;
  if (inmediato) { v.remove(); return; }
  v.classList.add('sale'); setTimeout(()=>v.remove(), 220);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarVentana(); });

// ---------- Loader único (ADR-0149) → el aviso sale DESPUÉS ----------
function guardar(texto, hecho){
  const esp = document.createElement('div');
  esp.className = 'espera';
  esp.innerHTML = `<div><svg width="34" height="30" viewBox="0 0 30 26"><path d="M2 5c5 1 9 4 11 9 2-6 7-10 15-12-4 3-7 7-8 12-1 5-4 9-9 10 2-2 3-5 2-8-3 0-7-3-11-11z" fill="none" stroke="var(--rojo)" stroke-width="1.4" stroke-linejoin="round"/></svg>Guardando…</div>`;
  document.body.appendChild(esp);
  hecho && hecho();   // lee los campos de la ventana ANTES de cerrarla
  setTimeout(()=>{ esp.remove(); cerrarVentana(); render(); avisar(texto); }, 650);
}
function avisar(texto){
  const a = document.createElement('div');
  a.className = 'aviso';
  a.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>${texto}</span>`;
  document.body.appendChild(a);
  setTimeout(()=>{ a.style.transition='opacity 220ms'; a.style.opacity='0'; setTimeout(()=>a.remove(), 240); }, 3200);
}

// ---------- Combo Responsable (ADR-0161/0162) ----------
const comboResponsable = () => `<div class="campo"><label for="fResp">Responsable</label>
  <select class="control" id="fResp" style="width:100%">${PERSONAS.filter(p=>esLider()||p!=='Felipe Alvarez').map(p=>`<option${p===responsableDefecto()?' selected':''}>${p}</option>`).join('')}</select></div>`;

// ---------- Gráfico de barras de una sola serie, con hover y etiquetas directas ----------
// Una serie en tinta; el rojo solo marca una pérdida o una semana bajo el mínimo, SIEMPRE con su etiqueta.
function barras(items, {alto=190, umbral=null, umbralTxt='', etiquetaValor=v=>S(v)}={}){
  const W = 640, H = alto, pad = {t:34, r:12, b:46, l:12};
  const vals = items.map(i=>i.v);
  const max = Math.max(0, ...vals, umbral||0), min = Math.min(0, ...vals);
  const y = v => pad.t + (max - v) / (max - min || 1) * (H - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / items.length;
  const barra = (it, i) => {
    const x = pad.l + i*bw + bw*0.2, w = bw*0.6, y0 = y(0), y1 = y(it.v);
    const top = Math.min(y0,y1), h = Math.max(2, Math.abs(y1-y0));
    const malo = it.malo;
    const r = 4;
    // extremo de dato redondeado, anclado a la línea base
    const d = it.v >= 0
      ? `M${x},${y0} V${top+r} q0,-${r} ${r},-${r} h${w-2*r} q${r},0 ${r},${r} V${y0} Z`
      : `M${x},${y0} V${top+h-r} q0,${r} ${r},${r} h${w-2*r} q${r},0 ${r},-${r} V${y0} Z`;
    const ly = it.v >= 0 ? top - 7 : top + h + 14;
    const ly2 = it.v >= 0 ? ly - 14 : ly + 13;
    return `<g class="barra${malo?' mala':''}" tabindex="0" data-tip="${esc(it.tip||'')}">
      <rect x="${pad.l+i*bw}" y="${pad.t-10}" width="${bw}" height="${H-pad.t-pad.b+20}" fill="transparent"/>
      <path d="${d}"/>
      <text x="${x+w/2}" y="${ly}" text-anchor="middle" class="val">${etiquetaValor(it.v)}</text>
      ${malo&&it.maloTxt?`<text x="${x+w/2}" y="${ly2}" text-anchor="middle" class="val">${esc(it.maloTxt)}</text>`:''}
      <text x="${x+w/2}" y="${H-6}" text-anchor="middle" class="eje">${esc(it.n)}</text>
    </g>`;
  };
  return `<div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(items.map(i=>i.n+': '+etiquetaValor(i.v)).join('; '))}">
    <line x1="${pad.l}" x2="${W-pad.r}" y1="${y(0)}" y2="${y(0)}" class="base"/>
    ${umbral!=null?`<line x1="${pad.l}" x2="${W-pad.r}" y1="${y(umbral)}" y2="${y(umbral)}" class="umbral"/>`:''}
    ${items.map(barra).join('')}
  </svg>${umbral!=null?`<p class="leyenda-g"><i></i>${esc(umbralTxt)}</p>`:''}<div class="tip" hidden></div></div>`;
}
document.addEventListener('mouseover', e => {
  const g = e.target.closest('.barra'); const cont = e.target.closest('.grafico');
  if (!cont) return; const tip = cont.querySelector('.tip');
  if (!g || !g.dataset.tip){ tip.hidden = true; return; }
  tip.innerHTML = g.dataset.tip; tip.hidden = false;
  const r = cont.getBoundingClientRect(), b = g.querySelector('path').getBoundingClientRect();
  tip.style.left = Math.min(r.width - 220, Math.max(0, b.left - r.left + b.width/2 - 110)) + 'px';
  tip.style.top = Math.max(0, b.top - r.top - 64) + 'px';
});
document.addEventListener('mouseout', e => { const c = e.target.closest('.grafico'); if (c && !c.contains(e.relatedTarget)) c.querySelector('.tip').hidden = true; });
