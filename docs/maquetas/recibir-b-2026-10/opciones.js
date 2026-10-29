/* Recibir · ronda 3 de opciones (2026-10-29). Felipe eligió: el Trayecto del flujo y el Dial (mejorados, con más animación) y el Sello
   de lacre; pidió rehacer las otras seis piezas. Cada opción es una muestra viva; «Me gusta esta» guarda la elección en este navegador.
   La ronda 2 sigue en ronda2.html. */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RED=matchMedia('(prefers-reduced-motion: reduce)').matches;
const P={ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',mas:'<path d="M12 5v14M5 12h14"/>',menos:'<path d="M5 12h14"/>',flecha:'<path d="M5 12h14M13 6l6 6-6 6"/>',atras:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
  repetir:'<path d="M4 4v6h6"/><path d="M20 12A8 8 0 0 0 5.5 7.5L4 10M4 12a8 8 0 0 0 14.5 4.5"/>',corazon:'<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  blusa:'<path d="M8 4l-5 4 2.5 4L8 11v9h8v-9l2.5 1L21 8l-5-4c-.5 1.8-2 3-4 3S8.5 5.8 8 4z"/>',falda:'<path d="M9 4h6l1 3 4 13H4L8 7z"/><path d="M8 7h8"/>',pantalon:'<path d="M7 3h10l1 18h-4l-2-10-2 10H6z"/><path d="M7 7h10"/>',
  etiqueta:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',piso:'<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M10 20v-6h4v6"/>',caja:'<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
  camion:'<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',abierta:'<path d="M3 9l9 4 9-4M3 9l9-5 9 5v8l-9 4-9-4z"/><path d="M3 9l-1.5 3 9 4L12 13M21 9l1.5 3-9 4"/>',
  pin:'<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',abajo:'<path d="M6 9l6 6 6-6"/>',copiar:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  mano:'<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1.3-5.5-3.6L3.6 14.5a1.5 1.5 0 0 1 2.5-1.7L8 15"/>'};
const ico=(n,c)=>`<svg class="i ${c||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]||''}</svg>`;
const cl=(v,a,b)=>Math.max(a,Math.min(b,v)),soles=n=>'S/ '+(+n).toFixed(2);
const tile=(c,i,t,o)=>`<span class="prenda ${o?'oscura':''}" data-color-dato style="--c:${c};--t:${t||40}px">${ico(i)}</span>`;
const anillo=(p,cls,centro,k,st)=>`<span class="anillo ${cls||''}" style="--p:${cl(p,0,100)};${st||''}"><svg viewBox="0 0 40 40"><circle class="pista" cx="20" cy="20" r="16" pathLength="100"/><circle class="arco" ${k?`data-k="${k}"`:''} cx="20" cy="20" r="16" pathLength="100" style="stroke-dashoffset:${100-cl(p,0,100)};${p<=0?'opacity:0':''}"/></svg><span class="c">${centro||''}</span></span>`;
const odo=(n,key)=>{const s=String(n);return `<span class="odo">${s.split('').map((v,i)=>`<span class="dg"><span class="tr" data-k="${key}-${s.length}-${i}" style="transform:translateY(-${v*1.15}em)">${[0,1,2,3,4,5,6,7,8,9].map(x=>`<span>${x}</span>`).join('')}</span></span>`).join('')}</span>`};
const ETAPAS=['Salió','En camino','Contando','Por terminar','Recibido'],IC=['caja','camion','abierta','etiqueta','piso'];
const MODS={emma:{n:'Blusa Emma',c:'var(--dato-negro)',o:1},valentina:{n:'Blusa Valentina',c:'var(--dato-verde)'}};
const ANOT=[{m:'emma',n:4},{m:'valentina',n:2}];
const COLS=[['Negro','var(--dato-negro)',1],['Beige','var(--dato-beige)',0]],TALLAS=['S','M','L'];
const EJ={cuadra:{t:'Cuadra',dij:6,cont:6,v:4,d:2},faltan:{t:'Faltan',dij:12,cont:10,v:4,d:6},sobran:{t:'Sobran',dij:8,cont:11,v:8,d:3}};
const CATS2=()=>[{n:'Blusas',i:'blusa',c:4,d:6,pr:[{n:'Blusa Emma',col:'var(--dato-negro)',o:1,e:4,id:4},{n:'Blusa Valentina',col:'var(--dato-verde)',e:2,id:0}]},
  {n:'Faldas',i:'falda',c:3,d:3,pr:[{n:'Falda Ariana',col:'var(--dato-rosado)',e:3,id:3}]},{n:'Pantalones',i:'pantalon',c:null,d:4,pr:[{n:'Pantalón Carla',col:'var(--dato-azul)',e:4,id:0}]}];
const estadoPrenda=p=>p.id===p.e?'<span class="chip punto verde">Identificadas</span>':p.id?`<span class="chip punto ambar">${p.id} de ${p.e}</span>`:'<span class="chip punto">Por identificar</span>';
const filaPrenda=(p,j)=>`<div class="k4a-pr ${j>=0?'llega':''}" style="--d:${Math.max(0,j)*90}ms">${tile(p.col,'blusa',44,p.o)}<span class="t"><span class="l1"><b>${p.n}</b><small>× ${p.e} en la compra</small></span><span class="l2"><span class="k4a-pts">${Array.from({length:p.e},(_,k)=>`<i class="${k<p.id?'on':''}"></i>`).join('')}</span>${estadoPrenda(p)}</span></span></div>`;
const CATS=()=>[{n:'Blusas',i:'blusa',c:4,d:6},{n:'Faldas',i:'falda',c:3,d:3},{n:'Pantalones',i:'pantalon',c:null,d:4}];
const veredicto=(n,d)=>n===d?`<span class="chip punto verde">Cuadra</span>`:n<d?`<span class="chip punto ambar">Faltan ${d-n}</span>`:`<span class="chip punto ambar">Sobran ${n-d}</span>`;
const ctl=b=>`<div class="controles">${b}</div>`;
const accCats={sel:(st,v)=>{st.sel=+v},mas:st=>{const c=st.cats[st.sel];c.c=(c.c||0)+1},prev:st=>{st.sel=Math.max(0,st.sel-1)},next:st=>{st.sel=Math.min(st.cats.length-1,st.sel+1)}};
const ctlCats=st=>ctl(`<button class="btn primario chico" data-x="mas">${ico('mas')}Una más en ${st.cats[st.sel].n}</button>`);
const anotsHtml=st=>`<div class="anots">${ANOT.map(a=>{const ya=st.asig.includes(a.m);return `<button class="btn chico" data-x="asig" data-v="${a.m}" ${ya||st.asig.length>=st.cont?'disabled':''}>${tile(MODS[a.m].c,'blusa',28,MODS[a.m].o)}${MODS[a.m].n} × ${a.n}</button>`}).join('')}<button class="btn enlace" data-x="deshacer">Deshacer</button></div>`;
const accIdent={asig:(st,m)=>{st.antes=st.asig.length;const a=ANOT.find(x=>x.m===m);for(let i=0;i<a.n&&st.asig.length<st.cont;i++)st.asig.push(m)},deshacer:st=>{st.antes=undefined;st.asig=[]}};
const totT=st=>Object.values(st.mat).reduce((a,b)=>a+b,0);
const tallasCab=st=>{const t=totT(st);return `<div class="tl-cab"><span class="etq">Blusa Emma · pusiste ${t} de ${st.tot}</span><span class="avance ${t===st.tot?'verde':''}"><i data-k="tav" style="width:${Math.min(100,t/st.tot*100)}%;animation:none"></i></span>${t===st.tot?'<span class="chip punto verde">Listo</span>':t>st.tot?`<span class="chip ambar">Sube a ${t}</span>`:`<span class="chip">Faltan ${st.tot-t}</span>`}<button class="btn enlace" data-x="borrar">Borrar</button></div>`};
const accTallas={add:(st,k)=>{st.ult=k;st.mat[k]=(st.mat[k]||0)+1;st.orden.push(k)},borrar:st=>{st.mat={};st.orden=[];st.ult=null}};
const ctlEj=st=>`<div class="ejs">${Object.entries(EJ).map(([k,e])=>`<button class="btn chico ${st.ej===k?'primario':''}" data-x="ej" data-v="${k}">${e.t}</button>`).join('')}</div>`;
const leyenda=e=>{const f=Math.max(0,e.dij-e.cont),s=Math.max(0,e.cont-e.dij);return `<div class="ley"><span><i style="--c:var(--verde)"></i>${e.v} se venden ya</span><span><i style="--c:var(--taupe)"></i>${e.d} para después</span>${f?`<span><i style="--c:color-mix(in srgb,var(--ambar) 45%,transparent)"></i>${f} faltan</span>`:''}${s?`<span><i style="--c:var(--ambar)"></i>${s} sobran</span>`:''}</div>`};
const avBar=p=>{const cats=['Blusas','Faldas','Pantalones'],est=cats.map((_,i)=>p>=2*i+2?'l':p>=2*i+1?'c':''),sig=est.findIndex(x=>x!=='l');return {cats,est,pct:Math.round(p/6*100),lbl:sig===-1?'Pasar a cerrar':est[sig]==='c'?'Identificar '+cats[sig].toLowerCase():'Contar '+cats[sig].toLowerCase(),sig}};
const accBarra={avanzar:st=>{st.antes=st.p;st.p=Math.min(6,st.p+1);st.fresco=true},reiniciar:st=>{st.antes=st.p;st.p=0;st.fresco=false}};
const ctlBarra=ctl(`<button class="btn chico primario" data-x="avanzar">Avanzar el conteo${ico('flecha')}</button><button class="btn chico" data-x="reiniciar">Reiniciar</button>`);
const CONT=[0,4,4,7,7,11,13],IDEN=[0,0,4,4,7,7,13];

