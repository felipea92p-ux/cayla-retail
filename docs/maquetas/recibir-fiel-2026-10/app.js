/* Recibir mercadería · prototipo fiel. Cada acción es la misma de hoy (ver README.md): el prototipo no guarda nada, y lo que en el ERP abre
   otra pantalla (Imprimir etiquetas, Bajar al piso, Ver todo lo recibido, + Agregar proveedor) solo lo avisa. */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RED=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- íconos (trazo de lucide) ---------- */
const P={
  sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  mas:'<path d="M12 5v14M5 12h14"/>',menos:'<path d="M5 12h14"/>',ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
  flecha:'<path d="M5 12h14M13 6l6 6-6 6"/>',atras:'<path d="M19 12H5M11 6l-6 6 6 6"/>',abajo:'<path d="M6 9l6 6 6-6"/>',der:'<path d="M9 6l6 6-6 6"/>',
  caja:'<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',abierta:'<path d="M3 9l9 4 9-4M3 9l9-5 9 5v8l-9 4-9-4z"/><path d="M3 9l-1.5 3 9 4L12 13M21 9l1.5 3-9 4"/>',
  camion:'<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  etiqueta:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',piso:'<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M10 20v-6h4v6"/>',
  buscar:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',filtro:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',alerta:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  nota:'<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',camara:'<path d="M4 7h4l2-3h4l2 3h4v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  chispa:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',reabrir:'<path d="M4 4v6h6"/><path d="M20 12A8 8 0 0 0 5.5 7.5L4 10M4 12a8 8 0 0 0 14.5 4.5"/>',
  lista:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.5M3 12h.5M3 18h.5"/>',persona:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  regalo:'<rect x="3" y="8" width="18" height="5"/><path d="M5 13v8h14v-8M12 8v13M12 8C10 4 6 4 7 7s5 1 5 1zM12 8c2-4 6-4 5-1s-5 1-5 1z"/>',
  separar:'<path d="M4 6h7v12H4zM13 6h7v12h-7z"/>',paleta:'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5-1.5-2-1.5-3.5S14 13 15.5 13H18a3 3 0 0 0 3-3c0-4-4-7-9-7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  falda:'<path d="M9 4h6l1 3 4 13H4L8 7z"/><path d="M8 7h8"/>',blusa:'<path d="M8 4l-5 4 2.5 4L8 11v9h8v-9l2.5 1L21 8l-5-4c-.5 1.8-2 3-4 3S8.5 5.8 8 4z"/>',
  pantalon:'<path d="M7 3h10l1 18h-4l-2-10-2 10H6z"/><path d="M7 7h10"/>',casaca:'<path d="M9 3L4 6l-1 14h4l.5-9M15 3l5 3 1 14h-4l-.5-9M9 3h6v18M9 3l3 4 3-4"/>'
};
const ico=(n,c)=>`<svg class="i ${c||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]||''}</svg>`;

/* ---------- datos: el caso que probamos en local (ENV-003035) y su alrededor ---------- */
const SEDE='Tienda Trujillo',CORTA='Trujillo';
const GENTE=[{n:'Micaela Vendedora',i:'MV'},{n:'Lucía Ramos',i:'LR'}];
const MOD={
  ariana:{n:'Falda Ariana',cat:'faldas',cols:[['Rosado','var(--dato-rosado)']],tal:['S','M'],costo:26,precio:64.9},
  renata:{n:'Falda Renata',cat:'faldas',cols:[['Beige','var(--dato-beige)']],tal:['S','M','L'],costo:30,precio:74.9},
  emma:{n:'Blusa Emma',cat:'blusas',cols:[['Negro','var(--dato-negro)',1],['Beige','var(--dato-beige)']],tal:['S','M','L'],costo:32,precio:79.9},
  valentina:{n:'Blusa Valentina',cat:'blusas',cols:[['Verde','var(--dato-verde)']],tal:['S','M','L'],costo:28,precio:69.9},
  carla:{n:'Pantalón Carla',cat:'pantalones',cols:[['Azul','var(--dato-azul)']],tal:['28','30','32'],costo:38,precio:89.9}
};
const CAT={faldas:{n:'Faldas',s:'falda',i:'falda'},blusas:{n:'Blusas',s:'blusa',i:'blusa'},pantalones:{n:'Pantalones',s:'pantalón',i:'pantalon'},casacas:{n:'Casacas',s:'casaca',i:'casaca'}};
const PROVS=[{n:'CAYLA SAC',m:'CAYLA'},{n:'Textiles Andina SAC',m:'CAYLA',fact:[{doc:'F001-88',n:6,f:'25/10'}]},{n:'Confecciones del Sur EIRL',m:'CAYLA'},{n:'Moda Lirio',m:'Lirio'},{n:'Gamarra Tex SAC',m:'Sin marca'},{n:'Perla Textil',m:'Perla'},{n:'Norte Moda',m:'NM'},{n:'Hilos del Sur',m:'Sin marca'}];
const OBS=[['rota','Prenda rota o dañada'],['falta','Prenda faltante'],['mancha','Prenda manchada'],['distinta','Distinta a lo pedido'],['demas','Llegó de más'],['bulto','Bulto o empaque dañado'],['otra','Otra cosa']];
const FALTA=['No vino','Se perdió en el camino','Llegó a otra sede'],SOBRA=['Regalo','Se cobra aparte','Se arregla en la próxima compra','Otro'];

const G=(cat,dij,anot,x)=>Object.assign({cat,marca:'CAYLA',dij,cont:null,anot:anot||[],sep:[],nuevas:0,desc:[],obs:[],causa:null,causaNota:'',extra:false,costoLinea:'',quien:null,abierta:false},x||{});
const S={pant:'portada',id:null,paso:'contar',gi:0,dir:'a',q:'',fEst:[],fProv:'',fFecha:'',pop:null,tab:'por',pag:1,resp:GENTE[0].n,guia:'',nota:'',estreno:true,guardando:{}};
let E=[
  {id:'ENV-002668',estado:'en_camino',env:'27/10 · 17:25',dias:2,prov:'CAYLA SAC',guia:'',oc:'OC-007698',fardos:2,de:'Felipe Alvarez',papel:{foto:false,tipo:'Factura',quien:'Felipe',f:'27/10'},g:[G('faldas',2,[{m:'ariana',n:2}])]},
  {id:'ENV-000249',estado:'en_camino',env:'22/10 · 15:19',dias:7,prov:'CAYLA SAC',guia:'SH-1234',oc:'OC-006120',fardos:3,de:'Felipe Alvarez',papel:{foto:true,tipo:'Factura',quien:'Felipe',f:'22/10'},g:[G('blusas',12,[{m:'valentina',n:12}]),G('pantalones',14,[{m:'carla',n:14}]),G('faldas',10,[{m:'renata',n:10}])]},
  {id:'ENV-002765',estado:'abierto',env:'28/10 · 17:44',dias:1,prov:'Textiles Andina SAC',guia:'T001-000512',oc:'OC-007750',fardos:1,de:'Felipe Alvarez',papel:{foto:false,tipo:'Boleta',quien:'Felipe',f:'28/10'},g:[G('blusas',4,[{m:'emma',n:4}],{cont:2,quien:'Lucía Ramos'})]},
  {id:'OC-007712',tipo:'orden',estado:'sin_guia',env:'—',dias:3,prov:'Confecciones del Sur EIRL',guia:'',oc:'OC-007712',fardos:null,de:'Felipe Alvarez',papel:{foto:false,tipo:'Sin papel',quien:'Felipe',f:'26/10'},g:[G('faldas',4,[{m:'renata',n:4}])]},
  {id:'ENV-001990',estado:'cerrado',cerrado:'20/10',diasCerrado:9,llego:'20/10',prov:'CAYLA SAC',guia:'T001-000301',cerro:'Lucía Ramos',g:[G('blusas',3,[{m:'emma',n:3}],{cont:3,sep:[{m:'emma',n:3,mat:{},dan:{}}]})]},
  {id:'ENV-003035',estado:'terminado',llego:'29/10',term:'29/10',prov:'CAYLA SAC',cerro:'Micaela Vendedora',g:[G('faldas',3,[],{cont:3,sep:[{m:'ariana',n:3,mat:{'Rosado|S':2,'Rosado|M':1},dan:{}}]}),G('blusas',2,[],{cont:2,sep:[{m:'emma',n:2,mat:{'Negro|M':1,'Beige|S':1},dan:{}}]})]},
  {id:'ENV-000875',estado:'terminado',llego:'26/10',term:'27/10',prov:'Textiles Andina SAC',cerro:'Lucía Ramos',g:[G('blusas',4,[],{cont:4,sep:[{m:'valentina',n:4,mat:{'Verde|S':1,'Verde|M':2,'Verde|L':1},dan:{}}]})]}
];
let NUEVO=3100;

/* ---------- cuentas ---------- */
const sum=o=>Object.values(o||{}).reduce((a,b)=>a+(+b||0),0);
const conTallas=s=>sum(s.mat);
const ident=g=>g.sep.reduce((a,s)=>a+s.n,0)+g.desc.reduce((a,d)=>a+d.n,0);
const faltanId=g=>Math.max(0,(g.cont||0)-ident(g));
const vender=g=>g.sep.reduce((a,s)=>a+conTallas(s)-sum(s.dan),0);
const despues=g=>Math.max(0,(g.cont||0)-g.sep.reduce((a,s)=>a+conTallas(s),0));
const dif=g=>g.cont==null?null:g.cont-g.dij;
const T=(e,f)=>e.g.reduce((a,g)=>a+f(g),0);
const dijo=e=>T(e,g=>g.dij),conto=e=>T(e,g=>g.cont||0);
const sinAviso=e=>!!e.sinAviso;
const pendientes=e=>{const p=[];e.g.forEach((g,gi)=>{g.sep.forEach((s,si)=>{const r=s.n-conTallas(s);if(r>0)p.push({t:'detalle',gi,si,n:r,txt:MOD[s.m].n+' · '+r+' sin tallas',sub:'faltan tallas y colores',btn:'Tallas y colores ahora',m:s.m})});
  g.desc.forEach((d,di)=>p.push({t:'crear',gi,di,n:d.n,txt:d.n+' '+(d.n===1?'prenda nueva':'prendas nuevas')+' · '+d.txt,sub:'por crear en el catálogo',btn:'Crear ahora'}));
  const sinSep=Math.max(0,(g.cont||0)-ident(g));if(sinSep>0)p.push({t:'separar',gi,n:sinSep,txt:'Separar '+sinSep+' prendas',sub:CAT[g.cat].n+' · '+g.marca+' · no se sabe qué prendas son',btn:'Hacer ahora'})});return p};
const pendN=e=>pendientes(e).reduce((a,p)=>a+p.n,0);
const env=()=>E.find(e=>e.id===S.id);
const soles=n=>'S/ '+(+n).toFixed(2);

