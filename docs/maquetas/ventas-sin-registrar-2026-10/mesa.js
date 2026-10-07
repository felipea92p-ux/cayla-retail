/* ====================================================================
   MESA · lo común de las variantes de A (2026-10-07)
   Talones a la izquierda (cifras, anillo, filtros, búsqueda, hoja de sugerencias, guardado con sello y pliegue) y, a la derecha, lo
   que cada variante dibuja distinto: cómo se UNE la venta con la prenda real. Cada variante llama a Mesa.iniciar(contenedor, cfg):
     cfg.tres            true si lleva una columna central (el «puente»)
     cfg.pintarPendiente(v, el, cab)  dibuja lo de la derecha para una venta pendiente (el = #elige, cab = el recuadro de la venta)
     cfg.pintarCentro(v, el)          (solo tres) dibuja la columna central
     cfg.redibujar()                  vuelve a trazar los hilos
     cfg.efecto({v,p,forma,talon})    animación propia al guardar (antes de que el talón se pliegue)
   Las reglas de negocio son las de A y las del ERP (ver comun.js).
   ==================================================================== */
(function(){
"use strict";
const {$, $$, soles} = V;
const M = window.Mesa = {};
const st = M.st = {filtro:'pendiente', venc:false, q:'', por:'', sel:null, prenda:null, forma:null, resp:'Pamela Burgos', total0:0};
let cfg = {}, ocupado = false;

M.lista = () => {
  const q = st.q.trim().toLowerCase();
  return V.todas().filter(v => (st.filtro==='todas' || v.estado===st.filtro) && (!st.venc || V.vencida(v)) && (!st.por || v.por===st.por) && (!q || (v.desc+' '+v.por+' '+v.precio).toLowerCase().includes(q))).sort((a,b) => b.vendidoEn - a.vendidoEn);
};
const cuenta = e => V.todas().filter(v => v.estado===e).length;
const actual = () => V.todas().find(x => x.id===st.sel);
M.actual = actual;

/* ── Arranque ─────────────────────────────────────────────────────────────── */
M.iniciar = (c, config) => {
  cfg = config; M.cfg = cfg;
  st.filtro='pendiente'; st.venc=false; st.q=''; st.por=''; st.prenda=null; st.forma=null; st.sel=null; st.total0=V.pendientes().length;
  c.innerHTML = `
  ${cfg.franja ? '<div class="franja sube" id="franja"></div>' : '<div class="cifras casc" id="cifras"></div>'}
  <div class="tarjeta mesa-t sube" style="--i:4">
    <div class="tools">
      <label class="campo">${V.ic('buscar')}<input id="q" type="search" placeholder="Buscar prenda, color, talla, quién vendió o precio" autocomplete="off"></label>
      <label class="combo"><select id="por"><option value="">Todas las colaboradoras</option>${V.vendedoras().map(n=>`<option>${n}</option>`).join('')}</select>${V.ic('abajo')}</label>
    </div>
    <div class="tools2"><div class="pils" id="pils"></div><span class="sp"></span>
      <button class="btn magia" id="b-sug">${V.ic('varita')} Identificar con sugerencias</button>
      <button class="btn" id="b-cerrar">Cerrar la cola de arranque</button></div>
    <p class="pl">Tienda TRU: puedes cerrar su cola de arranque hasta el 15/10 (9 días más).</p>
    <div class="mesa ${cfg.tres?'tres':''}" id="mesa" style="${cfg.cols?`--cols:${cfg.cols}`:''}">
      <svg class="hilos" id="hilos"></svg>
      <section class="col col-t" id="talones" aria-label="Lo que anotó caja"></section>
      <div></div>
      <div class="pd ${cfg.tres?'tres':''}" id="pd" style="${cfg.colsDer?`--cols-der:${cfg.colsDer}`:''}">
        ${cfg.tres?'<section class="col col-c" id="centro" aria-label="La unión"></section><div class="gut2"></div>':''}
        <section class="col col-e" id="elige" aria-label="La prenda real"></section>
      </div>
    </div>
  </div>
  <p class="nota sube" style="--i:6;margin-top:18px">Al regularizar, la venta pasa a la prenda real y el stock queda cuadrado. Pasados 2 días sin regularizar, se le avisa al líder. Las ya resueltas, las de este mes y el anterior.</p>`;
  $('#q').oninput = e => { st.q=e.target.value; M.pintarTalones(); };
  $('#por').onchange = e => { st.por=e.target.value; M.pintarTalones(); };
  $('#b-sug').onclick = abrirSugerencias;
  $('#b-cerrar').onclick = () => V.avisar('Eso es de un líder', 'Cerrar la cola de arranque no está en esta maqueta.');
  ['talones','elige'].forEach(id => $('#'+id).addEventListener('scroll', () => cfg.redibujar && cfg.redibujar(), {passive:true}));
  addEventListener('resize', () => cfg.redibujar && cfg.redibujar());
  M.pintarCifras(true); if (!cfg.franja) pintarAnillo(); M.pintarPils(); M.pintarTalones(true);
  const primero = M.lista()[0];
  if (primero) setTimeout(() => M.elegir(primero.id, {auto:true}), V.reducir()?0:650); else M.pintarElige();
};

/* ── Cifras y anillo ──────────────────────────────────────────────────────── */
M.pintarCifras = inicio => {
  if (cfg.franja) return pintarFranja(inicio);
  const k = V.cifras(), el = $('#cifras');
  if (!el.children.length) el.innerHTML = [['amb','Por regularizar','prendas vendidas sin registrar','pend'],['roj','Vencidas','más de 2 días sin regularizar','venc'],['','Descuento no planificado','se cobró menos que el oficial · este mes','desc'],['','Sobreprecio','se cobró más que el oficial · este mes','sobre']]
    .map(([cl,t,d,key],i)=>`<div class="cif ${cl}" style="--i:${i}"><div class="lbl">${t}</div><div class="v num" data-k="${key}">0</div><p>${d}</p><i class="barra"></i></div>`).join('');
  $$('.cif .v').forEach(n => { const key=n.dataset.k, mon=key==='desc'||key==='sobre'; V.cuenta(n, k[key], {dec:mon?2:0, pref:mon?'S/ ':'', delay:inicio?300:0}); });
  const max = st.total0||1, cs = $$('.cif');
  cs[0].style.setProperty('--k', k.pend/max); cs[1].style.setProperty('--k', k.venc/max); cs[2].style.setProperty('--k', Math.min(1,k.desc/60)); cs[3].style.setProperty('--k', Math.min(1,k.sobre/60));
};

/* ── Franja de avance (reemplaza a las 4 tarjetas y al anillo): lo que falta, lo urgente y el avance, en una línea ── */
function pintarFranja(inicio){
  const k = V.cifras(), hechas = st.total0 - k.pend, el = $('#franja'), mon = n => 'S/ ' + n.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
  if (!el.firstChild) el.innerHTML = `
    <div class="f-prog"><div class="f-top"><b class="num" id="f-pend">0</b><span id="f-txt"></span></div><div class="f-bar"><i id="f-fill"></i></div></div>
    <button class="f-venc" id="f-venc" aria-pressed="false"></button>
    <p class="f-mes" id="f-mes"></p>`;
  V.cuenta($('#f-pend'), k.pend, {delay:inicio?250:0, dur:700});
  $('#f-txt').textContent = k.pend===0 ? 'Todo cuadrado: ya no queda ninguna por identificar' : k.pend===1 ? 'venta por identificar' : 'ventas por identificar';
  setTimeout(() => { $('#f-fill').style.transform = `scaleX(${hechas/(st.total0||1)})`; }, inicio?500:0);
  const fv = $('#f-venc'); fv.style.display = k.venc ? '' : 'none'; fv.setAttribute('aria-pressed', st.venc);
  fv.innerHTML = `<i class="pto"></i><b class="num">${k.venc}</b> ${k.venc===1?'vencida':'vencidas'}${st.venc?' · ver todas':''}`;
  fv.title = 'Más de 2 días sin identificar: ya se le avisó al líder';
  fv.onclick = () => { st.venc = !st.venc; pintarFranja(); M.pintarTalones(); const p = M.lista()[0]; if (p) M.elegir(p.id,{auto:true}); else { st.sel=null; M.pintarElige(); } };
  $('#f-mes').innerHTML = `Este mes: <b class="num">${mon(k.desc)}</b> de descuento · <b class="num">${mon(k.sobre)}</b> de sobreprecio`;
}
function pintarAnillo(){
  const R=34, L=2*Math.PI*R, hechas = st.total0 - V.pendientes().length;
  $('#enc-der').innerHTML = `<div class="anillo sube" style="--i:3"><div style="position:relative"><svg viewBox="0 0 84 84"><circle class="pista" cx="42" cy="42" r="${R}"/><circle class="arco" id="arco" cx="42" cy="42" r="${R}" stroke-dasharray="${L}" stroke-dashoffset="${L}"/></svg><div class="c"><div><span id="an-n">${hechas}</span><small>de ${st.total0}</small></div></div></div><div class="tx"><b id="an-t"></b><span id="an-s"></span></div></div>`;
  M.actualizarAnillo(true);
}
M.actualizarAnillo = inicio => {
  if (cfg.franja) return;
  const hechas = st.total0 - V.pendientes().length, L=2*Math.PI*34, arco=$('#arco'); if(!arco) return;
  setTimeout(()=>{ arco.style.strokeDashoffset = L*(1-hechas/(st.total0||1)); }, inicio?500:0);
  $('#an-n').textContent = hechas;
  $('#an-t').textContent = hechas===st.total0 ? 'Todo cuadrado' : hechas ? 'Vas cuadrando el stock' : 'Nada cuadrado aún';
  $('#an-s').textContent = hechas===st.total0 ? 'Ya no quedan ventas por identificar.' : `Faltan ${st.total0-hechas} por identificar.`;
};
M.pintarPils = () => {
  const n = {pendiente:cuenta('pendiente'), regularizada:cuenta('regularizada'), cerrada:cuenta('cerrada'), todas:V.todas().length};
  $('#pils').innerHTML = [['pendiente','Pendientes'],['regularizada','Regularizadas'],['cerrada','Cerradas'],['todas','Todas']].map(([k,t])=>`<button class="pil" data-f="${k}" aria-pressed="${st.filtro===k}">${t} <span class="n">${n[k]}</span></button>`).join('');
  $$('#pils .pil').forEach(b => b.onclick = () => { st.filtro=b.dataset.f; if (st.venc) { st.venc=false; if (cfg.franja) pintarFranja(); } M.pintarPils(); M.pintarTalones(); const p=M.lista()[0]; if(p) M.elegir(p.id,{auto:true}); else { st.sel=null; M.pintarElige(); } });
};

/* ── Talones ──────────────────────────────────────────────────────────────── */
const chipDe = v => v.estado==='regularizada' ? '<span class="chip ok">Regularizada</span>' : v.estado==='cerrada' ? '<span class="chip cerr">Cerrada sin prenda</span>' : V.vencida(v) ? '<span class="chip venc">Vencida</span>' : '<span class="chip pend">Pendiente</span>';
M.chipDe = chipDe;
M.pintarTalones = inicio => {
  const l = M.lista(), el = $('#talones');
  el.innerHTML = l.length ? l.map((v,i)=>`
    <button class="talon ${inicio?'sube':''}" style="--i:${Math.min(i,9)+5}" data-id="${v.id}" aria-pressed="${st.sel===v.id}">
      ${V.baldosa(v.cat, v.hex)}
      <span class="tx"><b>${v.desc}</b><small>${v.estado==='regularizada'||v.estado==='cerrada' ? v.prendaNombre||'' : `${v.por} · ${V.fechaCorta(v.vendidoEn)} · ${V.hora(v.vendidoEn)}`}</small></span>
      <span class="der"><span class="pr num">${soles(v.precio)}</span>${chipDe(v)}<i class="nub"></i></span>
    </button>`).join('')
    : `<div class="vacio"><b>${st.q.trim() ? `Ninguna venta coincide con «${st.q.trim()}»` : st.filtro==='pendiente' ? 'Nada por regularizar' : 'Nada que mostrar'}</b>${st.filtro==='pendiente' && !st.q ? 'No hay prendas por regularizar en Tienda TRU.' : 'Prueba con otro filtro.'}</div>`;
  $$('.talon', el).forEach(b => b.onclick = () => M.elegir(b.dataset.id));
};

/* ── Elegir una venta ─────────────────────────────────────────────────────── */
M.elegir = (id, {auto=false}={}) => {
  st.sel = id; st.prenda=null; st.forma=null;
  $$('#talones .talon').forEach(b => b.setAttribute('aria-pressed', b.dataset.id===id));
  M.pintarElige();
  if (!auto) $('#pd').classList.add('abierto');
  requestAnimationFrame(() => requestAnimationFrame(() => cfg.redibujar && cfg.redibujar(true)));
};
M.cab = v => `<div class="el-cab"><button class="btn movil-volver" id="b-volver" aria-label="Volver a la lista" style="padding:0;width:36px;height:36px;border-radius:50%">${V.ic('atras')}</button>${V.baldosa(v.cat,v.hex)}<div class="tx"><b>${v.desc}</b><small>Cobrada a ${soles(v.precio)} · ${v.por} · ${V.hace(Math.round((V.AHORA-v.vendidoEn)/60000))}</small></div>${chipDe(v)}</div>`;
M.pintarElige = () => {
  const el = $('#elige'), v = actual(), pd = $('#pd'), centro = $('#centro');
  pd.classList.remove('abierto'); if (centro) centro.innerHTML='';
  if (!v) { el.innerHTML = celebracion(); cfg.redibujar && cfg.redibujar(); return; }
  if (v.estado!=='pendiente') {
    const p = V.catalogo.find(x=>x.id===v.prendaId);
    el.innerHTML = M.cab(v) + `<div class="resumen"><span class="lbl">${v.estado==='cerrada'?'Cerrada sin identificar':'Se identificó como'}</span>${p?V.baldosa(p.cat,p.hex):V.baldosa(v.cat,v.hex)}
      <div><b style="font-size:16px;font-weight:600">${p?`${p.nombre} · ${p.talla} · ${p.color}`:v.prendaNombre}</b><p style="color:var(--t65);font-size:13px;margin-top:2px">${v.estado==='cerrada'?`Motivo: ${v.motivo||'Nadie recuerda cuál era'}. El stock no cambió.`:`${V.textoDif(v.dif??0)} · ${v.forma==='llego_nueva'?'llegó nueva':'perdió la etiqueta'}`}</p></div></div>`;
    $('#b-volver').onclick = () => pd.classList.remove('abierto'); cfg.redibujar && cfg.redibujar(); return;
  }
  cfg.pintarPendiente(v, el, M.cab(v));
  $('#b-volver') && ($('#b-volver').onclick = () => pd.classList.remove('abierto'));
};
function celebracion(){
  const k = V.cifras();
  return `<div class="celebra"><div class="c-ic">${V.visto()}</div><b>Todo cuadrado</b><span>El stock de Tienda TRU ya coincide con lo que caja vendió.</span><span class="num" style="font-size:12.5px">Descuento no planificado ${soles(k.desc)} · Sobreprecio ${soles(k.sobre)}</span></div>`;
}

/* ── Piezas de la derecha que varias variantes comparten ──────────────────── */
M.balanza = (v,p) => {
  const d = V.dif(v,p), a=Math.abs(d), lo=Math.min(v.precio,p.precio)-a*1.4-6, hi=Math.max(v.precio,p.precio)+a*1.4+6, pos = x => ((x-lo)/(hi-lo)*100).toFixed(1);
  const col = d<0 ? 'var(--ambar)' : d>0 ? 'var(--pizarra)' : 'var(--verde)', pOf=pos(p.precio), pCo=pos(v.precio);
  return `<div class="bal"><div class="t"><span><b>${V.textoDif(d)}</b></span><span class="num" style="color:var(--t65)">${d===0?'':(d<0?'Descuento no planificado':'Sobreprecio')}</span></div>
    <div class="pista-b" style="--cd:${col}"><span class="eje"></span><span class="seg-d" style="left:${Math.min(pOf,pCo)}%;width:${Math.max(Math.abs(pCo-pOf),1.2)}%"></span>
      <span class="mk num" style="left:${pOf}%">Oficial ${soles(p.precio)}</span><span class="pt" style="left:${pCo}%"></span><span class="mk cob num" style="left:${pCo}%">Cobrado ${soles(v.precio)}</span></div><div style="height:6px"></div></div>`;
};
M.formasHTML = () => `<div class="formas" id="formas" style="position:relative">${['ya_registrada','llego_nueva'].map(f=>`
  <button class="forma sigue" data-f="${f}" aria-pressed="false">${V.ic(f==='ya_registrada'?'etiqueta':'caja')}<span><b>${V.FORMAS[f].corto}</b><small>${f==='ya_registrada'?'Ya estaba registrada, solo perdió la etiqueta':'Llegó nueva y no se contó en el lote'}</small></span></button>`).join('')}<span class="sigue-t" id="sigue-t" style="right:auto;left:22px">Sigue aquí</span></div>`;
M.finHTML = () => `<div class="fin"><label class="resp"><i class="av">${V.ini(st.resp)}</i><select id="resp"><option>Pamela Burgos</option><option>Diana Palacios</option></select>${V.ic('abajo')}</label><button class="btn pri gde" id="b-ok" disabled title="Elige cómo estaba la prenda">Regularizar</button></div>`;
/* Conecta «cómo estaba», responsable y guardar dentro de `raiz`. `alForma` se llama al elegir cómo estaba. */
M.atarForma = (raiz, {alForma}={}) => {
  const p = V.catalogo.find(x=>x.id===st.prenda);
  const r = $('#resp', raiz); if (r) { r.value = st.resp; r.onchange = e => { st.resp=e.target.value; $('.resp .av', raiz).textContent = V.ini(st.resp); }; }
  $$('.forma', raiz).forEach(b => b.onclick = () => {
    st.forma = b.dataset.f; $$('.forma', raiz).forEach(x => { x.setAttribute('aria-pressed', x===b); x.classList.remove('sigue'); });
    $('#sigue-t', raiz)?.remove();
    const nuevo = st.forma==='ya_registrada' ? p.stock-1 : p.stock;
    const cons = $('#cons', raiz); if (cons) cons.innerHTML = `<div class="cons"><span class="st">Stock de esta prenda: <span>${p.stock}</span> ${V.ic('flecha')} <span>${Math.max(0,nuevo)}</span></span><span>${V.FORMAS[st.forma].c}</span></div>`;
    const ok = $('#b-ok', raiz); ok.disabled=false; ok.title='';
    alForma && alForma();
  });
  $('#b-ok', raiz).onclick = () => M.confirmar($('#b-ok', raiz));
};

/* ── Guardar: efecto propio de la variante, sello, pliegue, cifras, siguiente ── */
M.confirmar = async btn => {
  if (ocupado || !st.forma) return; ocupado = true;
  const v = V.ventas.find(x=>x.id===st.sel), p = V.catalogo.find(x=>x.id===st.prenda), forma = st.forma;
  if (btn) { btn.dataset.cargando=1; btn.innerHTML='<i class="gira"></i> Guardando…'; }
  await V.esperar(650);
  V.regularizar(v.id, p.id, forma);
  const talon = $(`.talon[data-id="${v.id}"]`);
  if (cfg.efecto) await cfg.efecto({v, p, forma, talon});
  if (talon) { const s=document.createElement('span'); s.className='sello'; s.textContent='Regularizada'; talon.appendChild(s); talon.classList.add('hecha'); }
  if (btn) btn.innerHTML = V.visto()+' Listo';
  await V.esperar(1000);
  if (talon) { talon.style.height=talon.offsetHeight+'px'; talon.style.overflow='hidden'; requestAnimationFrame(()=>{ talon.classList.add('sale'); talon.style.height='0px'; talon.style.marginBottom='0px'; talon.style.borderWidth='0'; }); }
  M.pintarCifras(); M.actualizarAnillo(); M.pintarPils();
  V.avisar('Prenda regularizada', `${v.desc} → ${p.nombre}. ${V.textoDif(v.dif)}.`);
  await V.esperar(520);
  M.pintarTalones(); ocupado = false; M.siguiente();
};
M.siguiente = () => { const sig = M.lista().find(x=>x.estado==='pendiente'); if (sig) M.elegir(sig.id,{auto:true}); else { st.sel=null; M.pintarElige(); } };
M.ocupado = () => ocupado;

/* ── Geometría de hilos ───────────────────────────────────────────────────── */
M.punto = (el, lado) => {
  const m = $('#mesa').getBoundingClientRect(), r = el.getBoundingClientRect();
  return lado==='right' ? [r.right-m.left, r.top+r.height/2-m.top] : lado==='left' ? [r.left-m.left, r.top+r.height/2-m.top] : lado==='top' ? [r.left+r.width/2-m.left, r.top-m.top] : [r.left+r.width/2-m.left, r.bottom-m.top];
};
/* Dibuja una curva entre dos puntos y, si `anim`, la «escribe» una vez */
M.curva = (svg, [x1,y1], [x2,y2], clase, anim) => {
  const dx = (x2-x1)*.55, p = document.createElementNS('http://www.w3.org/2000/svg','path');
  p.setAttribute('class', clase); p.setAttribute('d', `M${x1} ${y1} C${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`); svg.appendChild(p);
  if (anim && !V.reducir()) { const L=p.getTotalLength(); p.style.strokeDasharray=L; p.style.strokeDashoffset=L; p.animate([{strokeDashoffset:L},{strokeDashoffset:0}],{duration:620,easing:'cubic-bezier(.32,.72,.24,1)',fill:'forwards'}); }
  return p;
};
M.punta = (svg, [x,y], anim, delay=520) => {
  const d = document.createElementNS('http://www.w3.org/2000/svg','circle'); d.setAttribute('r','4.5'); d.setAttribute('cx',x); d.setAttribute('cy',y); svg.appendChild(d);
  if (anim && !V.reducir()) { d.style.transformOrigin = `${x}px ${y}px`; d.animate([{opacity:0,transform:'scale(0)'},{opacity:1,transform:'scale(1)'}],{duration:300,delay,easing:'cubic-bezier(.32,.72,.24,1)',fill:'both'}); }
  return d;
};
M.movil = () => { const s=$('#hilos'); return !s || getComputedStyle(s).display==='none'; };
M.clamp = (y, colEl) => { const c = colEl.getBoundingClientRect(), m = $('#mesa').getBoundingClientRect(); return Math.max(c.top+14, Math.min(c.bottom-14, y+m.top)) - m.top; };

/* ── Hoja «Identificar con sugerencias» (ADR-0334): casillas SIN marcar ───── */
function abrirSugerencias(){
  const pares = V.pendientes().map(v=>({v,p:V.sugerida(v)})).filter(x=>x.p), marc = new Set(), host = $('#vista');
  const velo = document.createElement('div'); velo.className='velo'; host.appendChild(velo);
  const cerrar = () => { velo.classList.add('cierra'); setTimeout(()=>velo.remove(), V.reducir()?0:230); };
  velo.onclick = e => { if (e.target===velo) cerrar(); };
  velo.innerHTML = `<div class="hoja" role="dialog" aria-label="Identificar con sugerencias"><div class="in">
    <div style="--i:0"><h2>Identificar con sugerencias</h2><p class="sub">${pares.length} ventas tienen una sola prenda posible. Marca solo las que reconozcas.</p></div>
    <div style="--i:1;display:flex;justify-content:space-between;align-items:center"><span class="lbl">Tienda TRU · ${pares.length} pendientes con sugerencia</span><button class="btn" id="b-todas">Marcar todas</button></div>
    <ul class="pares" style="--i:2">${pares.map(({v,p})=>`<li><label class="par" data-id="${v.id}">${V.baldosa(v.cat,v.hex)}<span class="tx"><b>${v.desc}</b><small>cobrada a ${soles(v.precio)} · ${v.por}</small></span><span class="fl">${V.ic('flecha')}</span>${V.baldosa(p.cat,p.hex)}<span class="tx"><b>${p.nombre}</b><small>${p.talla} · ${p.color} · ${V.textoDif(V.dif(v,p)).replace(' que el oficial','')} · hay ${p.stock}</small></span><span class="cb"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;stroke-width:3"><path d="m5 12.5 4.2 4.2L19 7"/></svg></span></label></li>`).join('')}</ul>
    <p class="nota" style="--i:3"><b>Una sola candidata no es certeza.</b> Si la prenda vendida nunca se cargó, la sugerida es OTRA prenda que sigue en la tienda y quedaría con 1 de menos. Se descuenta 1 de cada una del stock.</p>
    <div class="pie" style="--i:4"><button class="btn" id="b-cancel">Cancelar</button><button class="btn pri gde" id="b-ident" disabled>Marca al menos una</button></div></div></div>`;
  const pie = () => { const b=$('#b-ident',velo); b.disabled=!marc.size; b.textContent = marc.size?`Identificar ${marc.size} ${marc.size===1?'venta':'ventas'}`:'Marca al menos una'; $('#b-todas',velo).textContent = marc.size===pares.length?'Desmarcar todas':'Marcar todas'; };
  $$('.par',velo).forEach(l => l.onclick = e => { e.preventDefault(); const id=l.dataset.id; marc.has(id)?marc.delete(id):marc.add(id); l.classList.toggle('on'); pie(); });
  $('#b-todas',velo).onclick = () => { marc.size===pares.length ? marc.clear() : pares.forEach(x=>marc.add(x.v.id)); $$('.par',velo).forEach(l=>l.classList.toggle('on',marc.has(l.dataset.id))); pie(); };
  $('#b-cancel',velo).onclick = cerrar;
  $('#b-ident',velo).onclick = async () => {
    const ids = [...marc]; cerrar(); await V.esperar(260);
    ids.forEach(id => { const x = pares.find(q=>q.v.id===id); V.regularizar(id, x.p.id, 'ya_registrada'); });
    const tal = ids.map(id => $(`.talon[data-id="${id}"]`)).filter(Boolean);
    tal.forEach((t,i) => setTimeout(()=>{ const s=document.createElement('span'); s.className='sello'; s.textContent='Identificada'; t.appendChild(s); }, i*90));
    await V.esperar(tal.length*90+700);
    tal.forEach((t,i) => setTimeout(()=>{ t.style.height=t.offsetHeight+'px'; t.style.overflow='hidden'; requestAnimationFrame(()=>{ t.classList.add('sale'); t.style.height='0px'; t.style.marginBottom='0px'; t.style.borderWidth='0'; }); }, i*70));
    await V.esperar(tal.length*70+500);
    M.pintarCifras(); M.actualizarAnillo(); M.pintarPils(); M.pintarTalones();
    V.avisar(`${ids.length} ventas identificadas`, 'El stock de cada prenda bajó 1.');
    M.siguiente();
  };
}
})();
