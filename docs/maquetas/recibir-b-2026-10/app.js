/* Recibir mercadería · B v2 (2026-10-29). Las MISMAS funciones y los mismos toques de hoy (ver ../recibir-fiel-2026-10/README.md),
   dibujadas con componentes nuevos que se proponen al sistema (componentes.html). No guarda nada: lo que en el ERP abre otra
   pantalla solo se avisa. Si la página no tiene #app (componentes.html), `RB.demo` repinta las muestras. */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RED=matchMedia('(prefers-reduced-motion: reduce)').matches;

const P={
  sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  mas:'<path d="M12 5v14M5 12h14"/>',menos:'<path d="M5 12h14"/>',ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
  flecha:'<path d="M5 12h14M13 6l6 6-6 6"/>',atras:'<path d="M19 12H5M11 6l-6 6 6 6"/>',abajo:'<path d="M6 9l6 6 6-6"/>',der:'<path d="M9 6l6 6-6 6"/>',
  caja:'<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',abierta:'<path d="M3 9l9 4 9-4M3 9l9-5 9 5v8l-9 4-9-4z"/><path d="M3 9l-1.5 3 9 4L12 13M21 9l1.5 3-9 4"/>',
  vacia:'<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M9 11l6 6M15 11l-6 6"/>',
  camion:'<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  etiqueta:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',piso:'<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M10 20v-6h4v6"/>',
  pin:'<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  buscar:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',filtro:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',alerta:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  nota:'<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',camara:'<path d="M4 7h4l2-3h4l2 3h4v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  chispa:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',reabrir:'<path d="M4 4v6h6"/><path d="M20 12A8 8 0 0 0 5.5 7.5L4 10M4 12a8 8 0 0 0 14.5 4.5"/>',
  lista:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.5M3 12h.5M3 18h.5"/>',persona:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  regalo:'<rect x="3" y="8" width="18" height="5"/><path d="M5 13v8h14v-8M12 8v13M12 8C10 4 6 4 7 7s5 1 5 1zM12 8c2-4 6-4 5-1s-5 1-5 1z"/>',
  moneda:'<circle cx="12" cy="12" r="9"/><path d="M14.5 9c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.3 0 3 6 1.5 6 4.4 0 1.3-1.3 2.3-3 2.3-1.2 0-2.3-.6-2.8-1.6M12 6v1.5M12 16.5V18"/>',
  separar:'<path d="M4 6h7v12H4zM13 6h7v12h-7z"/>',paleta:'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5-1.5-2-1.5-3.5S14 13 15.5 13H18a3 3 0 0 0 3-3c0-4-4-7-9-7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  mano:'<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1.3-5.5-3.6L3.6 14.5a1.5 1.5 0 0 1 2.5-1.7L8 15"/>',
  falda:'<path d="M9 4h6l1 3 4 13H4L8 7z"/><path d="M8 7h8"/>',blusa:'<path d="M8 4l-5 4 2.5 4L8 11v9h8v-9l2.5 1L21 8l-5-4c-.5 1.8-2 3-4 3S8.5 5.8 8 4z"/>',
  pantalon:'<path d="M7 3h10l1 18h-4l-2-10-2 10H6z"/><path d="M7 7h10"/>',casaca:'<path d="M9 3L4 6l-1 14h4l.5-9M15 3l5 3 1 14h-4l-.5-9M9 3h6v18M9 3l3 4 3-4"/>'
};
const ico=(n,c)=>`<svg class="i ${c||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]||''}</svg>`;

/* ---------- datos (el caso de local: ENV-003035 y su alrededor) ---------- */
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
const PROVS=[{n:'CAYLA SAC',m:'CAYLA'},{n:'Textiles Andina SAC',m:'CAYLA',fact:[{doc:'F001-88',n:6}]},{n:'Confecciones del Sur EIRL',m:'CAYLA'},{n:'Moda Lirio',m:'Lirio'},{n:'Gamarra Tex SAC',m:'Sin marca'},{n:'Perla Textil',m:'Perla'},{n:'Norte Moda',m:'NM'},{n:'Hilos del Sur',m:'Sin marca'}];
const OBS=[['rota','Prenda rota o dañada'],['falta','Prenda faltante'],['mancha','Prenda manchada'],['distinta','Distinta a lo pedido'],['demas','Llegó de más'],['bulto','Bulto o empaque dañado'],['otra','Otra cosa']];
const FALTA=[['No vino','vacia'],['Se perdió en el camino','camion'],['Llegó a otra sede','pin']];
const SOBRA=[['Regalo','regalo'],['Se cobra aparte','moneda'],['Se arregla en la próxima compra','reabrir'],['Otro','nota']];