/* ---------- piezas ---------- */
const tile=(m,t,n)=>{const d=MOD[m],c=d.cols[0];return `<span class="prenda ${c[2]?'oscura':''}" data-color-dato style="--c:${c[1]};--t:${t||48}px">${ico(CAT[d.cat].i)}${n?`<span class="n">${n}</span>`:''}</span>`};
const catTile=(c,t,n)=>`<span class="prenda cat" style="--t:${t||48}px">${ico(CAT[c].i)}${n!=null?`<span class="n">${n}</span>`:''}</span>`;
const anillo=(p,cls,centro,k,st)=>`<span class="anillo ${cls||''}" ${k?`data-k="${k}"`:''} style="--p:${Math.max(0,Math.min(100,p))};${st||''}"><svg viewBox="0 0 40 40"><circle class="pista" cx="20" cy="20" r="16" pathLength="100"/><circle class="arco" cx="20" cy="20" r="16" pathLength="100"/></svg><span class="c">${centro||''}</span></span>`;
const chipEstado=e=>({en_camino:'<span class="chip punto">En camino</span>',abierto:'<span class="chip punto ambar">Contando</span>',sin_guia:'<span class="chip tinta">Sin guía</span>',cerrado:'<span class="chip punto">Por terminar</span>',terminado:'<span class="chip punto verde">Recibido</span>'})[e.estado];
const persona=(n)=>{const p=GENTE.find(x=>x.n===n)||GENTE[0];return `<span class="persona-caja"><button class="persona" data-a="quien" aria-expanded="${!!S.quienPop}"><span class="avatar turno">${p.i}</span><span style="flex:1"><b>${p.n}</b><span>De turno en ${CORTA}</span></span>${ico('abajo')}</button>${S.quienPop?`<span class="pop" style="right:0">${GENTE.map(x=>`<button data-a="elegirQuien" data-v="${x.n}" class="${x.n===p.n?'si':''}"><span class="avatar turno">${x.i}</span>${x.n}</button>`).join('')}</span>`:''}</span>`};
const porque=(txt)=>`<span class="porque"><button class="ib" data-a="porque" aria-label="¿Por qué?">${ico('info')}</button><span class="porque-txt">${txt}</span></span>`;
const paso=(val,a,extra,cls)=>`<span class="paso ${cls||''}"><button data-a="${a}" data-d="-1" ${extra} aria-label="Una menos">${ico('menos')}</button><input inputmode="numeric" value="${val}" data-in="${a}" ${extra} aria-label="Cantidad"><button data-a="${a}" data-d="1" ${extra} aria-label="Una más">${ico('mas')}</button></span>`;
const veredicto=g=>{if(g.extra)return g.cont?`<span class="chip punto ambar">${g.cont} que no venían</span>`:'<span class="chip punto">Cuenta y escribe el número</span>';
  if(sinAvisoActual())return g.cont==null?'<span class="chip punto">Cuenta y escribe el número</span>':`<span class="chip punto">${g.cont} contadas</span>`;
  const d=dif(g);if(d==null)return `<span class="chip punto">Dijeron ${g.dij}: cuenta y escribe el número</span>`;
  if(d===0)return `<span class="chip punto verde">Cuadra: llegaron las ${g.dij}</span>`;
  return `<span class="chip punto ambar">${d<0?'Faltan '+(-d):'Sobran '+d}</span><span class="tenue" style="font-size:15px">Puedes seguir: lo explicas al cerrar.</span>`};
const sinAvisoActual=()=>{const e=env();return e&&sinAviso(e)};

/* ---------- motor de pantalla ---------- */
const main=()=>$('#app');
function render(conEstreno){
  if(conEstreno)S.estreno=true;
  const prev={};$$('[data-k]').forEach(el=>prev[el.dataset.k]=el.getAttribute('style'));
  const m=main();m.classList.toggle('estreno',S.estreno);
  m.innerHTML=S.pant==='portada'?portada():pantEnvio();
  $$('[data-k]').forEach(el=>{const p=prev[el.dataset.k],t=el.getAttribute('style');if(p==null||p===t||S.estreno)return;el.setAttribute('style',p);el.getBoundingClientRect();el.setAttribute('style',t)});
  if(S.estreno&&!RED)$$('[data-cuenta]').forEach(el=>cuenta(el,+el.dataset.cuenta));
  S.estreno=false;
}
function cuenta(el,b){const t0=performance.now(),d=700;(function f(t){const k=Math.min(1,(t-t0)/d),e=1-Math.pow(1-k,3);el.textContent=Math.round(b*e);if(k<1)requestAnimationFrame(f)})(t0)}
function ir(pant,id,paso){S.pant=pant;S.id=id||null;if(paso)S.paso=paso;S.gi=0;S.pop=null;window.scrollTo({top:0});render(true)}

/* =========================== PORTADA =========================== */
function filtrar(lst){
  const q=S.q.trim().toLowerCase();
  return lst.filter(e=>(!q||[e.id,e.guia,e.prov,e.oc].join(' ').toLowerCase().includes(q))
    &&(!S.fEst.length||S.fEst.includes(e.estado==='abierto'?'Abierto':'Por abrir'))
    &&(!S.fProv||e.prov===S.fProv)
    &&(!S.fFecha||({Hoy:e.dias===0,Ayer:e.dias===1,'Últimos 7 días':e.dias<=7,'Últimos 30 días':e.dias<=30,'Hace más de una semana':e.dias>7})[S.fFecha]));
}
function portada(){
  const recibir=E.filter(e=>['en_camino','abierto','sin_guia'].includes(e.estado));
  const porT=E.filter(e=>e.estado==='cerrado'),term=E.filter(e=>e.estado==='terminado');
  const nPT=porT.reduce((a,e)=>a+pendN(e),0),viejo=Math.max(0,...porT.map(e=>e.diasCerrado||0));
  const lst=filtrar(recibir);
  const semana=term.reduce((a,e)=>a+conto(e),0);
  let h=`<header class="cab"><div><div class="sede-linea">${SEDE} · jueves 29 de octubre</div><h1>Recibir mercadería</h1><p class="frase">Cuenta por categoría. Qué modelo es, ahora o después.</p></div>
    <div class="cifras cae" style="--i:1">
      <button class="cifra" data-a="irA" data-sec="envios"><span class="n" data-cuenta="${recibir.length}">${recibir.length}</span><span class="t">por recibir</span></button>
      <button class="cifra ${viejo>7?'ambar':''}" data-a="irA" data-sec="recibido" data-tab="por"><span class="n" data-cuenta="${nPT}">${nPT}</span><span class="t">prendas por terminar</span></button>
      <button class="cifra verde" data-a="irA" data-sec="recibido" data-tab="term"><span class="n" data-cuenta="${semana}">${semana}</span><span class="t">llegaron esta semana</span></button></div></header>
  <div class="avisos">
    ${nPT?`<div class="aviso ${viejo>7?'ambar':''} cae" style="--i:2">${ico('etiqueta')}<span><b>${nPT} prendas por terminar</b> · la más antigua, de hace ${viejo} días</span><span class="der">${porque('Ya están contadas y en el almacén, pero no en el sistema: hasta terminarlas no se venden.')}<button class="btn chico" data-a="irA" data-sec="recibido" data-tab="por">Ver</button></span></div>`:''}
    <div class="aviso cae" style="--i:3">${ico('camion')}<span><b>Viene el Traslado TR-0412</b> desde Tienda Lima</span><span class="der">${porque('Los traslados entre sedes no se reciben aquí: se reciben en Traslados.')}<button class="btn chico" data-a="toast" data-t="Abre el traslado en Traslados, como hoy">Abrir en Traslados</button></span></div>
  </div>
  <section class="seccion" id="envios"><div class="sec-cab"><h2>Por recibir</h2><span class="globo ${recibir.length?'pide':''}">${recibir.length}</span><span class="der"><span class="tenue" style="font-size:15px">¿Llegó algo que no está aquí?</span><button class="btn" data-a="sinAviso">${ico('abierta')}Sin aviso</button></span></div>
   ${herramientas(recibir,lst)}${S.dir==='c'?tablero(lst,porT,term):listaEnvios(lst)}</section>`;
  if(S.dir!=='c')h+=recibido(porT,term);
  return h;
}
function herramientas(todos,lst){
  const provs=[...new Set(todos.map(e=>e.prov))];
  const pop=(k,ops,sel,multi)=>S.pop===k?`<div class="pop">${ops.map(o=>`<button data-a="filtro" data-k="${k}" data-v="${o}" class="${(multi?sel.includes(o):sel===o)?'si':''}">${(multi?sel.includes(o):sel===o)?ico('ok'):'<span style="width:20px"></span>'}${o}</button>`).join('')}</div>`:'';
  const algo=S.q||S.fEst.length||S.fProv||S.fFecha;
  return `<div class="herr cae" style="--i:4"><label class="buscador">${ico('buscar')}<input data-in="q" value="${S.q}" placeholder="Envío, guía, proveedor u orden"></label>
    <span class="pild"><button data-a="pop" data-k="est" class="${S.fEst.length?'puesto':''}">${ico('filtro')}${S.fEst.length?S.fEst.join(', '):'Estado'}</button>${pop('est',['Abierto','Por abrir','No puedo abrir yo'],S.fEst,true)}</span>
    <span class="pild"><button data-a="pop" data-k="prov" class="${S.fProv?'puesto':''}">${ico('persona')}${S.fProv||'Proveedor'}</button>${pop('prov',['Todos',...provs],S.fProv||'Todos')}</span>
    <span class="pild"><button data-a="pop" data-k="fecha" class="${S.fFecha?'puesto':''}">${ico('cal')}${S.fFecha||'Fechas'}</button>${pop('fecha',['Hoy','Ayer','Últimos 7 días','Últimos 30 días','Hace más de una semana'],S.fFecha)}</span>
    ${algo?`<button class="btn enlace" data-a="limpiar">Limpiar todo</button>`:''}<span class="cuenta-lista">${algo?`${lst.length} de ${todos.length}`:''}</span></div>`;
}
function accion(e){
  if(e.estado==='abierto')return `<button class="btn primario chico" data-a="abrirEnvio" data-id="${e.id}">Seguir recibiendo${ico('flecha')}</button>`;
  if(e.estado==='sin_guia')return `<button class="btn chico" data-a="sinGuia" data-id="${e.id}">Llegó esta orden</button>`;
  return `<button class="btn chico" data-a="detalle" data-id="${e.id}">Detalle</button>`;
}
const viaje=e=>e.estado==='abierto'?`${conto(e)} de ${dijo(e)} contadas`:e.estado==='sin_guia'?'Llega directo, sin guía':`Salió hace ${e.dias} ${e.dias===1?'día':'días'}${e.fardos?` · ${e.fardos} ${e.fardos===1?'fardo':'fardos'}`:''}`;
function listaEnvios(lst){
  if(!lst.length)return vacioFiltro();
  if(S.dir==='b')return `<div class="lineas">${lst.map((e,i)=>{const w=e.estado==='abierto'?Math.round(conto(e)/dijo(e)*100):Math.min(92,30+e.dias*9);
    return `<div class="lenv cae" style="--i:${i+5}" data-a="abrirEnvio" data-id="${e.id}"><div><div class="num">${e.id}</div><div class="sub">${e.env==='—'?'Llega sin guía':e.env}</div><div style="margin-top:6px">${chipEstado(e)}</div></div>
      <div class="viaje-b" style="--w:${w}%;--c:${e.estado==='abierto'?'var(--ambar)':'var(--pizarra)'}"><span class="via"></span><span class="hecho"></span><span class="cam">${ico(e.estado==='abierto'?'abierta':'camion')}</span><span class="eti">${e.prov}${e.guia?' · '+e.guia:''}</span><span class="eti d">${viaje(e)}</span></div>
      <div class="pila suelta cats-b">${e.g.map(g=>catTile(g.cat,44,g.dij)).join('')}</div><div class="n">${dijo(e)}<small>prendas</small></div><div>${accion(e)}</div></div>`}).join('')}</div>`;
  return `<div class="fardos">${lst.map((e,i)=>`<div class="fardo cae" style="--i:${i+5}" data-a="abrirEnvio" data-id="${e.id}">
      <div class="top"><span class="num">${e.id}</span>${chipEstado(e)}</div><div class="prov">${e.prov}${e.guia?' · guía '+e.guia:''}</div>
      <div class="mid"><div class="pila suelta">${e.g.map(g=>catTile(g.cat,52,g.dij)).join('')}</div><div class="big">${dijo(e)}<small>prendas</small></div></div>
      ${e.estado==='abierto'?`<div class="avance"><i style="--w:${Math.round(conto(e)/dijo(e)*100)}%"></i></div>`:''}
      <div class="pie"><span class="viaje">${ico(e.estado==='abierto'?'abierta':'camion')}${viaje(e)}</span>${accion(e)}</div></div>`).join('')}</div>
    <div class="paginas" style="border:0;padding:12px 4px">Mostrando 1–${lst.length} de ${lst.length}<span>10 por página</span></div>`;
}
const vacioFiltro=()=>`<div class="tarjeta" style="padding:34px;text-align:center;display:grid;gap:12px;justify-items:center">${ico('buscar')}<b style="font-size:19px">Ningún envío ${S.q?`coincide con «${S.q}»`:'cumple los filtros'}</b><button class="btn" data-a="limpiar">Limpiar todo</button></div>`;
function tablero(lst,porT,term){
  const cols=[['Por abrir','caja',lst.filter(e=>e.estado!=='abierto'),e=>accion(e)],['Contando','abierta',lst.filter(e=>e.estado==='abierto'),e=>accion(e)],['Por terminar','etiqueta',porT,e=>`<button class="btn primario chico" data-a="abrirEnvio" data-id="${e.id}">Terminar</button>`],['Recibido','piso',term.slice(0,4),()=>'']];
  return `<div class="tablero">${cols.map(([t,i,l,a],ci)=>`<section class="col cae" style="--i:${ci+5}"><header><span class="ic">${ico(i)}</span><h3>${t}</h3><span class="globo ${l.length&&ci<3?'pide':''}">${ci===2?porT.reduce((x,e)=>x+pendN(e),0):l.length}</span></header>
    ${l.length?l.map(e=>mini(e,a(e),ci)).join(''):`<div class="vacio">${ci===2?'Nada por terminar':'Nada por aquí'}</div>`}
    ${ci===3?`<button class="btn enlace" data-a="toast" data-t="Abre «Ver todo lo recibido», como hoy">Ver todo lo recibido →</button>`:''}</section>`).join('')}</div>`;
}
function mini(e,acc,ci){
  if(ci===2){const p=pendientes(e);return `<div class="mini" data-a="abrirEnvio" data-id="${e.id}"><div class="top"><span class="num">${e.id}</span>${e.diasCerrado>7?`<span class="chip ambar">hace ${e.diasCerrado} días</span>`:'<span class="chip">hoy</span>'}</div><div class="faltas">${faltas(p)}</div><div class="fila"><span class="n">${pendN(e)}</span>${acc}</div></div>`}
  if(ci===3)return `<div class="mini" data-a="verTerminado" data-id="${e.id}"><div class="top"><span class="num">${e.id}</span><span class="tenue" style="font-size:15px">${e.term}</span></div><div class="fila"><div class="pila">${e.g.flatMap(g=>g.sep.map(s=>tile(s.m,36))).join('')}</div><span class="n">${conto(e)}</span></div></div>`;
  return `<div class="mini" data-a="abrirEnvio" data-id="${e.id}"><div class="top"><span class="num">${e.id}</span>${chipEstado(e)}</div><div class="tenue" style="font-size:15px">${e.prov}</div>
    ${e.estado==='abierto'?`<div class="avance"><i style="--w:${Math.round(conto(e)/dijo(e)*100)}%"></i></div>`:''}<div class="fila"><div class="pila">${e.g.map(g=>catTile(g.cat,36)).join('')}</div><span class="n">${dijo(e)}</span></div>${acc}</div>`;
}
const faltas=p=>{const c={detalle:0,separar:0,crear:0};p.forEach(x=>c[x.t]+=x.n);return [c.separar?`<span class="chip">${ico('separar')}${c.separar} por separar</span>`:'',c.detalle?`<span class="chip ambar">${ico('etiqueta')}${c.detalle} por poner tallas</span>`:'',c.crear?`<span class="chip">${ico('chispa')}${c.crear} por crear</span>`:''].join('')};
function recibido(porT,term){
  const por=S.tab==='por'&&porT.length;
  return `<section class="seccion" id="recibido"><div class="sec-cab"><h2>Lo recibido</h2><span class="seg">${porT.length?`<button data-a="tab" data-v="por" aria-pressed="${!!por}">Por terminar <span class="globo pide">${porT.reduce((a,e)=>a+pendN(e),0)}</span></button>`:''}<button data-a="tab" data-v="term" aria-pressed="${!por}">Terminados</button></span>
    <span class="der">${!por?`<button class="btn enlace" data-a="toast" data-t="Abre «Ver todo lo recibido», como hoy">Ver todo lo recibido</button>`:''}</span></div>
    <div class="tarjeta"><div class="filas">${por?porT.map((e,i)=>{const p=pendientes(e);return `<div class="rfila cae" style="--i:${i}" data-a="abrirEnvio" data-id="${e.id}"><div><div class="tenue fecha2" style="font-size:14px">Cerrado</div><b>${e.cerrado}</b> ${e.diasCerrado>7?`<span class="chip ambar">hace ${e.diasCerrado} días</span>`:''}</div>
        <div class="prov2"><div class="num">${e.id}</div><div class="tenue" style="font-size:15px">${e.prov}</div></div><div class="faltas">${faltas(p)}</div><div class="u">${pendN(e)}<small>prendas</small></div><button class="btn primario chico" data-a="abrirEnvio" data-id="${e.id}">Terminar</button></div>`}).join('')
      :term.map((e,i)=>`<div class="rfila cae" style="--i:${i}" data-a="verTerminado" data-id="${e.id}"><div class="fecha2"><div class="tenue" style="font-size:14px">Llegó · terminado</div><b>${e.llego} · ${e.term}</b></div><div class="prov2"><div class="num">${e.id}</div><div class="tenue" style="font-size:15px">${e.prov} · ${e.cerro}</div></div>
        <div class="pila">${e.g.flatMap(g=>g.sep.map(s=>tile(s.m,40))).join('')}</div><div class="u">${conto(e)}<small>${e.g.reduce((a,g)=>a+g.sep.length,0)} prendas</small></div><span>${ico('der')}</span></div>`).join('')}</div>
      <div class="paginas">${por?'Lo más antiguo primero':'Las 50 más recientes'}<span>10 por página</span></div></div></section>`;
}