/* ---------------- 1 · Trayecto mejorado ---------------- */
const FILAS=[{id:'ENV-002765',prov:'Textiles Andina SAC',sub:'guía T001-000512',n:6,lbl:'prendas',acc:'Seguir recibiendo',prim:1,trae:[['blusa','Blusas',4],['falda','Faldas',2]],
   det:['27/10 · 17:25','hace 2 días · 2 fardos','4 de 6 contadas','2 por poner tallas','29/10 · 10:42'],pp:[100,100,67,60,100]},
  {id:'ENV-001990',prov:'CAYLA SAC',sub:'cerrado hace 9 días',n:3,lbl:'por terminar',acc:'Terminar',prim:1,trae:[['blusa','Blusas',3]],det:['','','','3 por poner tallas',''],pp:[0,0,0,0,0]},
  {id:'ENV-003035',prov:'CAYLA SAC',sub:'recibió Micaela',n:5,lbl:'prendas',acc:'Ver',trae:[['falda','Faldas',3],['blusa','Blusas',2]],det:['','','','','29/10 · 10:42'],pp:[0,0,0,0,100]}];
function filaT2(f,k,i,antes){
  const tono=k>=4?'t-listo':k>=2?'t-cont':'';
  return `<div class="t2-fila" style="--i:${i}"><div class="t2-id"><b>${f.id}</b><span>${f.prov}</span><span>${f.sub}</span></div>
   <div class="t2 ${tono}"><div class="t2-via"><span class="t2-lleno" data-k="ll${i}" style="width:${k/4*100}%"></span></div>
    ${ETAPAS.map((e,j)=>j===k?'':`<span class="t2-p ${j<k?'hecho':'futuro'} ${j===0||j===4?'extremo':''} ${antes!=null&&j<k&&j>=antes?'recien':''}" style="left:${j/4*100}%;--j:${j}">${j<k?ico('ok'):''}<em>${e}</em></span>`).join('')}
    <span class="t2-marca" data-k="mk${i}" style="left:${k/4*100}%"><span class="t2-halo"></span><span class="t2-bola" style="--pp:${f.pp[k]}">${ico(IC[k])}</span><span class="t2-et ${antes!=null?'cambia':''}"><b>${ETAPAS[k]}</b><small>${f.det[k]}</small></span></span></div>
   <div class="t2-n" tabindex="0"><span class="num-s">${f.n}</span><small>${f.lbl}</small><span class="t2-peek"><span class="versal">Lo que trae</span>${f.trae.map(([ic,nm,c],x)=>`<span class="f" style="--i:${x}">${tile('var(--hueso)',ic,30)}${nm}<b>${c}</b></span>`).join('')}</span></div>
   <div><button class="btn chico ${f.prim?'primario':''}">${f.acc}${f.prim?ico('flecha'):''}</button></div></div>`;
}

/* ---------------- 2 · Dial mejorado ---------------- */
function dial2(st){
  const D=st.dij,n=st.n,ok=n===D,mas=n>D,p=Math.min(n,D)/D*100,x=mas?Math.min(100,(n-D)/D*100):0,a=Math.min(n,D)/D*360;
  const cortes=Array.from({length:D},(_,i)=>{const t=i/D*Math.PI*2;return `<line class="corte" style="--i:${i}" x1="${145+Math.cos(t)*94}" y1="${145+Math.sin(t)*94}" x2="${145+Math.cos(t)*116}" y2="${145+Math.sin(t)*116}"/>`}).join('');
  const txt=n===D?`cuadra · ${D}`:n<D?`faltan ${D-n} de ${D}`:`sobran ${n-D}`;
  return `<div class="d2-zona"><div class="d2 ${ok?'ok':mas?'mas':''} ${st.celebra?'celebra':''}" data-k="dr" style="--p:${p};--x:${x}" aria-label="Contadas: ${n} de ${D}">
    <svg viewBox="0 0 290 290" aria-hidden="true"><circle class="pista" cx="145" cy="145" r="105"/><circle class="arco" data-k="dar" cx="145" cy="145" r="105" pathLength="100" style="stroke-dashoffset:${100-p}"/>${cortes}<circle class="brillo" cx="145" cy="145" r="105" pathLength="100"/><circle class="extra" data-k="dex" cx="145" cy="145" r="128" pathLength="100" style="stroke-dashoffset:${100-x}"/>
     <g class="perilla ${st.chispa?'chispa':''}" data-k="per" style="transform:rotate(${a}deg)"><circle class="g" cx="250" cy="145" r="15"/><circle class="b" cx="250" cy="145" r="15"/><circle class="c" cx="250" cy="145" r="5"/></g></svg>
    <span class="d2-glow"></span><div class="d2-centro">${st.editando?`<input class="d2-in" id="d2in" inputmode="numeric" autocomplete="off" value="${n}" aria-label="Cuántas llegaron">`:`<button class="d2-num" data-x="editar" aria-label="Escribir cuántas llegaron (ahora ${n})">${odo(n,'dn')}</button>`}<small>${txt}</small></div><span class="d2-ok">${ico('ok')}</span>
    <button class="d2-btn m" data-x="menos" aria-label="Una menos">${ico('menos')}</button><button class="d2-btn p" data-x="mas" aria-label="Una más">${ico('mas')}</button></div>
   <div style="display:grid;gap:12px;justify-items:start"><button class="btn grande" data-x="todas">${ico('ok')}Llegaron las ${D}</button><div style="display:flex;gap:8px"><button class="btn sutil" data-x="cinco">+5</button><button class="btn" data-x="cero">Poner en cero</button></div>
    <span class="tenue" style="display:flex;gap:8px;align-items:center;font-size:15px">${ico('mano')}Toca el número para escribirlo</span>${veredicto(n,D)}</div></div>`;
}
function sumaDial(st,d){const v=Math.max(0,st.n+d);st.chispa=v>st.n;st.celebra=v===st.dij&&st.n!==st.dij;st.n=v}
const accDial={editar:st=>{st.editando=true},mas:st=>sumaDial(st,1),menos:st=>sumaDial(st,-1),cinco:st=>sumaDial(st,5),todas:st=>sumaDial(st,st.dij-st.n),cero:st=>sumaDial(st,-st.n)};