const G=(cat,dij,anot,x)=>Object.assign({cat,marca:'CAYLA',dij,cont:null,anot:anot||[],sep:[],nuevas:0,desc:[],obs:[],causa:null,causaNota:'',extra:false,costoLinea:'',quien:null},x||{});
const S={pant:'portada',id:null,paso:'contar',gi:0,q:'',fEst:[],fProv:'',fFecha:'',pop:null,tab:'por',resp:GENTE[0].n,guia:'',nota:'',estreno:true,guardando:{},hechos:{}};
let E=[
  {id:'ENV-002668',estado:'en_camino',env:'27/10 · 17:25',dias:2,prov:'CAYLA SAC',guia:'',oc:'OC-007698',fardos:2,de:'Felipe Alvarez',papel:{foto:false,tipo:'Factura',quien:'Felipe',f:'27/10'},g:[G('faldas',2,[{m:'ariana',n:2}])]},
  {id:'ENV-000249',estado:'en_camino',env:'22/10 · 15:19',dias:7,prov:'CAYLA SAC',guia:'SH-1234',oc:'OC-006120',fardos:3,de:'Felipe Alvarez',papel:{foto:true,tipo:'Factura',quien:'Felipe',f:'22/10'},g:[G('blusas',12,[{m:'valentina',n:12}]),G('pantalones',14,[{m:'carla',n:14}]),G('faldas',10,[{m:'renata',n:10}])]},
  {id:'ENV-002765',estado:'abierto',env:'28/10 · 17:44',dias:1,prov:'Textiles Andina SAC',guia:'T001-000512',oc:'OC-007750',fardos:1,de:'Felipe Alvarez',papel:{foto:false,tipo:'Boleta',quien:'Felipe',f:'28/10'},g:[G('blusas',4,[{m:'emma',n:4}],{cont:2,quien:'Lucía Ramos'})]},
  {id:'OC-007712',estado:'sin_guia',env:'—',dias:3,prov:'Confecciones del Sur EIRL',guia:'',oc:'OC-007712',fardos:null,de:'Felipe Alvarez',papel:{foto:false,tipo:'Sin papel',quien:'Felipe',f:'26/10'},g:[G('faldas',4,[{m:'renata',n:4}])]},
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
const sinAviso=e=>!!(e&&e.sinAviso);
const pendientes=e=>{const p=[];e.g.forEach((g,gi)=>{g.sep.forEach((s,si)=>{const r=s.n-conTallas(s);if(r>0)p.push({t:'detalle',gi,si,n:r,txt:MOD[s.m].n+' · '+r+' sin tallas',sub:'faltan tallas y colores',btn:'Tallas y colores ahora',m:s.m})});
  g.desc.forEach((d,di)=>p.push({t:'crear',gi,di,n:d.n,txt:d.n+' '+(d.n===1?'prenda nueva':'prendas nuevas')+' · '+d.txt,sub:'por crear en el catálogo',btn:'Crear ahora'}));
  const sinSep=Math.max(0,(g.cont||0)-ident(g));if(sinSep>0)p.push({t:'separar',gi,n:sinSep,txt:'Separar '+sinSep+' prendas',sub:CAT[g.cat].n+' · no se sabe qué prendas son',btn:'Hacer ahora'})});return p};
const pendN=e=>pendientes(e).reduce((a,p)=>a+p.n,0);
const env=()=>E.find(e=>e.id===S.id);
const soles=n=>'S/ '+(+n).toFixed(2);
const pl=(n,s,p)=>n+' '+(n===1?s:p);

/* ---------- piezas pequeñas ---------- */
const tile=(m,t,n,fly)=>{const d=MOD[m],c=d.cols[0];return `<span class="prenda ${c[2]?'oscura':''}" ${fly?`data-fly="${m}"`:''} data-color-dato style="--c:${c[1]};--t:${t||48}px">${ico(CAT[d.cat].i)}${n?`<span class="n">${n}</span>`:''}</span>`};
const catTile=(c,t,n)=>`<span class="prenda cat" style="--t:${t||48}px">${ico(CAT[c].i)}${n!=null?`<span class="n">${n}</span>`:''}</span>`;
const anillo=(p,cls,centro,k,st)=>{const v=Math.max(0,Math.min(100,p));return `<span class="anillo ${cls||''}" style="--p:${v};${st||''}"><svg viewBox="0 0 40 40"><circle class="pista" cx="20" cy="20" r="16" pathLength="100"/><circle class="arco" ${k?`data-k="${k}"`:''} cx="20" cy="20" r="16" pathLength="100" style="stroke-dashoffset:${100-v};${v<=0?'opacity:0':''}"/></svg><span class="c">${centro||''}</span></span>`};
const odo=(n,key)=>{const s=String(n);return `<span class="odo">${s.split('').map((v,i)=>`<span class="dg"><span class="tr" data-k="${key}-${s.length}-${i}" style="transform:translateY(-${v*1.15}em)">${[0,1,2,3,4,5,6,7,8,9].map(x=>`<span>${x}</span>`).join('')}</span></span>`).join('')}</span>`};
const persona=n=>{const p=GENTE.find(x=>x.n===n)||GENTE[0];return `<span class="persona-caja"><button class="persona" data-a="quien" aria-expanded="${!!S.quienPop}"><span class="avatar turno">${p.i}</span><span style="flex:1"><b>${p.n}</b><span>De turno en ${CORTA}</span></span>${ico('abajo')}</button>${S.quienPop?`<span class="pop" style="right:0">${GENTE.map(x=>`<button data-a="elegirQuien" data-v="${x.n}" class="${x.n===p.n?'si':''}"><span class="avatar turno">${x.i}</span>${x.n}</button>`).join('')}</span>`:''}</span>`};
const porque=txt=>`<span class="porque"><button class="ib" data-a="porque" aria-label="¿Por qué?">${ico('info')}</button><span class="porque-txt">${txt}</span></span>`;
const paso=(val,a,extra)=>`<span class="paso"><button data-a="${a}" data-d="-1" ${extra} aria-label="Una menos">${ico('menos')}</button><input inputmode="numeric" value="${val}" data-in="${a}" ${extra} aria-label="Cantidad"><button data-a="${a}" data-d="1" ${extra} aria-label="Una más">${ico('mas')}</button></span>`;
const marcaSigue='<span class="chip lleno sigue-chip">Sigue aquí</span>';

/* =====================================================================================
   C1 · TRAYECTO — el estado de un envío como un camino
   ===================================================================================== */
const ETAPAS=[['Salió','caja'],['En camino','camion'],['Contando','abierta'],['Por terminar','etiqueta'],['Recibido','piso']];
const etapa=e=>({sin_guia:0,en_camino:1,abierto:2,cerrado:3,terminado:4})[e.estado];
const tono=e=>({sin_guia:'camino',en_camino:'camino',abierto:'contando',cerrado:'terminar',terminado:'listo'})[e.estado];
const detalleEtapa=e=>({sin_guia:'sin guía · directo',en_camino:`hace ${e.dias} ${e.dias===1?'día':'días'}${e.fardos?' · '+pl(e.fardos,'fardo','fardos'):''}`,
  abierto:`${conto(e)} de ${sinAviso(e)?'—':dijo(e)}`,cerrado:pl(pendN(e),'por terminar','por terminar')+(e.diasCerrado>7?` · hace ${e.diasCerrado} días`:''),terminado:e.term})[e.estado];
const IC2=['caja','camion','abierta','etiqueta','piso'];
function trayecto(e){
  const k=etapa(e),t=k>=4?'t-listo':k>=2?'t-cont':'',pp=e.estado==='abierto'&&dijo(e)?Math.round(conto(e)/dijo(e)*100):e.estado==='cerrado'?Math.round(T(e,vender)/Math.max(1,conto(e))*100):100;
  return `<div class="t2 ${t}" role="img" aria-label="${ETAPAS[k][0]}: ${detalleEtapa(e)}"><div class="t2-via"><span class="t2-lleno" style="width:${k/4*100}%"></span></div>
    ${ETAPAS.map(([n],j)=>j===k?'':`<span class="t2-p ${j<k?'hecho':'futuro'} ${j===0||j===4?'extremo':''}" style="left:${j/4*100}%;--j:${j}">${j<k?ico('ok'):''}<em>${n}</em></span>`).join('')}
    <span class="t2-marca" style="left:${k/4*100}%"><span class="t2-halo"></span><span class="t2-bola" style="--pp:${pp}">${ico(IC2[k])}</span><span class="t2-et"><b>${ETAPAS[k][0]}</b><small>${detalleEtapa(e)}</small></span></span></div>`;
}
function filaEnvio(e,i){
  const acc=e.estado==='abierto'?`<button class="btn primario chico" data-a="abrirEnvio" data-id="${e.id}">Seguir recibiendo${ico('flecha')}</button>`
    :e.estado==='sin_guia'?`<button class="btn chico" data-a="sinGuia" data-id="${e.id}">Llegó esta orden</button>`
    :e.estado==='en_camino'?`<button class="btn chico" data-a="detalle" data-id="${e.id}">Detalle</button>`
    :e.estado==='cerrado'?`<button class="btn primario chico" data-a="abrirEnvio" data-id="${e.id}">Terminar</button>`
    :`<button class="btn chico" data-a="verTerminado" data-id="${e.id}">Ver</button>`;
  const n=e.estado==='cerrado'?pendN(e):e.estado==='terminado'?conto(e):dijo(e),sub=e.guia?'guía '+e.guia:e.estado==='terminado'?'recibió '+e.cerro.split(' ')[0]:e.env==='—'?'Llega sin guía':e.env||'';
  return `<div class="t2-fila" style="--i:${i}" data-a="${e.estado==='terminado'?'verTerminado':e.estado==='sin_guia'?'sinGuia':'abrirEnvio'}" data-id="${e.id}"><div class="t2-id"><b>${e.id}</b><span>${e.prov}</span><span>${sub}</span></div>${trayecto(e)}
    <div class="t2-n" tabindex="0"><span class="num-s">${n}</span><small>${e.estado==='cerrado'?'por terminar':'prendas'}</small><span class="t2-peek"><span class="versal">Lo que trae</span>${e.g.map((g,x)=>`<span class="f" style="--i:${x}">${catTile(g.cat,30)}${CAT[g.cat].n}<b>${e.estado==='terminado'||e.estado==='cerrado'?g.cont:g.dij}</b></span>`).join('')}</span></div>
    <div>${acc}</div></div>`;
}

/* Dial mejorado (elegido): el número se toca y se escribe con el teclado; el aro solo muestra. Sin arrastre ni rueda (Felipe). */
function dialF(g,e){
  const s=dialEstado(g,e),D=g.dij,n=s.n,a=s.sa?(n?360:0):Math.min(n,D)/D*360;
  const cortes=!s.sa&&D<=40?Array.from({length:D},(_,i)=>{const t=i/D*Math.PI*2;return `<line class="corte" style="--i:${i}" x1="${145+Math.cos(t)*94}" y1="${145+Math.sin(t)*94}" x2="${145+Math.cos(t)*116}" y2="${145+Math.sin(t)*116}"/>`}).join(''):'';
  return `<div class="d2 ${s.cls} ${S.celebra?'celebra':''}" id="dial" data-guia="recepcion.numero">
    <svg viewBox="0 0 290 290" aria-hidden="true"><circle class="pista" cx="145" cy="145" r="105"/><circle class="arco" data-k="dar" cx="145" cy="145" r="105" pathLength="100" style="stroke-dashoffset:${100-s.p}"/>${cortes}<circle class="brillo" cx="145" cy="145" r="105" pathLength="100"/><circle class="extra" data-k="dex" cx="145" cy="145" r="128" pathLength="100" style="stroke-dashoffset:${100-s.x}"/>
     <g class="perilla ${S.chispa?'chispa':''}" data-k="per" style="transform:rotate(${a}deg)"><circle class="g" cx="250" cy="145" r="15"/><circle class="b" cx="250" cy="145" r="15"/><circle class="c" cx="250" cy="145" r="5"/></g></svg>
    <span class="d2-glow"></span><div class="d2-centro">${S.editNum?`<input class="d2-in" id="d2in" inputmode="numeric" autocomplete="off" placeholder="0" value="${g.cont==null?'':g.cont}" aria-label="Cuántas ${CAT[g.cat].n.toLowerCase()} llegaron">`:`<button class="d2-num" data-a="editarNum" aria-label="Escribir cuántas ${CAT[g.cat].n.toLowerCase()} llegaron (ahora ${n})">${odo(n,'dn')}</button>`}<small>${s.txt}</small></div><span class="d2-ok">${ico('ok')}</span>
    <button class="d2-btn m" data-a="sumar" data-d="-1" ${n<=minimo(g)?'disabled':''} aria-label="Una menos">${ico('menos')}</button><button class="d2-btn p" data-a="sumar" data-d="1" aria-label="Una más">${ico('mas')}</button></div>`;
}

/* Acordeón de categorías (elegido): cada categoría despliega las prendas anotadas en la compra, con su avance. Abierta = la que se cuenta. */
function prendasDe(g){const l=g.anot.map(a=>{const s=g.sep.find(x=>x.m===a.m);return {m:a.m,e:a.n,id:s?s.n:0}});g.sep.filter(s=>!g.anot.some(a=>a.m===s.m)).forEach(s=>l.push({m:s.m,e:null,id:s.n}));g.desc.forEach(d=>l.push({nueva:d.txt,e:null,id:d.n}));return l}
const estadoP=p=>p.e==null?'<span class="chip">No estaba anotada</span>':p.id>=p.e?'<span class="chip punto verde">Identificadas</span>':p.id?`<span class="chip punto ambar">${p.id} de ${p.e}</span>`:'<span class="chip punto">Por identificar</span>';
function acordeon(e){
  return `<nav class="riel-cats k4a" aria-label="Categorías del envío"><span class="versal" style="padding:0 6px">${sinAviso(e)?'Lo que llegó':'Categorías'}</span>${e.g.map((x,i)=>{const ab=i===S.gi,d=dif(x),p=x.dij?Math.min(100,(x.cont||0)/x.dij*100):(x.cont?100:0),prs=prendasDe(x),ok=x.cont!=null&&faltanId(x)===0&&(d===0||sinAviso(e)||x.extra);
    return `<div class="k4a-g ${ab?'abierta':''}"><button class="k4a-cab" data-a="cat" data-v="${i}" aria-expanded="${ab}">${anillo(p,ok?'ok':d>0?'mas':'',ico(CAT[x.cat].i),'rc'+i)}<span><b>${CAT[x.cat].n}</b><small>${x.cont==null?'Sin contar':x.cont+(x.dij&&!sinAviso(e)?' de '+x.dij:'')} · ${pl(prs.length,'prenda','prendas')}</small></span><span class="k4a-fl">${ico('abajo')}</span></button>
     <div class="k4a-cuerpo" data-k="kc${i}" style="max-height:${ab?Math.max(1,prs.length)*120+30:0}px"><div class="k4a-in">${prs.length?prs.map(q=>`<div class="k4a-pr">${q.m?tile(q.m,40):`<span class="prenda cat" style="--t:40px">${ico('chispa')}</span>`}<span class="t"><span class="l1"><b>${q.m?MOD[q.m].n:q.nueva}</b><small>${q.e!=null?'× '+q.e+' en la compra':'× '+q.id}</small></span><span class="l2">${q.e!=null?`<span class="k4a-pts">${Array.from({length:Math.min(q.e,14)},(_,k)=>`<i class="${k<q.id?'on':''}"></i>`).join('')}</span>`:''}${estadoP(q)}</span></span></div>`).join(''):'<span class="tenue" style="font-size:15px">No hay prendas anotadas en la compra.</span>'}</div></div></div>`}).join('')}
    <button class="rc nueva" data-a="agregarCat"><span class="prenda cat" style="--t:40px">${ico('mas')}</span>${sinAviso(e)?'Agregar lo que llegó':'Agregar categoría'}</button>
    <div class="rc-quien"><span class="versal" style="padding:0 6px">Quién cuenta ${porque('Cada categoría guarda quién la contó. Varias personas pueden contar a la vez; firma quien cierra.')}</span>${persona(S.resp)}</div></nav>`;
}

/* =====================================================================================
   C2 · DIAL — el número que se cuenta; cada prenda es un segmento del aro
   ===================================================================================== */
function dialEstado(g,e){const sa=sinAviso(e)||!g.dij||g.extra,n=g.cont||0,d=dif(g);
  return {sa,n,p:sa?(n?100:0):Math.min(n,g.dij)/g.dij*100,x:sa?0:Math.min(100,Math.max(0,n-g.dij)/g.dij*100),cls:sa?'':d===0?'ok':d>0?'mas':'',
    txt:sa?(g.extra?'no venían':'contadas'):g.cont==null?`dijeron ${g.dij}`:d===0?`cuadra · ${g.dij}`:d<0?`faltan ${-d} de ${g.dij}`:`sobran ${d}`}}
const minimo=g=>g.sep.reduce((a,s)=>a+conTallas(s),0);

/* =====================================================================================
   C3 · RIEL DE CATEGORÍAS — la carpeta con sus lengüetas
   ===================================================================================== */

/* =====================================================================================
   C4 · BANDEJA DE IDENTIFICACIÓN — la barra se tiñe con cada prenda que se identifica
   ===================================================================================== */
function bandeja(e,g){
  const f=faltanId(g),cs=CAT[g.cat].n.toLowerCase(),cont=Math.max(1,g.cont||0),sg=sigue(e)==='ident';
  const anot=g.anot.filter(a=>!g.sep.some(s=>s.m===a.m));
  const hilo=g.cont?`<div class="hilo-id" aria-label="${ident(g)} de ${g.cont} identificadas">${g.sep.map(s=>{const c=MOD[s.m].cols[0];return `<span class="${c[2]?'oscura':''}" data-color-dato style="--f:${s.n/cont};background:${c[1]}">${s.n} ${MOD[s.m].n.split(' ')[1]}</span>`}).join('')}${g.desc.map(d=>`<span style="--f:${d.n/cont};background:var(--hueso);color:var(--tinta)">${d.n} nueva${d.n>1?'s':''}</span>`).join('')}${f?`<span class="falta" style="--f:${f/cont}">${f} ?</span>`:''}</div>`:'';
  return `<div class="tarjeta bandeja ${sg?'sigue':''}" id="bandeja" data-guia="recepcion.separar"><div class="ident-cab"><h3>¿Qué ${cs} son?</h3>${sg?marcaSigue:''}${g.cont?(f?`<span class="chip punto ambar">Faltan ${f}</span>`:'<span class="chip punto verde">Todas identificadas</span>'):''}${porque('Hasta identificar todas no se pasa a «Cerrar». Las tallas y los colores pueden esperar.')}</div>
    ${hilo}
    ${anot.length?`<div class="anot-cards">${anot.map(a=>`<button class="anot-card" data-a="anotada" data-m="${a.m}">${tile(a.m,56)}<b>${MOD[a.m].n} × ${a.n}</b><span class="ir">${ico('mano')}Anotado en la compra · pasarlas</span></button>`).join('')}</div>`:''}
    <label class="buscador" style="flex:none">${ico('buscar')}<input data-in="busca" value="${S.busca||''}" placeholder="Busca otra prenda (Ej. ${Object.values(MOD).find(m=>m.cat===g.cat)?.n||'Blusa Emma'})"></label>
    <div id="resultados">${resultados(g)}</div>
    ${g.sep.map((s,si)=>{const ct=conTallas(s),r=s.n-ct,m=MOD[s.m];const ts=m.tal.flatMap(t=>m.cols.map(([c,hx,o])=>({t,c,hx,o,v:s.mat[c+'|'+t]||0}))).filter(x=>x.v);
      return `<div class="idf entra">${tile(s.m,52,0,1)}<div><b>${m.n}</b><div class="tstrip">${ts.map(x=>`<span class="${x.o?'oscura':''}" data-color-dato style="--f:${x.v/s.n};--c:${x.hx}">${x.t}${x.v>1?' ×'+x.v:''}</span>`).join('')}${r?`<span class="resto" style="--f:${r/s.n}">${r} sin talla</span>`:''}</div></div>
      <span class="accs">${ct&&!r?`<span class="chip punto verde">Entra al stock</span><button class="btn enlace" data-a="tallas" data-si="${si}">Cambiar</button>`:`<button class="btn chico" data-a="tallas" data-si="${si}">${ico('paleta')}Tallas y colores ahora</button>`}</span>
      <span class="accs">${paso(s.n,'sepN',`data-si="${si}"`)}<button class="redondo" style="width:40px;height:40px" data-a="quitarSep" data-si="${si}" aria-label="Quitar">${ico('x')}</button></span></div>`}).join('')}
    ${g.desc.map((d,di)=>`<div class="idf entra"><span class="prenda cat" style="--t:52px">${ico('chispa')}</span><div><b>${d.txt}</b><small class="tenue" style="display:block;font-size:15px">Nueva · se crea después con su nombre, tallas y precio</small></div><span class="accs"><button class="btn chico" data-a="crear" data-di="${di}">${ico('mas')}Crear ahora</button></span><span class="accs">${paso(d.n,'descN',`data-di="${di}"`)}<button class="redondo" style="width:40px;height:40px" data-a="quitarDesc" data-di="${di}" aria-label="Quitar">${ico('x')}</button></span></div>`).join('')}
    <div class="idf" style="border-style:dashed"><span class="prenda cat" style="--t:52px">${ico('chispa')}</span><div><b>Nuevas, no están en el catálogo</b><small class="tenue" style="display:block;font-size:15px">Cuántas, y luego un nombre corto</small></div>
      <span class="accs">${g.nuevas?`<button class="btn chico" data-a="describir">Describir ahora</button>`:''}</span><span class="accs">${paso(g.nuevas,'nuevas','')}</span></div></div>`;
}
function resultados(g){
  const q=(S.busca||'').trim().toLowerCase();if(q.length<2)return '';
  const r=Object.entries(MOD).filter(([,m])=>m.n.toLowerCase().includes(q)).slice(0,6);
  return `<div class="resultados">${r.map(([k,m])=>`<button data-a="elegir" data-m="${k}">${tile(k,40)}<span style="flex:1"><b>${m.n}</b><br><span class="tenue" style="font-size:14px">${m.tal.length} tallas · ${m.cols.map(c=>c[0]).join(', ')}</span></span><span class="btn chico">Elegir</span></button>`).join('')}
    <button data-a="nuevaTxt">${ico('chispa')}<span>No es ninguna: anotar «${S.busca}» como nueva</span></button></div>`;
}

/* =====================================================================================
   C9 · ISLA CON HILO — la barra de abajo con el avance de todo el envío
   ===================================================================================== */
function isla(e){
  const g=e.g[S.gi],sig=e.g.findIndex((x,i)=>i>S.gi&&(x.cont==null||faltanId(x)>0));
  const bloqueo=e.g.filter(x=>faltanId(x)>0).map(x=>CAT[x.cat].n.toLowerCase());
  const D=dijo(e),C=conto(e),I=T(e,x=>Math.min(ident(x),x.cont||0)),base=Math.max(1,D,C),dT=C-D;
  const chip=sinAviso(e)?'<span class="chip">Llegó sin aviso</span>':!e.g.some(x=>x.cont!=null)?'<span class="chip">Sin contar</span>':dT===0?'<span class="chip punto verde">Cuadra</span>':`<span class="chip punto ambar">${dT<0?'Faltan '+(-dT):'Sobran '+dT}</span>`;
  const btn=sig>-1&&g&&g.cont!=null&&faltanId(g)===0?`<button class="btn primario grande" data-a="cat" data-v="${sig}"><span class="entra">Listo, sigue ${CAT[e.g[sig].cat].n}</span>${ico('flecha')}</button>`
    :`<button class="btn primario grande" data-a="paso" data-v="cerrar" ${!e.g.length||bloqueo.length?'disabled':''} data-guia="recepcion.pasar-a-cerrar"><span class="entra">Pasar a cerrar</span>${ico('flecha')}</button>`;
  return `<div class="isla c9c"><button class="redondo" data-a="cat" data-v="${Math.max(0,S.gi-1)}" ${S.gi===0?'disabled':''} aria-label="Categoría anterior">${ico('atras')}</button>
    ${sinAviso(e)?'':`<span class="tot"><span>Dijeron</span>${odo(D,'iD')}</span>`}<span class="tot"><span>Contadas</span>${odo(C,'iC')}</span><span class="tot"><span>Identificadas</span>${odo(I,'iI')}</span>${chip}
    <span class="der">${bloqueo.length?`<span class="motivo">Falta identificar ${bloqueo.join(' y ')}</span>`:''}${btn}</span>
    <span class="c9c-dos"><i class="b" data-k="idb" style="width:${I/base*100}%"></i><i class="a" data-k="ida" style="width:${Math.max(0,C-I)/base*100}%"></i></span></div>`;
}

/* ---------- guía de foco: una sola pieza encendida ---------- */
function sigue(e){
  if(S.paso==='cerrar'){const gi=e.g.findIndex(g=>g.cont!=null&&!sinAviso(e)&&(dif(g)!==0||g.extra)&&!g.causa);return gi>-1?'causa'+gi:''}
  const g=e.g[S.gi];if(!g)return '';if(g.cont==null)return 'numero';if(faltanId(g)>0)return 'ident';return '';
}
const veredicto=(g,e)=>{if(g.extra)return g.cont?`<span class="chip punto ambar">${g.cont} que no venían</span>`:'';if(sinAviso(e)||g.cont==null)return '';const d=dif(g);
  return d===0?`<span class="chip punto verde">Cuadra con lo que dijeron</span>`:`<span class="chip punto ambar">${d<0?'Faltan '+(-d):'Sobran '+d}</span><span class="tenue" style="font-size:15px">Puedes seguir: lo explicas al cerrar.</span>`};

/* =========================== MOTOR =========================== */
const main=()=>$('#app');
function render(conEstreno){
  if(!main()){window.RB&&RB.demo&&RB.demo();return}
  if(conEstreno)S.estreno=true;
  const prev={};$$('[data-k]').forEach(el=>prev[el.dataset.k]=el.getAttribute('style'));
  const fly=S.fly;S.fly=null;
  const m=main();m.classList.toggle('estreno',S.estreno);
  m.innerHTML=S.pant==='portada'?portada():pantEnvio();
  if(!S.estreno&&!RED){const cambios=[];$$('[data-k]').forEach(el=>{const p=prev[el.dataset.k],t=el.getAttribute('style');if(p==null||p===t)return;el.setAttribute('style',p);cambios.push([el,t])});
    if(cambios.length){m.getBoundingClientRect();requestAnimationFrame(()=>requestAnimationFrame(()=>cambios.forEach(([el,t])=>el.setAttribute('style',t))))}}
  S.chispa=false;S.celebra=false;
  if(S.editNum){const i=$('#d2in');if(i){i.focus();i.select();let listo=false;
    const fin=ok=>{if(listo)return;listo=true;S.editNum=false;const v=i.value.replace(/\D/g,'');if(ok&&v!==''){ponerCont(+v,null);return}render()};
    i.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();fin(true)}else if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();fin(false)}});
    i.addEventListener('input',()=>{i.value=i.value.replace(/\D/g,'').slice(0,3)});i.addEventListener('blur',()=>fin(true))}}
  if(S.estreno&&!RED)$$('[data-cuenta]').forEach(el=>cuenta(el,+el.dataset.cuenta));
  if(fly&&!RED){const dst=$(`.idf [data-fly="${fly.m}"]`);if(dst){const b=dst.getBoundingClientRect(),a=fly.r;dst.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px) scale(${a.width/b.width})`},{transform:'none'}],{duration:620,easing:'cubic-bezier(.32,.72,.24,1)'})}}
  S.estreno=false;
}
function cuenta(el,b){const t0=performance.now(),d=700;(function f(t){const k=Math.min(1,(t-t0)/d),e=1-Math.pow(1-k,3);el.textContent=Math.round(b*e);if(k<1)requestAnimationFrame(f)})(t0)}
function ir(pant,id,paso){S.pant=pant;S.id=id||null;if(paso)S.paso=paso;S.gi=0;S.pop=null;S.busca='';window.scrollTo({top:0});render(true)}

/* =========================== PORTADA =========================== */
function filtrar(lst){const q=S.q.trim().toLowerCase();
  return lst.filter(e=>(!q||[e.id,e.guia,e.prov,e.oc].join(' ').toLowerCase().includes(q))&&(!S.fEst.length||S.fEst.includes(e.estado==='abierto'?'Abierto':'Por abrir'))&&(!S.fProv||e.prov===S.fProv)
    &&(!S.fFecha||({Hoy:e.dias===0,Ayer:e.dias===1,'Últimos 7 días':e.dias<=7,'Últimos 30 días':e.dias<=30,'Hace más de una semana':e.dias>7})[S.fFecha]))}
function portada(){
  const recibir=E.filter(e=>['en_camino','abierto','sin_guia'].includes(e.estado)),porT=E.filter(e=>e.estado==='cerrado'),term=E.filter(e=>e.estado==='terminado');
  const nPT=porT.reduce((a,e)=>a+pendN(e),0),viejo=Math.max(0,...porT.map(e=>e.diasCerrado||0)),lst=filtrar(recibir),semana=term.reduce((a,e)=>a+conto(e),0);
  const por=S.tab==='por'&&porT.length;
  return `<header class="cab"><div><div class="sede-linea">${SEDE} · jueves 29 de octubre</div><h1>Recibir mercadería</h1><p class="frase">Cuenta por categoría. Qué modelo es, ahora o después.</p></div>
    <div class="cifras cae" style="--i:1"><button class="cifra" data-a="irA" data-sec="envios"><span class="n" data-cuenta="${recibir.length}">${recibir.length}</span><span class="t">por recibir</span></button>
      <button class="cifra ${viejo>7?'ambar':''}" data-a="irA" data-sec="recibido" data-tab="por"><span class="n" data-cuenta="${nPT}">${nPT}</span><span class="t">por terminar</span></button>
      <button class="cifra verde" data-a="irA" data-sec="recibido" data-tab="term"><span class="n" data-cuenta="${semana}">${semana}</span><span class="t">llegaron esta semana</span></button></div></header>
  <div class="avisos">${nPT?`<div class="aviso ${viejo>7?'ambar':''} cae" style="--i:2">${ico('etiqueta')}<span><b>${nPT} prendas por terminar</b> · la más antigua, de hace ${viejo} días</span><span class="der">${porque('Ya están contadas y en el almacén, pero no en el sistema: hasta terminarlas no se venden.')}<button class="btn chico" data-a="irA" data-sec="recibido" data-tab="por">Ver</button></span></div>`:''}
    <div class="aviso cae" style="--i:3">${ico('camion')}<span><b>Viene el Traslado TR-0412</b> desde Tienda Lima</span><span class="der">${porque('Los traslados entre sedes no se reciben aquí: se reciben en Traslados.')}<button class="btn chico" data-a="toast" data-t="Abre el traslado en Traslados, como hoy">Abrir en Traslados</button></span></div></div>
  <section class="seccion" id="envios"><div class="sec-cab"><h2>Por recibir</h2><span class="globo ${recibir.length?'pide':''}">${recibir.length}</span><span class="der"><span class="tenue" style="font-size:15px">¿Llegó algo que no está aquí?</span><button class="btn" data-a="sinAviso">${ico('abierta')}Sin aviso</button></span></div>
   ${herramientas(recibir,lst)}${lst.length?`<div class="t2-lista">${lst.map(filaEnvio).join('')}</div>`:vacioFiltro()}</section>
  <section class="seccion" id="recibido"><div class="sec-cab"><h2>Lo recibido</h2><span class="seg">${porT.length?`<button data-a="tab" data-v="por" aria-pressed="${!!por}">Por terminar <span class="globo pide">${nPT}</span></button>`:''}<button data-a="tab" data-v="term" aria-pressed="${!por}">Terminados</button></span>
    <span class="der">${!por?`<button class="btn enlace" data-a="toast" data-t="Abre «Ver todo lo recibido», como hoy">Ver todo lo recibido</button>`:''}</span></div>
    <div class="t2-lista">${(por?porT:term).map(filaEnvio).join('')}</div><div class="paginas" style="border:0;padding:12px 4px">${por?'Lo más antiguo primero':'Las 50 más recientes'}<span>10 por página</span></div></section>`;
}
function herramientas(todos,lst){
  const provs=[...new Set(todos.map(e=>e.prov))];
  const pop=(k,ops,sel,multi)=>S.pop===k?`<div class="pop">${ops.map(o=>`<button data-a="filtro" data-k="${k}" data-v="${o}" class="${(multi?sel.includes(o):sel===o)?'si':''}">${(multi?sel.includes(o):sel===o)?ico('ok'):'<span style="width:20px"></span>'}${o}</button>`).join('')}</div>`:'';
  const algo=S.q||S.fEst.length||S.fProv||S.fFecha;
  return `<div class="herr cae" style="--i:4"><label class="buscador">${ico('buscar')}<input data-in="q" value="${S.q}" placeholder="Envío, guía, proveedor u orden"></label>
    <span class="pild"><button data-a="pop" data-k="est" class="${S.fEst.length?'puesto':''}">${ico('filtro')}${S.fEst.length?S.fEst.join(', '):'Estado'}</button>${pop('est',['Abierto','Por abrir','No puedo abrir yo'],S.fEst,true)}</span>
    <span class="pild"><button data-a="pop" data-k="prov" class="${S.fProv?'puesto':''}">${ico('persona')}${S.fProv||'Proveedor'}</button>${pop('prov',['Todos',...provs],S.fProv||'Todos')}</span>
    <span class="pild"><button data-a="pop" data-k="fecha" class="${S.fFecha?'puesto':''}">${ico('cal')}${S.fFecha||'Fechas'}</button>${pop('fecha',['Hoy','Ayer','Últimos 7 días','Últimos 30 días','Hace más de una semana'],S.fFecha)}</span>
    ${algo?`<button class="btn enlace" data-a="limpiar">Limpiar todo</button><span class="cuenta-lista">${lst.length} de ${todos.length}</span>`:''}</div>`;
}
const vacioFiltro=()=>`<div class="tarjeta" style="padding:34px;text-align:center;display:grid;gap:12px;justify-items:center">${ico('buscar')}<b style="font-size:19px">Ningún envío ${S.q?`coincide con «${S.q}»`:'cumple los filtros'}</b><button class="btn" data-a="limpiar">Limpiar todo</button></div>`;

/* =========================== PÁGINA DEL ENVÍO =========================== */
function pantEnvio(){
  const e=env();if(!e)return '';
  const cab=`<div class="env-cab"><button class="redondo" data-a="volver" aria-label="Volver a Recibir mercadería">${ico('atras')}</button><div class="sede-linea">${SEDE} · jueves 29</div></div>
    <div class="env-tit"><div><h1>${e.id}</h1><div class="datos">${e.prov}${e.guia?' · guía '+e.guia:''}${e.oc?' · '+e.oc:''}</div></div><div style="min-width:min(520px,100%);flex:1;max-width:620px">${trayecto(e)}</div></div>`;
  if(e.estado==='en_camino')return cab+empezar(e);
  if(e.estado==='abierto')return cab+pasos2(e)+(S.paso==='contar'?contar(e):cerrar(e));
  return cab+cerrado(e);
}
function pasos2(e){const ok=e.g.length&&e.g.every(g=>faltanId(g)===0),c=S.paso==='cerrar';
  return `<div class="pasos2">${e.reabierto?`<span class="chip ambar">${ico('reabrir')}Reabierto: lo que ya entró al stock no se toca</span>`:''}<button class="p2 ${c?'hecho':'ahora'}" data-a="paso" data-v="contar"><span class="o">${c?ico('ok'):'1'}</span>Contar</button><span class="p2-hilo" style="--w:${c?100:ok?50:0}%"></span><button class="p2 ${c?'ahora':''}" data-a="paso" data-v="cerrar" ${ok?'':'disabled'}><span class="o">2</span>Cerrar</button></div>`}
function papel(e){
  const a=e.g.flatMap(g=>g.anot.map(x=>({...x,g})));
  return `<aside class="tarjeta papel"><div class="versal">El papel de la compra</div>${e.papel.foto?`<div class="foto con"><b>${e.papel.tipo.toUpperCase()} · ${e.prov}</b>${a.map(x=>`${x.n} × ${MOD[x.m].n} · S/ ${MOD[x.m].costo.toFixed(2)}`).join('<br>')}<br><b>Total S/ ${a.reduce((s,x)=>s+x.n*MOD[x.m].costo,0).toFixed(2)}</b></div>`:`<div class="foto">${ico('camara')}<span>No subió foto</span><button class="btn chico" data-a="toast" data-t="Sube la foto del papel, como hoy">Subir foto</button></div>`}
    <div class="tenue" style="font-size:15px">${e.papel.tipo} · compró ${e.papel.quien} · ${e.papel.f}</div>
    ${a.length?`<div class="versal">Lo que anotó ${e.papel.quien}</div>${a.map(x=>{const s=x.g.sep.find(y=>y.m===x.m),h=s?s.n:0;return `<div class="anot">${tile(x.m,40)}<div style="flex:1"><b>${x.n} · ${MOD[x.m].n}</b><div class="avance ${h>=x.n?'verde':''}" style="margin-top:6px"><i data-k="an-${x.m}" style="--w:${Math.min(100,h/x.n*100)}%"></i></div></div><span class="tenue" style="font-size:15px">${h}/${x.n}</span></div>`}).join('')}`:''}
    <div class="tenue" style="font-size:15px">Cuenta mirando el papel: lo que dice es lo que se pagó.</div></aside>`;
}
function loQueTrae(e){
  return `<div><div class="versal" style="margin-bottom:10px">Lo que trae</div><div class="trae">${e.g.map(g=>`<div class="f">${catTile(g.cat,44)}<div><b>${CAT[g.cat].n}</b><div class="tenue" style="font-size:15px">${g.marca} · ${g.anot.map(a=>MOD[a.m].n).join(', ')}</div></div><span class="q">${g.dij}</span></div>`).join('')}</div></div>
   <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">${e.fardos?`<span class="fardos-ic">${Array.from({length:e.fardos},()=>`<span class="prenda cat" style="--t:38px">${ico('caja')}</span>`).join('')}<b style="margin-left:6px">${pl(e.fardos,'fardo','fardos')}</b></span>`:''}<span style="font-size:17px">Dijeron <b class="serif" style="font-size:30px">${dijo(e)}</b> prendas</span><span class="chip">Sin etiqueta</span></div>`;
}
function empezar(e){
  return `<div class="env-grid"><div class="tarjeta entra" style="padding:24px;display:grid;gap:18px">${loQueTrae(e)}<div class="campo"><label>Quién recibe</label>${persona(S.resp)}</div>
    <div class="pie-acciones" style="margin:0"><span class="izq tenue" style="font-size:15px">Al empezar, la compra ya no se anula.</span><button class="btn primario grande" data-a="empezar" data-id="${e.id}">${ico('caja')}Empezar a recibir${ico('flecha')}</button></div></div>
    <aside class="tarjeta papel"><h3>¿Llegó algo que no está aquí?</h3><p class="tenue" style="margin:0">Ábrelo sin aviso y cuéntalo igual.</p><button class="btn" data-a="sinAviso">${ico('abierta')}Recibir sin aviso</button><p class="tenue" style="margin:0;font-size:15px">Lo que manda otra sede se recibe en Traslados.</p></aside></div>`;
}

