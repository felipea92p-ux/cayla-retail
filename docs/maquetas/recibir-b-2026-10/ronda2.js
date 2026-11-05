/* 27 opciones nuevas (3 por componente) para Recibir. Cada opción es una muestra viva: su estado, sus toques y su animación.
   «Me gusta» guarda la elección en este navegador; la barra de abajo la resume para copiarla. */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const RED=matchMedia('(prefers-reduced-motion: reduce)').matches;
const P={ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',mas:'<path d="M12 5v14M5 12h14"/>',menos:'<path d="M5 12h14"/>',flecha:'<path d="M5 12h14M13 6l6 6-6 6"/>',atras:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
  repetir:'<path d="M4 4v6h6"/><path d="M20 12A8 8 0 0 0 5.5 7.5L4 10M4 12a8 8 0 0 0 14.5 4.5"/>',corazon:'<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  blusa:'<path d="M8 4l-5 4 2.5 4L8 11v9h8v-9l2.5 1L21 8l-5-4c-.5 1.8-2 3-4 3S8.5 5.8 8 4z"/>',falda:'<path d="M9 4h6l1 3 4 13H4L8 7z"/><path d="M8 7h8"/>',pantalon:'<path d="M7 3h10l1 18h-4l-2-10-2 10H6z"/><path d="M7 7h10"/>',
  etiqueta:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',piso:'<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M10 20v-6h4v6"/>',caja:'<path d="M3 8l9-5 9 5v9l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v9"/>',
  gira:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',copiar:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'};
const ico=(n,c)=>`<svg class="i ${c||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]||''}</svg>`;
const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const soles=n=>'S/ '+(+n).toFixed(2);
const tile=(c,i,t,o)=>`<span class="prenda ${o?'oscura':''}" data-color-dato style="--c:${c};--t:${t||40}px">${ico(i)}</span>`;
const ETAPAS=['Salió','En camino','Contando','Por terminar','Recibido'],DET=['27/10 · 17:25','hace 2 días · 2 fardos','4 de 6 contadas','2 por poner tallas','29/10 · 10:42'];
const MODS={emma:{n:'Blusa Emma',c:'var(--dato-negro)',o:1,ini:'E'},valentina:{n:'Blusa Valentina',c:'var(--dato-verde)',ini:'V'}};
const ANOT=[{m:'emma',n:4},{m:'valentina',n:2}];
const COLS=[['Negro','var(--dato-negro)',1],['Beige','var(--dato-beige)',0]],TALLAS=['S','M','L'];
const EJ={cuadra:{t:'Cuadra',dij:6,cont:6,v:4,d:2},faltan:{t:'Faltan',dij:12,cont:10,v:4,d:6},sobran:{t:'Sobran',dij:8,cont:11,v:8,d:3}};
const CATS=()=>[{n:'Blusas',i:'blusa',c:4,d:6},{n:'Faldas',i:'falda',c:3,d:3},{n:'Pantalones',i:'pantalon',c:null,d:4}];
const veredicto=(n,d)=>n===d?`<span class="chip punto verde">Cuadra</span>`:n<d?`<span class="chip punto ambar">Faltan ${d-n}</span>`:`<span class="chip punto ambar">Sobran ${n-d}</span>`;
const btnsCont=st=>`<div class="cnt-btns"><button class="redondo" data-x="menos" aria-label="Una menos" ${st.n<=0?'disabled':''}>${ico('menos')}</button><button class="redondo fuerte" data-x="mas" aria-label="Una más">${ico('mas')}</button><button class="btn" data-x="todas">${ico('ok')}Llegaron las ${st.dij}</button></div>`;
const accCont={mas:st=>{st.antes=st.n;st.n++},menos:st=>{st.antes=st.n;st.n=Math.max(0,st.n-1)},todas:st=>{st.antes=st.n;st.n=st.dij}};
const ctlTray=st=>`<div class="controles"><button class="btn chico" data-x="mueve" data-v="-1" ${st.k===0?'disabled':''}>${ico('atras')}Estado anterior</button><button class="btn chico primario" data-x="mueve" data-v="1" ${st.k===4?'disabled':''}>Siguiente estado${ico('flecha')}</button></div>`;
const accTray={mueve:(st,v)=>{st.antes=st.k;st.k=cl(st.k+(+v),0,4)}};
const anotsHtml=st=>`<div class="anots">${ANOT.map(a=>{const ya=st.asig.includes(a.m);return `<button class="btn chico" data-x="asig" data-v="${a.m}" ${ya||st.asig.length>=st.cont?'disabled':''}>${tile(MODS[a.m].c,'blusa',28,MODS[a.m].o)}${MODS[a.m].n} × ${a.n}</button>`}).join('')}<button class="btn enlace" data-x="deshacer">Deshacer</button></div>`;
const accIdent={asig:(st,m)=>{st.antes=st.asig.length;const a=ANOT.find(x=>x.m===m);for(let i=0;i<a.n&&st.asig.length<st.cont;i++)st.asig.push(m)},deshacer:st=>{st.antes=undefined;st.asig=[]}};
const tallasCab=st=>{const t=Object.values(st.mat).reduce((a,b)=>a+b,0);return `<div class="tl-cab"><span class="etq">Blusa Emma · pusiste ${t} de ${st.tot}</span><span class="avance ${t===st.tot?'verde':''}"><i data-k="tav" style="--w:${Math.min(100,t/st.tot*100)}%;animation:none"></i></span>${t===st.tot?'<span class="chip punto verde">Listo</span>':t>st.tot?`<span class="chip ambar">Sube a ${t}</span>`:`<span class="chip">Faltan ${st.tot-t}</span>`}<button class="btn enlace" data-x="borrar">Borrar</button></div>`};
const accTallas={add:(st,k)=>{st.ult=k;st.mat[k]=(st.mat[k]||0)+1;st.orden.push(k)},addCol:(st,t)=>{const k=st.color+'|'+t;st.ult=k;st.mat[k]=(st.mat[k]||0)+1;st.orden.push(k)},color:(st,v)=>{st.color=v},borrar:st=>{st.mat={};st.orden=[];st.ult=null}};
const ctlEj=st=>`<div class="ejs">${Object.entries(EJ).map(([k,e])=>`<button class="btn chico ${st.ej===k?'primario':''}" data-x="ej" data-v="${k}">${e.t}</button>`).join('')}</div>`;
const leyenda=e=>{const f=Math.max(0,e.dij-e.cont),s=Math.max(0,e.cont-e.dij);return `<div class="ley"><span><i style="--c:var(--verde)"></i>${e.v} se venden ya</span><span><i style="--c:var(--borde-control)"></i>${e.d} para después</span>${f?`<span><i style="--c:transparent;border:2px dashed var(--ambar)"></i>${f} faltan</span>`:''}${s?`<span><i style="--c:var(--ambar)"></i>${s} sobran</span>`:''}</div>`};
const avBar=(p)=>{const cats=['Blusas','Faldas','Pantalones'];const est=cats.map((_,i)=>p>=2*i+2?'l':p>=2*i+1?'c':'');const sig=est.findIndex(x=>x!=='l');return {cats,est,pct:Math.round(p/6*100),lbl:sig===-1?'Pasar a cerrar':est[sig]==='c'?'Identificar '+cats[sig].toLowerCase():'Contar '+cats[sig].toLowerCase()}};
const accBarra={avanzar:st=>{st.antes=st.p;st.p=Math.min(6,st.p+1)},reiniciar:st=>{st.antes=st.p;st.p=0}};
const ctlBarra=`<div class="controles"><button class="btn chico primario" data-x="avanzar">Avanzar el conteo${ico('flecha')}</button><button class="btn chico" data-x="reiniciar">Reiniciar</button></div>`;