/* ---------------- 8 · Sello de lacre (elegido) ---------------- */
function lacre(){const pts=[];for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=i%2?42:46;pts.push(`${50+Math.cos(a)*r} ${50+Math.sin(a)*r}`)}
  return `<div class="rb"><svg class="rb-lacre" viewBox="0 0 100 100" aria-hidden="true"><path d="M${pts.join(' L')}Z"/><circle cx="50" cy="50" r="32" fill="none" stroke="color-mix(in srgb,var(--crema-fija) 35%,transparent)" stroke-width="2"/><text x="50" y="62" text-anchor="middle">C</text></svg>
   <span class="versal">Envío cerrado · 29/10 10:42</span><h4>ENV-002668 recibido</h4><span class="tenue">Lo cerró Micaela. El conteo ya es oficial.</span>
   <div class="rb-4">${[['Dijeron',2],['Contaste',2],['En el stock',2],['Para después',0]].map(([t,n],i)=>`<div style="--i:${i}"><span class="num-s" data-cuenta="${n}">${n}</span><small>${t}</small></div>`).join('')}</div>
   <div class="controles"><button class="btn primario">${ico('etiqueta')}Imprimir 2 etiquetas</button><button class="btn">${ico('piso')}Bajar al piso</button></div></div>`}

/* ---------------- 7 · ayudantes de precio ---------------- */
function up7a(st,el){const m=st.precio?(st.precio-st.costo)/st.precio*100:0;$('#ag7',el).style.setProperty('--a',(-90+cl(m,0,80)/80*180)+'deg');$('#pc7',el).textContent=Math.round(m)+'%';$('#gn7',el).textContent=(st.precio>=st.costo?'ganas ':'pierdes ')+soles(Math.abs(st.precio-st.costo))+' por prenda'}
function pilas(st){const nc=Math.min(24,Math.round(st.costo/5)),ng=Math.min(24,Math.max(0,Math.round((st.precio-st.costo)/5))),pc=st.pc??0,pg=st.pg??0;st.pc=nc;st.pg=ng;
  const col=(n,prev,c)=>`<span class="c7c-col">${Array.from({length:n},(_,i)=>`<span class="moneda ${i>=prev?'nuevo':''}" style="--c:${c};--d:${(i-prev)*45}ms"></span>`).join('')}</span>`;
  return `<span class="c7c-pila">${col(nc,pc,'var(--borde-control)')}<b>${soles(st.costo)}</b><small>Costo</small></span><span class="c7c-pila">${col(ng,pg,'color-mix(in srgb,var(--verde) 85%,var(--ambar))')}<b>${soles(Math.max(0,st.precio-st.costo))}</b><small>Ganas</small></span>`}