/* ---- paso 1: contar (riel | dial + bandeja | papel) ---- */
function contar(e){
  const g=e.g[S.gi];
  if(!g)return `<div class="mesa-b">${acordeon(e)}<div class="tarjeta" style="padding:34px;text-align:center;display:grid;gap:12px;justify-items:center">${ico('abierta')}<h3 style="font-size:26px">¿Qué llegó?</h3><p class="tenue" style="margin:0">Agrega la primera categoría y cuéntala.</p><button class="btn primario" data-a="agregarCat">${ico('mas')}Agregar lo que llegó</button></div>${papel(e)}</div>`+isla(e);
  const sub=[g.marca,e.prov,g.anot.map(a=>MOD[a.m].n).join(', ')].filter(Boolean).join(' · '),sv=S.guardando[S.gi],sg=sigue(e)==='numero';
  return `<div class="mesa-b">${acordeon(e)}<div>
    <div class="tarjeta contador ${sg?'sigue':''}"><div class="cont-cab">${catTile(g.cat,52)}<div><h2>¿Cuántas ${CAT[g.cat].n.toLowerCase()} llegaron? ${sg?marcaSigue:''}</h2><div class="sub">${sub}</div></div>${g.extra?'<span class="chip ambar">No estaba en la guía</span>':''}
      <span class="guardado ${sv==='ok'?'ok':''}" id="guardado">${sv==='ok'?ico('ok')+'Guardado':sv==='va'?'Guardando…':g.quien?'Contó '+g.quien.split(' ')[0]:''}</span></div>
      <div class="dial-zona" style="margin:22px 0 6px">${dialF(g,e)}<div style="display:grid;gap:14px">
        <div class="atajos-b">${g.dij&&!sinAviso(e)&&!g.extra?`<button class="btn grande" data-a="poner" data-v="${g.dij}" style="grid-column:1/-1">${ico('ok')}Llegaron las ${g.dij}</button>`:''}<button class="btn sutil" data-a="sumar" data-d="5">+5</button><button class="btn sutil" data-a="sumar" data-d="10">+10</button><button class="btn" data-a="poner" data-v="0" style="grid-column:1/-1">${g.cont==null?'No llegó nada':'Poner en cero'}</button></div>
        <span class="d-pista-ayuda">${ico('mano')}Toca el número para escribirlo</span>
        <div class="veredicto" id="veredicto" style="margin:0">${veredicto(g,e)}</div></div></div>
      <div class="obs"><span class="versal">Observaciones</span>${g.obs.length?g.obs.map(o=>`<span class="chip">${o.t}</span>`).join(''):'<span class="tenue" style="font-size:15px">Lo que viste al abrir la caja</span>'}<button class="btn chico" data-a="observacion" style="margin-left:auto">${ico('nota')}Anotar observación</button></div></div>
    ${bandeja(e,g)}</div>${papel(e)}</div>`+isla(e);
}