/* =========================== PÁGINA DEL ENVÍO =========================== */
function pantEnvio(){
  const e=env();if(!e)return '';
  const cabeza=`<div class="env-cab"><button class="redondo" data-a="volver" aria-label="Volver a Recibir mercadería">${ico('atras')}</button><div class="sede-linea">${SEDE} · jueves 29</div></div>
    <div class="env-tit"><div><h1>${e.id}</h1><div class="datos">${e.prov}${e.guia?' · guía '+e.guia:''}${e.oc?' · '+e.oc:''}</div></div>${e.estado==='abierto'?'<span class="chip punto ambar">Contando</span>':chipEstado(e)}</div>`;
  if(e.estado==='en_camino')return cabeza+empezar(e);
  if(e.estado==='abierto')return cabeza+riel(e)+(S.paso==='contar'?contar(e):cerrar(e));
  return cabeza+cerrado(e);
}
function riel(e){
  const ok=e.g.length&&e.g.every(g=>faltanId(g)===0);
  return `<div class="riel" style="--f:${S.paso==='cerrar'?1:0}"><button class="parada ${S.paso==='contar'?'ahora':'hecho'}" data-a="paso" data-v="contar"><span class="o">${S.paso==='cerrar'?ico('ok'):'1'}</span><b>Contar</b><span>${conto(e)} contadas</span></button>
    <button class="parada ${S.paso==='cerrar'?'ahora':''}" data-a="paso" data-v="cerrar" ${ok?'':'disabled'}><span class="o">2</span><b>Cerrar</b><span>Lo que no cuadró</span></button></div>`;
}
function papel(e){
  const a=e.g.flatMap(g=>g.anot.map(x=>({...x,g})));
  return `<aside class="tarjeta papel"><div class="versal">El papel de la compra</div>${e.papel.foto?`<div class="foto con"><b>${e.papel.tipo.toUpperCase()} · ${e.prov}</b>${a.map(x=>`${x.n} × ${MOD[x.m].n} · S/ ${MOD[x.m].costo.toFixed(2)}`).join('<br>')}<br><b>Total S/ ${a.reduce((s,x)=>s+x.n*MOD[x.m].costo,0).toFixed(2)}</b></div>`:`<div class="foto">${ico('camara')}<span>No subió foto</span><button class="btn chico" data-a="toast" data-t="Sube la foto del papel, como hoy">Subir foto</button></div>`}
    <div class="tenue" style="font-size:15px">${e.papel.tipo} · compró ${e.papel.quien} · ${e.papel.f}</div>
    ${a.length?`<div class="versal">Lo que anotó ${e.papel.quien}</div>${a.map(x=>{const s=x.g.sep.find(y=>y.m===x.m),h=s?s.n:0;return `<div class="anot">${tile(x.m,40)}<div style="flex:1"><b>${x.n} · ${MOD[x.m].n}</b><div class="avance ${h>=x.n?'verde':''}" style="margin-top:6px"><i data-k="an-${x.m}" style="--w:${Math.min(100,h/x.n*100)}%"></i></div></div><span class="tenue" style="font-size:15px">${h}/${x.n}</span></div>`}).join('')}`:''}
    <div class="tenue" style="font-size:15px">Cuenta mirando el papel: lo que dice es lo que se pagó.</div></aside>`;
}

/* ---- llegó, sin abrir (página) ---- */
function empezar(e){
  return `<div class="env-grid"><div class="tarjeta entra" style="padding:24px;display:grid;gap:18px">${loQueTrae(e)}
    <div class="campo"><label>Quién recibe</label>${persona(S.resp)}</div>
    <div class="pie-acciones" style="margin:0"><span class="izq tenue" style="font-size:15px">Al empezar, la compra ya no se anula.</span><button class="btn primario grande" data-a="empezar" data-id="${e.id}">${ico('caja')}Empezar a recibir${ico('flecha')}</button></div></div>
    <aside class="tarjeta papel"><h3>¿Llegó algo que no está aquí?</h3><p class="tenue" style="margin:0">Ábrelo sin aviso y cuéntalo igual.</p><button class="btn" data-a="sinAviso">${ico('abierta')}Recibir sin aviso</button><p class="tenue" style="margin:0;font-size:15px">Lo que manda otra sede se recibe en Traslados.</p></aside></div>`;
}
function loQueTrae(e){
  return `<div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span class="versal">Lo que trae</span>${chipEstado(e)}</div>
    <div class="trae">${e.g.map(g=>`<div class="f">${catTile(g.cat,44)}<div><b>${CAT[g.cat].n}</b><div class="tenue" style="font-size:15px">${g.marca} · ${g.anot.map(a=>MOD[a.m].n).join(', ')}</div></div><span class="q">${g.dij}</span></div>`).join('')}</div></div>
   <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">${e.fardos?`<span class="fardos-ic">${Array.from({length:e.fardos},()=>`<span class="prenda cat" style="--t:38px">${ico('caja')}</span>`).join('')}<b style="margin-left:6px">${e.fardos} ${e.fardos===1?'fardo':'fardos'}</b></span>`:''}
   <span style="font-size:17px">Dijeron <b class="serif" style="font-size:30px">${dijo(e)}</b> prendas</span><span class="chip">Sin etiqueta</span></div>`;
}

