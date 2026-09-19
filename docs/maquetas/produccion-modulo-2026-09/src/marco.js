/* ====================================================================
   Marco: estado de interfaz, lateral, animaciones compartidas, avisos
   ==================================================================== */
let ui = {vista:'resumen', rol:'lider', drawer:null, abierto:null, insAbierto:{}, form:{insumo:null,qty:0}, rec:{}, cierre:null,
  nuevoMov:null, nuevoIns:null, nuevoLote:null, no:null, cf:'todos', sel:{}, rc:{}, nuevoComp:null};
const L = () => ui.rol === 'lider';
const REDUCE = () => document.documentElement.classList.contains('reducir') || matchMedia('(prefers-reduced-motion:reduce)').matches;
const ic = (id,c='') => `<svg class="ic ${c}"><use href="#i-${id}"/></svg>`;
const src = (k,t) => `<span class="src ${k}" title="${{hoy:'Existe hoy en la base',deriva:'Se deriva de lo que ya hay, sin tabla nueva',nuevo:'Dato nuevo: hoy no se registra'}[k]}">${t||{hoy:'hoy',deriva:'deriva',nuevo:'nuevo'}[k]}</span>`;

/* ---------- lateral: el módulo padre «Producción» ---------- */
const NAV = [
  {sec:'Decidir', items:[{v:'resumen', t:'Resumen', l:true}]},
  {sec:'Abastecer', items:[{v:'proveedores',t:'Proveedores',l:true},{v:'comprobantes',t:'Comprobantes',l:true},{v:'porpagar',t:'Por pagar',l:true},{v:'recibir',t:'Recibir',l:false}]},
  {sec:'Fabricar', items:[{v:'ordenes',t:'Órdenes',l:false},{v:'insumos',t:'Insumos',l:false}]},
  {sec:'Medir', items:[{v:'eficiencia',t:'Eficiencia del Taller',l:true}]},
];
const VISTAS_COLAB = NAV.flatMap(g=>g.items).filter(i=>!i.l).map(i=>i.v);
function contadores(){
  const bajos = D.insumos.filter(i=>estadoIns(i).c!=='verde').length;
  const venc = D.comps.filter(c=>!c.recibido||true).filter(c=>saldoComp(c)>0 && c.vence && dias(c.vence)<0).length;
  const rec = D.comps.filter(c=>!c.recibido).length;
  const rie = D.ordenes.filter(o=>riesgo(o).tarde>0).length;
  const dec = typeof decisiones==='function' ? decisiones().filter(d=>d.sev>=3).length : 0;
  return {resumen:dec, insumos:bajos, porpagar:venc, recibir:rec, ordenes:rie};
}
const saldoComp = c => totalComp(c) - c.pagado;
function renderLateral(){
  const ct = contadores();
  const item = i => `<button class="it" data-v="${i.v}" ${ui.vista===i.v?'aria-current="page"':''}>${i.t}${ct[i.v]?`<span class="ct ${i.v==='porpagar'||i.v==='resumen'?'r':''}">${ct[i.v]}</span>`:''}</button>`;
  $('#lat').innerHTML = `<div class="logo"><img src="cayla-isotipo.png" alt=""><span>CAYLA</span></div>
    <button class="it est">Inicio</button>${L()?'<button class="it est">Colaboradores</button>':''}<button class="it est">Catálogo</button>
    <div class="grupo"><button class="it" style="cursor:default">${ic('prod')} Producción</button>
      <div class="hijos">${NAV.map(g=>{ const its=g.items.filter(i=>L()||!i.l); return its.length?`<div class="sec">${g.sec}</div>${its.map(item).join('')}`:'' }).join('')}</div></div>
    <button class="it est">Ventas</button><button class="it est">Inventario</button>
    ${L()?`<div class="movido">Compras ya no es un grupo aparte: sus 4 pantallas viven en <b>Abastecer</b>.</div>`:`<div class="movido">Como colaborador del Taller ves lo que operas: recibir, órdenes e insumos. Los montos en soles son del líder.</div>`}`;
}