/* =====================================================================================
   C6 · CINTA DE CIERRE  +  C7 · ETIQUETA DE PRECIO
   ===================================================================================== */
function podio(g,gi,sa){
  const v=vender(g),ds=despues(g),dij=sa||g.extra?null:g.dij,cont=g.cont||0,mx=Math.max(1,dij||0,cont),df=dij==null?null:cont-dij;
  const cols=[...(dij!=null?[['Dijeron',dij,'color-mix(in srgb,var(--borde-control) 40%,var(--hueso))']]:[]),['Contaste',cont,'var(--tinta)'],['Se venden ya',v,'var(--verde)'],['Para después',ds,'var(--taupe)']],w=100/cols.length;
  return `<div class="c6c" style="grid-template-columns:repeat(${cols.length},minmax(0,1fr))">${dij!=null?`<span class="c6c-llave" style="top:8px;left:${w/2}%;width:${w}%;border-color:${df?'var(--ambar)':'var(--verde)'}"><b style="color:${df?'var(--ambar)':'var(--verde-profundo)'}">${df===0?'cuadra':df<0?'faltan '+(-df):'sobran '+df}</b></span>`:''}
    ${cols.map(([t,n,c],i)=>`<div class="c6c-b"><span class="num-s">${n}</span><span class="c6c-barra" data-k="pd${gi}-${i}" style="height:${Math.max(3,n/mx*150)}px;--c:${c};--d:${i*130}ms"></span><small>${t}</small></div>`).join('')}</div>`;
}
function vitrina(g,gi,s,si){
  const m=MOD[s.m],c=+(s.costoN??m.costo),p=+(s.precioN??m.precio),cambio=c!==m.costo||p!==m.precio,todas=s.donde==='todas',col=m.cols[0];
  return `<div class="c7b vitrina ${cambio?'cambio':''}"><div class="c7b-card"><span class="c7b-foto" data-color-dato style="background:${col[1]};color:${col[2]?'var(--crema-fija)':'var(--tinta-fija)'}">${ico(CAT[m.cat].i)}</span><b>${m.n}</b><span class="tenue" style="font-size:14px">${s.n} u. · ${m.cols.map(x=>x[0]).join(', ')}</span>
     <label class="c7b-sticker"><small>S/</small><input data-in="precioN" data-gi="${gi}" data-si="${si}" value="${p.toFixed(2)}" aria-label="Precio de venta de ${m.n}"></label></div>
   <div class="c7b-info"><span class="l"><span>Costo c/u</span><span style="display:flex;align-items:center;gap:6px">S/ <input class="caja" style="width:100px;height:40px" data-in="costoN" data-gi="${gi}" data-si="${si}" value="${c.toFixed(2)}" aria-label="Costo de ${m.n}"></span></span>
    <span class="l"><span>Ganas por prenda</span><b style="color:${p>=c?'var(--verde-profundo)':'var(--ambar)'}">${soles(p-c)}</b></span>
    <span class="etq">El precio vale en</span><div class="c7b-sedes">${['Trujillo','Lima','Arequipa'].map((sd,i)=>{const on=todas||i===0;return `<span class="c7b-sede" data-k="sd${gi}-${si}-${i}" style="${on?'background:var(--tinta);color:var(--crema);border-color:var(--tinta)':'background:var(--papel);color:var(--tinta-60);border-color:var(--borde-control)'};transition-delay:${i*120}ms">${ico('pin')}${sd}</span>`}).join('')}</div>
    <span class="seg" style="justify-self:start"><button data-a="donde" data-gi="${gi}" data-si="${si}" data-v="sede" aria-pressed="${!todas}">Solo ${CORTA}</button><button data-a="donde" data-gi="${gi}" data-si="${si}" data-v="todas" aria-pressed="${todas}">Todas</button></span>
    <button class="btn enlace" style="justify-self:start" data-a="toast" data-t="Abre la matriz de precio por talla y color, como hoy">Distinto por talla o color</button></div></div>`;
}
function cerrar(e){
  const sa=sinAviso(e);
  const tarj=e.g.map((g,gi)=>{
    const d=dif(g),sg=sigue(e)==='causa'+gi,cambios=g.sep.some(s=>(s.costoN!=null&&+s.costoN!==MOD[s.m].costo)||(s.precioN!=null&&+s.precioN!==MOD[s.m].precio));
    let preg='';
    if(g.cont==null)preg=`<div class="pregunta"><div><span class="chip punto ambar">Sin contar</span><button class="btn chico" data-a="contarla" data-v="${gi}">Contarla</button></div></div>`;
    else if(!sa&&(g.extra||d!==0)){const ops=g.extra||d>0?SOBRA:FALTA,n=g.extra?g.cont:Math.abs(d);
      preg=`<div class="pregunta ${sg?'sigue':''}"><div>${g.extra?n+' no venían en la guía':d>0?'Sobran '+n:'Faltan '+n}: ¿qué pasó? ${sg?marcaSigue:''}</div><div class="causas">${ops.map(([o,i])=>`<button class="causa" data-a="causa" data-gi="${gi}" data-v="${o}" aria-pressed="${g.causa===o}"><span class="ci">${g.causa===o?ico('ok'):ico(i)}</span>${o}</button>`).join('')}</div>
      ${g.causa==='Otro'?`<input class="caja" data-in="causaNota" data-gi="${gi}" value="${g.causaNota}" placeholder="¿Qué pasó exactamente?">`:''}${g.extra&&g.causa&&g.causa!=='Regalo'?`<label class="campo"><span class="versal" style="font-size:14px">Costo de toda la línea</span><input class="caja" style="max-width:200px" data-in="costoLinea" data-gi="${gi}" value="${g.costoLinea}" placeholder="S/ 0.00"></label>`:''}${g.causa==='Regalo'?'<span class="tenue" style="font-size:15px">Entra con costo S/ 0.00.</span>':''}</div>`}
    const reasons=[];g.sep.forEach(s=>{const r=s.n-conTallas(s);if(r)reasons.push(`${MOD[s.m].n}: ${r} sin tallas`)});g.desc.forEach(x=>reasons.push(`${x.txt}: por crear`));
    return `<article class="tarjeta cg cae" style="--i:${gi+1}"><div class="cg-cab">${catTile(g.cat,48)}<div><h3>${CAT[g.cat].n}</h3><div class="tenue" style="font-size:15px">${g.marca}${g.quien?' · contó '+g.quien.split(' ')[0]:''}${g.extra?' · no estaba en la guía':''}</div></div>
      <span style="margin-left:auto;text-align:right"><span class="serif" style="font-size:40px;line-height:1">${g.cont==null?'—':g.cont}</span><span class="tenue" style="display:block;font-size:15px">contaste</span></span></div>
      ${g.cont!=null?podio(g,gi,sa):''}${reasons.length?`<div class="tenue" style="font-size:15px">Para después: ${reasons.join(' · ')}</div>`:''}
      ${preg}
      ${g.sep.length?`<div class="desp"><span class="versal">Precio y costo ${cambios?'<span class="chip ambar" style="margin-left:8px">cambiado</span>':''}</span><div class="vitrinas">${g.sep.map((s,si)=>vitrina(g,gi,s,si)).join('')}</div></div>`:''}</article>`}).join('');
  const D=dijo(e),C=conto(e),rot=sa?0:Math.max(-14,Math.min(14,(D-C)*4)),faltan=faltaCierre(e);
  return `<div class="cierre">${tarj}
    <div class="tarjeta balanza cae" style="--i:5"><div class="lado"><div class="versal">Dijeron</div><div class="n">${sa?'—':D}</div></div>
      <svg viewBox="0 0 150 90" aria-hidden="true"><path d="M75 26v52M50 82h50" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><g class="brazo" style="--rot:${rot}deg"><path d="M15 26h120" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M15 26l-10 22h20zM135 26l-10 22h20z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></g><circle cx="75" cy="26" r="5" fill="currentColor"/></svg>
      <div class="lado d"><div class="versal">Contaste</div><div class="n">${C}</div></div></div>
    <div class="tarjeta datos-cierre cae" style="--i:6"><label class="campo"><span class="versal" style="font-size:14px">Número de guía</span><input class="caja" data-in="guia" value="${S.guia||e.guia||''}" placeholder="Ej. T001-000342"></label><label class="campo"><span class="versal" style="font-size:14px">Nota · opcional</span><input class="caja" data-in="nota" value="${S.nota}" placeholder="Ej. Llegó en dos bolsas"></label>
      ${sa&&!e.provOk?`<div class="campo" style="grid-column:1/-1"><span class="versal" style="font-size:14px">¿De quién llegó?</span><div style="display:flex;gap:8px;flex-wrap:wrap">${PROVS.slice(0,4).map(p=>`<button class="opc" data-a="provCierre" data-v="${p.n}" aria-pressed="${e.prov===p.n}">${p.n}</button>`).join('')}</div></div>`:''}
      <div class="campo" style="grid-column:1/-1"><span class="versal" style="font-size:14px">Quién cierra el conteo</span><span style="max-width:360px">${persona(S.resp)}</span></div></div></div>
    <div class="isla ${faltan.length?'':'ok'}" style="--av:${faltan.length?60:100}%"><button class="redondo" data-a="paso" data-v="contar" aria-label="Volver a contar">${ico('atras')}</button><span style="font-size:16px"><b>Al cerrar:</b> ${T(e,vender)} se venden ya · ${T(e,despues)} para después</span>
      <span class="der">${faltan.length?`<span class="motivo">Falta: ${faltan.join(', ')}</span>`:''}<button class="btn primario grande" data-a="pedirCerrar" ${faltan.length?'disabled':''}>${ico('ok')}Cerrar el envío · ${C}</button></span></div>`;
}
function faltaCierre(e){const f=[];e.g.forEach(g=>{if(g.cont==null&&!g.extra)f.push('contar '+CAT[g.cat].n.toLowerCase());const d=dif(g);
    if(!sinAviso(e)&&g.cont!=null&&(d!==0||g.extra)&&!g.causa)f.push('qué pasó con '+CAT[g.cat].n.toLowerCase());if(g.causa==='Otro'&&!g.causaNota.trim())f.push('explicar «Otro»');
    if(g.extra&&g.causa&&g.causa!=='Regalo'&&!g.costoLinea)f.push('costo de '+CAT[g.cat].n.toLowerCase())});if(sinAviso(e)&&!e.provOk)f.push('de quién llegó');return f}