/* ---- paso 1: contar ---- */
function contar(e){
  const g=e.g[S.gi];
  const aviso=e.reabierto?`<div class="aviso ambar" style="margin-bottom:16px">${ico('reabrir')}<span><b>Reabriste el envío.</b> Corrige lo que haga falta.</span>${porque('Lo que ya entró al stock no se vuelve a contar ni se toca.')}</div>`:'';
  const cats=catsDiv(e)+`
    <div style="display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap"><span class="versal">Quién cuenta</span><span style="max-width:300px;flex:1">${persona(S.resp)}</span>${porque('Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.')}</div>`;
  if(!g)return aviso+`<div class="env-grid"><div>${cats}<div class="tarjeta" style="padding:34px;text-align:center;margin-top:16px;display:grid;gap:12px;justify-items:center">${ico('abierta')}<h3 style="font-size:26px">¿Qué llegó?</h3><p class="tenue" style="margin:0">Agrega la primera categoría y cuéntala.</p><button class="btn primario" data-a="agregarCat">${ico('mas')}Agregar lo que llegó</button></div></div>${papel(e)}</div>`+isla(e);
  return aviso+`<div class="env-grid"><div>${cats}${contador(e,g)}${identificar(e,g)}</div>${papel(e)}</div>`+isla(e);
}
function catsDiv(e){
  return `<div class="cats cae" style="--i:1">${e.g.map((x,i)=>{const p=x.dij?Math.min(100,(x.cont||0)/x.dij*100):(x.cont?100:0),d=dif(x),ok=x.cont!=null&&faltanId(x)===0&&(d===0||sinAviso(e)||x.extra);
      return `<button class="cat ${i===S.gi?'sel':''}" data-a="cat" data-v="${i}">${anillo(p,d>0?'mas':d===0?'ok':'',ico(CAT[x.cat].i),'cat'+i)}<span><b>${CAT[x.cat].n}</b><span>${x.cont==null?'—':x.cont}${x.dij&&!sinAviso(e)?' / '+x.dij:''}${d&&!x.extra&&!sinAviso(e)?` · <span style="color:var(--ambar);font-weight:700">${d>0?'+':''}${d}</span>`:''}</span></span>${ok?`<span class="marca-ok">${ico('ok')}</span>`:''}</button>`}).join('')}
      <button class="cat nueva" data-a="agregarCat">${ico('mas')}${sinAviso(e)?'Agregar lo que llegó':'Agregar categoría'}</button></div>`;
}
/* La guía de foco (ADR-0284): qué sigue en el paso. Solo una pieza a la vez. */
function sigue(e){
  if(S.paso==='cerrar'){const gi=e.g.findIndex(g=>g.cont!=null&&!sinAviso(e)&&(dif(g)!==0||g.extra)&&!g.causa);return gi>-1?'causa'+gi:''}
  const g=e.g[S.gi];if(!g)return '';if(g.cont==null)return 'numero';if(faltanId(g)>0)return 'ident';return '';
}
const marcaSigue='<span class="chip lleno sigue-chip">Sigue aquí</span>';
function visual(g,e){
  const n=g.cont||0,max=Math.max(g.dij,n,1),d=dif(g),cls=d===0?'ok':d>0?'mas':'';
  if(S.dir==='b'){const c=!g.dij||sinAviso(e)?`${n}<small>contadas</small>`:d==null?`${g.dij}<small>dijeron</small>`:d===0?`${ico('ok')}<small>cuadra</small>`:`${Math.abs(d)}<small>${d<0?'faltan':'sobran'}</small>`;
    return `<div class="vis-anillo">${anillo(g.dij?n/g.dij*100:(n?100:0),cls,c,'grande')}<span class="tenue" style="font-size:16px">${g.dij&&!sinAviso(e)?`Van ${n} de ${g.dij}`:''}</span></div>`}
  if(S.dir==='c'){const tot=Math.min(Math.max(g.dij,n),60),s=tot<=12?44:tot>30?20:28;return `<div class="vis-casillas" style="--s:${s}px">${Array.from({length:tot},(_,k)=>`<i class="${k<n?(k>=g.dij&&g.dij?'de-mas':'on '+cls):''}"></i>`).join('')}${Math.max(g.dij,n)>60?`<span class="mas">+${Math.max(g.dij,n)-60}</span>`:''}</div>`}
  return `<div class="vis-barra"><div class="vb-pista"><span class="vb-fill ${cls}" data-k="vb" style="--w:${n/max*100}%"></span>${g.dij&&!sinAviso(e)?`<span class="vb-marca" style="--m:${g.dij/max*100}%"></span>`:''}</div><div class="vb-eti"><span>0</span>${g.dij&&!sinAviso(e)?`<span>dijeron ${g.dij}</span>`:''}</div></div>`;
}
function contador(e,g){
  const sub=[g.marca,e.prov,g.anot.map(a=>MOD[a.m].n).join(', '),g.dij&&!sinAviso(e)?'dijeron '+g.dij:''].filter(Boolean).join(' · ');
  const minimo=0,sv=S.guardando[S.gi];
  const sg=sigue(e)==='numero';return `<div class="tarjeta contador cae ${sg?'sigue':''}" style="--i:2" data-guia="recepcion.numero"><div class="cont-cab">${catTile(g.cat,52)}<div><h2>${CAT[g.cat].n} ${sg?marcaSigue:''}</h2><div class="sub">${sub}</div></div>${g.extra?'<span class="chip ambar">No estaba en la guía</span>':''}
      <span class="guardado ${sv==='ok'?'ok':''}" id="guardado">${sv==='ok'?ico('ok')+'Guardado':sv==='va'?'Guardando…':g.quien?'Contó '+g.quien.split(' ')[0]:''}</span></div>
    <div class="cont-cuerpo"><div class="numero"><button class="redondo" data-a="sumar" data-d="-1" ${(g.cont||0)<=minimo?'disabled':''} aria-label="Una menos">${ico('menos')}</button>
      <input id="numero" inputmode="numeric" value="${g.cont==null?'':g.cont}" placeholder="0" data-in="numero" aria-label="Cuántas ${CAT[g.cat].n.toLowerCase()} llegaron">
      <button class="redondo fuerte" data-a="sumar" data-d="1" aria-label="Una más">${ico('mas')}</button></div>
      <div><div id="visual">${visual(g,e)}</div><div class="atajos"><button class="btn sutil chico" data-a="sumar" data-d="5">+5</button><button class="btn sutil chico" data-a="sumar" data-d="10">+10</button>
        ${g.dij&&!sinAviso(e)?`<button class="btn chico" data-a="poner" data-v="${g.dij}">Llegaron las ${g.dij}</button>`:''}<button class="btn chico" data-a="poner" data-v="0">${g.cont==null?'No llegó nada':'Poner en cero'}</button></div></div></div>
    <div class="veredicto" id="veredicto">${veredicto(g)}</div>
    <div class="obs"><span class="versal">Observaciones</span>${g.obs.length?g.obs.map(o=>`<span class="chip">${o.t}</span>`).join(''):'<span class="tenue" style="font-size:15px">Lo que viste al abrir la caja</span>'}<button class="btn chico" data-a="observacion" style="margin-left:auto">${ico('nota')}Anotar observación</button></div></div>`;
}
function identificar(e,g){
  const f=faltanId(g),cs=CAT[g.cat].n.toLowerCase();
  const anot=g.anot.filter(a=>!g.sep.some(s=>s.m===a.m));
  const sg=sigue(e)==='ident';return `<div class="tarjeta ident cae ${sg?'sigue':''}" style="--i:3" id="ident"><div class="ident-cab"><h3>¿Qué ${cs} son?</h3>${sg?marcaSigue:''}${g.cont?(f?`<span class="chip punto ambar">Faltan ${f} por identificar</span>`:'<span class="chip punto verde">Todas identificadas</span>'):''}${porque('Hasta identificar todas no se puede pasar a «Cerrar». Las tallas y los colores pueden esperar.')}</div>
    ${anot.length?`<div class="anotadas"><span class="tenue" style="font-size:15px">Anotado en la compra:</span>${anot.map(a=>`<button class="anotada" data-a="anotada" data-m="${a.m}">${tile(a.m,36)}+ ${MOD[a.m].n} × ${a.n}</button>`).join('')}</div>`:''}
    <label class="buscador" style="flex:none">${ico('buscar')}<input data-in="busca" value="${S.busca||''}" placeholder="Busca una prenda por su nombre (Ej. ${Object.values(MOD).find(m=>m.cat===g.cat)?.n||'Blusa Emma'})"></label>
    <div id="resultados">${resultados(g)}</div>
    ${g.sep.map((s,si)=>{const ct=conTallas(s),r=s.n-ct;const tl=Object.entries(s.mat).filter(([,v])=>v>0).map(([k,v])=>k.split('|')[1]+'×'+v).join(' · ');
      return `<div class="sep entra">${tile(s.m,52)}<div><b>${MOD[s.m].n}</b><small>${ct?tl+(r?` · ${r} sin tallas`:''):'Sin tallas: quedan para después si no las pones'}</small></div>
      <span class="acc">${ct&&!r?`<span class="chip punto verde">Entra al stock</span> <button class="btn enlace" data-a="tallas" data-si="${si}">Cambiar</button>`:`<button class="btn chico" data-a="tallas" data-si="${si}">${ico('paleta')}Tallas y colores ahora</button>`}</span>
      ${paso(s.n,'sepN',`data-si="${si}"`)}<button class="redondo" style="width:40px;height:40px" data-a="quitarSep" data-si="${si}" aria-label="Quitar">${ico('x')}</button></div>`}).join('')}
    ${g.desc.map((d,di)=>`<div class="sep entra"><span class="prenda cat" style="--t:52px">${ico('chispa')}</span><div><b>${d.txt}</b><small>Nueva · se crea después, con su nombre, tallas y precio</small></div><span class="acc"><span class="chip">Por crear</span> <button class="btn chico" data-a="crear" data-di="${di}">${ico('mas')}Crear ahora</button></span>${paso(d.n,'descN',`data-di="${di}"`)}<button class="redondo" style="width:40px;height:40px" data-a="quitarDesc" data-di="${di}" aria-label="Quitar">${ico('x')}</button></div>`).join('')}
    <div class="sep" style="border-style:dashed"><span class="prenda cat" style="--t:52px">${ico('chispa')}</span><div><b>Nuevas, no están en el catálogo</b><small>Ponles cuántas y descríbelas con un nombre corto</small></div>
      <span class="acc">${g.nuevas?`<span class="chip ambar">Falta describirlas</span> <button class="btn chico" data-a="describir">Describir ahora</button>`:'<span class="chip">Ninguna</span>'}</span>${paso(g.nuevas,'nuevas','')}<span></span></div></div>`;
}
function resultados(g){
  const q=(S.busca||'').trim().toLowerCase();if(q.length<2)return '';
  const r=Object.entries(MOD).filter(([,m])=>m.n.toLowerCase().includes(q)).slice(0,6);
  return `<div class="resultados">${r.map(([k,m])=>`<button data-a="elegir" data-m="${k}">${tile(k,40)}<span style="flex:1"><b>${m.n}</b><br><span class="tenue" style="font-size:14px">${m.tal.length} tallas · ${m.cols.map(c=>c[0]).join(', ')}</span></span><span class="btn chico">Elegir</span></button>`).join('')}
    <button data-a="nuevaTxt">${ico('chispa')}<span>No es ninguna de estas: anotar «${S.busca}» como nueva</span></button></div>`;
}
function isla(e){
  const g=e.g[S.gi],sig=e.g.findIndex((x,i)=>i>S.gi&&(x.cont==null||faltanId(x)>0));
  const bloqueo=e.g.filter(x=>faltanId(x)>0).map(x=>CAT[x.cat].n.toLowerCase());
  const dTot=conto(e)-dijo(e);
  const chip=sinAviso(e)?'<span class="chip">Llegó sin aviso</span>':!e.g.some(x=>x.cont!=null)?'<span class="chip">Todavía no contaste</span>':dTot===0?'<span class="chip punto verde">Cuadra</span>':`<span class="chip punto ambar">${dTot<0?'Faltan '+(-dTot):'Sobran '+dTot}</span>`;
  const btn=sig>-1&&g&&g.cont!=null&&faltanId(g)===0?`<button class="btn primario grande" data-a="cat" data-v="${sig}">Listo, sigue ${CAT[e.g[sig].cat].n}${ico('flecha')}</button>`
    :`<button class="btn primario grande" data-a="paso" data-v="cerrar" ${!e.g.length||bloqueo.length?'disabled':''}>Pasar a cerrar${ico('flecha')}</button>`;
  return `<div class="isla"><button class="redondo" data-a="cat" data-v="${Math.max(0,S.gi-1)}" ${S.gi===0?'disabled':''} aria-label="Categoría anterior">${ico('atras')}</button>
    ${sinAviso(e)?'':`<span class="tot"><span>Dijeron</span><b>${dijo(e)}</b></span>`}<span class="tot"><span>Contadas</span><b>${conto(e)}</b></span>${chip}
    <span class="der">${bloqueo.length?`<span class="motivo">Falta identificar ${bloqueo.join(' y ')}</span>`:''}${btn}</span></div>`;
}

