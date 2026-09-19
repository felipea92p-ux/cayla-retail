/* ====================================================================
   FABRICAR · ÓRDENES — tablero, panel de la orden (talla × color) y
   «Nueva orden» con la información para decidir ANTES de abrirla.
   ==================================================================== */
function tarjetaOrden(o,i){
  const c=costos(o), m=modelo(o.modelo), mg=margen(m.precio,c.cpp), sm=semaforo(mg), r=riesgo(o), act=etapaActual(o), tot=c.total||1;
  const seg=ETAPAS.map(e=>{const s=o.etapas[e.k]; return `<i class="${s==='hecho'?'hecho':s==='terc'?'terc':(e.k===act?'actual':'')}" title="${e.t}"></i>`}).join('');
  const ent = r.d<0&&r.rest>0 ? `<span class="vence">entrega pasada</span>` : `entrega ${fechaCorta(o.entrega)} · ${r.d} d`;
  const sinIns = (c.tela+c.avio)===0;
  const estado = o.etapas[act]==='terc' ? `<span class="chip ambar">Maquila externa</span>` : (L()&&sinIns) ? `<span class="chip ambar">Sin insumos</span>` : (L()&&sm?`<span class="sem"><span class="dot ${sm.c}"></span>${sm.t} ${Math.round(mg*100)}%</span>`:'');
  const rie = r.rest===0 ? '' : r.tarde>0 ? `<div class="riesgo ambar"><b>~${r.tarde} d tarde:</b> faltan ~${r.rest} d de trabajo</div>` : '';
  return `<button class="card oc e" style="--i:${i}" data-id="${o.id}" type="button">
    <div class="r1"><div><h3>${nombreOrden(o)}</h3><div class="sub">${m.cat} · ${planDe(o)} prendas</div></div>${L()?`<div class="cpp"><b>${c.total?S(c.cpp):'—'}</b><span>costo / prenda</span></div>`:''}</div>
    <div class="seg">${seg}</div><div class="pie"><span>${ent}</span>${estado}</div>${rie}
    ${L()?(c.total>0?`<div class="stack"><i class="c-tela" style="width:${c.tela/tot*100}%"></i><i class="c-avio" style="width:${c.avio/tot*100}%"></i><i class="c-maq" style="width:${c.maq/tot*100}%"></i></div>`:''):''}</button>`;
}
function vOrdenes(){
  const os=D.ordenes, prendas=sum(os.map(planDe)), rie=os.filter(o=>riesgo(o).tarde>0).length;
  const ms=os.map(o=>{const c=costos(o); return c.total>0?margen(modelo(o.modelo).precio,c.cpp):null}).filter(x=>x!=null), mp=ms.length?sum(ms)/ms.length:0;
  const cols = COLS.map((col,ci)=>{ const xs=os.filter(o=>etapaActual(o)===col.k);
    return `<section class="col"><header><span class="lbl">${col.t}</span><span class="k">${xs.length}</span></header>${xs.length?xs.map((o,i)=>tarjetaOrden(o,ci*2+i)).join(''):`<div class="vacia">${col.k==='listo'?'Cuando terminen los acabados, la orden espera aquí para entrar al stock.':'Sin órdenes en esta etapa.'}</div>`}</section>`; }).join('');
  return `${cab('Órdenes de producción','Dónde está cada corrida, cuánto lleva costando y si llega a tiempo.', L()?btnPri('data-nueva="auto"',ic('plus')+'Nueva orden'):'')}
    <div class="kpis">${kpi(0,'verde','Órdenes en curso','k1',os.length,'',`${N(prendas)} prendas planeadas`,'verde',src('hoy'))}
      ${kpi(1,rie?'ambar':'verde','Llegarían tarde','k2',rie,'',rie?'según lo que falta trabajar':'todas a tiempo',rie?'ambar':'verde',src('deriva','deriva de etapas'))}
      ${L()?kpi(2,'verde','Margen promedio','k3',Math.round(mp*100),'','sobre el precio de venta',  'verde',src('hoy'),0,' %'):''}</div>
    <div class="board">${cols}</div>`;
}