/* ===================================================== LAS PIEZAS ===================================================== */
const C=[
{id:'estado',n:'El estado del envío',intro:'El del flujo, con más cuidado y movimiento.',fija:{mejoras:['La línea se dibuja y brilla al entrar','El marcador viaja de parada en parada','Cada parada hecha dibuja su ✓','Un halo al llegar','El aro del marcador dice cuánto va','«Lo que trae» entra en cascada al pasar el mouse']},ops:[
 {k:'1',t:'Trayecto mejorado',idea:'Toca «Siguiente estado» para ver viajar la primera fila. Pasa el mouse por las filas y por el número.',init:()=>({k:1}),acc:{mueve:(st,v)=>{st.antes=st.k;st.k=cl(st.k+(+v),0,4)}},
  render:st=>`<div class="t2-lista">${filaT2(FILAS[0],st.k,0,st.antes)}${filaT2(FILAS[1],3,1)}${filaT2(FILAS[2],4,2)}</div>${ctl(`<button class="btn chico" data-x="mueve" data-v="-1" ${st.k===0?'disabled':''}>${ico('atras')}Estado anterior</button><button class="btn chico primario" data-x="mueve" data-v="1" ${st.k===4?'disabled':''}>Siguiente estado${ico('flecha')}</button>`)}`}]},
{id:'contador',n:'El contador',intro:'El Dial que te gustó, con animación más fina.',fija:{mejoras:['El aro se llena y los cortes aparecen uno por uno','Toca el número y escríbelo con el teclado','El número rueda como un contador','Chispa en cada prenda que sumas','Al cuadrar: destello verde, brillo que da la vuelta y ✓','Si sobran, un segundo aro ámbar']},ops:[
 {k:'1',t:'Dial mejorado',idea:'Prueba +, «Llegaron las 6» y toca el número para escribir otro.',init:()=>({n:3,dij:6}),acc:accDial,render:dial2,
  after:(el,st,rep)=>{const i=el.querySelector('#d2in');if(!i)return;i.focus();i.select();let listo=false;
   const fin=guardar=>{if(listo)return;listo=true;st.editando=false;if(guardar){const v=i.value.replace(/\D/g,'');if(v!==''){const n=+v;st.chispa=n>st.n;st.celebra=n===st.dij&&st.n!==st.dij;st.n=n}}rep()};
   i.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();fin(true)}if(ev.key==='Escape'){ev.preventDefault();fin(false)}});
   i.addEventListener('input',()=>{i.value=i.value.replace(/\D/g,'').slice(0,3)});i.addEventListener('blur',()=>fin(true))}}]},
{id:'categorias',n:'Las categorías del envío',intro:'Cada categoría despliega las prendas que se anotaron en la compra, para ver el detalle. No se cuenta aquí: aquí se mira.',ops:[
 {k:'A',t:'Acordeón',idea:'Cada categoría es una fila con su aro; al tocarla se abre y muestra sus prendas de la compra, cada una con su avance.',init:()=>({sel:0,cats:CATS2()}),acc:{sel:(st,v)=>{st.antes=st.sel;st.sel=st.sel===+v?-1:+v}},
  render:st=>`<div class="k4a">${st.cats.map((x,i)=>{const ab=i===st.sel;return `<div class="k4a-g ${ab?'abierta':''}"><button class="k4a-cab" data-x="sel" data-v="${i}" aria-expanded="${ab}">${anillo((x.c||0)/x.d*100,x.c===x.d?'ok':'',ico(x.i),'ka'+i)}<span><b>${x.n}</b><small>${x.c==null?'Sin contar':x.c+' de '+x.d+' contadas'} · ${x.pr.length} ${x.pr.length===1?'prenda':'prendas'}</small></span><span class="k4a-fl">${ico('abajo')}</span></button>
   <div class="k4a-cuerpo" data-k="kc${i}" style="max-height:${ab?x.pr.length*120+30:0}px"><div class="k4a-in">${x.pr.map((p,j)=>filaPrenda(p,ab&&st.antes!==undefined?j:-1)).join('')}</div></div></div>`}).join('')}</div>`},
 {k:'B',t:'Pestañas con vitrina',idea:'Arriba, las categorías como pestañas con su aro; abajo, sus prendas de la compra como tarjetas que entran al cambiar.',init:()=>({sel:0,cats:CATS2()}),acc:{sel:(st,v)=>{st.antes=st.sel;st.sel=+v}},
  render:st=>{const x=st.cats[st.sel];return `<div class="k4b"><div class="k4b-tabs"><span class="k4b-luz"></span>${st.cats.map((y,i)=>`<button class="k4b-tab ${i===st.sel?'sel':''}" data-x="sel" data-v="${i}">${anillo((y.c||0)/y.d*100,y.c===y.d?'ok':'',ico(y.i),'kb'+i,'--s:40px;--g:5')}<span><b>${y.n}</b><small>${y.c==null?'—':y.c}/${y.d}</small></span></button>`).join('')}</div>
   <div class="k4b-panel">${x.pr.map((p,j)=>`<div class="k4b-card ${st.antes!==undefined?'llega':''}" style="--d:${j*90}ms">${tile(p.col,'blusa',64,p.o).replace(ico('blusa'),ico(x.i))}<b>${p.n}</b><span class="tenue">× ${p.e} en la compra</span><span class="k4b-bar"><i data-k="kbb${st.sel}-${j}" style="width:${p.id/p.e*100}%"></i></span>${estadoPrenda(p)}</div>`).join('')}</div></div>`},
  after:(el,st)=>{const t=$$('.k4b-tab',el)[st.sel],l=$('.k4b-luz',el);if(!t||!l)return;if(st._luz){l.style.left=st._luz[0]+'px';l.style.width=st._luz[1]+'px';l.getBoundingClientRect()}l.style.left=t.offsetLeft+'px';l.style.width=t.offsetWidth+'px';st._luz=[t.offsetLeft,t.offsetWidth]}},
 {k:'C',t:'Mapa de la compra',idea:'Toda la compra de un vistazo: las categorías a la izquierda, sus prendas a la derecha, unidas por hilos. Al tocar una categoría, se encienden las suyas.',init:()=>({sel:0,cats:CATS2()}),acc:{sel:(st,v)=>{st.antes=st.sel;st.sel=+v}},
  render:st=>`<div class="k4c"><div class="k4c-cats">${st.cats.map((x,i)=>`<button class="k4c-cat ${i===st.sel?'sel':''}" data-x="sel" data-v="${i}" data-ci="${i}">${anillo((x.c||0)/x.d*100,x.c===x.d?'ok':'',ico(x.i),'kcc'+i,'--s:44px;--g:5')}<span><b>${x.n}</b><small>${x.c==null?'Sin contar':x.c+' de '+x.d}</small></span></button>`).join('')}</div>
   <svg class="k4c-hilos" aria-hidden="true">${st.cats.flatMap((x,i)=>x.pr.map((p,j)=>`<path class="${i===st.sel?'on':''} ${i===st.sel&&st.antes!==undefined?'nuevo':''}" data-ci="${i}" data-pi="${i}-${j}" pathLength="100" d="M0 0" style="--d:${j*120}ms"/>`)).join('')}</svg>
   <div class="k4c-prs">${st.cats.flatMap((x,i)=>x.pr.map((p,j)=>`<div class="k4c-pr ${i===st.sel?'on':''}" data-pi="${i}-${j}">${tile(p.col,x.i,40,p.o)}<span><b>${p.n}</b><small>× ${p.e} · ${p.id===p.e?'identificadas':p.id?p.id+' identificadas':'por identificar'}</small></span></div>`)).join('')}</div></div>`,
  after:el=>{const sv=el.querySelector('.k4c-hilos');if(!sv)return;const r=sv.getBoundingClientRect();sv.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
   sv.querySelectorAll('path').forEach(p=>{const ca=el.querySelector(`.k4c-cat[data-ci="${p.dataset.ci}"]`),cb=el.querySelector(`.k4c-pr[data-pi="${p.dataset.pi}"]`);if(!ca||!cb)return;const a=ca.getBoundingClientRect(),b=cb.getBoundingClientRect(),y1=a.top+a.height/2-r.top,y2=b.top+b.height/2-r.top;
    p.setAttribute('d',`M0 ${y1} C${r.width*.5} ${y1} ${r.width*.5} ${y2} ${r.width} ${y2}`)})}}
]},
{id:'identificar',n:'Qué prendas son',intro:'Decir qué modelo es cada prenda contada. Lo anotado en la compra se pasa con un toque.',ops:[
 {k:'A',t:'Cartas boca abajo',idea:'Cada prenda contada es una carta boca abajo; al tocar lo anotado, se voltean una tras otra y muestran el modelo.',init:()=>({cont:6,asig:[]}),acc:accIdent,
  render:st=>`<div class="c4a">${Array.from({length:st.cont},(_,i)=>{const m=st.asig[i],d=MODS[m],nuevo=m&&st.antes!=null&&i>=st.antes;return `<div class="carta ${m&&!nuevo?'vuelta':''} ${nuevo?'nuevo':''}" style="--d:${(i-(st.antes||0))*130}ms"><span class="cara dorso">C</span><span class="cara frente ${d&&d.o?'oscura':''}" data-color-dato style="--c:${d?d.c:'var(--hueso)'}">${ico('blusa')}${d?d.n.split(' ')[1]:''}</span></div>`}).join('')}</div>
   <span class="tenue">${st.asig.length} de ${st.cont} identificadas</span>${anotsHtml(st)}`},
 {k:'B',t:'Ríos',idea:'Lo anotado en la compra fluye como cintas de color hasta cada prenda contada.',init:()=>({cont:6,asig:[]}),acc:accIdent,
  render:st=>{
   return `<div class="c4b"><div class="c4b-src">${ANOT.map(a=>`<button data-x="asig" data-v="${a.m}" ${st.asig.includes(a.m)||st.asig.length>=st.cont?'disabled':''}>${tile(MODS[a.m].c,'blusa',30,MODS[a.m].o)}<span>${MODS[a.m].n.split(' ')[1]}<br>× ${a.n}</span></button>`).join('')}</div>
    <svg aria-hidden="true">${st.asig.map((m,i)=>`<path class="${st.antes!=null&&i>=st.antes?'nuevo':''}" pathLength="100" data-m="${m}" data-i="${i}" d="M0 0" style="stroke:${MODS[m].c};--d:${(i-(st.antes||0))*120}ms"/>`).join('')}</svg>
    <div class="c4b-dst">${Array.from({length:st.cont},(_,i)=>{const m=st.asig[i];return `<i class="${m?'si':''} ${m&&MODS[m].o?'oscura':''}" data-color-dato style="--c:${m?MODS[m].c:'transparent'}">${m?ico('blusa'):'?'}</i>`}).join('')}</div></div>
    <span class="tenue">${st.asig.length} de ${st.cont} identificadas · toca un modelo de la izquierda</span><div class="anots"><button class="btn enlace" data-x="deshacer">Deshacer</button></div>`},
  after:el=>{const sv=el.querySelector('.c4b>svg');if(!sv)return;const r=sv.getBoundingClientRect();sv.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);const src=[...el.querySelectorAll('.c4b-src button')],dst=[...el.querySelectorAll('.c4b-dst i')];
   sv.querySelectorAll('path').forEach(p=>{const sb=src[ANOT.findIndex(a=>a.m===p.dataset.m)].getBoundingClientRect(),db=dst[+p.dataset.i].getBoundingClientRect(),y1=sb.top+sb.height/2-r.top,y2=db.top+db.height/2-r.top;
    p.setAttribute('d',`M0 ${y1} C${r.width*.55} ${y1} ${r.width*.45} ${y2} ${r.width} ${y2}`)})}},
 {k:'C',t:'Polaroids',idea:'Cada modelo identificado cae sobre la mesa como una foto con su cantidad; las que faltan quedan en una pila con «?».',init:()=>({cont:6,asig:[]}),acc:accIdent,
  render:st=>{const grupos=Object.keys(MODS).map(m=>({m,n:st.asig.filter(x=>x===m).length,ini:st.asig.indexOf(m)})).filter(g=>g.n),resto=st.cont-st.asig.length;
   return `<div class="c4c">${grupos.map((g,i)=>{const d=MODS[g.m];return `<div class="pola ${st.antes!=null&&g.ini>=st.antes?'nuevo':''}" style="--r:${i%2?3:-4}deg"><span class="foto ${d.o?'oscura':''}" data-color-dato style="--c:${d.c}">${ico('blusa')}</span><b>${d.n}</b><span class="n">${g.n}</span></div>`}).join('')}
    ${resto?`<div class="pola pila"><span class="foto">?</span><b>Sin identificar</b><span class="n">${resto}</span></div>`:''}</div>${anotsHtml(st)}`}}
]},
{id:'tallas',n:'Tallas y colores',intro:'Repartir lo contado de un modelo entre sus tallas y colores.',ops:[
 {k:'A',t:'Burbujas',idea:'Una burbuja por talla y color que crece con cada prenda; al tocarla, una onda de su color.',init:()=>({mat:{},orden:[],tot:4}),acc:accTallas,
  render:st=>`${tallasCab(st)}<div class="c5a"><div class="c5a-f cab"><span></span>${TALLAS.map(t=>`<span>${t}</span>`).join('')}<span>Total</span></div>
   ${COLS.map(([c,hx,o])=>`<div class="c5a-f"><span class="c5a-col"><i data-color-dato style="--c:${hx}"></i>${c}</span>${TALLAS.map(t=>{const k=c+'|'+t,v=st.mat[k]||0;return `<button class="burbuja ${v?'tiene':'cero'} ${o?'oscura':''} ${st.ult===k?'ultimo':''}" data-color-dato data-k="bu${k}" style="width:${v?Math.min(96,50+v*14):50}px;height:${v?Math.min(96,50+v*14):50}px;--c:${hx};--m:${v?'62%':'0%'}" data-x="add" data-v="${k}" aria-label="${c} ${t}: ${v}">${v||'+'}</button>`}).join('')}<span class="c5a-tot">${TALLAS.reduce((a,t)=>a+(st.mat[c+'|'+t]||0),0)}</span></div>`).join('')}</div>`},
 {k:'B',t:'Chips que vuelan',idea:'Tocas la talla y su etiqueta vuela a la bolsa de arriba, donde se agrupa por color y talla.',init:()=>({mat:{},orden:[],tot:4}),
  acc:{add:(st,k,el)=>{accTallas.add(st,k);st.vuelo={k,r:el.getBoundingClientRect()}},borrar:accTallas.borrar},
  render:st=>{const ks=[...new Set(st.orden)];return `${tallasCab(st)}<div class="c5b"><div class="c5b-bolsa">${ks.length?ks.map(k=>{const[c,t]=k.split('|'),cc=COLS.find(x=>x[0]===c);return `<span class="c5b-l ${cc[2]?'oscura':''} ${st.ult===k&&!st.vuelo?'late':''}" data-color-dato data-l="${k}" style="--c:${cc[1]}">${c} · ${t} ×${st.mat[k]}</span>`}).join(''):'<span class="vacio">Toca una talla abajo</span>'}</div>
   ${COLS.map(([c,hx])=>`<div class="c5b-f"><span class="c5b-col"><i data-color-dato style="--c:${hx}"></i>${c}</span>${TALLAS.map(t=>`<button class="c5b-chip" data-x="add" data-v="${c}|${t}">${t}</button>`).join('')}</div>`).join('')}</div>`},
  after:(el,st)=>{if(!st.vuelo||RED){st.vuelo=null;return}const v=st.vuelo;st.vuelo=null;const dst=el.querySelector(`[data-l="${v.k}"]`);if(!dst)return;const b=dst.getBoundingClientRect(),cc=COLS.find(x=>x[0]===v.k.split('|')[0]);
   const f=document.createElement('span');f.className='c5b-vuelo';f.textContent=v.k.replace('|',' · ');f.style.cssText=`left:${v.r.left}px;top:${v.r.top}px;--c:${cc[1]};${cc[2]?'color:var(--crema-fija)':''}`;document.body.appendChild(f);dst.style.opacity=0;
   f.animate([{transform:'translate(0,0) scale(.9)'},{transform:`translate(${(b.left-v.r.left)/2}px,${(b.top-v.r.top)/2-50}px) scale(1.05)`,offset:.5},{transform:`translate(${b.left-v.r.left}px,${b.top-v.r.top}px) scale(1)`}],{duration:620,easing:'cubic-bezier(.32,.72,.24,1)'}).onfinish=()=>{f.remove();dst.style.opacity=1;dst.classList.add('late')}}},
 {k:'C',t:'Planilla',idea:'Una planilla limpia: cada celda cuenta como un odómetro, con su barrita del color, y los totales se suman solos.',init:()=>({mat:{},orden:[],tot:4}),acc:accTallas,
  render:st=>`${tallasCab(st)}<table class="c5c"><thead><tr><th></th>${TALLAS.map(t=>`<th>${t}</th>`).join('')}<th>Total</th></tr></thead><tbody>
   ${COLS.map(([c,hx])=>`<tr><th class="tcol"><span><i data-color-dato style="--c:${hx}"></i>${c}</span></th>${TALLAS.map(t=>{const k=c+'|'+t,v=st.mat[k]||0;return `<td><button class="celda ${st.ult===k?'ultimo':''}" data-color-dato style="--c:${hx}" data-x="add" data-v="${k}" aria-label="${c} ${t}: ${v}">${odo(v,'ce'+k)}<i><b data-k="cb${k}" style="width:${Math.min(100,v/st.tot*100)}%"></b></i></button></td>`}).join('')}<td class="tot">${odo(TALLAS.reduce((a,t)=>a+(st.mat[c+'|'+t]||0),0),'tr'+c)}</td></tr>`).join('')}
   <tr><th class="tcol">Total</th>${TALLAS.map(t=>`<td class="tot">${odo(COLS.reduce((a,[c])=>a+(st.mat[c+'|'+t]||0),0),'tc'+t)}</td>`).join('')}<td class="tot"><b>${odo(totT(st),'tt')}</b></td></tr></tbody></table>`}
]},
{id:'cierre',n:'El cierre de una categoría',intro:'Lo que dijeron contra lo que contaste, y qué parte se vende ya.',ops:[
 {k:'A',t:'Anillos',idea:'El aro de afuera es lo que dijeron; el de adentro, lo que contaste, partido en lo que se vende y lo que espera. En el centro, la diferencia.',init:()=>({ej:'faltan'}),acc:{ej:(st,v)=>{st.ej=v}},
  render:st=>{const e=EJ[st.ej],mx=Math.max(e.dij,e.cont),f=Math.max(0,e.dij-e.cont),s=Math.max(0,e.cont-e.dij),dif=e.cont-e.dij;
   const seg=(r,w,l,o,c,k,d)=>`<circle class="seg" data-k="${k}" cx="110" cy="110" r="${r}" pathLength="100" style="stroke-width:${w};stroke-dasharray:${l} 100;stroke-dashoffset:${o};stroke:${c};--d:${d}ms"/>`;
   return `<div class="c6a"><span class="c6a-c"><svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="92" style="stroke:var(--hueso);stroke-width:12"/><circle cx="110" cy="110" r="66" style="stroke:var(--hueso);stroke-width:20"/>
     ${seg(92,12,e.dij/mx*100,0,'var(--borde-control)','ad',0)}${seg(66,20,e.v/mx*100,0,'var(--verde)','av',200)}${seg(66,20,e.d/mx*100,-e.v/mx*100,'var(--taupe)','ap',350)}${seg(66,20,f/mx*100,-e.cont/mx*100,'color-mix(in srgb,var(--ambar) 40%,transparent)','af',500)}${seg(66,6,s/mx*100,-e.dij/mx*100,'var(--ambar)','as',500)}</svg>
     <span class="txt"><span class="num-s" style="color:${dif?'var(--ambar)':'var(--verde-profundo)'}">${dif===0?'✓':(dif>0?'+':'−')+Math.abs(dif)}</span><span class="tenue" style="font-size:15px">${dif===0?'cuadra':dif<0?'faltan':'sobran'}</span></span></span>
    <div style="display:grid;gap:10px"><span class="etq">Dijeron ${e.dij} · contaste ${e.cont}</span>${leyenda(e)}</div></div>${ctlEj(st)}`}},
 {k:'B',t:'Flujo',idea:'Lo que dijeron fluye hasta lo que contaste, y de ahí se reparte en lo que se vende y lo que espera; lo que falta se desvía en ámbar.',init:()=>({ej:'faltan'}),acc:{ej:(st,v)=>{st.ej=v;st.cambio=true}},
  render:st=>{const e=EJ[st.ej],mx=Math.max(e.dij,e.cont),u=140/mx,f=Math.max(0,e.dij-e.cont),s=Math.max(0,e.cont-e.dij),w1=Math.min(e.dij,e.cont)*u,y0=26,nv=st.cambio?'nuevo':'';
   const rib=(x1,y1,x2,y2,w,c,d)=>`<path class="cinta ${nv}" pathLength="100" d="M${x1} ${y1} C${(x1+x2)/2} ${y1} ${(x1+x2)/2} ${y2} ${x2} ${y2}" style="stroke-width:${w};stroke:${c};--d:${d}ms"/>`;
   const nodo=(x,y,h,lbl,n,der)=>`<rect class="nodo" x="${x}" y="${y}" width="10" height="${Math.max(2,h)}" rx="3"/><text x="${der?x+18:x}" y="${der?y+Math.max(2,h)/2+5:y-8}">${lbl} <tspan style="font-family:'EB Garamond',Georgia,serif;font-size:24px;font-weight:500">${n}</tspan></text>`;
   const yV=y0,yD=y0+e.v*u+26,yF=yD+e.d*u+26;
   let svg=rib(20,y0+w1/2,150,y0+w1/2,w1,'var(--borde-control)',0);
   if(f)svg+=rib(20,y0+w1+f*u/2,270,yF+f*u/2,f*u,'color-mix(in srgb,var(--ambar) 55%,transparent)',300);
   if(s)svg+=rib(20,y0+e.dij*u+18+s*u/2,150,y0+w1+s*u/2,s*u,'var(--ambar)',300);
   svg+=rib(160,y0+e.v*u/2,270,yV+e.v*u/2,e.v*u,'var(--verde)',500)+rib(160,y0+e.v*u+e.d*u/2,270,yD+e.d*u/2,e.d*u,'var(--taupe)',650);
   svg+=nodo(10,y0,e.dij*u,'Dijeron',e.dij)+nodo(150,y0,e.cont*u,'Contaste',e.cont)+nodo(270,yV,e.v*u,'Se venden',e.v,1)+nodo(270,yD,e.d*u,'Después',e.d,1)+(f?nodo(270,yF,f*u,'Faltan',f,1):'')+(s?nodo(10,y0+e.dij*u+18,s*u,'Sobran',s):'');
   return `<div class="c6b"><svg viewBox="0 0 420 ${Math.max(220,yF+f*u+16)}" aria-hidden="true">${svg}</svg></div>${ctlEj(st)}`},after:(el,st)=>{st.cambio=false}},
 {k:'C',t:'Podio',idea:'Cuatro columnas que suben una tras otra; una llave marca la diferencia entre lo que dijeron y lo que contaste.',init:()=>({ej:'faltan'}),acc:{ej:(st,v)=>{st.ej=v}},
  render:st=>{const e=EJ[st.ej],mx=Math.max(e.dij,e.cont),dif=e.cont-e.dij,cols=[['Dijeron',e.dij,'color-mix(in srgb,var(--borde-control) 40%,var(--hueso))'],['Contaste',e.cont,'var(--tinta)'],['Se venden',e.v,'var(--verde)'],['Para después',e.d,'var(--taupe)']];
   return `<div class="c6c"><span class="c6c-llave" style="top:8px;border-color:${dif?'var(--ambar)':'var(--verde)'}"><b style="color:${dif?'var(--ambar)':'var(--verde-profundo)'}">${dif===0?'cuadra':dif<0?'faltan '+(-dif):'sobran '+dif}</b></span>
    ${cols.map(([t,n,c],i)=>`<div class="c6c-b"><span class="num-s">${n}</span><span class="c6c-barra" data-k="pc${i}" style="height:${n/mx*150}px;--c:${c};--d:${i*130}ms"></span><small>${t}</small></div>`).join('')}</div>${leyenda(e)}${ctlEj(st)}`}}
]},
{id:'precio',n:'Costo y precio de venta',intro:'Corregir el costo y el precio al recibir, y ver cuánto se gana.',ops:[
 {k:'A',t:'Medidor de margen',idea:'Una aguja marca qué parte del precio es ganancia: ámbar si es poca, verde si es buena. Se mueve mientras escribes.',init:()=>({precio:79.9,costo:32}),acc:{},
  render:st=>{const m=st.precio?(st.precio-st.costo)/st.precio*100:0;return `<div class="c7a"><svg viewBox="0 0 320 180" aria-hidden="true">${[[0,37.5,'color-mix(in srgb,var(--ambar) 70%,transparent)'],[37.5,31.25,'var(--hueso)'],[68.75,31.25,'color-mix(in srgb,var(--verde) 75%,transparent)']].map(([o,l,c])=>`<path class="z" pathLength="100" d="M30 160 A130 130 0 0 1 290 160" style="stroke:${c};stroke-dasharray:${l} 100;stroke-dashoffset:${-o}"/>`).join('')}
    <g class="aguja" id="ag7" style="--a:${-90+cl(m,0,80)/80*180}deg"><path d="M160 160 L160 52"/></g><circle cx="160" cy="160" r="9" fill="var(--tinta)"/></svg>
    <div class="pct"><span class="num-s" id="pc7">${Math.round(m)}%</span><div class="tenue" id="gn7">ganas ${soles(st.precio-st.costo)} por prenda</div></div>
    <div class="campos"><label>Precio de venta<input class="caja" data-in="precio" value="${st.precio.toFixed(2)}"></label><label>Costo c/u<input class="caja" data-in="costo" value="${st.costo.toFixed(2)}"></label></div></div>`},
  vivo:{precio:(st,v,el)=>{st.precio=+v.replace(',','.')||0;up7a(st,el)},costo:(st,v,el)=>{st.costo=+v.replace(',','.')||0;up7a(st,el)}}},
 {k:'B',t:'Vitrina',idea:'La prenda como se verá en la tienda, con su precio en una pegatina que se edita; abajo, costo y ganancia, y las sedes donde vale se encienden.',init:()=>({precio:79.9,costo:32,vale:'sede'}),acc:{vale:(st,v)=>{st.vale=v}},
  render:st=>`<div class="c7b"><div class="c7b-card"><span class="c7b-foto" data-color-dato>${ico('blusa')}</span><b>Blusa Emma</b><span class="tenue" style="font-size:14px">Negro · S M L</span>
    <label class="c7b-sticker"><small>S/</small><input data-in="precio" value="${st.precio.toFixed(2)}" aria-label="Precio de venta"></label></div>
   <div class="c7b-info"><span class="l"><span>Costo c/u</span><span style="display:flex;align-items:center;gap:6px">S/ <input class="caja" style="width:100px;height:40px" data-in="costo" value="${st.costo.toFixed(2)}"></span></span>
    <span class="l"><span>Ganas por prenda</span><b id="g7b" style="color:var(--verde-profundo)">${soles(st.precio-st.costo)}</b></span>
    <span class="etq">El precio vale en</span><div class="c7b-sedes">${['Trujillo','Lima','Arequipa'].map((s,i)=>`<span class="c7b-sede" data-k="sd${i}" style="${st.vale==='todas'||i===0?'background:var(--tinta);color:var(--crema);border-color:var(--tinta)':'background:var(--papel);color:var(--tinta-60);border-color:var(--borde-control)'};transition-delay:${i*120}ms">${ico('pin')}${s}</span>`).join('')}</div>
    <span class="seg" style="justify-self:start"><button data-x="vale" data-v="sede" aria-pressed="${st.vale==='sede'}">Solo Trujillo</button><button data-x="vale" data-v="todas" aria-pressed="${st.vale==='todas'}">Todas</button></span></div></div>`,
  vivo:{precio:(st,v,el)=>{st.precio=+v.replace(',','.')||0;$('#g7b',el).textContent=soles(st.precio-st.costo)},costo:(st,v,el)=>{st.costo=+v.replace(',','.')||0;$('#g7b',el).textContent=soles(st.precio-st.costo)}}},
 {k:'C',t:'Monedas',idea:'El precio en dos pilas de monedas: lo que costó y lo que ganas. Cada moneda es S/ 5 y caen mientras escribes.',init:()=>({precio:79.9,costo:32}),acc:{},
  render:st=>{st.pc=0;st.pg=0;return `<div class="c7c"><div class="c7c-mesa" id="mesa7">${pilas(st)}</div><div class="c7c-campos"><label>Precio de venta<input class="caja" data-in="precio" value="${st.precio.toFixed(2)}"></label><label>Costo c/u<input class="caja" data-in="costo" value="${st.costo.toFixed(2)}"></label></div></div>`},
  vivo:{precio:(st,v,el)=>{st.precio=+v.replace(',','.')||0;$('#mesa7',el).innerHTML=pilas(st)},costo:(st,v,el)=>{st.costo=+v.replace(',','.')||0;$('#mesa7',el).innerHTML=pilas(st)}}}
]},
{id:'cerrado',n:'El envío cerrado',intro:'Lo que queda al cerrar: cuántas entraron y qué sigue.',fija:{mejoras:['Elegido por ti en la ronda anterior']},ops:[
 {k:'B',t:'Sello de lacre',idea:'El sello cae sobre la tarjeta del envío y, al asentarse, aparecen las cifras.',init:()=>({}),acc:{},render:lacre}]},
{id:'barra',n:'La barra de abajo',intro:'Lo que acompaña mientras se cuenta: totales, avance y el botón que sigue.',ancha:true,ops:[
 {k:'A',t:'Isla dinámica',idea:'Una píldora negra con el avance que se agranda un momento para avisar lo que terminaste y vuelve a recogerse.',init:()=>({p:2}),acc:accBarra,
  render:st=>{const b=avBar(st.p),msg=st.fresco&&st.antes!=null&&st.p>st.antes?(st.p%2?b.cats[Math.floor((st.p-1)/2)]+' contadas':b.cats[st.p/2-1]+' listas')+' ✓':b.lbl;
   return `<div class="c9a-zona"><div class="c9a" data-k="isla" style="width:min(${st.fresco?440:330}px,100%)">${anillo(b.pct,b.pct===100?'ok':'',b.pct+'%','ia')}<span class="msg">${msg}</span><button class="btn chico">${b.pct===100?'Cerrar':'Seguir'}${ico('flecha')}</button></div></div>${ctlBarra}`},
  after:(el,st,rep)=>{if(st.fresco){clearTimeout(st._t);st._t=setTimeout(()=>{st.fresco=false;rep()},1800)}}},
 {k:'B',t:'Siguiente paso',idea:'A la izquierda, una tarjeta con lo que sigue que se desliza al cambiar; al medio, seis tramos que se llenan; a la derecha, el botón.',init:()=>({p:2}),acc:accBarra,
  render:st=>{const b=avBar(st.p),ic=['blusa','falda','pantalon'];return `<div class="ba"><span class="c9b-sig"><span class="ic">${b.sig===-1?ico('ok'):ico(ic[b.sig])}</span><span class="t"><small>Sigue</small><b>${b.lbl}</b></span></span>
    <span class="c9b-seg">${Array.from({length:6},(_,i)=>`<i class="${i<st.p?'on':''}"></i>`).join('')}</span><span class="tenue">${b.pct}%</span><span class="der"><button class="btn primario grande">${b.pct===100?'Pasar a cerrar':'Listo'}${ico('flecha')}</button></span></div>${ctlBarra}`}},
 {k:'C',t:'Totales que ruedan',idea:'Los números ruedan como un contador al cambiar, y una línea de dos tonos dice cuánto está contado y cuánto identificado.',init:()=>({p:2}),acc:accBarra,
  render:st=>{const b=avBar(st.p),c=CONT[st.p],i=IDEN[st.p];return `<div class="ba c9c"><span class="tot"><span>Dijeron</span>${odo(13,'dj')}</span><span class="tot"><span>Contadas</span>${odo(c,'ct')}</span><span class="tot"><span>Identificadas</span>${odo(i,'id')}</span>
    <span class="der"><button class="btn primario grande"><span class="entra">${b.lbl}</span>${ico('flecha')}</button></span>
    <span class="c9c-dos"><i class="b" data-k="db" style="width:${i/13*100}%"></i><i class="a" data-k="da" style="width:${(c-i)/13*100}%"></i></span></div>${ctlBarra}`}}
]}
];