/* ---- paso 2: cerrar ---- */
function cerrar(e){
  const sa=sinAviso(e);
  const tarjetas=e.g.map((g,gi)=>{
    const d=dif(g),v=vender(g),ds=despues(g),f=d<0?-d:0,tot=Math.max(1,(g.cont||0)+f);
    const reasons=[];g.sep.forEach(s=>{const r=s.n-conTallas(s);if(r)reasons.push(`${MOD[s.m].n} · ${r} sin tallas`)});g.desc.forEach(x=>reasons.push(`${x.txt} · por crear`));
    let dif_='';
    if(g.cont==null)dif_=`<div class="dif"><span class="chip punto ambar">Sin contar</span><button class="btn chico" data-a="contarla" data-v="${gi}">Contarla</button></div>`;
    else if(g.extra||(!sa&&d>0)){const n=g.extra?g.cont:d;dif_=`<div class="dif ${sigue(e)==='causa'+gi?'sigue':''}"><span class="chip punto ambar">${g.extra?n+' que no venían':'Sobran '+n}</span><span style="font-weight:600">¿Qué pasó?</span>${sigue(e)==='causa'+gi?marcaSigue:''}${SOBRA.map(o=>`<button class="opc" data-a="causa" data-gi="${gi}" data-v="${o}" aria-pressed="${g.causa===o}">${g.causa===o?ico('ok'):''}${o}</button>`).join('')}
      ${g.causa==='Otro'?`<input class="caja" style="max-width:340px" data-in="causaNota" data-gi="${gi}" value="${g.causaNota}" placeholder="¿Qué pasó exactamente?">`:''}${g.extra&&g.causa!=='Regalo'?`<label class="campo" style="margin-left:auto"><span class="versal" style="font-size:14px">Costo de toda la línea</span><input class="caja" style="width:150px" data-in="costoLinea" data-gi="${gi}" value="${g.costoLinea}" placeholder="S/ 0.00"></label>`:''}${g.causa==='Regalo'?'<span class="tenue" style="font-size:15px">Entra con costo S/ 0.00</span>':''}</div>`}
    else if(!sa&&d<0)dif_=`<div class="dif ${sigue(e)==='causa'+gi?'sigue':''}"><span class="chip punto ambar">Faltan ${f}</span><span style="font-weight:600">¿Qué pasó?</span>${sigue(e)==='causa'+gi?marcaSigue:''}${FALTA.map(o=>`<button class="opc" data-a="causa" data-gi="${gi}" data-v="${o}" aria-pressed="${g.causa===o}">${g.causa===o?ico('ok'):''}${o}</button>`).join('')}</div>`;
    else dif_=`<div class="dif ok"><span class="chip punto verde">${sa?'Sin aviso':'Cuadra'}</span></div>`;
    return `<article class="tarjeta cg cae" style="--i:${gi+1}"><div class="cg-cab">${catTile(g.cat,48)}<div><h3>${CAT[g.cat].n}</h3><div class="tenue" style="font-size:15px">${g.marca}${g.quien?' · contó '+g.quien.split(' ')[0]:''}${g.extra?' · no estaba en la guía':''}</div></div>${cambios(g)}</div>
      <div class="cg-nums"><div class="cg-num"><div class="n">${sa||g.extra?'—':g.dij}</div><div class="t">Dijeron</div></div><div class="cg-num ${g.cont==null?'ambar':''}"><div class="n">${g.cont==null?'—':g.cont}</div><div class="t">Contaste</div></div><div class="cg-num verde"><div class="n">${v}</div><div class="t">Se venden ya</div></div><div class="cg-num"><div class="n">${ds}</div><div class="t">Para después</div></div></div>
      <div class="apilada">${v?`<i class="v" style="--f:${v/tot}"></i>`:''}${ds?`<i class="d" style="--f:${ds/tot}"></i>`:''}${f?`<i class="f" style="--f:${f/tot}"></i>`:''}</div>
      <div class="leyenda"><span><i style="background:var(--verde)"></i>Se venden ya</span><span><i style="background:var(--borde-control)"></i>Para después${reasons.length?': '+reasons.join(' · '):''}</span>${f?`<span><i style="background:var(--ambar)"></i>Faltan</span>`:''}</div>
      ${dif_}
      ${g.sep.length?`<div class="desp"><button class="btn sutil chico" data-a="desplegar" data-gi="${gi}">${ico(g.abierta?'abajo':'der')}Costo y precio de venta</button>${g.abierta?g.sep.map((s,si)=>precioFila(g,gi,s,si)).join(''):''}</div>`:''}</article>`}).join('');
  const D=dijo(e),C=conto(e),rot=sa?0:Math.max(-14,Math.min(14,(D-C)*4));
  const faltan=faltaCierre(e);
  return `<div class="cierre">${tarjetas}
    <div class="tarjeta balanza cae" style="--i:5"><div class="lado"><div class="versal">Dijeron</div><div class="n">${sa?'—':D}</div></div>
      <svg viewBox="0 0 150 90" aria-hidden="true"><path d="M75 26v52M50 82h50" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><g class="brazo" style="--rot:${rot}deg"><path d="M15 26h120" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M15 26l-10 22h20zM135 26l-10 22h20z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></g><circle cx="75" cy="26" r="5" fill="currentColor"/></svg>
      <div class="lado d"><div class="versal">Contaste</div><div class="n">${C}</div></div></div>
    <div class="tarjeta datos-cierre cae" style="--i:6"><label class="campo"><span class="versal" style="font-size:14px">Número de guía</span><input class="caja" data-in="guia" value="${S.guia||e.guia||''}" placeholder="Ej. T001-000342"></label><label class="campo"><span class="versal" style="font-size:14px">Nota · opcional</span><input class="caja" data-in="nota" value="${S.nota}" placeholder="Ej. Llegó en dos bolsas"></label>
      ${sa&&!e.provOk?`<div class="campo" style="grid-column:1/-1"><span class="versal" style="font-size:14px">¿De quién llegó?</span><div style="display:flex;gap:8px;flex-wrap:wrap">${PROVS.slice(0,4).map(p=>`<button class="opc" data-a="provCierre" data-v="${p.n}" aria-pressed="${e.prov===p.n}">${p.n}</button>`).join('')}</div></div>`:''}
      <div class="campo" style="grid-column:1/-1"><span class="versal" style="font-size:14px">Quién cierra el conteo</span><span style="max-width:360px">${persona(S.resp)}</span></div></div></div>
    <div class="isla"><button class="redondo" data-a="paso" data-v="contar" aria-label="Volver a contar">${ico('atras')}</button><span style="font-size:16px"><b>Al cerrar:</b> ${T(e,vender)} se venden ya · ${T(e,despues)} para después</span>
      <span class="der">${faltan.length?`<span class="motivo">Falta: ${faltan.join(', ')}</span>`:''}<button class="btn primario grande" data-a="pedirCerrar" ${faltan.length?'disabled':''}>${ico('ok')}Cerrar el envío · ${C}</button></span></div>`;
}
const cambios=g=>{const c=g.sep.some(s=>s.costoN!=null&&+s.costoN!==MOD[s.m].costo),p=g.sep.some(s=>s.precioN!=null&&+s.precioN!==MOD[s.m].precio);return c||p?`<span class="chip ambar" style="margin-left:auto">${c&&p?'Costo y precio cambiados':c?'Costo cambiado':'Precio de venta cambiado'}</span>`:''};
function precioFila(g,gi,s,si){
  const m=MOD[s.m],c=s.costoN??m.costo,p=s.precioN??m.precio;
  return `<div class="precio entra">${tile(s.m,44)}<div><b>${m.n}</b><div class="tenue" style="font-size:15px">${s.n} unidades · ${m.cols.length} ${m.cols.length===1?'color':'colores'} × ${m.tal.length} tallas</div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><span class="tenue" style="font-size:14px;align-self:center">El precio vale en</span><button class="opc" style="min-height:36px" data-a="donde" data-gi="${gi}" data-si="${si}" data-v="sede" aria-pressed="${s.donde!=='todas'}">Solo ${CORTA}</button><button class="opc" style="min-height:36px" data-a="donde" data-gi="${gi}" data-si="${si}" data-v="todas" aria-pressed="${s.donde==='todas'}">Todas</button></div></div>
    <label class="campo ${+c!==m.costo?'cambiado':''}"><span class="versal" style="font-size:14px">Costo c/u</span><input class="caja" data-in="costoN" data-gi="${gi}" data-si="${si}" value="${(+c).toFixed(2)}"></label>
    <label class="campo ${+p!==m.precio?'cambiado':''}"><span class="versal" style="font-size:14px">Precio de venta</span><input class="caja" data-in="precioN" data-gi="${gi}" data-si="${si}" value="${(+p).toFixed(2)}"></label></div>`;
}
function faltaCierre(e){
  const f=[];e.g.forEach(g=>{if(g.cont==null&&!g.extra)f.push('contar '+CAT[g.cat].n.toLowerCase());const d=dif(g);
    if(!sinAviso(e)&&g.cont!=null&&(d!==0||g.extra)&&!g.causa)f.push('qué pasó con '+CAT[g.cat].n.toLowerCase());
    if(g.causa==='Otro'&&!g.causaNota.trim())f.push('explicar «Otro»');
    if(g.extra&&g.causa&&g.causa!=='Regalo'&&!g.costoLinea)f.push('costo de '+CAT[g.cat].n.toLowerCase())});
  if(sinAviso(e)&&!e.provOk)f.push('de quién llegó');return f;
}

/* ---- envío cerrado ---- */
function cerrado(e){
  const p=pendientes(e),st=T(e,vender),sa=sinAviso(e);
  const chipsSt=e.g.flatMap(g=>g.sep.filter(s=>conTallas(s)).map(s=>`<span class="chip">${tile(s.m,24)}${MOD[s.m].n} ×${conTallas(s)}</span>`)).join('');
  const nocuadro=e.g.filter(g=>g.cont!=null&&(dif(g)!==0||g.extra)&&!sa);
  return `<div class="tarjeta sello-cab entra"><span class="sello">${ico('ok')}</span><div><div class="versal">Envío cerrado · ${SEDE} · ${e.cerrado||'hoy'}</div><h2 style="font-size:36px;margin:4px 0">${conto(e)} ${conto(e)===1?'prenda contada':'prendas contadas'}</h2><div class="tenue">Lo cerró ${e.cerro||S.resp}. El conteo ya es oficial.</div></div></div>
   <div class="cifras4"><div class="cifra cae" style="--i:1"><span class="n" data-cuenta="${sa?0:dijo(e)}">${sa?'—':dijo(e)}</span><span class="t">${sa?'Llegó sin aviso':'Dijeron'}</span></div><div class="cifra cae" style="--i:2"><span class="n" data-cuenta="${conto(e)}">${conto(e)}</span><span class="t">Contaste</span></div>
     <div class="cifra verde cae" style="--i:3"><span class="n" data-cuenta="${st}">${st}</span><span class="t">Ya en el stock</span></div><div class="cifra ${p.length?'ambar':''} cae" style="--i:4"><span class="n" data-cuenta="${pendN(e)}">${pendN(e)}</span><span class="t">Para después</span></div></div>
   ${st?`<section class="tarjeta seccion cae" style="--i:5;padding:20px;display:grid;gap:14px"><div class="sec-cab" style="margin:0"><h2 style="font-size:24px">${st} ${st===1?'prenda ya está':'prendas ya están'} en el stock</h2><span class="chip punto verde">Listas para etiquetar</span></div><div class="faltas">${chipsSt}</div>
     <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primario" data-a="toast" data-t="Abre «Etiquetas de precio» con estas ${st} prendas, como hoy">${ico('etiqueta')}Imprimir ${st} ${st===1?'etiqueta':'etiquetas'} de precio</button><button class="btn" data-a="toast" data-t="Abre «Bajar al piso» con estas prendas, como hoy">${ico('piso')}Bajar al piso</button></div></section>`
     :`<section class="aviso seccion">${ico('caja')}<span><b>Las ${pendN(e)} prendas están guardadas, pero todavía no se pueden vender.</b></span>${p.length?`<span class="der"><button class="btn primario chico" data-a="hacer" data-k="0">${p[0].t==='detalle'?'Ponerles tallas ahora':p[0].t==='crear'?'Crearlas ahora':'Separarlas ahora'}</button></span>`:''}</section>`}
   <section class="tarjeta seccion cae" style="--i:6;padding:20px"><div class="sec-cab" style="margin:0 0 6px"><h2 style="font-size:24px">${p.length?'Para después':'Nada quedó para después'}</h2>${p.length?`<span class="globo pide">${p.length}</span><span class="der"><span class="chip ambar">Avisa en Recibir y en el Inicio</span></span>`:'<span class="der"><span class="chip punto verde">Todo al día</span></span>'}</div>
     ${p.map((x,k)=>`<div class="pend">${x.m?tile(x.m,48):`<span class="prenda cat" style="--t:48px">${ico(x.t==='crear'?'chispa':'separar')}</span>`}<div><b>${x.txt}</b><small>${x.sub}</small></div><button class="btn" data-a="hacer" data-k="${k}">${x.t==='crear'?ico('mas'):''}${x.btn}</button></div>`).join('')}</section>
   ${nocuadro.length?`<section class="tarjeta seccion" style="padding:20px"><h2 style="font-size:24px;margin-bottom:8px">Lo que no cuadró</h2>${nocuadro.map(g=>{const d=g.extra?g.cont:dif(g);return `<div class="pend">${catTile(g.cat,44)}<div><b>${d>0?'+':''}${d} ${CAT[g.cat].n} · ${g.marca}</b><small>${g.causa||'—'} → Compras lo ve</small></div><span></span></div>`}).join('')}<p class="tenue" style="margin:10px 0 0;font-size:15px">La sede dice qué pasó; Compras decide qué pasa con la plata.</p></section>`:''}
   <section class="aviso seccion">${ico('reabrir')}<span><b>¿Encontraste algo más?</b> Reabre, corrige y cierra de nuevo.</span><span class="der">${porque('Lo que ya entró al stock no se toca.')}<button class="btn" data-a="reabrir">${ico('reabrir')}Reabrir el conteo</button></span></section>
   <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap"><button class="btn primario" data-a="volver">${ico('caja')}Recibir otro</button><button class="btn" data-a="toast" data-t="Abre «Ver todo lo recibido», como hoy">${ico('lista')}Ver todo lo recibido</button></div>`;
}