/* =====================================================================================
   C8 · TALÓN DE RECEPCIÓN + «Lo que sigue»
   ===================================================================================== */
function lacre(e){
  const st=T(e,vender),pn=pendN(e),sa=sinAviso(e),c=conto(e),D=dijo(e),h=S.hechos[e.id]||{},pts=[];for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=i%2?42:46;pts.push(`${50+Math.cos(a)*r} ${50+Math.sin(a)*r}`)}
  return `<div class="rb entra"><svg class="rb-lacre" viewBox="0 0 100 100" aria-hidden="true"><path d="M${pts.join(' L')}Z"/><circle cx="50" cy="50" r="32" fill="none" stroke="color-mix(in srgb,var(--crema-fija) 35%,transparent)" stroke-width="2"/><text x="50" y="62" text-anchor="middle">C</text></svg>
    <span class="versal">Envío cerrado · ${SEDE} · ${e.cerrado||'hoy'}</span><h4>${e.id} recibido</h4><span class="tenue">Lo cerró ${e.cerro||S.resp}. El conteo ya es oficial.</span>
    <div class="rb-4">${[[sa?'Llegó sin aviso':'Dijeron',sa?null:D],['Contaste',c],['En el stock',st],['Para después',pn]].map(([t,n],i)=>`<div style="--i:${i}"><span class="num-s" ${n!=null?`data-cuenta="${n}"`:''}>${n==null?'—':n}</span><small>${t}</small></div>`).join('')}</div>
    ${st?`<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primario" data-a="hecho" data-k="et" data-t="Abre «Etiquetas de precio», como hoy">${h.et?ico('ok')+'Etiquetas impresas':ico('etiqueta')+'Imprimir '+pl(st,'etiqueta','etiquetas')}</button><button class="btn" data-a="hecho" data-k="piso" data-t="Abre «Bajar al piso», como hoy">${h.piso?ico('ok')+'Bajadas al piso':ico('piso')+'Bajar al piso'}</button></div>`:''}</div>`;
}
function cerrado(e){
  const p=pendientes(e),sa=sinAviso(e),nocuadro=e.g.filter(g=>g.cont!=null&&(dif(g)!==0||g.extra)&&!sa);
  return lacre(e)+(p.length?`<section class="tarjeta seccion cae" style="--i:2;padding:20px"><div class="sec-cab" style="margin:0 0 6px"><h2 style="font-size:24px">Para después</h2><span class="globo pide">${p.length}</span><span class="der"><span class="chip ambar">Avisa en Recibir y en el Inicio</span></span></div>
     ${p.map((x,k)=>`<div class="pend">${x.m?tile(x.m,44):`<span class="prenda cat" style="--t:44px">${ico(x.t==='crear'?'chispa':'separar')}</span>`}<div><b>${x.txt}</b><small>${x.sub}</small></div><button class="btn" data-a="hacer" data-k="${k}">${x.t==='crear'?ico('mas'):''}${x.btn}</button></div>`).join('')}</section>`
     :`<section class="aviso verde seccion">${ico('ok')}<span><b>Nada quedó para después.</b> Todo al día.</span></section>`)+`
   ${nocuadro.length?`<section class="tarjeta seccion" style="padding:20px"><h2 style="font-size:24px;margin-bottom:8px">Lo que no cuadró</h2>${nocuadro.map(g=>{const d=g.extra?g.cont:dif(g);return `<div class="pend">${catTile(g.cat,44)}<div><b>${d>0?'+':''}${d} ${CAT[g.cat].n} · ${g.marca}</b><small>${g.causa||'—'} · Compras lo ve</small></div><span></span></div>`}).join('')}<p class="tenue" style="margin:10px 0 0;font-size:15px">La sede dice qué pasó; Compras decide qué pasa con la plata.</p></section>`:''}
   <section class="aviso seccion">${ico('reabrir')}<span><b>¿Encontraste algo más?</b> Reabre, corrige y cierra de nuevo.</span><span class="der">${porque('Lo que ya entró al stock no se toca.')}<button class="btn" data-a="reabrir">${ico('reabrir')}Reabrir el conteo</button></span></section>
   <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap"><button class="btn primario" data-a="volver">${ico('caja')}Recibir otro</button><button class="btn" data-a="toast" data-t="Abre «Ver todo lo recibido», como hoy">${ico('lista')}Ver todo lo recibido</button></div>`;
}