const ELEGIDAS={cierre:'C',precio:'B',barra:'C'};
C.forEach(c=>{const k=ELEGIDAS[c.id];if(k){c.ops=c.ops.filter(o=>o.k===k);c.fija={mejoras:['Elegido por ti en la ronda 3']}}
  if(c.id==='identificar'||c.id==='tallas')c.intro+=' Sin elegir todavía: si ninguna te convence, pídeme otra ronda.'});
/* ===================================================== MOTOR ===================================================== */
const CLAVE='recibir-opciones-3';
let ELEC={};try{ELEC=JSON.parse(localStorage.getItem(CLAVE)||'{}')}catch(_){}
C.forEach(c=>{if(c.fija)ELEC[c.id]=c.ops[0].k});
const busca=(cid,k)=>{const c=C.find(x=>x.id===cid);return [c,c.ops.find(o=>o.k===k)]};
function pintar(c,o,estreno){
  const box=$(`[data-demo="${c.id}-${o.k}"]`);if(!box)return;
  const prev={};$$('[data-k]',box).forEach(x=>prev[x.dataset.k]=x.getAttribute('style'));
  box.classList.toggle('estreno',!!estreno);box.innerHTML=o.render(o.st);
  if(!estreno&&!RED){const cambios=[];$$('[data-k]',box).forEach(x=>{const p=prev[x.dataset.k],t=x.getAttribute('style');if(p==null||p===t)return;x.setAttribute('style',p);cambios.push([x,t])});
    if(cambios.length){box.getBoundingClientRect();requestAnimationFrame(()=>requestAnimationFrame(()=>cambios.forEach(([x,t])=>x.setAttribute('style',t))))}}
  o.after&&o.after(box,o.st,()=>pintar(c,o,false));
  if(estreno&&!RED)$$('[data-cuenta]',box).forEach(el=>{const b=+el.dataset.cuenta,t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/800);el.textContent=Math.round(b*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(t0)});
  delete o.st.antes;o.st.chispa=false;o.st.celebra=false;
}
function armar(){
  $('#og-ind').innerHTML=C.map((c,i)=>`<a href="#o-${c.id}">${i+1} · ${c.n}</a>`).join('');
  $('#og-comps').innerHTML=C.map((c,i)=>`<section class="comp-o" id="o-${c.id}"><header><span class="num">${String(i+1).padStart(2,'0')}</span><h2>${c.n}</h2>${c.fija?'<span class="chip punto verde">Elegido</span>':'<span class="chip">3 opciones nuevas</span>'}</header><p>${c.intro}</p>
    ${c.fija?`<div class="mejoras" style="margin-bottom:16px">${c.fija.mejoras.map(m=>`<span>${ico('ok')}${m}</span>`).join('')}</div>`:''}
    <div class="ops ${c.ancha||c.fija?'anchas':''}">${c.ops.map(o=>`<article class="op ${c.fija?'fija elegida':''} ${!c.fija&&ELEC[c.id]===o.k?'elegida':''}" data-c="${c.id}" data-k="${o.k}"><header><span class="letra">${c.fija?ico('ok'):o.k}</span><h3>${o.t}</h3>${c.fija?`<span class="sello-eleccion">${ico('corazon')}Tu elección</span>`:''}</header><p class="idea">${o.idea}</p>
      <div class="escena" data-demo="${c.id}-${o.k}"></div>
      <div class="pie-op"><button class="btn chico" data-rep>${ico('repetir')}Repetir animación</button>${c.fija?'':`<button class="btn chico megusta" data-gusta aria-pressed="${ELEC[c.id]===o.k}">${ico('corazon')}${ELEC[c.id]===o.k?'Elegida':'Me gusta esta'}</button>`}</div></article>`).join('')}</div></section>`).join('');
  C.forEach(c=>c.ops.forEach(o=>{o.st=o.init()}));
  const io=new IntersectionObserver(es=>es.forEach(en=>{if(!en.isIntersecting)return;const a=en.target;io.unobserve(a);const[c,o]=busca(a.dataset.c,a.dataset.k);pintar(c,o,true)}),{threshold:.25});
  $$('.op').forEach(a=>{const[c,o]=busca(a.dataset.c,a.dataset.k);$(`[data-demo="${c.id}-${o.k}"]`).innerHTML=o.render(o.st);io.observe(a)});
  resumen();
}
function resumen(){
  const n=C.filter(c=>ELEC[c.id]).length;
  $('#eleccion').innerHTML=`<b>${n} de ${C.length}</b><span class="chips-e">${C.filter(c=>ELEC[c.id]).map(c=>`<span>${c.n}: ${c.ops.find(o=>o.k===ELEC[c.id]).t}</span>`).join('')}</span><button class="btn chico" id="copiar">${ico('copiar')}Copiar mi elección</button>`;
  $('#copiar').onclick=ev=>{const b=ev.currentTarget,t='Mi elección para Recibir (ronda 3):\n'+C.map(c=>`- ${c.n}: ${ELEC[c.id]?c.ops.find(o=>o.k===ELEC[c.id]).t:'(sin elegir)'}`).join('\n');(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.innerHTML=ico('ok')+'Copiado'},()=>{prompt('Copia tu elección:',t)})};
  $$('.og-ind a').forEach((a,i)=>{const c=C[i];a.classList.toggle('elegido',!!ELEC[c.id]);a.textContent=`${i+1} · ${c.n}${ELEC[c.id]&&!c.fija?' · '+ELEC[c.id]:''}`});
}
document.addEventListener('click',ev=>{
  const art=ev.target.closest('.op');if(!art)return;const[c,o]=busca(art.dataset.c,art.dataset.k);
  if(ev.target.closest('[data-rep]')){o.st=o.init();pintar(c,o,true);return}
  if(ev.target.closest('[data-gusta]')){ELEC[c.id]=ELEC[c.id]===o.k?undefined:o.k;if(!ELEC[c.id])delete ELEC[c.id];const g={...ELEC};C.forEach(x=>{if(x.fija)delete g[x.id]});try{localStorage.setItem(CLAVE,JSON.stringify(g))}catch(_){}
    $$(`.op[data-c="${c.id}"]`).forEach(a=>{const si=ELEC[c.id]===a.dataset.k;a.classList.toggle('elegida',si);const b=$('[data-gusta]',a);b.setAttribute('aria-pressed',si);b.innerHTML=ico('corazon')+(si?'Elegida':'Me gusta esta')});resumen();return}
  const x=ev.target.closest('[data-x]');if(!x||x.disabled)return;const f=o.acc&&o.acc[x.dataset.x];if(!f)return;
  if(f(o.st,x.dataset.v,x)!==false)pintar(c,o,false);
});
document.addEventListener('input',ev=>{const el=ev.target.closest('[data-in]');if(!el)return;const art=el.closest('.op');if(!art)return;const[c,o]=busca(art.dataset.c,art.dataset.k);const f=o.vivo&&o.vivo[el.dataset.in];if(f)f(o.st,el.value,$(`[data-demo="${c.id}-${o.k}"]`))});
function pintaTema(){const o=document.documentElement.dataset.tema==='oscuro',t=$('.tema');if(t)t.innerHTML=`<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${o?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>':'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'}</svg>`}
try{if(localStorage.getItem('cayla-tema')==='oscuro')document.documentElement.dataset.tema='oscuro'}catch(_){}
document.addEventListener('DOMContentLoaded',()=>{pintaTema();$('.tema').onclick=()=>{const r=document.documentElement,o=r.dataset.tema==='oscuro';if(o)delete r.dataset.tema;else r.dataset.tema='oscuro';try{localStorage.setItem('cayla-tema',o?'claro':'oscuro')}catch(_){}pintaTema()};armar()});
})();
