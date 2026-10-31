/* Campana de estados de las cuentas: datos reales de la pantalla del usuario (Interbank es de ejemplo). Se engancha a window.CAMPANA_HTML(). */
(function(){
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const f=n=>(n<0?"−":"")+"S/ "+Math.abs(Math.round(n)).toLocaleString("en-US");
const SEDES={aqp:{n:"Tienda AQP",c:"var(--rojo-p)"},lim:{n:"Tienda LIM",c:"var(--rojo)"},tru:{n:"Tienda TRU",c:"var(--ambar)"},tal:{n:"Taller",c:"var(--taupe)"},emp:{n:"Empresa",c:"var(--verde)"},cam:{n:"En camino",c:"var(--pizarra)"}};
const ETAPAS={banco:{n:"Ya en el banco",q:"Disponible para pagar hoy",c:"var(--pizarra)"},camino:{n:"En camino al banco",q:"Cobrado con tarjeta o QR; la máquina lo deposita en 1–2 días",c:"var(--m-qr)"},fuerte:{n:"Por depositar",q:"Caja fuerte de tienda o en manos del líder",c:"var(--m-efectivo)"},caja:{n:"En las cajas de venta",q:"El efectivo del día",c:"var(--taupe)"}};
/* e: ok | info | am | rj ; fl: filtro al que pertenece */
const C=[
 {id:1,s:"aqp",et:"caja",n:"Caja Operativa",q:"Caja cerrada desde el viernes 30",v:302,chip:["Cerrada","info"]},
 {id:2,s:"aqp",et:"fuerte",n:"Caja fuerte",q:"Lo que los cierres guardan en la tienda",v:861,chip:["depositada hace 2 días","ok"]},
 {id:3,s:"lim",et:"caja",n:"Caja Operativa",q:"Caja cerrada desde el viernes 30",v:101,chip:["Cerrada","info"]},
 {id:4,s:"lim",et:"fuerte",n:"Caja fuerte",q:"Lo que los cierres guardan en la tienda",v:0},
 {id:5,s:"tru",et:"caja",n:"Caja Operativa",q:"Abierta desde las 08:14 · vendió S/ 30 en efectivo",v:316,chip:["Abierta ahora","ok"]},
 {id:6,s:"tru",et:"fuerte",n:"Caja fuerte",q:"Lo que los cierres guardan en la tienda",v:2300,chip:["depositada hace 3 días","ok"]},
 {id:7,s:"tal",et:"caja",n:"Fondo fijo",q:"Fondo fijo para gastos chicos",v:0},
 {id:8,s:"tal",et:"caja",n:"Caja Operativa",q:"Lo que los cierres guardan en la tienda",v:0},
 {id:9,s:"emp",et:"fuerte",n:"Efectivo entregado al líder",q:"Lo que un cierre entrega al líder, hasta que lo deposita",v:-5,chip:["Saldo negativo: revisar","rj"],fl:"neg",accion:"Revisar movimientos"},
 {id:10,s:"emp",et:"banco",n:"BCP Empresa",q:"Yape de las 3 tiendas · Plin de las 3 tiendas · transferencias",v:4009,chip:["sin conciliar","am"],fl:"conc",accion:"Cuadrar con el banco"},
 {id:11,s:"emp",et:"banco",n:"BCP Operativa",q:"Sin cobros asignados todavía",v:1567,chip:["sin conciliar","am"],fl:"conc",accion:"Cuadrar con el banco"},
 {id:12,s:"emp",et:"banco",n:"Interbank (ejemplo)",q:"Aquí depositan Izipay y Vendemás",v:21492,chip:["sin conciliar","am"],fl:"conc",accion:"Cuadrar con el banco"},
 {id:13,s:"cam",et:"camino",n:"Por depositar Izipay",q:"QR de las 3 tiendas · tarjeta de LIM, hasta que la máquina los deposita",v:8190,chip:["4 días sin abonar","am"],fl:"abonar",accion:"Registrar el depósito"},
 {id:14,s:"cam",et:"camino",n:"Por depositar Vendemás",q:"Tarjeta de AQP y TRU, hasta que la máquina los deposita",v:3169,chip:["4 días sin abonar","am"],fl:"abonar",accion:"Registrar el depósito"}];
const S={abierta:null};
const atn=c=>c.chip&&(c.chip[1]==="am"||c.chip[1]==="rj");
const FILTROS=[["todas","Todas",()=>true],["atn","Piden atención",atn],["conc","Sin conciliar",c=>c.fl==="conc"],["abonar","Sin abonar",c=>c.fl==="abonar"],["neg","Saldo negativo",c=>c.fl==="neg"]];
const tot=l=>l.reduce((a,c)=>a+c.v,0);
const chip=c=>c.chip?`<span class="chip t-${c.chip[1]}">${c.chip[0]}</span>`:"";
const det=(c,ab=S.abierta)=>ab===c.id?`<div class="det"><span><b>${SEDES[c.s].n==="En camino"?"Todavía no tiene sede":SEDES[c.s].n}</b> · ${ETAPAS[c.et].n}</span><span class="tenue">${c.q}</span>${c.accion?`<button class="btnx" data-a="1">${c.accion}</button>`:'<span class="tenue">Sin nada pendiente.</span>'}<button class="btnx" data-a="1">Ver historial completo</button></div>`:"";
const CIERRES=[["TRU","miércoles 28",180.5,"Janis Revilla"],["LIM","miércoles 28",-233,"Claudia Pereyra"],["TRU","martes 27",.5,"Keyla Ramos"],["TRU","lunes 26",4,"Janis Revilla"],["TRU","viernes 23",3,"Janis Revilla"],["TRU","miércoles 21",15.2,"Janis Revilla"],["TRU","martes 20",79.5,"Danixa Valverde"],["TRU","domingo 18",.1,"Janis Revilla"],["AQP","sábado 17",.1,"Sandra Ramírez"],["TRU","sábado 17",2,"Chiara Flores"]];
const SEDE_C={TRU:"Tienda TRU",LIM:"Tienda LIM",AQP:"Tienda AQP"};
const fc=n=>"S/ "+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const nFalt=CIERRES.filter(c=>c[2]<0).length;
const M={tab:"cuentas",fc:"todos",open:false,fl:"todas",orden:{k:"e",d:1},size:30,page:1,abierta:null};
const nAt=C.filter(atn).length;const nBell=nAt+nFalt;
function Tcuentas(){const {k,d}=M.orden;const fn=FILTROS.find(x=>x[0]===M.fl)[2];
 const key={n:c=>c.n,s:c=>SEDES[c.s].n,et:c=>ETAPAS[c.et].n,e:c=>(c.chip?({rj:0,am:1,info:2,ok:3})[c.chip[1]]:4),v:c=>c.v}[k];
 const todos=C.filter(fn).sort((a,b)=>{const x=key(a),y=key(b);return (x>y?1:x<y?-1:0)*d});
 const pags=Math.max(1,Math.ceil(todos.length/M.size));M.page=Math.min(M.page,pags);const vis=todos.slice((M.page-1)*M.size,M.page*M.size);
 const th=(kk,t,r)=>`<th class="${r?"r":""}" data-ms="${kk}" ${M.orden.k===kk?`aria-sort="${d>0?"ascending":"descending"}" data-f="${d>0?"↑":"↓"}"`:""}>${t}</th>`;
 const nums=[];for(let p=1;p<=pags;p++)if(p===1||p===pags||Math.abs(p-M.page)<=1)nums.push(p);else if(nums.at(-1)!=="…")nums.push("…");
 return `<div class="m-velo" data-m="velo"><div class="m-hoja" role="dialog" aria-modal="true" aria-label="Estado de las cuentas"><div class="m-cab"><div><span class="versalita">Dónde está</span><h2>Estado de las cuentas</h2><p class="tenue">${nAt} piden atención. Toca una fila para ver qué hacer.</p></div><button class="m-x" data-m="cerrar" aria-label="Cerrar">×</button></div>${tabs()}
 <div class="m-barra" role="group" aria-label="Filtrar por estado">${FILTROS.map(([kk,t,fn2])=>`<button class="fl ${kk==="atn"?"am":""}" aria-pressed="${M.fl===kk}" data-mf="${kk}">${t}${kk!=="todas"?`<span class="n">${C.filter(fn2).length}</span>`:""}</button>`).join("")}</div>
 <div class="m-cuerpo">${todos.length?`<section class="c-tab"><table><thead><tr>${th("n","Cuenta")}${th("s","Sede")}${th("et","Etapa")}${th("e","Estado")}${th("v","Saldo",1)}</tr></thead><tbody>
 ${vis.map(c=>`<tr class="fila" data-mo="${c.id}" tabindex="0"><td class="nom"><b style="font-weight:600">${c.n}</b><small>${c.q}</small></td><td>${SEDES[c.s].n==="En camino"?'<span class="sinsede">sin sede</span>':SEDES[c.s].n}</td><td>${ETAPAS[c.et].n}</td><td>${chip(c)||'<span class="tenue">—</span>'}</td><td class="r s num ${c.v<0?"neg":""}">${f(c.v)}</td></tr>${M.abierta===c.id?`<tr><td colspan="5" style="padding:0 14px 12px">${det(c,M.abierta)}</td></tr>`:""}`).join("")}</tbody></table></section>`:'<div class="m-vacio"><p class="serif" style="font-size:20px">Todo en orden</p><p class="tenue" style="font-size:13px">Ninguna cuenta está en este estado.</p></div>'}</div>
 <div class="m-pie"><span class="tenue num">${todos.length?(M.page-1)*M.size+1:0}–${Math.min(M.page*M.size,todos.length)} de ${todos.length} cuentas · Suma ${f(tot(todos))} · <span class="m-seg">${[30,40].map(n=>`<button aria-pressed="${M.size===n}" data-msz="${n}">${n}</button>`).join("")}</span> por página</span>
 <div class="m-pag"><button data-mp="${M.page-1}" ${M.page<=1?"disabled":""} aria-label="Página anterior">‹</button>${nums.map(p=>p==="…"?"<span class='tenue'>…</span>":`<button aria-pressed="${p===M.page}" data-mp="${p}">${p}</button>`).join("")}<button data-mp="${M.page+1}" ${M.page>=pags?"disabled":""} aria-label="Página siguiente">›</button></div></div></div></div>`;}
const tabs=()=>`<div class="m-tabs" role="tablist" aria-label="Qué mirar">${[["cuentas","Cuentas",nAt],["cierres","Cierres con diferencia",nFalt],...((window.CAMPANA_OPC||[]).length?[["porreg","Por registrar",window.CAMPANA_OPC.length]]:[])].map(([k,t,n])=>`<button role="tab" aria-selected="${M.tab===k}" data-mt="${k}">${t}${n?`<span class="g">${n}</span>`:""}</button>`).join("")}</div>`;
function Tcierres(){const FC=[["todos","Todos",()=>true],["falt","Faltaron",c=>c[2]<0],["sobr","Sobraron",c=>c[2]>0],["TRU","TRU",c=>c[0]==="TRU"],["LIM","LIM",c=>c[0]==="LIM"],["AQP","AQP",c=>c[0]==="AQP"]];
 const fn=FC.find(x=>x[0]===M.fc)[2];const todos=CIERRES.filter(fn);const pags=Math.max(1,Math.ceil(todos.length/M.size));M.page=Math.min(M.page,pags);const vis=todos.slice((M.page-1)*M.size,M.page*M.size);
 const nums=[];for(let p=1;p<=pags;p++)if(p===1||p===pags||Math.abs(p-M.page)<=1)nums.push(p);else if(nums.at(-1)!=="…")nums.push("…");
 const neto=todos.reduce((a,c)=>a+c[2],0);
 return `<div class="m-velo" data-m="velo"><div class="m-hoja" role="dialog" aria-modal="true" aria-label="Cierres con diferencia"><div class="m-cab"><div><span class="versalita">Dónde está</span><h2>Cierres con diferencia</h2><p class="tenue">${nFalt} faltó plata y ${CIERRES.length-nFalt} sobró. Un cierre con faltante pide revisión.</p></div><button class="m-x" data-m="cerrar" aria-label="Cerrar">×</button></div>${tabs()}
 <div class="m-barra" role="group" aria-label="Filtrar cierres">${FC.map(([k,t,fn2])=>`<button class="fl ${k==="falt"?"am":""}" aria-pressed="${M.fc===k}" data-mc="${k}">${t}<span class="n">${CIERRES.filter(fn2).length}</span></button>`).join("")}</div>
 <div class="m-cuerpo">${todos.length?`<section class="c-tab"><table><thead><tr><th>Día</th><th>Sede</th><th>Qué pasó</th><th class="r">Diferencia</th><th>Quién cerró</th></tr></thead><tbody>${vis.map(c=>`<tr><td><b style="font-weight:600;text-transform:capitalize">${c[1]}</b></td><td>${SEDE_C[c[0]]}</td><td><span class="chip ${c[2]<0?"t-rj":"t-am"}">${c[2]<0?"Faltaron":"Sobraron"}</span></td><td class="r s num ${c[2]<0?"neg":""}">${c[2]<0?"−":"+"}${fc(c[2])}</td><td>${c[3]}</td></tr>`).join("")}</tbody></table></section>`:'<div class="m-vacio"><p class="serif" style="font-size:20px">Sin cierres con diferencia</p></div>'}</div>
 <div class="m-pie"><span class="tenue num">${todos.length?(M.page-1)*M.size+1:0}–${Math.min(M.page*M.size,todos.length)} de ${todos.length} cierres · Neto ${neto<0?"−":"+"}${fc(neto)} · <span class="m-seg">${[30,40].map(n=>`<button aria-pressed="${M.size===n}" data-msz="${n}">${n}</button>`).join("")}</span> por página</span>
 <div class="m-pag"><button data-mp="${M.page-1}" ${M.page<=1?"disabled":""} aria-label="Página anterior">‹</button>${nums.map(p=>p==="…"?"<span class='tenue'>…</span>":`<button aria-pressed="${p===M.page}" data-mp="${p}">${p}</button>`).join("")}<button data-mp="${M.page+1}" ${M.page>=pags?"disabled":""} aria-label="Página siguiente">›</button></div></div></div></div>`;}
function Tporreg(){const P=window.CAMPANA_OPC||[];return `<div class="m-velo" data-m="velo"><div class="m-hoja" role="dialog" aria-modal="true" aria-label="Por registrar"><div class="m-cab"><div><span class="versalita">Dónde está</span><h2>Por registrar</h2><p class="tenue">${P.length} cosas esperan que las registres: depósitos de máquinas y salidas de planilla.</p></div><button class="m-x" data-m="cerrar" aria-label="Cerrar">×</button></div>${tabs()}<div class="m-cuerpo" style="padding:16px 24px;display:flex;flex-direction:column;gap:10px">${P.map(x=>`<div class="pr-card"><span class="ic">!</span><div><b>${x.t}</b><span>${x.d}</span></div><button class="btnx" data-pa="1" ${x.q?`data-pq="${x.q}"`:""}>${x.a}</button></div>`).join("")}</div><div class="m-pie"><span class="tenue">Cada aviso se va cuando lo registras.</span></div></div></div>`}
const Tm=()=>M.tab==="porreg"&&(window.CAMPANA_OPC||[]).length?Tporreg():M.tab==="cierres"?Tcierres():Tcuentas();
function renderM(keep){const el=document.getElementById("modal-estados");const ya=!!el.firstChild&&M.open;const sc=ya?(el.querySelector(".m-cuerpo")||{}).scrollTop:0;const foco=document.activeElement&&document.activeElement.dataset?document.activeElement.dataset.mo:null;
 el.innerHTML=M.open?Tm():"";document.body.style.overflow=M.open?"hidden":"";
 if(ya){el.querySelector(".m-velo").classList.add("ya");const c=el.querySelector(".m-cuerpo");if(c&&keep)c.scrollTop=sc;if(foco){const r=el.querySelector('[data-mo="'+foco+'"]');if(r)r.focus({preventScroll:true})}}}
document.addEventListener("click",e=>{const t=e.target.closest("[data-m],[data-pa],[data-mt],[data-mc],[data-mf],[data-ms],[data-msz],[data-mp],[data-mo],[data-sub]");if(!t)return;const d=t.dataset;
 if(d.pa){e.stopPropagation();if(d.pq&&window.ABRIR_MOV){M.open=false;renderM();window.ABRIR_MOV(d.pq)}else alert("En la app esto abre la hoja que ya existe. La maqueta no guarda.");return}
 if(d.m==="velo"&&e.target!==t)return;
 if(d.m==="abrir"){M.open=true;M.page=1;M.abierta=null}else if(d.m==="cerrar"||d.m==="velo")M.open=false;
 else if(d.mt){M.tab=d.mt;M.page=1;M.abierta=null}else if(d.mc){M.fc=d.mc;M.page=1}
 else if(d.mf){M.fl=d.mf;M.page=1;M.abierta=null}else if(d.ms){M.orden=M.orden.k===d.ms?{k:d.ms,d:-M.orden.d}:{k:d.ms,d:d.ms==="v"?-1:1};M.page=1}
 else if(d.msz){M.size=+d.msz;M.page=1}else if(d.mp)M.page=+d.mp;else if(d.mo){const i=+d.mo;M.abierta=M.abierta===i?null:i}
 e.stopPropagation();renderM(!!d.mo)},true);
addEventListener("keydown",e=>{if(e.key==="Escape"&&M.open){M.open=false;renderM()}if((e.key==="Enter"||e.key===" ")&&e.target.dataset&&e.target.dataset.mo){e.preventDefault();e.target.click()}});

window.CAMPANA_ABRIR=t=>{M.tab=t;M.open=true;M.page=1;M.abierta=null;renderM()};
const host=document.createElement("div");host.id="modal-estados";document.body.appendChild(host);
window.CAMPANA_HTML=()=>`<button class="campana ${C.some(c=>c.chip&&c.chip[1]==="rj")?"rj":""}" data-m="abrir" aria-haspopup="dialog" aria-label="${nAt} cuentas piden atención y ${nFalt} cierre con faltante" title="${nAt} cuentas piden atención · ${nFalt} cierre con faltante"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="b">${nAt+nFalt+(window.CAMPANA_OPC||[]).length}</span></button>`;
})();