/* ---------- matriz talla × color ---------- */
function matrizHTML(m, vals, {editable=true, id='mx', pie=''}={}){
  const cols=Object.keys(m.colores);
  const celda=(c,t)=>{ const k=c+'|'+t, v=vals[k]||0; return editable ? `<td><input data-mx="${id}" data-k="${k}" inputmode="numeric" value="${v}" aria-label="${c} ${t}"></td>` : `<td class="ro">${v}</td>`; };
  const totT=t=>sum(cols.map(c=>vals[c+'|'+t]||0));
  return `<table class="mx"><thead><tr><th></th>${TALLAS.map(t=>`<th>${t}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${cols.map(c=>`<tr><th class="f">${c}</th>${TALLAS.map(t=>celda(c,t)).join('')}<td class="tot tab" data-tc="${c}">${sum(TALLAS.map(t=>vals[c+'|'+t]||0))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td></td>${TALLAS.map(t=>`<td class="tab" data-tt="${t}">${totT(t)}</td>`).join('')}<td class="tot tab" data-tg="1">${sum(Object.values(vals))}</td></tr></tfoot></table>${pie}`;
}
function refrescarMatriz(m, vals){
  const cols=Object.keys(m.colores);
  cols.forEach(c=>{ const e=document.querySelector(`[data-tc="${c}"]`); if(e) e.textContent=sum(TALLAS.map(t=>vals[c+'|'+t]||0)); });
  TALLAS.forEach(t=>{ const e=document.querySelector(`[data-tt="${t}"]`); if(e) e.textContent=sum(cols.map(c=>vals[c+'|'+t]||0)); });
  const g=document.querySelector('[data-tg]'); if(g) g.textContent=sum(Object.values(vals));
}

/* ---------- panel de una orden ---------- */
function pasoHTML(o){
  const act=etapaActual(o);
  return `<div class="stp">${ETAPAS.map((e,i)=>{ const s=o.etapas[e.k];
    const cl = s==='hecho'?'hecho': s==='terc'?'terc actual': e.k===act?'actual':'';
    const pas = (i>0 && o.etapas[ETAPAS[i-1].k]==='hecho')?'pasado':'';
    const ck = s==='hecho'?`<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`: s==='terc'?`<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`:`<span class="tab" style="font-size:12px;font-weight:600">${i+1}</span>`;
    const acc = (e.k===act) ? `<div class="ac"><button class="btn pri s" data-hecho="${e.k}" type="button"><span class="brillo"></span>Marcar hecho</button><button class="btn dis s" data-terc="${e.k}" type="button">${s==='terc'?'Traer de vuelta':'Enviar a maquila'}</button></div>` : '';
    return `<div class="nd ${cl} ${pas}"><span class="pt">${ck}</span><div class="tt">${e.t}</div><div class="dd">${s==='terc'?'Con maquila externa':e.txt}</div>${acc}</div>`; }).join('')}</div>`;
}
function prevConsumo(o){
  const i=ui.form.insumo?insumo(ui.form.insumo):null, q=+ui.form.qty||0;
  if(!i||q<=0) return {vacio:true};
  const l=loteActivo(i);
  if(!l) return {error:`No hay saldo de ${i.nombre}. Recíbelo primero.`};
  const sl=saldoLote(i,l);
  if(q>sl) return {error:`El lote ${l.id} solo tiene ${N(sl,1)} ${i.u}. Registra ${N(sl,1)} y luego el resto: sale del siguiente lote, con su propio costo.`};
  const v=q*l.costo, a=costos(o), b=costos(o,{tipo:i.tipo,v}), m=modelo(o.modelo);
  return {i,l,sl,q,v,a,b, ma:margen(m.precio,a.cpp), mb:margen(m.precio,b.cpp)};
}
function previewConsumo(o){
  const p=prevConsumo(o);
  if(p.vacio) return `<div class="pv"><div class="fila"><span class="muted">Elige un insumo y una cantidad: verás de qué lote sale antes de confirmar.</span></div></div>`;
  if(p.error) return `<div class="pv"><div class="err">${p.error}</div></div>`;
  const u=p.i.u, tl=p.i.tipo==='tela'?'Tela':'Avíos', ta=p.i.tipo==='tela'?p.a.tela:p.a.avio, tb=p.i.tipo==='tela'?p.b.tela:p.b.avio;
  return `<div class="pv"><div class="fila"><span>Sale del lote <b>${p.l.id}</b><small>${p.l.prov}${L()?` · ${S(p.l.costo)} / ${u}`:''} · el más antiguo con saldo</small></span><span class="de"><s>${N(p.sl,1)}</s><b>${N(p.sl-p.q,1)} ${u}</b></span></div>
    ${L()?`<div class="fila"><span>${tl} de la orden<small>este consumo suma ${S(p.v)}</small></span><span class="de"><s>${S(ta)}</s><b>${S(tb)}</b></span></div>
    <div class="fila"><span>Costo por prenda</span><span class="de"><s>${S(p.a.cpp)}</s><b>${S(p.b.cpp)}</b></span></div>
    <div class="fila"><span>Margen sobre ${S(modelo(o.modelo).precio)}</span><span class="de"><s>${Math.round(p.ma*100)}%</s><b>${Math.round(p.mb*100)}%</b></span></div>`:''}</div>`;
}
function renderOrden(){
  const o=orden(ui.abierto); if(!o) return;
  const m=modelo(o.modelo), c=costos(o), mg=margen(m.precio,c.cpp), sm=semaforo(mg), r=riesgo(o), act=etapaActual(o), listo=act==='listo', tot=c.total||1, F=ui.form;
  const cs=D.consumos.filter(x=>x.orden===o.id).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const sinIns=(c.tela+c.avio)===0, sinAv=c.avio===0&&c.tela>0;
  const rendReal = (()=>{ const mt=sum(cs.filter(x=>insumo(x.insumo).tipo==='tela').map(x=>x.qty)); return mt? mt/planDe(o):null; })();
  $('#drw').innerHTML = `
  <div class="hd"><div><div class="lbl muted">${m.cat} · ${planDe(o)} prendas · ${r.d<0&&r.rest>0?'entrega pasada':'entrega '+fechaCorta(o.entrega)}</div><h2 id="drwT">${nombreOrden(o)}</h2></div><button class="x" data-cerrar type="button" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="bd">
    ${r.tarde>0?`<div class="aviso" style="margin:0 0 20px"><span class="dot ambar vivo"></span><span>Llegaría <b>~${r.tarde} días tarde</b>: faltan ~${r.rest} d de trabajo y hay ${r.d}.</span></div>`:''}
    <div class="sec"><span class="lbl">Etapas</span>${pasoHTML(o)}</div>
    <div class="sec"><span class="lbl">Qué se fabrica · talla × color</span>${matrizHTML(m,o.lineas,{editable:false})}</div>
    ${L()?`<div class="sec"><span class="lbl">Costo de la corrida</span>
      <div class="cost"><div><div class="big" data-num="cpp-${o.id}" data-val="${c.cpp}" data-pre="S/ " data-d="2">${S(c.cpp)}</div><div class="muted" style="font-size:12px;margin-top:4px">por prenda · ${S(c.total)} entre ${planDe(o)}</div></div>
        <div style="text-align:right">${sm?`<span class="chip ${sm.c}">${sm.t} · ${Math.round(mg*100)}%</span>`:''}<div class="muted" style="font-size:12px;margin-top:6px">precio de venta ${S(m.precio)}</div></div></div>
      <div class="stackg" style="margin-top:16px"><i class="c-tela" data-bar="sg-t-${o.id}" data-val="1" style="width:${c.tela/tot*100}%"></i><i class="c-avio" data-bar="sg-a-${o.id}" data-val="1" style="width:${c.avio/tot*100}%"></i><i class="c-maq" data-bar="sg-m-${o.id}" data-val="1" style="width:${c.maq/tot*100}%"></i></div>
      <div class="leg"><div><i class="c-tela"></i><span>Tela</span><span>${S(c.tela)}</span></div><div><i class="c-avio"></i><span>Avíos</span><span>${S(c.avio)}</span></div><div><i class="c-maq"></i><span>Maquila</span><span>${S(c.maq)}</span></div></div>
      <div class="gauge"><div class="tk"><i class="z1"></i><i class="z2"></i><i class="z3"></i></div><div class="mk"><b data-gauge="g-${o.id}" data-val="${mg==null?0:Math.max(0,Math.min(1,mg))}"></b></div><div class="es"><span>pierde &lt; 40%</span><span>al filo</span><span>gana ≥ 60%</span></div></div></div>`:''}
    <div class="sec"><span class="lbl">Insumos descontados</span>
      ${sinIns?`<div class="sinins"><b>Sin tela ni avíos registrados.</b> ${L()?'El costo por prenda está subestimado: solo cuenta la maquila. ':''}Registra lo que salió del estante.</div>`: sinAv?`<div class="sinins">Hay tela pero ningún avío: ¿botones, cierres, etiqueta?</div>`:''}
      ${rendReal?`<p class="muted" style="font-size:12.5px;margin-bottom:6px">Rinde <b>${N(rendReal,2)} m/prenda</b> hasta ahora · estándar ${m.rend} m ${src('deriva')}</p>`:''}
      ${cs.map(x=>{const i=insumo(x.insumo); return `<div class="cons ${x.id===ui.nuevoMov?'flash':''}"><span class="tipo">${ic('out')}</span><span>${i.nombre}<small>${x.lote} · ${fechaCorta(x.fecha)}</small></span><span class="v">${N(x.qty,1)} ${i.u}${L()?`<small>${S(costoC(x))}</small>`:''}</span></div>`}).join('')}
      <div class="form"><span class="lbl muted">Registrar consumo al cortar</span>
        <div class="opts">${D.insumos.map(i=>`<button class="opt" type="button" data-pick="${i.id}" aria-pressed="${F.insumo===i.id}">${i.nombre}<small class="tab">${N(saldo(i),1)} ${i.u}</small></button>`).join('')}</div>
        <div class="qty"><button type="button" data-q="-1" aria-label="Menos">−</button><input id="qty" inputmode="decimal" value="${F.qty||''}" placeholder="0" aria-label="Cantidad"><button type="button" data-q="1" aria-label="Más">+</button><span>${F.insumo?insumo(F.insumo).u:''}</span></div>
        <div id="prev">${previewConsumo(o)}</div>
        <div style="margin-top:14px"><button class="btn pri" id="btnCons" type="button" ${prevConsumo(o).v?'':'disabled'}><span class="brillo"></span>Descontar del lote</button></div></div></div>
    ${ui.cierre?cierreHTML(o,c,m):''}
  </div>
  <div class="ft">${listo&&!ui.cierre?`<button class="btn pri" id="btnCerrarOrd" type="button" style="flex:1"><span class="brillo"></span>Cerrar al inventario</button>`:ui.cierre?`<button class="btn dis" id="btnCancelarCierre" type="button" style="flex:1">Volver sin cerrar</button>`:`<button class="btn pri" style="flex:1" disabled title="Faltan etapas por marcar">Cerrar al inventario</button>`}
    ${L()?`<button class="btn dis" id="btnAnular" type="button">Anular</button>`:''}</div>`;
  post();
}
function cierreHTML(o,c,m){
  const b=sum(Object.values(ui.cierre.buenas)), cpp=b>0?c.total/b:0, mg=margen(m.precio,cpp), seg=planDe(o)-b;
  return `<div class="sec"><span class="lbl">Cierre: cuántas salieron buenas, por talla y color</span><div class="cierre">
    <div class="ok" id="cok">${ic('in')} Entran al stock del Taller · ${seg>0?`<span class="ambar">${seg} segunda${seg>1?'s':''} o perdida${seg>1?'s':''}</span>`:'sin segundas'}</div>
    ${matrizHTML(m,ui.cierre.buenas,{id:'cierre'})}
    ${L()?`<div class="cost" style="align-items:center;margin-top:12px"><div class="muted" style="font-size:12.5px">El costo se reparte entre las buenas, no entre las planeadas: una segunda sube el costo de las demás.</div>
      <div style="text-align:right"><div class="disp" style="font-size:30px;line-height:1" id="ccpp">${S(cpp)}</div><div class="muted" style="font-size:12px;margin-top:4px" id="cmg">costo real por prenda${mg!=null?` · margen ${Math.round(mg*100)}%`:''}</div></div></div>`:''}
    <div style="margin-top:12px"><button class="btn pri" id="btnConfirmarCierre" type="button" style="width:100%"><span class="brillo"></span>Confirmar entrada al stock</button></div></div></div>`;
}

/* ---------- Nueva orden: decidir antes de abrir ---------- */
function abrirNueva(id){
  const m = (id&&id!=='auto') ? modelo(id) : MODELOS.map(x=>({x,e:estadoModelo(x)})).sort((a,b)=>a.e.o-b.e.o||a.e.c1-b.e.c1)[0].x;
  const cv=curva(m), total=cv.sugerido||24;
  ui.no={modelo:m.id, total, mx:distribuir(m,total,cv.w)};
  abrirDrawer('nueva');
}
function analisisNueva(){
  const no=ui.no, m=modelo(no.modelo), n=sum(Object.values(no.mx)), tela=insumo(m.tela);
  const necTela = n*m.rend*(1+MERMA[m.tela]), sTela=saldo(tela), cam=enCamino(m.tela), otros=(demandaTela()[m.tela]||0);
  const libre = sTela - otros;
  const estTela = necTela<=libre ? {c:'verde',t:'Alcanza'} : necTela<=libre+cam ? {c:'ambar',t:'Alcanza si llega lo que viene'} : {c:'rojo',t:`Faltan ${N(necTela-libre-cam)} m`};
  const av = Object.entries(m.avios).map(([k,q])=>{ const i=insumo(k), need=n*q, s=saldo(i); return {i,need,s,ok:s>=need}; });
  const cTela = m.rend*precioRef(m.tela), cAv=sum(av.map(a=>a.need/Math.max(n,1)*precioRef(a.i.id))), cpp=cTela+cAv+m.maq, mg=margen(m.precio,cpp);
  const cm=comparaMaquila(m), dur=sum(ETAPAS.map(e=>e.d)), fecha=sumaDias(HOY,dur);
  return {m,n,necTela,sTela,cam,otros,libre,estTela,av,cTela,cAv,cpp,mg,cm,dur,fecha,capital:n*cpp};
}
function renderNueva(){
  const no=ui.no, m=modelo(no.modelo), cv=curva(m), a=analisisNueva(), e=estadoModelo(m);
  const sug = TALLAS.map(t=>Math.round(cv.need[t]));
  const mxv = Math.max(...TALLAS.map(t=>Math.max(m.v60[t]/8.57*SEM_OBJ, m.st[t])),1);
  $('#drw').innerHTML = `
  <div class="hd"><div><div class="lbl muted">Producción</div><h2 id="drwT">Nueva orden</h2></div><button class="x" data-cerrar type="button" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="bd">
    <div class="sec"><span class="lbl">1 · ¿Qué modelo?</span>
      <div class="opts" style="margin-bottom:6px">${MODELOS.map(x=>{const ex=estadoModelo(x); return `<button class="opt" data-nmodelo="${x.id}" aria-pressed="${x.id===m.id}">${x.n}<small>${ex.t}</small></button>`}).join('')}</div>
      <p class="muted" style="font-size:12.5px">Vendes <b>${N(ventasSem(m),1)}</b>/semana; hay <b>${stockTot(m)}</b> en stock${enProd(m)?` y <b>${enProd(m)}</b> en producción`:''} → <span class="chip ${e.c}">${e.t}</span></p></div>
    <div class="sec"><span class="lbl">2 · ¿Cuántas y en qué tallas? ${src('deriva','ventas + stock')}</span>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><div class="qty"><button type="button" data-nt="-6" aria-label="Menos">−</button><input id="ntotal" inputmode="numeric" value="${a.n}" aria-label="Total"><button type="button" data-nt="6" aria-label="Más">+</button><span>prendas</span></div>
        <button class="btn dis s" data-ncurva="1" type="button">Usar la curva sugerida (${cv.sugerido})</button></div>
      <div id="nmx">${matrizHTML(m,no.mx,{id:'nueva'})}</div>
      <div class="curva">${TALLAS.map((t,i)=>{ const v=m.v60[t]/8.57*SEM_OBJ, s=m.st[t]; return `<div><div class="bar"><i class="c-tela" title="Ventas en 8 semanas" style="height:${v/mxv*44}px;transform:none"></i><i class="c-prod" title="Stock actual" style="height:${Math.max(2,s/mxv*44)}px;transform:none"></i></div>${t}: piden ${Math.round(v)}, hay ${s}<br><b style="color:var(--tinta)">falta ${sug[i]}</b></div>`}).join('')}</div>
      <p class="muted" style="font-size:12px;margin-top:8px">Negro = lo que se vende en ${SEM_OBJ} semanas · marrón = lo que ya hay. La curva sugerida cubre la diferencia por talla.</p></div>
    <div class="sec"><span class="lbl">3 · Antes de abrirla</span><div id="nprev">${previewNueva(a)}</div></div>
  </div>
  <div class="ft">${btnPri('id="btnAbrirOrden"','Abrir orden','') .replace('class="btn pri "','class="btn pri" style="flex:1"')}<button class="btn dis" data-cerrar type="button">Cancelar</button></div>`;
}
function previewNueva(a){
  const ver = a.cm.v;
  return `<div class="pv">
    <div class="fila"><span>Tela: ${insumo(a.m.tela).nombre}<small>necesitas ${N(a.necTela,1)} m con ${N(MERMA[a.m.tela]*100)} % de merma · hay ${N(a.sTela,1)} m${a.otros?`, ${N(a.otros,1)} ya comprometidos en otras órdenes`:''}${a.cam?` · ${N(a.cam)} m en camino`:''}</small></span><span class="chip ${a.estTela.c}">${a.estTela.t}</span></div>
    ${a.av.map(x=>`<div class="fila"><span>${x.i.nombre}<small>necesitas ${N(x.need)} · hay ${N(x.s)}</small></span><span class="chip ${x.ok?'verde':'ambar'}">${x.ok?'Alcanza':'Faltan '+N(x.need-x.s)}</span></div>`).join('')}
    <div class="fila"><span>Costo estimado por prenda<small>tela ${S(a.cTela)} + avíos ${S(a.cAv)} + maquila ${S(a.m.maq)} ${src('deriva')}</small></span><span class="de"><b>${S(a.cpp)}</b></span></div>
    <div class="fila"><span>Margen esperado<small>contra el precio de venta ${S(a.m.precio)}</small></span>${(()=>{const s=semaforo(a.mg);return s?`<span class="chip ${s.c}">${s.t} · ${Math.round(a.mg*100)}%</span>`:'—'})()}</div>
    <div class="fila"><span>¿Fabricar o maquilar?<small>Interno ${S(a.cm.interno)} · externo ${S(a.cm.externo)} (${a.cm.d>0?'+':''}${N(a.cm.d*100,1)} %) ${src('nuevo','cotización')}</small></span><span class="chip ${ver.c}">${ver.t}</span></div>
    <div class="fila"><span>Entrega estimada<small>${a.dur} días de trabajo si empieza hoy</small></span><span class="de"><b>${fechaCorta(a.fecha)}</b></span></div>
    <div class="fila"><span>Capital que se inmoviliza</span><span class="de"><b>${S0(a.capital)}</b></span></div></div>`;
}