/* ===================================================== LOS 9 COMPONENTES ===================================================== */
const C=[
{id:'estado',n:'El estado del envío',hoy:'Trayecto (la línea con el camión)',intro:'Dónde va cada envío: salió, en camino, contando, por terminar o recibido.',ancha:true,ops:[
 {k:'A',t:'Hilo de costura',idea:'Un hilo cose el camino de parada en parada; cada parada es un botón de ropa y la aguja marca dónde va.',init:()=>({k:2}),acc:accTray,
  render:st=>{const Pt=[[30,58],[175,32],[320,62],[465,32],[610,58]];let d=`M${Pt[0][0]} ${Pt[0][1]}`;for(let i=1;i<Pt.length;i++){const a=Pt[i-1],b=Pt[i],mx=(a[0]+b[0])/2;d+=` C${mx} ${a[1]} ${mx} ${b[1]} ${b[0]} ${b[1]}`}
   const k=st.k,c=Pt[k];
   return `<div class="ta"><svg viewBox="0 0 640 100" aria-hidden="true"><path class="ta-base" d="${d}"/><path class="ta-prog" data-k="tp" d="${d}" pathLength="100" style="--p:${k/4*100}"/>
     ${Pt.map((p,j)=>`<g class="ta-boton ${j<k?'si':''} ${j===k?'ahora':''}" transform="translate(${p[0]} ${p[1]})">${j===k?'<circle class="ta-onda" r="16"/>':''}<circle class="cuerpo" r="15"/><circle class="hoyo" cx="-4" cy="-4" r="2.2"/><circle class="hoyo" cx="4" cy="-4" r="2.2"/><circle class="hoyo" cx="-4" cy="4" r="2.2"/><circle class="hoyo" cx="4" cy="4" r="2.2"/></g>`).join('')}
     <g class="ta-aguja" data-k="ag" style="transform:translate(${c[0]}px,${c[1]}px)"><path d="M0 -46 L0 -20"/><ellipse cx="0" cy="-50" rx="2.6" ry="5" fill="none" stroke="var(--tinta)" stroke-width="2"/></g></svg>
     <div class="ta-ets">${Pt.map((p,j)=>`<span class="ta-et ${j===k?'ahora':''}" style="left:${p[0]/640*100}%">${ETAPAS[j]}${j===k?`<small>${DET[j]}</small>`:''}</span>`).join('')}</div></div>${ctlTray(st)}`}},
 {k:'B',t:'Etiquetas colgadas',idea:'Las cinco paradas cuelgan de un cordel como etiquetas; la de ahora es grande y se mece al llegar.',init:()=>({k:2}),acc:accTray,
  render:st=>`<div class="tb"><svg class="tb-cuerda" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6 Q50 42 100 6" vector-effect="non-scaling-stroke"/></svg>
   ${ETAPAS.map((e,j)=>{const x=8+j*21,t=x/100,y=(Math.pow(1-t,2)*6+2*t*(1-t)*42+t*t*6)*46/40,cls=j<st.k?'si':j===st.k?'ahora':'';return `<div class="tb-tag ${cls} ${j===st.k&&st.antes!==undefined&&st.antes!==st.k?'llega':''}" style="left:${x}%;top:${y-1}px;--d:${j*120}ms"><i class="tb-hilo"></i><div class="tb-card">${j<st.k?ico('ok'):''}${e}${j===st.k?`<small>${DET[j]}</small>`:''}</div></div>`}).join('')}</div>${ctlTray(st)}`},
 {k:'C',t:'Píldora líquida',idea:'Una cápsula se llena como líquido hasta la parada de hoy, con un destello al llegar.',init:()=>({k:2}),acc:accTray,
  render:st=>{const pct=st.k===0?12:st.k/4*100,dentro=pct>=45;return `<div class="tc"><div class="tc-tubo"><div class="tc-liq" data-k="liq" style="--w:${pct}%"><svg class="tc-ola" viewBox="0 0 24 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 Q24 12 0 25 T0 50 T0 75 T0 100 Z"/></svg></div><span class="tc-brillo"></span>
   <span class="tc-txt ${dentro?'':'fuera'}">${ETAPAS[st.k]}<small>${DET[st.k]}</small></span></div>
   <div class="tc-paradas">${ETAPAS.map((e,j)=>`<span class="${j<=st.k?'si':''} ${j===st.k?'ahora':''}" style="left:${j/4*100}%"><i></i>${e}</span>`).join('')}</div></div>${ctlTray(st)}`}}
]},
{id:'contador',n:'El contador',hoy:'Dial (el aro con segmentos)',intro:'Cuántas llegaron de una categoría, contra lo que dijeron.',ops:[
 {k:'A',t:'Odómetro',idea:'Los números ruedan como un contador de verdad, y debajo cada prenda se cuelga en su percha.',init:()=>({n:4,dij:6}),acc:accCont,
  render:st=>{const dg=String(st.n).split('');const tot=Math.max(st.dij,st.n);
   return `<div class="ca"><div class="ca-num"><span class="ca-digs">${dg.map((v,i)=>`<span class="ca-dig"><span class="ca-tira" data-k="d${dg.length}-${i}" style="transform:translateY(-${v*1.15}em)">${[0,1,2,3,4,5,6,7,8,9].map(x=>`<span>${x}</span>`).join('')}</span></span>`).join('')}</span><span class="ca-de">de ${st.dij}</span></div>
    <div class="ca-perchas">${Array.from({length:tot},(_,i)=>`<span class="ca-p ${i<st.n?'on':''} ${st.n===st.dij&&i<st.n?'ok':''} ${i>=st.dij?'mas':''} ${st.antes!=null&&i>=st.antes&&i<st.n?'nuevo':''}"><svg viewBox="0 0 44 52" aria-hidden="true"><path d="M22 4a3 3 0 1 1 3 3c-1.5.8-3 1.6-3 3.5V12M4 22l18-10 18 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path class="ropa" d="M10 22l-4 6 4 4 2-2v18h20V30l2 2 4-4-4-6-6-1c-1 3-3 4-6 4s-5-1-6-4z" fill="currentColor"/></svg></span>`).join('')}</div>
    ${veredicto(st.n,st.dij)}${btnsCont(st)}</div>`}},
 {k:'B',t:'Pila de prendas',idea:'Cada prenda cae doblada sobre la pila; una regla y una línea roja marcan lo que dijeron.',init:()=>({n:4,dij:6}),acc:accCont,
  render:st=>{const max=Math.max(st.dij+4,st.n),u=Math.min(26,260/max),col=['var(--dato-negro)','var(--dato-beige)'];
   return `<div class="cbx"><div class="cb-col" style="height:${max*u}px;margin-left:34px"><div class="cb-regla">${Array.from({length:max+1},(_,i)=>`<i class="${i%2?'':'c'}" style="bottom:${i*u}px"></i>${i%2===0?`<b style="bottom:${i*u}px">${i}</b>`:''}`).join('')}</div>
     <div class="cb-pila">${Array.from({length:st.n},(_,i)=>`<span class="cb-bloque ${i>=st.dij?'mas':''} ${st.antes!=null&&i>=st.antes?'nuevo':''}" style="--c:${col[i%2]};height:${u-3}px"></span>`).join('')}</div>
     <span class="cb-meta" data-k="meta" style="bottom:${st.dij*u}px"><b>dijeron ${st.dij}</b></span></div>
    <div class="cb-info"><span class="num-s">${st.n}</span><span class="tenue">de ${st.dij}</span>${veredicto(st.n,st.dij)}</div></div>${btnsCont(st)}`}},
 {k:'C',t:'Velocímetro',idea:'Una aguja barre el arco hasta lo contado; la raya roja es lo que dijeron.',init:()=>({n:4,dij:6}),acc:accCont,
  render:st=>{const max=st.dij+4,cx=170,cy=170,tk=[];for(let i=0;i<=max;i++){const a=Math.PI-i/max*Math.PI,r1=148,r2=i===st.dij?164:158;tk.push(`<line class="tick ${i===st.dij?'meta':''}" x1="${cx+Math.cos(a)*r1}" y1="${cy-Math.sin(a)*r1}" x2="${cx+Math.cos(a)*r2}" y2="${cy-Math.sin(a)*r2}"/>`)}
   const am=Math.PI-st.dij/max*Math.PI,cls=st.n===st.dij?'ok':st.n>st.dij?'mas':'';
   return `<div class="cv ${cls}"><svg viewBox="0 0 340 200" aria-hidden="true"><path class="pista" d="M40 170 A130 130 0 0 1 300 170"/><path class="lleno" data-k="arc" pathLength="100" d="M40 170 A130 130 0 0 1 300 170" style="--p:${Math.min(st.n,max)/max*100}"/>${tk.join('')}
     <text class="meta-et" x="${cx+Math.cos(am)*178}" y="${cy-Math.sin(am)*178}" text-anchor="middle">dijeron ${st.dij}</text>
     <g class="aguja" data-k="ag" style="--a:${-90+Math.min(st.n,max)/max*180}deg"><path d="M170 170 L170 64"/></g><circle class="eje" cx="170" cy="170" r="9"/></svg>
    <div class="cifra-v"><span class="num-s">${st.n}</span><div class="tenue">de ${st.dij}</div></div>${veredicto(st.n,st.dij)}</div>${btnsCont(st)}`}}
]},
{id:'categorias',n:'Las categorías del envío',hoy:'Riel de categorías (lengüetas con aro)',intro:'Pasar de una categoría a otra y ver cuál está lista.',ops:[
 {k:'A',t:'Pestañas de carpeta',idea:'Cada categoría es la pestaña de una carpeta; la elegida se desliza y se une al panel. El borde se llena con lo contado.',init:()=>({sel:0,cats:CATS()}),
  acc:{sel:(st,v)=>{st.sel=+v},mas:st=>{const c=st.cats[st.sel];c.c=(c.c||0)+1}},
  render:st=>{const c=st.cats[st.sel];return `<div class="pa"><div class="pa-tabs"><span class="pa-luz"></span>${st.cats.map((x,i)=>`<button class="pa-tab ${i===st.sel?'sel':''}" data-x="sel" data-v="${i}"><span class="fila">${ico(x.i)}${x.n}</span><small>${x.c==null?'Sin contar':x.c+' de '+x.d}</small><span class="barra"><i class="${x.c===x.d?'ok':''}" data-k="b${i}" style="--w:${Math.min(100,(x.c||0)/x.d*100)}%"></i></span></button>`).join('')}</div>
   <div class="pa-panel">${tile('var(--hueso)',c.i,52)}<div><h4 key="${st.sel}">${c.n}</h4><span class="tenue">${c.c==null?'Todavía no la cuentas':c.c+' de '+c.d+' contadas'}</span></div><button class="btn primario" style="margin-left:auto" data-x="mas">${ico('mas')}Una más</button></div></div>`},
  after:(el,st)=>{const t=$$('.pa-tab',el)[st.sel],l=$('.pa-luz',el);if(!t||!l)return;if(st._luz){l.style.left=st._luz[0]+'px';l.style.width=st._luz[1]+'px';l.getBoundingClientRect()}l.style.left=t.offsetLeft+'px';l.style.width=t.offsetWidth+'px';st._luz=[t.offsetLeft,t.offsetWidth]}},
 {k:'B',t:'Estantes',idea:'Cada categoría es un casillero que se va llenando con sus prendas; el elegido se levanta.',init:()=>({sel:0,cats:CATS()}),
  acc:{sel:(st,v)=>{st.sel=+v},mas:st=>{const c=st.cats[st.sel];st.nuevo=[st.sel,c.c||0];c.c=(c.c||0)+1}},
  render:st=>`<div class="pe">${st.cats.map((x,i)=>`<button class="pe-c ${i===st.sel?'sel':''} ${x.c===x.d?'lleno':''}" data-x="sel" data-v="${i}"><span style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px"><b>${x.n}</b>${x.c===x.d?'<span class="chip punto verde">Lista</span>':''}</span><small>${x.c==null?'Sin contar':x.c+' de '+x.d}</small>
    <span class="pe-estante">${Array.from({length:Math.max(x.d,x.c||0)},(_,k)=>`<span class="${k<(x.c||0)?'on':''} ${st.nuevo&&st.nuevo[0]===i&&st.nuevo[1]===k?'nuevo':''}">${ico(x.i)}</span>`).join('')}</span></button>`).join('')}</div>
   <div class="controles"><button class="btn primario chico" data-x="mas">${ico('mas')}Una más en ${st.cats[st.sel].n}</button></div>`},
 {k:'C',t:'Tubos de ensayo',idea:'Cada categoría es un tubo que se llena; una raya roja se desliza hasta la elegida.',init:()=>({sel:0,cats:CATS()}),
  acc:{sel:(st,v)=>{st.sel=+v},mas:st=>{const c=st.cats[st.sel];c.c=(c.c||0)+1}},
  render:st=>`<div class="pt"><span class="pt-ind" data-k="ind" style="transform:translateY(${st.sel*84}px)"></span>${st.cats.map((x,i)=>`<button class="pt-f ${i===st.sel?'sel':''}" data-x="sel" data-v="${i}"><span class="pt-tubo"><span class="pt-liq ${x.c===x.d?'ok':''}" data-k="l${i}" style="--h:${Math.min(100,(x.c||0)/x.d*100)}%"></span></span><span><b>${x.n}</b><small>${x.c==null?'Sin contar':x.c+' de '+x.d}</small></span>${x.c===x.d?'<span class="chip punto verde">Lista</span>':x.c!=null?`<span class="chip ambar">Faltan ${x.d-x.c}</span>`:''}</button>`).join('')}</div>
   <div class="controles"><button class="btn primario chico" data-x="mas">${ico('mas')}Una más en ${st.cats[st.sel].n}</button></div>`}
]},
{id:'identificar',n:'Qué prendas son',hoy:'Bandeja (la barra que se tiñe)',intro:'Decir qué modelo es cada prenda contada. Lo anotado en la compra se pasa con un toque.',ops:[
 {k:'A',t:'Perchero',idea:'Un perchero con una percha por prenda contada; al tocar lo anotado, las prendas llegan colgadas y se mecen.',init:()=>({cont:6,asig:[]}),acc:accIdent,
  render:st=>`<div class="ia"><div class="ia-barra"></div><div class="ia-perchas">${Array.from({length:st.cont},(_,i)=>{const m=st.asig[i],d=MODS[m];return `<span class="ia-p ${m?'si':''} ${d&&d.o?'oscura':''} ${st.antes!=null&&i>=st.antes&&m?'nuevo':''}" style="--d:${(i-(st.antes||0))*110}ms"><svg class="gancho" viewBox="0 0 40 30" aria-hidden="true"><path d="M20 3a3 3 0 1 1 3 3c-1.5.8-3 1.6-3 3.5V12M3 26l17-14 17 14" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="ia-ropa" data-color-dato style="--c:${d?d.c:'transparent'}">${m?ico('blusa'):'?'}</span></span>`}).join('')}</div></div>
   <span class="tenue">${st.asig.length} de ${st.cont} identificadas</span>${anotsHtml(st)}`},
 {k:'B',t:'Mosaico',idea:'Una baldosa por prenda contada; al identificarlas se tiñen en ola con el color del modelo.',init:()=>({cont:6,asig:[]}),acc:accIdent,
  render:st=>`<div class="ib-m">${Array.from({length:st.cont},(_,i)=>{const m=st.asig[i],d=MODS[m];return `<span class="ib-c ${m?'si':''} ${d&&d.o?'oscura':''} ${st.antes!=null&&i>=st.antes&&m?'nuevo':''}" data-color-dato style="--c:${d?d.c:'transparent'};--d:${(i-(st.antes||0))*90}ms">${m?ico('blusa')+`<span class="ini">${d.ini}</span>`:'?'}</span>`}).join('')}</div>
   <span class="tenue">${st.asig.length} de ${st.cont} identificadas</span>${anotsHtml(st)}`},
 {k:'C',t:'Dona',idea:'Un anillo se reparte entre los modelos; lo que falta queda en ámbar hasta identificarlo.',init:()=>({cont:6,asig:[]}),acc:accIdent,
  render:st=>{let ini=0;const segs=Object.keys(MODS).map(m=>{const n=st.asig.filter(x=>x===m).length,l=n/st.cont*100,s=`<circle class="seg" data-k="s${m}" cx="80" cy="80" r="56" pathLength="100" style="--l:${l};--o:${-ini};stroke:${MODS[m].c}"/>`;ini+=l;return s}).join('');
   const resto=100-ini;
   return `<div class="ic"><span class="ic-centro"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="fondo" cx="80" cy="80" r="56"/>${segs}<circle class="seg" data-k="sr" cx="80" cy="80" r="56" pathLength="100" style="--l:${resto};--o:${-ini};stroke:color-mix(in srgb,var(--ambar) 30%,transparent)"/></svg><span class="txt"><span class="num-s">${st.asig.length}/${st.cont}</span><span class="tenue" style="font-size:14px">identificadas</span></span></span>
    <div class="ic-ley">${Object.entries(MODS).map(([m,d])=>`<span><i style="--c:${d.c}"></i>${d.n} · ${st.asig.filter(x=>x===m).length}</span>`).join('')}${resto>0?`<span><i style="--c:color-mix(in srgb,var(--ambar) 30%,transparent)"></i>Sin identificar · ${st.cont-st.asig.length}</span>`:''}</div></div>${anotsHtml(st)}`}}
]},
{id:'tallas',n:'Tallas y colores',hoy:'Tablero de tallas (celdas que se tocan)',intro:'Repartir lo contado de un modelo entre sus tallas y colores.',ops:[
 {k:'A',t:'Teclado',idea:'Cada talla es una tecla de verdad que se hunde al tocarla; debajo se dibujan rayitas, como al contar a mano.',init:()=>({mat:{},orden:[],tot:4,color:'Negro'}),acc:accTallas,
  render:st=>`${tallasCab(st)}<div class="ka">${COLS.map(([c,hx])=>`<div class="ka-f"><span class="ka-col"><i data-color-dato style="--c:${hx}"></i>${c}</span>${TALLAS.map(t=>{const k=c+'|'+t,v=st.mat[k]||0;return `<div><button class="ka-tecla ${v?'tiene':''}" data-color-dato style="--c:${hx}" data-x="add" data-v="${k}" aria-label="${c} ${t}: ${v}">${t}${v?`<span class="badge">${v}</span>`:''}</button><div class="ka-marcas">${Array.from({length:v},(_,i)=>`<i class="${st.ult===k&&i===v-1?'nuevo':''}"></i>`).join('')}</div></div>`}).join('')}</div>`).join('')}</div>`},
 {k:'B',t:'Torres por talla',idea:'Eliges el color y tocas la talla: cada prenda cae como un bloque en su torre.',init:()=>({mat:{},orden:[],tot:4,color:'Negro'}),acc:accTallas,
  render:st=>`${tallasCab(st)}<div class="kb"><div class="kb-colores">${COLS.map(([c,hx,o])=>`<button class="btn chico ${st.color===c?'primario':''}" data-x="color" data-v="${c}"><span class="prenda ${o?'oscura':''}" data-color-dato style="--c:${hx};--t:22px"></span>${c}</button>`).join('')}</div>
   <div class="kb-cols">${TALLAS.map(t=>{const bl=st.orden.map((k,i)=>[k,i]).filter(([k])=>k.endsWith('|'+t));return `<button class="kb-c" data-x="addCol" data-v="${t}" aria-label="Talla ${t}"><span class="kb-torre">${bl.map(([k,i])=>`<span class="kb-b ${i===st.orden.length-1&&st.ult===k?'nuevo':''}" data-color-dato style="--c:${COLS.find(c=>c[0]===k.split('|')[0])[1]}"></span>`).join('')}</span><b>${t}</b><small>${bl.length||'—'}</small></button>`}).join('')}</div></div>`},
 {k:'C',t:'Rueda de tallas',idea:'Las combinaciones se abren en flor alrededor de la prenda; cada pétalo crece con lo que pones.',init:()=>({mat:{},orden:[],tot:4,color:'Negro'}),acc:accTallas,
  render:st=>{const combos=COLS.flatMap(c=>TALLAS.map(t=>[c,t])),t0=Object.values(st.mat).reduce((a,b)=>a+b,0);
   return `${tallasCab(st)}<div class="kc"><svg class="kc-anillo ${t0===st.tot?'ok':''}" viewBox="0 0 100 100" aria-hidden="true"><circle class="p" cx="50" cy="50" r="20" pathLength="100"/><circle class="a" data-k="ka" cx="50" cy="50" r="20" pathLength="100" style="--p:${Math.min(100,t0/st.tot*100)}"/></svg>
    <span class="kc-centro">${tile('var(--dato-negro)','blusa',40,1)}<span class="num-s">${t0}/${st.tot}</span></span>
    ${combos.map(([[c,hx,o],t],i)=>{const a=(i/combos.length)*Math.PI*2-Math.PI/2,v=st.mat[c+'|'+t]||0;return `<button class="kc-petalo ${v?'tiene':''} ${o?'oscura':''}" data-color-dato data-k="pt${i}" style="--x:${50+38*Math.cos(a)}%;--y:${50+38*Math.sin(a)}%;--s:${62+v*12}px;--c:${hx};--m:${v?'70%':'0%'};--d:${i*70}ms" data-x="add" data-v="${c}|${t}" aria-label="${c} ${t}: ${v}">${t}<small>${v?'×'+v:c}</small></button>`}).join('')}</div>`}}
]},
{id:'cierre',n:'El cierre de una categoría',hoy:'Cinta de cierre (la barra a escala)',intro:'Lo que dijeron contra lo que contaste, y qué parte se vende ya.',ops:[
 {k:'A',t:'Balanza',idea:'Una balanza de verdad: lo que dijeron en un plato, lo que contaste en el otro; se inclina hacia lo que pesa más.',init:()=>({ej:'faltan'}),acc:{ej:(st,v)=>{st.ej=v}},
  render:st=>{const e=EJ[st.ej],r=cl((e.cont-e.dij)*2.5,-12,12);
   const caja=(n,x0,col)=>Array.from({length:n},(_,i)=>`<rect class="caja-p" x="${x0+(i%6)*13}" y="${128-Math.floor(i/6)*13}" width="12" height="12" rx="2" fill="${col}" style="--d:${i*40}ms"/>`).join('');
   const plato=(x,lbl,n,col)=>`<g class="plato"><line class="hilo" x1="${x}" y1="60" x2="${x-42}" y2="140"/><line class="hilo" x1="${x}" y1="60" x2="${x+42}" y2="140"/><path class="linea" d="M${x-50} 140 Q${x} 162 ${x+50} 140"/>${caja(n,x-38,col)}<text x="${x}" y="196" text-anchor="middle">${lbl}</text><text class="n" x="${x}" y="236" text-anchor="middle">${n}</text></g>`;
   return `<div class="za"><svg viewBox="0 0 400 250" aria-hidden="true"><path class="linea" d="M200 60 V238 M160 240 H240"/><g class="brazo" data-k="br" style="--r:${r}deg"><path class="linea" d="M60 60 H340"/>${plato(60,'Dijeron',e.dij,'var(--borde-control)')}${plato(340,'Contaste',e.cont,'var(--tinta)')}</g><circle cx="200" cy="60" r="7" fill="var(--tinta)"/></svg></div>${leyenda(e)}${ctlEj(st)}`}},
 {k:'B',t:'Regla de sastre',idea:'Una cinta métrica con una raya por prenda; se llena con lo que se vende y lo que espera, y lo que falta queda rayado.',init:()=>({ej:'faltan'}),acc:{ej:(st,v)=>{st.ej=v}},
  render:st=>{const e=EJ[st.ej],max=Math.max(e.dij,e.cont),f=Math.max(0,e.dij-e.cont),s=Math.max(0,e.cont-e.dij);
   return `<div class="zb"><div class="zb-pista"><span class="zb-s v" data-k="v" style="--w:${e.v/max*100}%">${e.v} se venden</span><span class="zb-s d" data-k="d" style="--w:${e.d/max*100}%">${e.d} después</span><span class="zb-s f" data-k="f" style="--w:${f/max*100}%">${f?f+' faltan':''}</span>
     ${s?`<span style="position:absolute;top:-6px;bottom:-6px;left:${e.dij/max*100}%;width:${s/max*100}%;border:2px solid var(--ambar);border-radius:10px;display:grid;place-items:center;color:var(--ambar);font-weight:800;font-size:15px;background:color-mix(in srgb,var(--ambar) 10%,transparent)">+${s}</span>`:''}
     <span class="zb-meta ${e.dij/max>.75?'fin':''}" data-k="m" style="left:${e.dij/max*100}%"><b>dijeron ${e.dij}</b></span></div>
     <div class="zb-ticks">${Array.from({length:max+1},(_,i)=>`<i style="left:${i/max*100}%;height:${i%2?6:10}px"></i>${i===0||i===max||i===e.cont?`<b style="left:${i/max*100}%">${i}</b>`:''}`).join('')}</div></div>${leyenda(e)}${ctlEj(st)}`}},
 {k:'C',t:'Cuadrícula',idea:'Una baldosa por prenda: verde se vende, gris espera, ámbar sobra y la punteada es la que no llegó.',init:()=>({ej:'faltan'}),acc:{ej:(st,v)=>{st.ej=v}},
  render:st=>{const e=EJ[st.ej],f=Math.max(0,e.dij-e.cont),s=Math.max(0,e.cont-e.dij),cel=[];
   for(let i=0;i<e.cont;i++)cel.push(i>=e.cont-s?'var(--ambar)':i<e.v?'var(--verde)':'var(--borde-control)');for(let i=0;i<f;i++)cel.push('f');
   return `<div class="zc">${cel.map((c,i)=>`<i class="${c==='f'?'f':''}" style="--c:${c};--d:${i*40}ms"></i>`).join('')}</div>${leyenda(e)}${ctlEj(st)}`}}
]},
{id:'precio',n:'Costo y precio de venta',hoy:'Etiqueta de precio (la tarjeta crema)',intro:'Corregir el costo y el precio al recibir, y ver cuánto se gana.',ops:[
 {k:'A',t:'Etiqueta que gira',idea:'Una etiqueta colgada: adelante el precio de venta; al girarla, atrás el costo y lo que se gana.',init:()=>({precio:79.9,costo:32,vuelta:false}),acc:{gira:st=>{st.vuelta=!st.vuelta}},
  render:st=>`<div class="pa2"><span class="pa2-hilo"></span><div class="pa2-gira ${st.vuelta?'vuelta':''}" data-k="g" style="">
    <div class="pa2-cara"><span class="nom">${tile('var(--dato-negro)','blusa',26,1)}Blusa Emma</span><small>Precio de venta</small><label class="pa2-mon">S/<input data-in="precio" value="${st.precio.toFixed(2)}" aria-label="Precio de venta"></label><span class="gana" id="g1">Ganas ${soles(st.precio-st.costo)}</span></div>
    <div class="pa2-cara atras"><span class="nom">Lo que costó</span><small>Costo c/u</small><label class="pa2-mon">S/<input data-in="costo" value="${st.costo.toFixed(2)}" aria-label="Costo"></label><span class="gana" id="g2">Ganas ${soles(st.precio-st.costo)} · ${Math.round((st.precio-st.costo)/st.precio*100)}%</span></div></div></div>
   <div class="controles" style="justify-content:center"><button class="btn" data-x="gira">${ico('gira')}${st.vuelta?'Ver el precio':'Ver el costo'}</button></div>`,
  vivo:{precio:(st,v,el)=>{st.precio=+v.replace(',','.')||0;upGana(st,el)},costo:(st,v,el)=>{st.costo=+v.replace(',','.')||0;upGana(st,el)}}},
 {k:'B',t:'Barra de margen',idea:'El precio grande y, debajo, cuánto es costo y cuánto ganancia; la barra se reparte mientras escribes.',init:()=>({precio:79.9,costo:32,vale:'sede'}),acc:{vale:(st,v)=>{st.vale=v}},
  render:st=>{const c=st.costo/st.precio;return `<div class="pb"><label class="pb-precio">S/<input data-in="precio" value="${st.precio.toFixed(2)}" aria-label="Precio de venta"></label>
   <div class="pb-barra" id="pbb" style="--c:${c};--g:${1-c}"><span class="c">Costo ${soles(st.costo)}</span><span class="g">Ganas ${soles(st.precio-st.costo)}</span></div>
   <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><span class="pb-pct" id="pbp">${Math.round((1-c)*100)}%</span><span class="tenue">de lo que cobras es ganancia</span>
   <span class="seg" style="margin-left:auto"><button data-x="vale" data-v="sede" aria-pressed="${st.vale==='sede'}">Solo Trujillo</button><button data-x="vale" data-v="todas" aria-pressed="${st.vale==='todas'}">Todas</button></span></div>
   <label class="campo" style="max-width:200px"><span class="versal" style="font-size:14px">Costo c/u</span><input class="caja" data-in="costo" value="${st.costo.toFixed(2)}"></label></div>`},
  vivo:{precio:(st,v,el)=>{st.precio=+v.replace(',','.')||0;upBarra(st,el)},costo:(st,v,el)=>{st.costo=+v.replace(',','.')||0;upBarra(st,el)}}},
 {k:'C',t:'Deslizador',idea:'El precio se arrastra sobre una pista; la raya marca el costo y el color dice si ganas o pierdes.',init:()=>({precio:79.9,costo:32}),acc:{},
  render:st=>`<div class="pcx"><div class="pc-cifra"><span class="num-s" id="pcn">${soles(st.precio)}</span><span class="gana" id="pcg" style="font-weight:700;font-size:18px;color:var(--verde-profundo)">Ganas ${soles(st.precio-st.costo)}</span></div>
   <div class="pc-riel" id="pcr" style="${varsDesl(st)}"><span class="pc-pista"></span><span class="pc-lleno"></span><span class="pc-costo"><b>costo ${soles(st.costo)}</b></span><span class="pc-pulgar"><b id="pct">${soles(st.precio)}</b></span><input type="range" min="16" max="140" step="0.1" value="${st.precio}" data-in="rango" aria-label="Precio de venta"></div>
   <span class="tenue">Arrastra el punto. A la izquierda de la raya, pierdes.</span></div>`,
  vivo:{rango:(st,v,el)=>{st.precio=+v;const r=$('#pcr',el);r.setAttribute('style',varsDesl(st));$('#pcn',el).textContent=soles(st.precio);$('#pct',el).textContent=soles(st.precio);const g=$('#pcg',el);g.textContent=st.precio>=st.costo?'Ganas '+soles(st.precio-st.costo):'Pierdes '+soles(st.costo-st.precio);g.style.color=st.precio>=st.costo?'var(--verde-profundo)':'var(--ambar)'}}}
]},
{id:'cerrado',n:'El envío cerrado',hoy:'Talón de recepción',intro:'Lo que queda al cerrar: cuántas entraron y qué sigue.',ops:[
 {k:'A',t:'Ticket que se imprime',idea:'El cierre sale como un ticket de la impresora, línea por línea, y termina con el sello de recibido.',init:()=>({}),acc:{},
  render:()=>`<div class="ra"><span class="ra-ranura"></span><div class="ra-papel"><span class="t">CAYLA · TIENDA TRUJILLO</span><span class="t">RECEPCIÓN ENV-002668</span><hr><span class="l"><span>Dijeron</span><span>2</span></span><span class="l"><span>Contaste</span><span>2</span></span><span class="l"><span>Ya en el stock</span><span>2</span></span><span class="l"><span>Para después</span><span>0</span></span><hr><span class="l"><span>Falda Ariana S</span><span>×1</span></span><span class="l"><span>Falda Ariana M</span><span>×1</span></span><hr><span>Lo cerró Micaela · 29/10 10:42</span><span class="ra-sello">RECIBIDO</span></div></div>
   <div class="controles" style="justify-content:center"><button class="btn primario">${ico('etiqueta')}Imprimir 2 etiquetas</button><button class="btn">${ico('piso')}Bajar al piso</button></div>`},
 {k:'B',t:'Sello de lacre',idea:'Un sello de lacre cae sobre la tarjeta del envío y, al asentarse, aparecen las cifras.',init:()=>({}),acc:{},
  render:()=>{const pts=[];for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=i%2?42:46;pts.push(`${50+Math.cos(a)*r} ${50+Math.sin(a)*r}`)}
   return `<div class="rb"><svg class="rb-lacre" viewBox="0 0 100 100" aria-hidden="true"><path d="M${pts.join(' L')}Z"/><circle cx="50" cy="50" r="32" fill="none" stroke="color-mix(in srgb,var(--crema-fija) 35%,transparent)" stroke-width="2"/><text x="50" y="62" text-anchor="middle">C</text></svg>
    <span class="versal">Envío cerrado · 29/10 10:42</span><h4>ENV-002668 recibido</h4><span class="tenue">Lo cerró Micaela. El conteo ya es oficial.</span>
    <div class="rb-4">${[['Dijeron',2],['Contaste',2],['En el stock',2],['Para después',0]].map(([t,n],i)=>`<div style="--i:${i}"><span class="num-s" data-cuenta="${n}">${n}</span><small>${t}</small></div>`).join('')}</div>
    <div class="controles"><button class="btn primario">${ico('etiqueta')}Imprimir 2 etiquetas</button><button class="btn">${ico('piso')}Bajar al piso</button></div></div>`}},
 {k:'C',t:'Logros',idea:'Cuatro anillos se cierran uno tras otro, saltan chispas y entra lo que sigue.',init:()=>({}),acc:{},
  render:()=>{const an=(p,c,n,d)=>`<span class="anillo ${p>=100?'ok':''}" style="--p:${p};--d:${d}ms"><svg viewBox="0 0 40 40"><circle class="pista" cx="20" cy="20" r="16" pathLength="100"/><circle class="arco" cx="20" cy="20" r="16" pathLength="100" style="stroke:${c};${p?'':'opacity:0'}"/></svg><span class="c" data-cuenta="${n}">${n}</span></span>`;
   const ch=Array.from({length:14},(_,i)=>{const a=i/14*Math.PI*2;return `<i style="--dx:${Math.cos(a)*120}px;--dy:${Math.sin(a)*70}px;--c:${['var(--verde)','var(--ambar)','var(--rojo)','var(--pizarra)'][i%4]}"></i>`}).join('');
   return `<div style="position:relative;display:grid;gap:16px"><span class="rc-chispas">${ch}</span><div class="rc4">${[['Dijeron',2,100,'var(--borde-control)'],['Contaste',2,100,'var(--tinta)'],['En el stock',2,100,'var(--verde)'],['Para después',0,0,'var(--ambar)']].map(([t,n,p,c],i)=>`<div style="display:grid;justify-items:center;gap:6px">${an(p,c,n,i*220)}<small>${t}</small></div>`).join('')}</div>
    <div class="rc-sig">${[['etiqueta','Imprimir 2 etiquetas de precio'],['piso','Bajar al piso'],['ok','Nada quedó para después']].map(([i,t],k)=>`<div style="--i:${k}">${ico(i)}${t}</div>`).join('')}</div></div>`}}
]},
{id:'barra',n:'La barra de abajo',hoy:'Isla con hilo',intro:'Lo que acompaña mientras se cuenta: totales, avance y el botón que sigue.',ancha:true,ops:[
 {k:'A',t:'Anillo en el botón',idea:'El avance rodea el botón principal: cuando se cierra el anillo, toca pasar a cerrar.',init:()=>({p:2}),acc:accBarra,
  render:st=>{const b=avBar(st.p);return `<div class="ba"><span class="tot"><span>Dijeron</span><b>13</b></span><span class="tot"><span>Contadas</span><b>${[0,4,4,7,7,11,13][st.p]}</b></span><span class="der"><span class="tenue">${b.pct}% listo</span><span class="ba-boton ${b.pct===100?'ok':''}"><svg aria-hidden="true"><rect class="pista" x="1.5" y="1.5" rx="16" pathLength="100" style="width:calc(100% - 3px);height:calc(100% - 3px)"/><rect x="1.5" y="1.5" rx="16" pathLength="100" data-k="r" style="--p:${b.pct};width:calc(100% - 3px);height:calc(100% - 3px)"/></svg><button class="btn primario grande">${b.lbl}${ico('flecha')}</button></span></span></div>${ctlBarra}`}},
 {k:'B',t:'Puntos por categoría',idea:'Un punto por categoría que se enciende al contarla y se pone verde al terminarla; el botón cambia de palabra con un deslizamiento.',init:()=>({p:2}),acc:accBarra,
  render:st=>{const b=avBar(st.p),ic=['blusa','falda','pantalon'];return `<div class="ba"><span class="bb-pts">${b.cats.map((c,i)=>`${i?`<i data-k="h${i}" style="--w:${b.est[i-1]==='l'?100:0}%"></i>`:''}<span class="${b.est[i]}" title="${c}">${b.est[i]==='l'?ico('ok'):ico(ic[i])}</span>`).join('')}</span><span class="tenue">${b.est.filter(x=>x==='l').length} de 3 listas</span><span class="der"><button class="btn primario grande"><span class="entra" key="${st.p}">${b.lbl}</span>${ico('flecha')}</button></span></div>${ctlBarra}`}},
 {k:'C',t:'Barra que se llena',idea:'Toda la barra se llena de verde por detrás, como un vaso, a medida que avanzas.',init:()=>({p:2}),acc:accBarra,
  render:st=>{const b=avBar(st.p);return `<div class="ba bc"><span class="bc-liq ${st.antes!==undefined?'cambia':''}" data-k="lq" style="--w:${b.pct}%"><svg viewBox="0 0 16 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 Q16 12 0 25 T0 50 T0 75 T0 100 Z"/></svg></span><span class="tot"><span>Contadas</span><b>${[0,4,4,7,7,11,13][st.p]}</b></span><span class="tot"><span>Listo</span><b>${b.pct}%</b></span><span class="der"><button class="btn primario grande">${b.lbl}${ico('flecha')}</button></span></div>${ctlBarra}`}}
]}
];
function upGana(st,el){const t='Ganas '+soles(st.precio-st.costo);const g1=$('#g1',el),g2=$('#g2',el);if(g1)g1.textContent=t;if(g2)g2.textContent=t+' · '+(st.precio?Math.round((st.precio-st.costo)/st.precio*100):0)+'%'}
function upBarra(st,el){const c=st.precio?cl(st.costo/st.precio,0,1):1,b=$('#pbb',el);b.style.setProperty('--c',c);b.style.setProperty('--g',1-c);b.children[0].textContent='Costo '+soles(st.costo);b.children[1].textContent='Ganas '+soles(Math.max(0,st.precio-st.costo));$('#pbp',el).textContent=Math.round((1-c)*100)+'%'}
function varsDesl(st){const min=16,max=140,x=(st.precio-min)/(max-min)*100,cm=(st.costo-min)/(max-min)*100;return `--x:${x}%;--cm:${cm}%;--cmr:${x?Math.min(100,cm/x*100):100}%`}

/* ===================================================== MOTOR ===================================================== */
let ELEC={};try{ELEC=JSON.parse(localStorage.getItem('recibir-opciones')||'{}')}catch(_){}
const busca=(cid,k)=>{const c=C.find(x=>x.id===cid);return [c,c.ops.find(o=>o.k===k)]};
function pintar(c,o,estreno){
  const box=$(`[data-demo="${c.id}-${o.k}"]`);if(!box)return;
  const prev={};$$('[data-k]',box).forEach(x=>prev[x.dataset.k]=x.getAttribute('style'));
  box.classList.toggle('estreno',!!estreno);box.innerHTML=o.render(o.st);
  if(!estreno&&!RED)$$('[data-k]',box).forEach(x=>{const p=prev[x.dataset.k],t=x.getAttribute('style');if(p==null||p===t)return;x.setAttribute('style',p);x.getBoundingClientRect();x.setAttribute('style',t)});
  o.after&&o.after(box,o.st);
  if(estreno&&!RED)$$('[data-cuenta]',box).forEach(el=>{const b=+el.dataset.cuenta,t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/800);el.textContent=Math.round(b*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(t0)});
  delete o.st.antes;
}
function armar(){
  $('#og-ind').innerHTML=C.map((c,i)=>`<a href="#o-${c.id}" class="${ELEC[c.id]?'elegido':''}">${i+1} · ${c.n}${ELEC[c.id]?' · '+ELEC[c.id]:''}</a>`).join('');
  $('#og-comps').innerHTML=C.map((c,i)=>`<section class="comp-o" id="o-${c.id}"><header><span class="num">${String(i+1).padStart(2,'0')}</span><h2>${c.n}</h2><span class="chip">Hoy en la maqueta: ${c.hoy}</span></header><p>${c.intro}</p>
    <div class="ops ${c.ancha?'anchas':''}">${c.ops.map(o=>`<article class="op ${ELEC[c.id]===o.k?'elegida':''}" data-c="${c.id}" data-k="${o.k}"><header><span class="letra">${o.k}</span><h3>${o.t}</h3></header><p class="idea">${o.idea}</p>
      <div class="escena" data-demo="${c.id}-${o.k}"></div>
      <div class="pie-op"><button class="btn chico" data-rep>${ico('repetir')}Repetir animación</button><button class="btn chico megusta" data-gusta aria-pressed="${ELEC[c.id]===o.k}">${ico('corazon')}${ELEC[c.id]===o.k?'Elegida':'Me gusta esta'}</button></div></article>`).join('')}</div></section>`).join('');
  C.forEach(c=>c.ops.forEach(o=>{o.st=o.init()}));
  const io=new IntersectionObserver(es=>es.forEach(en=>{if(!en.isIntersecting)return;const a=en.target;io.unobserve(a);const[c,o]=busca(a.dataset.c,a.dataset.k);pintar(c,o,true)}),{threshold:.25});
  $$('.op').forEach(a=>{const[c,o]=busca(a.dataset.c,a.dataset.k);$(`[data-demo="${c.id}-${o.k}"]`).innerHTML=o.render(o.st);io.observe(a)});
  resumen();
}
function resumen(){
  const n=Object.keys(ELEC).length;
  $('#eleccion').innerHTML=`<b>${n} de ${C.length}</b><span class="chips-e">${C.filter(c=>ELEC[c.id]).map(c=>`<span>${c.n}: ${ELEC[c.id]} · ${c.ops.find(o=>o.k===ELEC[c.id]).t}</span>`).join('')||'<span>Toca «Me gusta esta» en la opción que prefieras de cada componente</span>'}</span>${n?`<button class="btn chico" id="copiar">${ico('copiar')}Copiar mi elección</button>`:''}`;
  const b=$('#copiar');if(b)b.onclick=()=>{const t='Mi elección para Recibir:\n'+C.filter(c=>ELEC[c.id]).map(c=>`- ${c.n}: ${ELEC[c.id]} (${c.ops.find(o=>o.k===ELEC[c.id]).t})`).join('\n');(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{b.innerHTML=ico('ok')+'Copiado'},()=>{prompt('Copia tu elección:',t)})};
  $$('.og-ind a').forEach((a,i)=>{const c=C[i];a.classList.toggle('elegido',!!ELEC[c.id]);a.textContent=`${i+1} · ${c.n}${ELEC[c.id]?' · '+ELEC[c.id]:''}`});
}
document.addEventListener('click',ev=>{
  const art=ev.target.closest('.op');if(!art)return;const[c,o]=busca(art.dataset.c,art.dataset.k);
  if(ev.target.closest('[data-rep]')){o.st=o.init();pintar(c,o,true);return}
  if(ev.target.closest('[data-gusta]')){ELEC[c.id]=ELEC[c.id]===o.k?undefined:o.k;if(!ELEC[c.id])delete ELEC[c.id];try{localStorage.setItem('recibir-opciones',JSON.stringify(ELEC))}catch(_){}
    $$(`.op[data-c="${c.id}"]`).forEach(a=>{const si=ELEC[c.id]===a.dataset.k;a.classList.toggle('elegida',si);const g=$('[data-gusta]',a);g.setAttribute('aria-pressed',si);g.innerHTML=ico('corazon')+(si?'Elegida':'Me gusta esta')});resumen();return}
  const x=ev.target.closest('[data-x]');if(!x||x.disabled)return;const f=o.acc&&o.acc[x.dataset.x];if(!f)return;
  if(f(o.st,x.dataset.v,x)!==false)pintar(c,o,false);
});
document.addEventListener('input',ev=>{const el=ev.target.closest('[data-in]');if(!el)return;const art=el.closest('.op');if(!art)return;const[c,o]=busca(art.dataset.c,art.dataset.k);const f=o.vivo&&o.vivo[el.dataset.in];if(f)f(o.st,el.value,$(`[data-demo="${c.id}-${o.k}"]`))});
function pintaTema(){const o=document.documentElement.dataset.tema==='oscuro',t=$('.tema');if(t)t.innerHTML=`<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${o?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>':'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'}</svg>`}
try{if(localStorage.getItem('cayla-tema')==='oscuro')document.documentElement.dataset.tema='oscuro'}catch(_){}
document.addEventListener('DOMContentLoaded',()=>{pintaTema();$('.tema').onclick=()=>{const r=document.documentElement,o=r.dataset.tema==='oscuro';if(o)delete r.dataset.tema;else r.dataset.tema='oscuro';try{localStorage.setItem('cayla-tema',o?'claro':'oscuro')}catch(_){}pintaTema()};armar()});
})();