/* =========================== HOJAS =========================== */
let H=null;
function hoja(o){cerrarHoja(true);const v=document.createElement('div');v.className='velo';v.innerHTML=`<div class="hoja" role="dialog" aria-modal="true" style="--ancho:${o.ancho||576}px"></div>`;document.body.appendChild(v);H={v,o};pintarHoja(true);v.addEventListener('mousedown',ev=>{if(ev.target===v)cerrarHoja()})}
function pintarHoja(primera){if(!H)return;const o=H.o,h=$('.hoja',H.v);h.classList.toggle('quieta',!primera);
  h.innerHTML=`<h2>${o.titulo}</h2>${o.bajada?`<p class="bajada">${typeof o.bajada==='function'?o.bajada():o.bajada}</p>`:''}<div class="cuerpo">${o.cuerpo()}</div><div class="pie-acciones">${o.pie()}</div>${o.x?`<button class="redondo x" data-a="cerrarHoja" aria-label="Cerrar">${ico('x')}</button>`:''}`}
function cerrarHoja(ya){if(!H)return;const v=H.v;H=null;if(ya||RED){v.remove();return}$('.hoja',v).classList.add('sale');v.style.transition='opacity .22s';v.style.opacity=0;setTimeout(()=>v.remove(),220)}
const btnCancelar=t=>`<button class="btn" data-a="cerrarHoja">${t||'Cancelar'}</button>`;
function hojaDetalle(e){hoja({titulo:'Envío '+e.id,bajada:`Lo despachó ${e.de} · ${e.env}${e.guia?' · guía '+e.guia:''} · ${e.oc}`,cuerpo:()=>trayecto(e)+loQueTrae(e)+`<div class="campo"><label class="versal" style="font-size:14px">Quién recibe</label>${persona(S.resp)}</div>`,
  pie:()=>`<span class="izq tenue" style="font-size:15px">Al empezar, la compra ya no se anula.</span>${btnCancelar('Cerrar')}<button class="btn primario" data-a="empezar" data-id="${e.id}">${ico('caja')}Empezar a recibir${ico('flecha')}</button>`,ancho:620})}
function hojaSinGuia(e){hoja({titulo:`Recibir ${e.oc} sin guía`,bajada:`${e.prov} · ${dijo(e)} prendas por llegar a ${SEDE}.`,
  cuerpo:()=>`<div class="aviso">${ico('caja')}<span>Se arma un envío con lo que falta llegar y queda abierto para contar.</span>${porque('Desde ese momento la orden ya no se puede anular.')}</div><div class="campo"><label class="versal" style="font-size:14px">Quién recibe</label>${persona(S.resp)}</div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="empezarSinGuia" data-id="${e.id}">Empezar a recibir${ico('flecha')}</button>`})}
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

/* ---- C5 · TABLERO DE TALLAS (hoja) ---- */
let HT=null;
function hojaTallas(gi,si,modo){
  const e=env(),g=e.g[gi],s=g.sep[si],m=MOD[s.m];const orden=[];Object.entries(s.mat).forEach(([k,v])=>{for(let i=0;i<v;i++)orden.push(k)});
  HT={gi,si,mat:{...s.mat},dan:{...s.dan},orden,dmodo:false,arreglo:s.arreglo||null,modo};
  hoja({titulo:'Tallas y colores · '+m.n,bajada:()=>`Contaste ${s.n}. Toca la talla por cada prenda que sacas.`,ancho:760,
   cuerpo:()=>{const t=HT.orden.length,colH=Object.fromEntries(m.cols.map(c=>[c[0],c]));
    return `<div class="anot">${tile(s.m,52)}<div style="flex:1"><b style="font-size:18px">${m.n}</b><div class="tenue" style="font-size:15px">${m.cols.length*m.tal.length} combinaciones</div></div><button class="btn chico" data-a="toast" data-t="Abre «Sumar tallas o colores», como hoy">${ico('mas')}Talla o color</button><button class="btn chico" data-a="toast" data-t="Abre «Es nueva / Ya la tengo», como hoy">Cambiar</button></div>
     <div class="casillero" aria-label="Pusiste ${t} de ${s.n}">${Array.from({length:Math.max(s.n,t)},(_,k)=>{const key=HT.orden[k];if(!key)return '<i></i>';const[c,ta]=key.split('|'),cc=colH[c];return `<i class="on ${k>=s.n?'sobra':''} ${cc[2]&&k<s.n?'oscura':''}" data-color-dato style="--c:${cc[1]}">${ta}</i>`}).join('')}</div>
     <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="modo"><button data-a="dmodo" data-v="0" aria-pressed="${!HT.dmodo}">Buenas</button><button data-a="dmodo" data-v="1" aria-pressed="${HT.dmodo}">Dañadas</button></span>
      ${t>s.n?`<span class="chip ambar">Al guardar, lo contado pasa a ${t}</span>`:t===s.n?'<span class="chip punto verde">Listo</span>':`<span class="chip">Faltan ${s.n-t}</span>`}${HT.dmodo?'<span class="tenue" style="font-size:15px">Toca la talla de cada dañada.</span>':''}</div>
     <div class="tablero-t ${HT.dmodo?'danadas':''}"><div class="tt-fila cab" style="--nt:${m.tal.length}"><span></span>${m.tal.map(x=>`<span>${x}</span>`).join('')}</div>
      ${m.cols.map(([c,hx])=>`<div class="tt-fila" style="--nt:${m.tal.length}"><span class="tt-color" data-color-dato><i style="--c:${hx}"></i>${c}</span>${m.tal.map(ta=>{const k=c+'|'+ta,v=HT.mat[k]||0,dn=HT.dan[k]||0;
        return `<button class="tcel ${v?'tiene':''}" data-color-dato style="--c:${hx}" data-a="tcel" data-c="${k}" aria-label="${c} talla ${ta}: ${v}"><span class="v ${v?'':'cero'}">${v||'+'}</span>${v?`<span class="menos" data-a="tmenos" data-c="${k}" role="button" aria-label="Una menos">${ico('menos')}</span>`:''}${dn?`<span class="dan">${dn}</span>`:''}</button>`}).join('')}</div>`).join('')}</div>
     ${sum(HT.dan)?`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span style="font-weight:600">${sum(HT.dan)} dañadas: ¿tienen arreglo?</span><button class="opc" data-a="arreglo" data-v="si" aria-pressed="${HT.arreglo==='si'}">Sí, tienen arreglo</button><button class="opc" data-a="arreglo" data-v="no" aria-pressed="${HT.arreglo==='no'}">No tienen arreglo</button>${porque('Las dañadas no se venden: quedan en cuarentena hasta decidir.')}</div>`:''}
     ${modo==='meter'?vitrina(g,gi,s,si):''}`},
   pie:()=>`${btnCancelar('Dejar para después')}<button class="btn primario" data-a="guardarTallas" ${HT.orden.length===0?'disabled':''}>${modo==='meter'?ico('caja')+'Meter al stock':'Listo'}</button>`});
}
let OB={t:null,txt:''};
function hojaObs(){OB={t:null,txt:''};hoja({titulo:'Anotar observación',bajada:'Lo que viste al abrir la caja. No cambia lo contado.',ancho:620,
  cuerpo:()=>`<div class="rejilla-tipos">${OBS.map(([k,t])=>`<button class="topc" data-a="obsTipo" data-v="${k}" aria-pressed="${OB.t===k}"><span style="flex:1"><b>${t}</b></span>${OB.t===k?ico('ok'):''}</button>`).join('')}</div>
    <label class="campo"><span class="versal" style="font-size:14px">Qué viste</span><textarea class="caja" data-in="obsTxt" maxlength="300" placeholder="${OB.t==='rota'?'Ej. 1 blusa con el cierre roto':OB.t==='bulto'?'Ej. El fardo llegó mojado':'Ej. Lo que viste'}">${OB.txt}</textarea></label>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="obsGuardar" ${OB.t?'':'disabled'}>Guardar observación</button>`})}