/* ---------- animación de números, barras y medidor ---------- */
const numCache = {}, barCache = {}, gaugeCache = {};
function tween(el,from,to,fmt,dur=800){
  if(REDUCE()||from===to){el.textContent=fmt(to);return}
  const t0=performance.now();
  (function f(t){const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3); el.textContent=fmt(from+(to-from)*e); if(p<1)requestAnimationFrame(f)})(t0);
}
function post(){
  document.querySelectorAll('[data-num]').forEach(el=>{
    const k=el.dataset.num, v=parseFloat(el.dataset.val), d=+(el.dataset.d||0), pre=el.dataset.pre||'', suf=el.dataset.suf||'';
    const fmt = x => pre==='S/ ' ? (d===0?S0(x):S(x)) : N(x,d)+suf;
    const from = k in numCache ? numCache[k] : v;
    tween(el, from, v, fmt); numCache[k]=v;
  });
  document.querySelectorAll('[data-bar]').forEach(el=>{
    const k=el.dataset.bar, v=Math.max(0,Math.min(1,parseFloat(el.dataset.val)));
    const from = k in barCache ? barCache[k] : 0;
    const eje = el.dataset.eje==='y'?'Y':'X';
    el.style.transform=`scale${eje}(${from})`; barCache[k]=v;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.transform=`scale${eje}(${v})`}));
  });
  document.querySelectorAll('[data-gauge]').forEach(el=>{
    const k=el.dataset.gauge, v=Math.max(0,Math.min(1,parseFloat(el.dataset.val)));
    const from = k in gaugeCache ? gaugeCache[k] : 0;
    el.style.left=(from*100)+'%'; gaugeCache[k]=v;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.left=(v*100)+'%'}));
  });
}
function flip(mutar){
  const antes={};
  document.querySelectorAll('.oc[data-id]').forEach(el=>antes[el.dataset.id]=el.getBoundingClientRect());
  mutar();
  if(REDUCE()) return;
  document.querySelectorAll('.oc[data-id]').forEach(el=>{
    const a=antes[el.dataset.id]; if(!a) return;
    const b=el.getBoundingClientRect(), dx=a.left-b.left, dy=a.top-b.top;
    el.style.animation='none';
    if(Math.abs(dx)+Math.abs(dy)>2) el.animate([{transform:`translate(${dx}px,${dy}px)`,boxShadow:'0 18px 44px -14px rgb(26 26 24/.22)'},{transform:'none'}],{duration:620,easing:'cubic-bezier(.32,.72,.24,1)'});
  });
}
function aviso(html,{sub='',deshacer=null,dur=6}={}){
  const el=document.createElement('div'); el.className='aviso-t'; el.style.setProperty('--dur',dur+'s');
  el.innerHTML=`<span>${html}${sub?`<small>${sub}</small>`:''}</span>${deshacer?'<button class="und" type="button">Deshacer</button>':''}<span class="pg"></span>`;
  $('#avisos').appendChild(el);
  const quitar=()=>{el.classList.add('sale'); setTimeout(()=>el.remove(),280)};
  const t=setTimeout(quitar,dur*1000);
  if(deshacer) el.querySelector('.und').onclick=()=>{clearTimeout(t); deshacer(); quitar();};
}
function trabajando(ms=900){ const h=$('#hilo'); h.classList.add('trab'); setTimeout(()=>h.classList.remove('trab'),ms); }

/* ---------- piezas de vista reutilizables ---------- */
const kpi = (i,dot,lbl,k,val,pre,dt,dc='',fuente='',d=0,suf='') => `<div class="card kpi e" style="--i:${i}">
  <div class="row"><span class="dot ${dot}"></span><span class="lbl">${lbl}</span>${fuente}</div>
  <div class="n" data-num="${k}" data-val="${val}" data-d="${d}" data-pre="${pre}" data-suf="${suf}">${pre==='S/ '?(d===0?S0(val):S(val)):N(val,d)+suf}</div><div class="d ${dc}">${dt}</div></div>`;
const cab = (t,baj,acc='') => `<div class="cab e"><div><div class="lbl muted">Producción</div><h1 class="t">${t}</h1><p class="bajada">${baj}</p></div><div class="acc">${acc}</div></div>`;
const btnPri = (attr,txt,extra='') => `<button class="btn pri ${extra}" ${attr} type="button"><span class="brillo"></span>${txt}</button>`;
const chipPago = c => { const s=saldoComp(c); if(s<=0.005) return '<span class="chip verde">Pagado</span>'; if(c.vence&&dias(c.vence)<0) return '<span class="chip rojo">Vencido</span>';
  if(c.vence&&dias(c.vence)<=7) return '<span class="chip ambar">Vence en '+dias(c.vence)+' d</span>'; return '<span class="chip neutro">Por pagar</span>'; };
const conceptoComp = c => c.lineas.map(l=> l.k==='ins' ? `${N(l.qty,insumo(l.ins).u==='m'?0:0)} ${insumo(l.ins).u} · ${insumo(l.ins).nombre}` : l.desc).join(' · ');