/* =========================== HOJAS =========================== */
let H=null;
function hoja(o){
  cerrarHoja(true);
  const v=document.createElement('div');v.className='velo';
  v.innerHTML=`<div class="hoja" role="dialog" aria-modal="true" style="--ancho:${o.ancho||576}px"></div>`;
  document.body.appendChild(v);H={v,o};pintarHoja(true);
  v.addEventListener('mousedown',ev=>{if(ev.target===v)cerrarHoja()});
}
function pintarHoja(primera){
  if(!H)return;const o=H.o,h=$('.hoja',H.v);h.classList.toggle('quieta',!primera);
  h.innerHTML=`<h2>${o.titulo}</h2>${o.bajada?`<p class="bajada">${typeof o.bajada==='function'?o.bajada():o.bajada}</p>`:''}<div class="cuerpo">${o.cuerpo()}</div><div class="pie-acciones">${o.pie()}</div>${o.x?`<button class="redondo x" data-a="cerrarHoja" aria-label="Cerrar">${ico('x')}</button>`:''}`;
}
function cerrarHoja(ya){if(!H)return;const v=H.v;H=null;if(ya||RED){v.remove();return}$('.hoja',v).classList.add('sale');v.style.transition='opacity .22s';v.style.opacity=0;setTimeout(()=>v.remove(),220)}
const btnCancelar=t=>`<button class="btn" data-a="cerrarHoja">${t||'Cancelar'}</button>`;

/* ---- hoja «Envío ENV-…» (Detalle) ---- */
function hojaDetalle(e){hoja({titulo:'Envío '+e.id,bajada:`Lo despachó ${e.de} · ${e.env}${e.guia?' · guía '+e.guia:''} · ${e.oc}`,ancho:576,
  cuerpo:()=>loQueTrae(e)+`<div class="campo"><label class="versal" style="font-size:14px">Quién recibe</label>${persona(S.resp)}</div>`,
  pie:()=>`<span class="izq tenue" style="font-size:15px">Al empezar, la compra ya no se anula.</span>${btnCancelar('Cerrar')}<button class="btn primario" data-a="empezar" data-id="${e.id}">${ico('caja')}Empezar a recibir${ico('flecha')}</button>`})}
/* ---- hoja «Recibir OC sin guía» ---- */
function hojaSinGuia(e){hoja({titulo:`Recibir ${e.oc} sin guía`,bajada:`${e.prov} · ${dijo(e)} prendas por llegar a ${SEDE}.`,
  cuerpo:()=>`<div class="aviso">${ico('caja')}<span>Se arma un envío con lo que falta llegar y queda abierto para contar.</span>${porque('Desde ese momento la orden ya no se puede anular.')}</div><div class="campo"><label class="versal" style="font-size:14px">Quién recibe</label>${persona(S.resp)}</div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="empezarSinGuia" data-id="${e.id}">Empezar a recibir${ico('flecha')}</button>`})}
/* ---- hoja «Sin aviso» ---- */
let SA={q:'',prov:null,guia:''};
function hojaSinAviso(){SA={q:'',prov:null,guia:''};hoja({titulo:'¿Llegó algo que no está en la lista?',bajada:'Dime de quién es y se cuenta igual, por categoría.',ancho:620,x:true,
  cuerpo:()=>{const q=SA.q.toLowerCase(),lst=PROVS.filter(p=>!q||(p.n+' '+p.m).toLowerCase().includes(q)),ver=lst.slice(0,6),pf=PROVS.find(p=>p.n===SA.prov);
    return `<div class="campo"><label class="versal" style="font-size:14px">¿De quién es?</label><label class="buscador" style="flex:none">${ico('buscar')}<input data-in="saQ" value="${SA.q}" placeholder="Nombre, marca o RUC"></label></div>
     <div class="tarjetas-opc">${ver.map(p=>`<button class="topc" data-a="saProv" data-v="${p.n}" aria-pressed="${SA.prov===p.n}"><span class="prenda cat" style="--t:40px">${ico('caja')}</span><span style="flex:1"><b>${p.n}</b><span>${p.m}</span></span>${SA.prov===p.n?ico('ok'):''}</button>`).join('')}
      ${lst.length>6?`<span class="tenue" style="font-size:15px">Escribe para encontrar a los demás (${lst.length-6} más).</span>`:''}
      <button class="topc punteada" data-a="saProv" data-v="?" aria-pressed="${SA.prov==='?'}"><span class="prenda cat" style="--t:40px">${ico('info')}</span><span style="flex:1"><b>No sé de quién es</b><span>Se cuenta igual; antes de cerrar, elígelo.</span></span>${SA.prov==='?'?ico('ok'):''}</button></div>
     <span class="tenue" style="font-size:15px">¿No está? <button class="btn enlace" data-a="toast" data-t="Abre «Agregar proveedor», como hoy">+ Agregar proveedor</button></span>
     ${pf&&pf.fact?`<div class="aviso ambar">${ico('nota')}<span>Tiene una factura pendiente aquí.</span><span class="der"><button class="btn chico" data-a="toast" data-t="Abre la recepción contra la ${pf.fact[0].doc}, como hoy">Sí, viene con la ${pf.fact[0].doc} · ${pf.fact[0].n} prendas</button></span></div>`:''}
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><label class="campo"><span class="versal" style="font-size:14px">Número de guía · opcional</span><input class="caja" data-in="saGuia" value="${SA.guia}" placeholder="Ej. T001-000342"></label><div class="campo"><span class="versal" style="font-size:14px">Quién recibe</span>${persona(S.resp)}</div></div>`},
  pie:()=>`<span class="izq tenue" style="font-size:15px">Lo de otra sede se recibe en Traslados.</span><button class="btn primario" data-a="saEmpezar" ${SA.prov?'':'disabled'}>${ico('abierta')}${PROVS.find(p=>p.n===SA.prov)?.fact?'No, recibir sin factura y contar':'Empezar a contar'}${ico('flecha')}</button>`})}