let AC={c:null,m:'Sin marca'};
function hojaAgregar(){const e=env();AC={c:null,m:'Sin marca'};hoja({titulo:sinAviso(e)?'¿Qué llegó?':'Algo que no estaba en la guía',
  cuerpo:()=>`<div class="campo"><span class="versal" style="font-size:14px">Qué llegó</span><div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(CAT).map(([k,c])=>`<button class="opc" data-a="acCat" data-v="${k}" aria-pressed="${AC.c===k}" ${e.g.some(g=>g.cat===k&&g.marca===AC.m)?'disabled':''}>${ico(c.i)}${c.n}</button>`).join('')}</div></div>
    <div class="campo"><span class="versal" style="font-size:14px">La marca</span><div style="display:flex;gap:8px;flex-wrap:wrap">${['Sin marca','CAYLA'].map(k=>`<button class="opc" data-a="acMarca" data-v="${k}" aria-pressed="${AC.m===k}">${k}</button>`).join('')}</div></div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="acGuardar" ${AC.c?'':'disabled'}>${ico('mas')}Agregar y contar</button>`})}
let DN={txt:'',n:1};
function hojaDescribir(){const g=env().g[S.gi];DN={txt:'',n:g.nuevas};hoja({titulo:'Describir lo nuevo',bajada:`De ${g.nuevas} nuevas.`,ancho:520,
  cuerpo:()=>`<label class="campo"><span class="versal" style="font-size:14px">¿Qué son?</span><input class="caja" data-in="dnTxt" value="${DN.txt}" placeholder="Nombre, color, tallas (Ej. ${CAT[g.cat].s} lino azul S-M)"></label><div class="campo"><span class="versal" style="font-size:14px">¿Cuántas son?</span>${paso(DN.n,'dnN','')}</div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="dnGuardar">Guardar lo que son</button>`})}
function hojaCrear(gi,di){const d=env().g[gi].desc[di];hoja({titulo:'Crear la prenda que llegó',bajada:'Nombre, tallas, color y precio. Un líder la revisa después.',
  cuerpo:()=>`<label class="campo"><span class="versal" style="font-size:14px">Nombre de la prenda</span><input class="caja" value="${d.txt.split(' ').slice(0,2).join(' ')}"></label><div class="campo"><span class="versal" style="font-size:14px">Tallas</span><div style="display:flex;gap:8px">${['S','M','L'].map(t=>`<span class="opc" aria-pressed="true">${t}</span>`).join('')}</div></div><label class="campo"><span class="versal" style="font-size:14px">Precio de venta</span><input class="caja" value="69.90"></label>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="crearOk" data-gi="${gi}" data-di="${di}">Crear y contar</button>`})}
let RA='';
function hojaReabrir(){RA='';hoja({titulo:'Reabrir el conteo',bajada:'Lo que ya entró al stock no se toca.',ancho:520,
  cuerpo:()=>`<label class="campo"><span class="versal" style="font-size:14px">¿Por qué lo reabres?</span><input class="caja" data-in="raTxt" value="${RA}" placeholder="Ej. Apareció una falda en otra bolsa"></label><div class="campo"><span class="versal" style="font-size:14px">Quién lo reabre</span>${persona(S.resp)}</div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="raOk" ${RA.trim().length>=3?'':'disabled'}>${ico('reabrir')}Reabrir</button>`})}
function hojaConfirmar(e){const l=e.g.flatMap(g=>g.sep).filter(s=>(s.costoN!=null&&+s.costoN!==MOD[s.m].costo)||(s.precioN!=null&&+s.precioN!==MOD[s.m].precio));
  hoja({titulo:'Vas a cambiar costos y precios',cuerpo:()=>`${l.map(s=>{const m=MOD[s.m];return `<div class="anot">${tile(s.m,40)}<div><b>${m.n}</b><div style="font-size:16px">${s.costoN!=null&&+s.costoN!==m.costo?`Costo ${soles(m.costo)} → <b>${soles(s.costoN)}</b><br>`:''}${s.precioN!=null&&+s.precioN!==m.precio?`Precio ${soles(m.precio)} → <b>${soles(s.precioN)}</b> (${s.donde==='todas'?'todas las sedes':'solo '+CORTA})`:''}</div></div></div>`}).join('')}
    <div class="aviso ambar">${ico('alerta')}<span><b>Es dinero.</b> El precio rige desde ahora.</span>${porque('El costo cambia lo que cuesta lo que entra en este envío. El precio de venta rige desde ahora en donde lo elegiste.')}</div>`,
  pie:()=>btnCancelar()+`<button class="btn primario" data-a="cerrarYa">Confirmar y cerrar</button>`})}
let TE={};
function hojaTerminado(e){TE={};hoja({titulo:e.id,bajada:`Llegó el ${e.llego} · terminado el ${e.term} · ${e.prov} · recibió ${e.cerro}`,ancho:640,x:true,
  cuerpo:()=>trayecto(e)+e.g.flatMap(g=>g.sep).map((s,i)=>`<div class="tarjeta" style="padding:12px 14px"><button class="anot" style="width:100%;border:0;background:none;padding:0;text-align:left" data-a="teAbrir" data-v="${i}">${tile(s.m,44)}<b style="flex:1">${MOD[s.m].n}</b><span class="serif" style="font-size:30px">${s.n}</span>${ico(TE[i]?'abajo':'der')}</button>${TE[i]?matrizLectura(MOD[s.m],s.mat):''}</div>`).join('')+`<div class="tenue">${conto(e)} unidades en total</div>`,pie:()=>''})}