/* ---- hoja «Quién» ---- */
function hojaQuien(){hoja({titulo:'¿Quién está?',bajada:'De turno hoy en '+CORTA+'.',ancho:448,x:true,cuerpo:()=>`<div class="tarjetas-opc">${GENTE.map(p=>`<button class="topc" data-a="elegirQuien" data-v="${p.n}" aria-pressed="${S.resp===p.n}"><span class="avatar turno">${p.i}</span><span style="flex:1"><b>${p.n}</b><span>Marcó su entrada</span></span>${S.resp===p.n?ico('ok'):''}</button>`).join('')}</div>`,pie:()=>''})}
/* ---- hoja «Tallas y colores» ---- */
let HT=null;
function hojaTallas(gi,si,modo){
  const e=env(),g=e.g[gi],s=g.sep[si],m=MOD[s.m];HT={gi,si,mat:{...s.mat},dan:{...s.dan},verDan:sum(s.dan)>0,arreglo:s.arreglo||null,modo};
  const max=modo==='meter'?s.n:s.n;
  hoja({titulo:'Tallas y colores · '+m.n,bajada:()=>`Contaste ${s.n}. Reparte cuántas llegaron de cada talla y color.`,ancho:720,
   cuerpo:()=>{const t=sum(HT.mat);
    return `<div class="anot">${tile(s.m,52)}<div style="flex:1"><b style="font-size:18px">${m.n}</b><div class="tenue" style="font-size:15px">${m.cols.length*m.tal.length} combinaciones de talla y color</div></div><button class="btn chico" data-a="toast" data-t="Abre «Sumar tallas o colores», como hoy">${ico('mas')}Talla o color</button><button class="btn chico" data-a="toast" data-t="Abre «Es nueva / Ya la tengo», como hoy">Cambiar</button></div>
     ${matriz(m,HT.mat,'celda')}
     <div class="alcanza"><span>Pusiste <b>${t}</b> de ${max}</span><div class="avance ${t===max?'verde':''}"><i data-k="ht" style="--w:${Math.min(100,t/max*100)}%;animation:none"></i></div>${t>max?`<span class="chip ambar">Al guardar, lo contado pasa a ${t}</span>`:t===max?'<span class="chip punto verde">Listo</span>':`<span class="chip">Faltan ${max-t}</span>`}</div>
     <button class="btn sutil chico" style="justify-self:start" data-a="verDan">${ico(HT.verDan?'abajo':'der')}¿Llegó algo dañado?</button>
     ${HT.verDan?`<div class="tarjeta" style="padding:14px;display:grid;gap:12px"><span class="versal">¿Cuántas llegaron dañadas?</span>${matriz(m,HT.dan,'dan')}<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span style="font-weight:600">¿Tienen arreglo?</span><button class="opc" data-a="arreglo" data-v="si" aria-pressed="${HT.arreglo==='si'}">Sí, tienen arreglo</button><button class="opc" data-a="arreglo" data-v="no" aria-pressed="${HT.arreglo==='no'}">No tienen arreglo</button>${porque('Las dañadas no se venden: quedan en cuarentena hasta decidir.')}</div></div>`:''}
     ${modo==='meter'?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><label class="campo"><span class="versal" style="font-size:14px">Costo c/u</span><input class="caja" value="${m.costo.toFixed(2)}"></label><label class="campo"><span class="versal" style="font-size:14px">Precio de venta</span><input class="caja" value="${m.precio.toFixed(2)}"></label></div>`:''}`},
   pie:()=>`${btnCancelar('Dejar para después')}<button class="btn primario" data-a="guardarTallas" ${sum(HT.mat)===0?'disabled':''}>${modo==='meter'?ico('caja')+'Meter al stock':'Listo'}</button>`});
}
function matriz(m,o,tipo){
  return `<table class="matriz"><thead><tr><th>Color</th>${m.tal.map(t=>`<th>${t}</th>`).join('')}<th>Total</th></tr></thead><tbody>${m.cols.map(([c,hex])=>`<tr><td><span class="col-color" data-color-dato><i style="--c:${hex}"></i>${c}</span></td>${m.tal.map(t=>`<td>${paso(o[c+'|'+t]||0,'celda',`data-c="${c}|${t}" data-tipo="${tipo}"`,'celda')}</td>`).join('')}<td class="tot">${m.tal.reduce((a,t)=>a+(o[c+'|'+t]||0),0)}</td></tr>`).join('')}</tbody></table>`;
}
/* ---- hoja «Anotar observación» ---- */
let OB={t:null,txt:''};
function hojaObs(){OB={t:null,txt:''};hoja({titulo:'Anotar observación',bajada:'Lo que viste al abrir la caja. No cambia lo contado.',ancho:620,
  cuerpo:()=>`<div class="rejilla-tipos">${OBS.map(([k,t])=>`<button class="topc" data-a="obsTipo" data-v="${k}" aria-pressed="${OB.t===k}"><span style="flex:1"><b>${t}</b></span>${OB.t===k?ico('ok'):''}</button>`).join('')}</div>
    <label class="campo"><span class="versal" style="font-size:14px">Qué viste</span><textarea class="caja" data-in="obsTxt" maxlength="300" placeholder="${OB.t==='rota'?'Ej. 1 blusa con el cierre roto':OB.t==='bulto'?'Ej. El fardo llegó mojado':'Ej. Lo que viste'}">${OB.txt}</textarea></label>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="obsGuardar" ${OB.t?'':'disabled'}>Guardar observación</button>`})}
/* ---- hoja «Agregar categoría» ---- */
let AC={c:null,m:'Sin marca'};
function hojaAgregar(){const e=env();AC={c:null,m:'Sin marca'};hoja({titulo:sinAviso(e)?'¿Qué llegó?':'Algo que no estaba en la guía',ancho:576,
  cuerpo:()=>`<div class="campo"><span class="versal" style="font-size:14px">Qué llegó</span><div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(CAT).map(([k,c])=>`<button class="opc" data-a="acCat" data-v="${k}" aria-pressed="${AC.c===k}" ${e.g.some(g=>g.cat===k&&g.marca===AC.m)?'disabled':''}>${ico(c.i)}${c.n}</button>`).join('')}</div></div>
    <div class="campo"><span class="versal" style="font-size:14px">La marca</span><div style="display:flex;gap:8px;flex-wrap:wrap">${['Sin marca','CAYLA'].map(k=>`<button class="opc" data-a="acMarca" data-v="${k}" aria-pressed="${AC.m===k}">${k}</button>`).join('')}</div></div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="acGuardar" ${AC.c?'':'disabled'}>${ico('mas')}Agregar y contar</button>`})}
/* ---- hoja «Describir lo nuevo» ---- */
let DN={txt:'',n:1};
function hojaDescribir(){const g=env().g[S.gi];DN={txt:'',n:g.nuevas};hoja({titulo:'Describir lo nuevo',bajada:`De ${g.nuevas} nuevas.`,ancho:520,
  cuerpo:()=>`<label class="campo"><span class="versal" style="font-size:14px">¿Qué son?</span><input class="caja" data-in="dnTxt" value="${DN.txt}" placeholder="Nombre, color, tallas (Ej. ${CAT[g.cat].s} lino azul S-M)"></label><div class="campo"><span class="versal" style="font-size:14px">¿Cuántas son?</span>${paso(DN.n,'dnN','')}</div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="dnGuardar">Guardar lo que son</button>`})}
/* ---- hoja «Crear la prenda que llegó» (resumida) ---- */
function hojaCrear(gi,di){const e=env(),g=e.g[gi],d=g.desc[di];const CP={n:d.txt.split(' ').slice(0,2).join(' ')};hoja({titulo:'Crear la prenda que llegó',bajada:'Nombre, tallas, color y precio. Un líder la revisa después.',ancho:576,
  cuerpo:()=>`<label class="campo"><span class="versal" style="font-size:14px">Nombre de la prenda</span><input class="caja" value="${CP.n}"></label><div class="campo"><span class="versal" style="font-size:14px">Tallas</span><div style="display:flex;gap:8px">${['S','M','L'].map(t=>`<span class="opc" aria-pressed="true">${t}</span>`).join('')}</div></div>
    <div class="campo"><span class="versal" style="font-size:14px">Color</span><div style="display:flex;gap:8px"><span class="opc" aria-pressed="true" data-color-dato><i style="width:16px;height:16px;border-radius:5px;background:var(--dato-azul)"></i>Azul</span></div></div><label class="campo"><span class="versal" style="font-size:14px">Precio de venta</span><input class="caja" value="69.90"></label>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="crearOk" data-gi="${gi}" data-di="${di}">Crear y contar</button>`})}
/* ---- hoja «Reabrir» ---- */
let RA='';
function hojaReabrir(){RA='';hoja({titulo:'Reabrir el conteo',bajada:'Lo que ya entró al stock no se toca.',ancho:520,
  cuerpo:()=>`<label class="campo"><span class="versal" style="font-size:14px">¿Por qué lo reabres?</span><input class="caja" data-in="raTxt" value="${RA}" placeholder="Ej. Apareció una falda en otra bolsa"></label><div class="campo"><span class="versal" style="font-size:14px">Quién lo reabre</span>${persona(S.resp)}</div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="raOk" ${RA.trim().length>=3?'':'disabled'}>${ico('reabrir')}Reabrir</button>`})}
/* ---- hoja «Vas a cambiar costos y precios» ---- */
function hojaConfirmar(e){const l=e.g.flatMap(g=>g.sep).filter(s=>(s.costoN!=null&&+s.costoN!==MOD[s.m].costo)||(s.precioN!=null&&+s.precioN!==MOD[s.m].precio));
  hoja({titulo:'Vas a cambiar costos y precios',ancho:576,cuerpo:()=>`${l.map(s=>{const m=MOD[s.m];return `<div class="anot">${tile(s.m,40)}<div><b>${m.n}</b><div style="font-size:16px">${s.costoN!=null&&+s.costoN!==m.costo?`Costo ${soles(m.costo)} → <b>${soles(s.costoN)}</b><br>`:''}${s.precioN!=null&&+s.precioN!==m.precio?`Precio ${soles(m.precio)} → <b>${soles(s.precioN)}</b> (${s.donde==='todas'?'todas las sedes':'solo '+CORTA})`:''}</div></div></div>`}).join('')}
    <div class="aviso ambar">${ico('alerta')}<span><b>Es dinero.</b> El precio rige desde ahora.</span>${porque('El costo cambia lo que cuesta lo que entra en este envío. El precio de venta rige desde ahora en donde lo elegiste.')}</div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="cerrarYa">Confirmar y cerrar</button>`})}
/* ---- hoja de un envío terminado ---- */
let TE={};
function hojaTerminado(e){TE={};hoja({titulo:e.id,bajada:`Llegó el ${e.llego} · terminado el ${e.term} · ${e.prov} · recibió ${e.cerro}`,ancho:640,x:true,
  cuerpo:()=>e.g.flatMap(g=>g.sep).map((s,i)=>`<div class="tarjeta" style="padding:12px 14px"><button class="anot" style="width:100%;border:0;background:none;padding:0;text-align:left" data-a="teAbrir" data-v="${i}">${tile(s.m,44)}<b style="flex:1">${MOD[s.m].n}</b><span class="serif" style="font-size:30px">${s.n}</span>${ico(TE[i]?'abajo':'der')}</button>${TE[i]?matrizLectura(MOD[s.m],s.mat):''}</div>`).join('')+`<div class="tenue">${conto(e)} unidades en total</div>`,
  pie:()=>''})}
const matrizLectura=(m,o)=>`<table class="matriz" style="margin-top:8px"><thead><tr><th>Color</th>${m.tal.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${m.cols.map(([c,hex])=>`<tr><td><span class="col-color" data-color-dato><i style="--c:${hex}"></i>${c}</span></td>${m.tal.map(t=>`<td class="tot">${o[c+'|'+t]||'·'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/* =========================== ACCIONES =========================== */
function toast(t,sub){const x=document.createElement('div');x.className='toast';x.innerHTML=`${ico('ok')}<span><b>${t}</b>${sub?`<span class="tenue">${sub}</span>`:''}</span>`;document.body.appendChild(x);requestAnimationFrame(()=>x.classList.add('ver'));setTimeout(()=>{x.classList.remove('ver');setTimeout(()=>x.remove(),400)},2800)}
function guardarSolo(gi){S.guardando[gi]='va';const el=$('#guardado');if(el){el.className='guardado';el.textContent='Guardando…'}clearTimeout(guardarSolo['t'+gi]);guardarSolo['t'+gi]=setTimeout(()=>{S.guardando[gi]='ok';const g=env()?.g[gi];if(g)g.quien=S.resp;const el2=$('#guardado');if(el2&&S.gi===gi){el2.className='guardado ok';el2.innerHTML=ico('ok')+'Guardado'}},700)}
function flota(btn,txt){if(RED||!btn)return;const r=btn.getBoundingClientRect(),f=document.createElement('span');f.className='flota';f.textContent=txt;f.style.left=r.left+r.width/2+'px';f.style.top=r.top-6+'px';document.body.appendChild(f);setTimeout(()=>f.remove(),720)}
function ponerCont(n,btn){const e=env(),g=e.g[S.gi];const minimo=g.sep.reduce((a,s)=>a+conTallas(s),0);const v=Math.max(minimo,n);const d=v-(g.cont||0);g.cont=v;if(btn&&d>0)flota(btn,'+'+d);guardarSolo(S.gi);render()}
function separar(m,cuantas,btn){const e=env(),g=e.g[S.gi];let s=g.sep.find(x=>x.m===m);if(!s){s={m,n:0,mat:{},dan:{}};g.sep.push(s)}s.n+=cuantas;
  const id=ident(g);if(id>(g.cont||0)){g.cont=id;toast(`Se agregaron ${cuantas} «${MOD[m].n}»`,`El conteo ahora es ${id}.`)}guardarSolo(S.gi);render()}
const A={
  porque:b=>b.parentElement.classList.toggle('abierto'),
  dir:b=>{S.dir=b.dataset.v;try{localStorage.setItem('recibir-dir',S.dir)}catch(_){}$$('.dirs button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.v===S.dir));render(true)},
  tema:()=>{const r=document.documentElement,o=r.dataset.tema==='oscuro';if(o)delete r.dataset.tema;else r.dataset.tema='oscuro';pintaTema()},
  toast:b=>toast(b.dataset.t),
  irA:b=>{if(b.dataset.tab)S.tab=b.dataset.tab;if(S.dir==='c'){$('#envios')?.scrollIntoView({behavior:'smooth'});return}render();$('#'+b.dataset.sec)?.scrollIntoView({behavior:RED?'auto':'smooth',block:'start'})},
  pop:b=>{S.pop=S.pop===b.dataset.k?null:b.dataset.k;render()},
  filtro:b=>{const k=b.dataset.k,v=b.dataset.v;if(k==='est'){S.fEst=S.fEst.includes(v)?S.fEst.filter(x=>x!==v):[...S.fEst,v];render();return}if(k==='prov')S.fProv=v==='Todos'?'':v;if(k==='fecha')S.fFecha=S.fFecha===v?'':v;S.pop=null;render()},
  limpiar:()=>{S.q='';S.fEst=[];S.fProv='';S.fFecha='';S.pop=null;render()},
  tab:b=>{S.tab=b.dataset.v;render()},
  abrirEnvio:b=>{const e=E.find(x=>x.id===b.dataset.id);if(e.estado==='sin_guia'){hojaSinGuia(e);return}S.paso='contar';ir('envio',e.id)},
  detalle:b=>hojaDetalle(E.find(x=>x.id===b.dataset.id)),
  sinGuia:b=>hojaSinGuia(E.find(x=>x.id===b.dataset.id)),
  verTerminado:b=>hojaTerminado(E.find(x=>x.id===b.dataset.id)),
  teAbrir:b=>{TE[b.dataset.v]=!TE[b.dataset.v];pintarHoja()},
  quien:()=>{S.quienPop=!S.quienPop;H?pintarHoja():render()},
  elegirQuien:b=>{S.resp=b.dataset.v;S.quienPop=false;H?pintarHoja():render()},
  cerrarHoja:()=>cerrarHoja(),
  empezar:b=>{const e=E.find(x=>x.id===b.dataset.id);e.estado='abierto';cerrarHoja(true);toast(e.id+' abierto','Cuenta lo que llegó.');S.paso='contar';ir('envio',e.id)},
  empezarSinGuia:b=>{const e=E.find(x=>x.id===b.dataset.id);e.id='ENV-00'+(NUEVO++);e.estado='abierto';e.env='hoy';e.dias=0;cerrarHoja(true);toast(e.id+' abierto','Cuenta lo que llegó.');ir('envio',e.id,'contar')},
  sinAviso:()=>hojaSinAviso(),
  saProv:b=>{SA.prov=b.dataset.v;pintarHoja()},
  saEmpezar:()=>{const id='ENV-00'+(NUEVO++);E.unshift({id,estado:'abierto',sinAviso:true,provOk:SA.prov!=='?',env:'hoy',dias:0,prov:SA.prov==='?'?'Por confirmar':SA.prov,guia:SA.guia,oc:'',fardos:null,de:'—',papel:{foto:false,tipo:'Sin papel',quien:'—',f:'hoy'},g:[]});cerrarHoja(true);toast(id+' abierto','Llegó sin aviso: cuéntalo por categoría.');ir('envio',id,'contar')},
  volver:()=>ir('portada'),
  paso:b=>{if(b.disabled)return;S.paso=b.dataset.v;window.scrollTo({top:0,behavior:RED?'auto':'smooth'});render(true)},
  cat:b=>{if(b.disabled)return;S.gi=+b.dataset.v;S.busca='';render()},
  sumar:b=>{const g=env().g[S.gi];ponerCont((g.cont||0)+(+b.dataset.d),b)},
  poner:b=>ponerCont(+b.dataset.v,b),
  anotada:b=>{const g=env().g[S.gi],a=g.anot.find(x=>x.m===b.dataset.m);separar(a.m,a.n,b)},
  elegir:b=>{S.busca='';separar(b.dataset.m,1,b)},
  nuevaTxt:()=>{const g=env().g[S.gi];g.desc.push({txt:S.busca,n:1});S.busca='';if(ident(g)>(g.cont||0))g.cont=ident(g);guardarSolo(S.gi);render()},
  sepN:b=>{const g=env().g[S.gi],s=g.sep[+b.dataset.si];s.n=Math.max(Math.max(1,conTallas(s)),s.n+(+b.dataset.d));if(ident(g)>(g.cont||0)){g.cont=ident(g);toast('Separaste más de lo que contaste',`El conteo pasó a ${g.cont}.`)}guardarSolo(S.gi);render()},
  descN:b=>{const g=env().g[S.gi],d=g.desc[+b.dataset.di];d.n=Math.max(1,d.n+(+b.dataset.d));if(ident(g)>(g.cont||0))g.cont=ident(g);render()},
  quitarSep:b=>{const g=env().g[S.gi];g.sep.splice(+b.dataset.si,1);guardarSolo(S.gi);render()},
  quitarDesc:b=>{env().g[S.gi].desc.splice(+b.dataset.di,1);render()},
  nuevas:b=>{const g=env().g[S.gi];g.nuevas=Math.max(0,g.nuevas+(+b.dataset.d));render()},
  describir:()=>hojaDescribir(),
  dnN:b=>{DN.n=Math.max(1,Math.min(env().g[S.gi].nuevas,DN.n+(+b.dataset.d)));pintarHoja()},
  dnGuardar:()=>{if(DN.txt.trim().length<3){toast('Escribe al menos 3 letras');return}const g=env().g[S.gi];g.desc.push({txt:DN.txt.trim(),n:DN.n});g.nuevas-=DN.n;if(ident(g)>(g.cont||0))g.cont=ident(g);cerrarHoja();render()},
  crear:b=>hojaCrear(S.gi,+b.dataset.di),
  crearOk:b=>{const gi=+b.dataset.gi,di=+b.dataset.di,e=env(),g=e.g[gi],d=g.desc[di];MOD.nuevaX={n:d.txt.split(' ').slice(0,2).map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),cat:g.cat,cols:[['Azul','var(--dato-azul)']],tal:['S','M','L'],costo:30,precio:69.9};
    g.desc.splice(di,1);g.sep.push({m:'nuevaX',n:d.n,mat:{},dan:{}});cerrarHoja(true);toast(MOD.nuevaX.n+' creada','Ya puedes contarla. Un líder la revisa después.');
    if(e.estado==='abierto'){render();hojaTallas(gi,g.sep.length-1)}else{render();hojaTallas(gi,g.sep.length-1,'meter')}},
  tallas:b=>hojaTallas(S.gi,+b.dataset.si),
  celda:b=>{const o=b.dataset.tipo==='dan'?HT.dan:HT.mat,k=b.dataset.c;o[k]=Math.max(0,(o[k]||0)+(+b.dataset.d));pintarHoja()},
  verDan:()=>{HT.verDan=!HT.verDan;pintarHoja()},
  arreglo:b=>{HT.arreglo=b.dataset.v;pintarHoja()},
  guardarTallas:()=>{const e=env(),g=e.g[HT.gi],s=g.sep[HT.si],t=sum(HT.mat);s.mat=HT.mat;s.dan=HT.dan;s.arreglo=HT.arreglo;if(t>s.n){s.n=t;if(ident(g)>(g.cont||0))g.cont=ident(g)}
    const meter=HT.modo==='meter';cerrarHoja();
    if(meter){toast(`${t} prendas entraron al stock`,pendN(e)?pendN(e)+' quedaron para después':'');if(!pendN(e)){e.estado='terminado';e.term='29/10';e.llego=e.llego||'29/10'}render(true)}else{guardarSolo(HT.gi);render()}},
  observacion:()=>hojaObs(),
  obsTipo:b=>{OB.t=b.dataset.v;pintarHoja()},
  obsGuardar:()=>{env().g[S.gi].obs.push({t:OBS.find(o=>o[0]===OB.t)[1],txt:OB.txt});cerrarHoja();toast('Observación guardada');render()},
  agregarCat:()=>hojaAgregar(),
  acCat:b=>{AC.c=b.dataset.v;pintarHoja()},acMarca:b=>{AC.m=b.dataset.v;pintarHoja()},
  acGuardar:()=>{const e=env();e.g.push(G(AC.c,0,[],{marca:AC.m,extra:!sinAviso(e)}));S.gi=e.g.length-1;cerrarHoja();render()},
  contarla:b=>{S.paso='contar';S.gi=+b.dataset.v;render(true)},
  causa:b=>{const g=env().g[+b.dataset.gi];g.causa=b.dataset.v;render()},
  desplegar:b=>{const g=env().g[+b.dataset.gi];g.abierta=!g.abierta;render()},
  donde:b=>{const s=env().g[+b.dataset.gi].sep[+b.dataset.si];s.donde=b.dataset.v;render()},
  provCierre:b=>{const e=env();e.prov=b.dataset.v;e.provOk=true;render()},
  pedirCerrar:b=>{if(b.disabled)return;const e=env();const hay=e.g.flatMap(g=>g.sep).some(s=>(s.costoN!=null&&+s.costoN!==MOD[s.m].costo)||(s.precioN!=null&&+s.precioN!==MOD[s.m].precio));if(hay){hojaConfirmar(e);return}A.cerrarYa()},
  cerrarYa:()=>{const e=env();cerrarHoja(true);e.estado='cerrado';e.cerrado='hoy';e.diasCerrado=0;e.cerro=S.resp;e.llego='29/10';if(!pendN(e)){e.estado='terminado';e.term='29/10'}
    toast(e.id+' cerrado',`${T(e,vender)} entraron al stock; ${pendN(e)} quedan para después.`);window.scrollTo({top:0});render(true)},
  hacer:b=>{const e=env(),p=pendientes(e)[+b.dataset.k];if(!p)return;S.gi=p.gi;if(p.t==='detalle')hojaTallas(p.gi,p.si,'meter');else if(p.t==='crear')hojaCrear(p.gi,p.di);else toast('Abre «Separar» como hoy')},
  reabrir:()=>hojaReabrir(),
  raOk:()=>{const e=env();e.estado='abierto';e.reabierto=true;cerrarHoja(true);toast(e.id+' reabierto');ir('envio',e.id,'contar')}
};
const IN={
  q:v=>{S.q=v;const p=document.activeElement.selectionStart;render();const i=$('[data-in="q"]');i.focus();i.setSelectionRange(p,p)},
  numero:(v)=>{const e=env(),g=e.g[S.gi];const n=v.replace(/\D/g,'');g.cont=n===''?null:+n;guardarSolo(S.gi);
    $('#visual').innerHTML=visual(g,e);$('#veredicto').innerHTML=veredicto(g);$('.isla').outerHTML=isla(e);$('.cats').outerHTML=catsDiv(e).replace('cats cae','cats');const st=$('.contador');if(st)st.classList.toggle('sigue',sigue(e)==='numero');
    const id=$('#ident');if(id){const tmp=document.createElement('div');tmp.innerHTML=identificar(e,g);id.replaceWith(tmp.firstElementChild)}},
  busca:v=>{S.busca=v;$('#resultados').innerHTML=resultados(env().g[S.gi])},
  sepN:(v,el)=>{const s=env().g[S.gi].sep[+el.dataset.si];const n=+v.replace(/\D/g,'');if(n>0)s.n=Math.max(conTallas(s),n)},
  nuevas:v=>{env().g[S.gi].nuevas=+v.replace(/\D/g,'')||0},
  celda:(v,el)=>{const o=el.dataset.tipo==='dan'?HT.dan:HT.mat;o[el.dataset.c]=+v.replace(/\D/g,'')||0},
  causaNota:(v,el)=>{env().g[+el.dataset.gi].causaNota=v},
  costoLinea:(v,el)=>{env().g[+el.dataset.gi].costoLinea=v},
  costoN:(v,el)=>{env().g[+el.dataset.gi].sep[+el.dataset.si].costoN=v},
  precioN:(v,el)=>{env().g[+el.dataset.gi].sep[+el.dataset.si].precioN=v},
  guia:v=>{S.guia=v},nota:v=>{S.nota=v},
  saQ:v=>{SA.q=v;const p=document.activeElement.selectionStart;pintarHoja();const i=$('[data-in="saQ"]');i.focus();i.setSelectionRange(p,p)},saGuia:v=>{SA.guia=v},
  obsTxt:v=>{OB.txt=v},dnTxt:v=>{DN.txt=v},raTxt:v=>{RA=v;const b=$('[data-a="raOk"]');if(b)b.disabled=v.trim().length<3}
};
document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-a]');
  if(S.pop&&!ev.target.closest('.pild')){S.pop=null;if(!b){render();return}}
  if(S.quienPop&&!ev.target.closest('.persona-caja')){S.quienPop=false;if(!b){H?pintarHoja():render();return}}
  if(!b)return;if(b.disabled)return;
  if(b.classList.contains('btn')&&!RED){const r=b.getBoundingClientRect(),o=document.createElement('span'),s=Math.max(r.width,r.height)*2;o.className='onda';o.style.cssText=`width:${s}px;height:${s}px;left:${ev.clientX-r.left-s/2}px;top:${ev.clientY-r.top-s/2}px`;b.appendChild(o);setTimeout(()=>o.remove(),560)}
  const f=A[b.dataset.a];if(f){if(b.tagName!=='BUTTON'||b.closest('[data-a]')===b)f(b,ev)}
});
document.addEventListener('input',ev=>{const el=ev.target.closest('[data-in]');if(!el)return;const f=IN[el.dataset.in];if(f)f(el.value,el)});
document.addEventListener('change',ev=>{const el=ev.target.closest('[data-in]');if(!el)return;if(['sepN','nuevas','celda','costoN','precioN'].includes(el.dataset.in)){if(el.dataset.in==='celda')pintarHoja();else render()}});
document.addEventListener('focusin',ev=>{if(ev.target.id==='numero')ev.target.select()});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if(S.pop){S.pop=null;render();return}if(H)cerrarHoja()}if(ev.key==='Enter'&&ev.target.id==='numero')ev.target.blur()});

function pintaTema(){const o=document.documentElement.dataset.tema==='oscuro';$('.tema').innerHTML=ico(o?'sol':'luna');try{localStorage.setItem('cayla-tema',o?'oscuro':'claro')}catch(_){}}
try{if(localStorage.getItem('cayla-tema')==='oscuro')document.documentElement.dataset.tema='oscuro';const d=new URLSearchParams(location.search).get('dir')||localStorage.getItem('recibir-dir');if(d)S.dir=d}catch(_){}
document.addEventListener('DOMContentLoaded',()=>{$$('.dirs button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.v===S.dir));pintaTema();render(true)});
})();