const matrizLectura=(m,o)=>`<table class="matriz" style="margin-top:8px"><thead><tr><th>Color</th>${m.tal.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${m.cols.map(([c,hex])=>`<tr><td><span class="col-color" data-color-dato><i style="--c:${hex}"></i>${c}</span></td>${m.tal.map(t=>`<td class="tot">${o[c+'|'+t]||'·'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/* =========================== ACCIONES =========================== */
function toast(t,sub){const x=document.createElement('div');x.className='toast';x.innerHTML=`${ico('ok')}<span><b>${t}</b>${sub?`<span class="tenue">${sub}</span>`:''}</span>`;document.body.appendChild(x);requestAnimationFrame(()=>x.classList.add('ver'));setTimeout(()=>{x.classList.remove('ver');setTimeout(()=>x.remove(),400)},2800)}
function guardarSolo(gi){S.guardando[gi]='va';const el=$('#guardado');if(el){el.className='guardado';el.textContent='Guardando…'}clearTimeout(guardarSolo['t'+gi]);guardarSolo['t'+gi]=setTimeout(()=>{S.guardando[gi]='ok';const g=env()?.g[gi];if(g)g.quien=S.resp;const el2=$('#guardado');if(el2&&S.gi===gi){el2.className='guardado ok';el2.innerHTML=ico('ok')+'Guardado'}},700)}
function flota(btn,txt){if(RED||!btn)return;const r=btn.getBoundingClientRect(),f=document.createElement('span');f.className='flota';f.textContent=txt;f.style.left=r.left+r.width/2+'px';f.style.top=r.top-6+'px';document.body.appendChild(f);setTimeout(()=>f.remove(),720)}
function ponerCont(n,btn){const e=env(),g=e.g[S.gi];const v=Math.max(minimo(g),n),d=v-(g.cont||0);S.chispa=d>0;S.celebra=!sinAviso(e)&&!g.extra&&g.dij&&v===g.dij&&g.cont!==g.dij;g.cont=v;if(btn&&d>0)flota(btn,'+'+d);guardarSolo(S.gi);render()}
function separar(m,cuantas,btn){const g=env().g[S.gi];let s=g.sep.find(x=>x.m===m);if(!s){s={m,n:0,mat:{},dan:{}};g.sep.push(s)}s.n+=cuantas;
  const t=btn&&btn.querySelector('.prenda');if(t)S.fly={m,r:t.getBoundingClientRect()};
  const id=ident(g);if(id>(g.cont||0)){g.cont=id;toast(`Se agregaron ${cuantas} «${MOD[m].n}»`,`El conteo ahora es ${id}.`)}guardarSolo(S.gi);render()}
const A={
  porque:b=>b.parentElement.classList.toggle('abierto'),
  tema:()=>{const r=document.documentElement,o=r.dataset.tema==='oscuro';if(o)delete r.dataset.tema;else r.dataset.tema='oscuro';pintaTema()},
  toast:b=>toast(b.dataset.t),
  irA:b=>{if(b.dataset.tab)S.tab=b.dataset.tab;render();$('#'+b.dataset.sec)?.scrollIntoView({behavior:RED?'auto':'smooth',block:'start'})},
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
  empezar:b=>{const e=E.find(x=>x.id===b.dataset.id);e.estado='abierto';cerrarHoja(true);toast(e.id+' abierto','Cuenta lo que llegó.');ir('envio',e.id,'contar')},
  empezarSinGuia:b=>{const e=E.find(x=>x.id===b.dataset.id);e.id='ENV-00'+(NUEVO++);e.estado='abierto';e.env='hoy';e.dias=0;cerrarHoja(true);toast(e.id+' abierto','Cuenta lo que llegó.');ir('envio',e.id,'contar')},
  sinAviso:()=>hojaSinAviso(),
  saProv:b=>{SA.prov=b.dataset.v;pintarHoja()},
  saEmpezar:()=>{const id='ENV-00'+(NUEVO++);E.unshift({id,estado:'abierto',sinAviso:true,provOk:SA.prov!=='?',env:'hoy',dias:0,prov:SA.prov==='?'?'Por confirmar':SA.prov,guia:SA.guia,oc:'',fardos:null,de:'—',papel:{foto:false,tipo:'Sin papel',quien:'—',f:'hoy'},g:[]});cerrarHoja(true);toast(id+' abierto','Llegó sin aviso: cuéntalo por categoría.');ir('envio',id,'contar')},
  volver:()=>ir('portada'),
  paso:b=>{if(b.disabled)return;S.paso=b.dataset.v;window.scrollTo({top:0,behavior:RED?'auto':'smooth'});render(true)},
  cat:b=>{if(b.disabled)return;S.gi=+b.dataset.v;S.busca='';render()},
  editarNum:()=>{S.editNum=true;render()},
  sumar:b=>{const g=env().g[S.gi];ponerCont((g.cont||0)+(+b.dataset.d),b)},
  poner:b=>ponerCont(+b.dataset.v,b),
  anotada:b=>{const g=env().g[S.gi],a=g.anot.find(x=>x.m===b.dataset.m);separar(a.m,a.n,b)},
  elegir:b=>{S.busca='';separar(b.dataset.m,1,b)},
  nuevaTxt:()=>{const g=env().g[S.gi];g.desc.push({txt:S.busca,n:1});S.busca='';if(ident(g)>(g.cont||0))g.cont=ident(g);guardarSolo(S.gi);render()},
  sepN:b=>{const g=env().g[S.gi],s=g.sep[+b.dataset.si];s.n=Math.max(Math.max(1,conTallas(s)),s.n+(+b.dataset.d));if(ident(g)>(g.cont||0)){g.cont=ident(g);toast('Separaste más de lo que contaste',`El conteo pasó a ${g.cont}.`)}guardarSolo(S.gi);render()},
  descN:b=>{const g=env().g[S.gi],d=g.desc[+b.dataset.di];d.n=Math.max(1,d.n+(+b.dataset.d));if(ident(g)>(g.cont||0))g.cont=ident(g);render()},
  quitarSep:b=>{env().g[S.gi].sep.splice(+b.dataset.si,1);guardarSolo(S.gi);render()},
  quitarDesc:b=>{env().g[S.gi].desc.splice(+b.dataset.di,1);render()},
  nuevas:b=>{const g=env().g[S.gi];g.nuevas=Math.max(0,g.nuevas+(+b.dataset.d));render()},
  describir:()=>hojaDescribir(),
  dnN:b=>{DN.n=Math.max(1,Math.min(env().g[S.gi].nuevas,DN.n+(+b.dataset.d)));pintarHoja()},
  dnGuardar:()=>{if(DN.txt.trim().length<3){toast('Escribe al menos 3 letras');return}const g=env().g[S.gi];g.desc.push({txt:DN.txt.trim(),n:DN.n});g.nuevas-=DN.n;if(ident(g)>(g.cont||0))g.cont=ident(g);cerrarHoja();render()},
  crear:b=>hojaCrear(S.gi,+b.dataset.di),
  crearOk:b=>{const gi=+b.dataset.gi,di=+b.dataset.di,e=env(),g=e.g[gi],d=g.desc[di];MOD.nuevaX={n:d.txt.split(' ').slice(0,2).map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),cat:g.cat,cols:[['Azul','var(--dato-azul)']],tal:['S','M','L'],costo:30,precio:69.9};
    g.desc.splice(di,1);g.sep.push({m:'nuevaX',n:d.n,mat:{},dan:{}});cerrarHoja(true);toast(MOD.nuevaX.n+' creada','Un líder la revisa después.');render();hojaTallas(gi,g.sep.length-1,e.estado==='abierto'?null:'meter')},
  tallas:b=>hojaTallas(S.gi,+b.dataset.si),
  tcel:(b,ev)=>{if(ev.target.closest('[data-a="tmenos"]'))return;const k=b.dataset.c;if(HT.dmodo){HT.dan[k]=Math.min(HT.mat[k]||0,(HT.dan[k]||0)+1)}else{HT.mat[k]=(HT.mat[k]||0)+1;HT.orden.push(k)}pintarHoja()},
  tmenos:b=>{const k=b.dataset.c;if(HT.dmodo){HT.dan[k]=Math.max(0,(HT.dan[k]||0)-1)}else{HT.mat[k]=Math.max(0,(HT.mat[k]||0)-1);const i=HT.orden.lastIndexOf(k);if(i>-1)HT.orden.splice(i,1);HT.dan[k]=Math.min(HT.dan[k]||0,HT.mat[k])}pintarHoja()},
  dmodo:b=>{HT.dmodo=b.dataset.v==='1';pintarHoja()},
  arreglo:b=>{HT.arreglo=b.dataset.v;pintarHoja()},
  guardarTallas:()=>{const e=env(),g=e.g[HT.gi],s=g.sep[HT.si],t=sum(HT.mat);s.mat=HT.mat;s.dan=HT.dan;s.arreglo=HT.arreglo;if(t>s.n){s.n=t;if(ident(g)>(g.cont||0))g.cont=ident(g)}
    const meter=HT.modo==='meter';cerrarHoja();
    if(meter){toast(`${pl(t,'prenda entró','prendas entraron')} al stock`,pendN(e)?pendN(e)+' quedan para después':'');if(!pendN(e)){e.estado='terminado';e.term='29/10';e.llego=e.llego||'29/10'}render(true)}else{guardarSolo(HT.gi);render()}},
  observacion:()=>hojaObs(),
  obsTipo:b=>{OB.t=b.dataset.v;pintarHoja()},
  obsGuardar:()=>{env().g[S.gi].obs.push({t:OBS.find(o=>o[0]===OB.t)[1],txt:OB.txt});cerrarHoja();toast('Observación guardada');render()},
  agregarCat:()=>hojaAgregar(),
  acCat:b=>{AC.c=b.dataset.v;pintarHoja()},acMarca:b=>{AC.m=b.dataset.v;pintarHoja()},
  acGuardar:()=>{const e=env();e.g.push(G(AC.c,0,[],{marca:AC.m,extra:!sinAviso(e)}));S.gi=e.g.length-1;cerrarHoja();render()},
  contarla:b=>{S.paso='contar';S.gi=+b.dataset.v;render(true)},
  causa:b=>{env().g[+b.dataset.gi].causa=b.dataset.v;render()},
  donde:b=>{const s=env().g[+b.dataset.gi].sep[+b.dataset.si];s.donde=b.dataset.v;H?pintarHoja():render()},
  provCierre:b=>{const e=env();e.prov=b.dataset.v;e.provOk=true;render()},
  pedirCerrar:b=>{if(b.disabled)return;const e=env();if(e.g.flatMap(g=>g.sep).some(s=>(s.costoN!=null&&+s.costoN!==MOD[s.m].costo)||(s.precioN!=null&&+s.precioN!==MOD[s.m].precio))){hojaConfirmar(e);return}A.cerrarYa()},
  cerrarYa:()=>{const e=env();cerrarHoja(true);e.estado='cerrado';e.cerrado='hoy';e.diasCerrado=0;e.cerro=S.resp;e.llego='29/10';if(!pendN(e)){e.estado='terminado';e.term='29/10'}
    toast(e.id+' cerrado',`${T(e,vender)} entraron al stock; ${pendN(e)} quedan para después.`);window.scrollTo({top:0});render(true)},
  hecho:b=>{toast(b.dataset.t);const h=S.hechos[S.id]=S.hechos[S.id]||{};h[b.dataset.k]=true;render()},
  hacer:b=>{const e=env(),p=pendientes(e)[+b.dataset.k];if(!p)return;S.gi=p.gi;if(p.t==='detalle')hojaTallas(p.gi,p.si,'meter');else if(p.t==='crear')hojaCrear(p.gi,p.di);else toast('Abre «Separar», como hoy')},
  reabrir:()=>hojaReabrir(),
  raOk:()=>{const e=env();e.estado='abierto';e.reabierto=true;cerrarHoja(true);toast(e.id+' reabierto');ir('envio',e.id,'contar')}
};
const IN={
  q:v=>{S.q=v;const p=document.activeElement.selectionStart;render();const i=$('[data-in="q"]');i.focus();i.setSelectionRange(p,p)},
  busca:v=>{S.busca=v;$('#resultados').innerHTML=resultados(env().g[S.gi])},
  sepN:(v,el)=>{const s=env().g[S.gi].sep[+el.dataset.si],n=+v.replace(/\D/g,'');if(n>0)s.n=Math.max(conTallas(s),n)},
  nuevas:v=>{env().g[S.gi].nuevas=+v.replace(/\D/g,'')||0},
  causaNota:(v,el)=>{env().g[+el.dataset.gi].causaNota=v},costoLinea:(v,el)=>{env().g[+el.dataset.gi].costoLinea=v},
  costoN:(v,el)=>{env().g[+el.dataset.gi].sep[+el.dataset.si].costoN=v},precioN:(v,el)=>{env().g[+el.dataset.gi].sep[+el.dataset.si].precioN=v},
  guia:v=>{S.guia=v},nota:v=>{S.nota=v},
  saQ:v=>{SA.q=v;const p=document.activeElement.selectionStart;pintarHoja();const i=$('[data-in="saQ"]');i.focus();i.setSelectionRange(p,p)},saGuia:v=>{SA.guia=v},
  obsTxt:v=>{OB.txt=v},dnTxt:v=>{DN.txt=v},raTxt:v=>{RA=v;const b=$('[data-a="raOk"]');if(b)b.disabled=v.trim().length<3}
};
document.addEventListener('click',ev=>{
  let b=ev.target.closest('[data-a]');
  if(S.pop&&!ev.target.closest('.pild')){S.pop=null;if(!b){render();return}}
  if(S.quienPop&&!ev.target.closest('.persona-caja')){S.quienPop=false;if(!b){H?pintarHoja():render();return}}
  if(!b||b.disabled)return;
  if(b.classList.contains('btn')&&!RED){const r=b.getBoundingClientRect(),o=document.createElement('span'),s=Math.max(r.width,r.height)*2;o.className='onda';o.style.cssText=`width:${s}px;height:${s}px;left:${ev.clientX-r.left-s/2}px;top:${ev.clientY-r.top-s/2}px`;b.appendChild(o);setTimeout(()=>o.remove(),560)}
  const f=A[b.dataset.a];if(f)f(b,ev);
});
document.addEventListener('input',ev=>{const el=ev.target.closest('[data-in]');if(!el)return;const f=IN[el.dataset.in];if(f)f(el.value,el)});
document.addEventListener('change',ev=>{const el=ev.target.closest('[data-in]');if(!el)return;if(['sepN','nuevas','costoN','precioN'].includes(el.dataset.in)){H?pintarHoja():render()}});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if(S.pop){S.pop=null;render();return}if(H)cerrarHoja()}});

function pintaTema(){const o=document.documentElement.dataset.tema==='oscuro',t=$('.tema');if(t)t.innerHTML=ico(o?'sol':'luna');try{localStorage.setItem('cayla-tema',o?'oscuro':'claro')}catch(_){}}
try{if(localStorage.getItem('cayla-tema')==='oscuro')document.documentElement.dataset.tema='oscuro'}catch(_){}
window.RB={S,E,MOD,ico,trayecto,filaEnvio,dialF,acordeon,bandeja,podio,vitrina,lacre,isla,hojaTallas,render,setEnvio:id=>{S.id=id;S.pant='envio'}};
document.addEventListener('DOMContentLoaded',()=>{pintaTema();render(true)});
})();
