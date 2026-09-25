/* ====================================================================
   Paneles de comprobante y pago, enrutador y eventos
   ==================================================================== */
const VISTAS = {resumen:vResumen, proveedores:vProveedores, comprobantes:vComprobantes, porpagar:vPorPagar, recibir:vRecibir, ordenes:vOrdenes, insumos:vInsumos, eficiencia:vEficiencia};

function render(){
  if(!L() && !VISTAS_COLAB.includes(ui.vista)) ui.vista='ordenes';
  $('#vista').innerHTML = VISTAS[ui.vista]();
  renderLateral(); post();
  if(ui.drawer) renderDrawer();
}
function ir(v){ ui.vista=v; ui.nuevoComp=null; render(); window.scrollTo({top:0,behavior:REDUCE()?'auto':'smooth'}); }
function abrirDrawer(modo,id){
  ui.drawer=modo; ui.abierto=id||ui.abierto;
  if(modo==='orden'){ ui.form={insumo:null,qty:0}; ui.cierre=null; }
  $('#drw').classList.toggle('ancho', modo==='nueva');
  renderDrawer(); $('#veil').classList.add('on'); $('#drw').classList.add('on');
}
function cerrarDrawer(){ ui.drawer=null; $('#veil').classList.remove('on'); $('#drw').classList.remove('on'); }
function renderDrawer(){
  if(ui.drawer==='orden') return renderOrden();
  if(ui.drawer==='nueva') return renderNueva();
  if(ui.drawer==='comp') return renderRegistrar();
  if(ui.drawer==='pagar') return renderPagar();
  if(ui.drawer==='detalle') { $('#drw').innerHTML=detalleComp(D.comps.find(c=>c.id===ui.abierto)); post(); }
}

/* ---------- Registrar comprobante (de tela o avíos) ---------- */
function abrirComprobante(iid){
  const i = iid?insumo(iid):insumo('lino');
  const provs = D.provs.filter(p=>p.rubro===(i.tipo==='tela'?'Tela':'Avíos'));
  const mejor = [...provs].sort((a,b)=>a.serie[a.serie.length-1]-b.serie[b.serie.length-1])[0];
  const cobertura = i.tipo==='tela' ? Math.max(0,Math.ceil(((demandaTela()[i.id]||0)+i.min-saldo(i)-enCamino(i.id))/10)*10) : Math.max(50,Math.ceil((i.min*2-saldo(i))/50)*50);
  ui.rcmp={ins:i.id, prov:mejor.n, qty:cobertura||50, costo:mejor.serie[mejor.serie.length-1], cond:'credito', doc:''};
  abrirDrawer('comp');
}
function renderRegistrar(){
  const r=ui.rcmp, i=insumo(r.ins), rub=i.tipo==='tela'?'Tela':'Avíos', provs=D.provs.filter(p=>p.rubro===rub), p=prov(r.prov)||provs[0];
  const total=r.qty*r.costo, venc=r.cond==='credito'?sumaDias(HOY,p.plazo):null, llega=sumaDias(HOY,p.dias);
  const otro=provs.find(x=>x.n!==p.n), pu=p.serie[p.serie.length-1], po=otro&&otro.serie[otro.serie.length-1];
  $('#drw').innerHTML=`<div class="hd"><div><div class="lbl muted">Abastecer</div><h2 id="drwT">Registrar comprobante</h2></div><button class="x" data-cerrar type="button" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="bd"><span class="lbl muted">¿Qué compraste?</span><div class="opts">${D.insumos.map(x=>`<button class="opt" data-rins="${x.id}" aria-pressed="${x.id===i.id}">${x.nombre}</button>`).join('')}</div>
    <div class="g2"><label class="fld"><span>Cantidad (${i.u})</span><input id="rcQty" inputmode="decimal" value="${r.qty}"></label>
      <label class="fld"><span>Costo por ${i.u==='m'?'metro':i.u} (sin IGV)</span><input id="rcCosto" inputmode="decimal" value="${r.costo}"></label></div>
    <div class="g2"><label class="fld"><span>Proveedor</span><select id="rcProv">${provs.map(x=>`<option ${x.n===p.n?'selected':''}>${x.n}</option>`).join('')}</select></label>
      <label class="fld"><span>N.º de documento</span><input id="rcDoc" placeholder="F004-0000" value="${r.doc}"></label></div>
    <span class="lbl muted">Condición</span><div class="opts"><button class="opt" data-rcond="credito" aria-pressed="${r.cond==='credito'}">Crédito ${p.plazo?p.plazo+' d':''}</button><button class="opt" data-rcond="contado" aria-pressed="${r.cond==='contado'}">Contado</button></div>
    <div class="pv"><div class="fila"><span>Total sin IGV<small>el IGV (${S(total*.18)}) es crédito fiscal, no costo del insumo</small></span><span class="de"><b>${S(total)}</b></span></div>
      <div class="fila"><span>${venc?'Vence':'Se paga hoy'}<small>${venc?'entra a Por pagar':'sale de la cuenta de la empresa'}</small></span><span class="de"><b>${venc?fechaCorta(venc):'hoy'}</b></span></div>
      <div class="fila"><span>Llegada estimada<small>${p.n} suele entregar en ${p.dias} días (puntual ${p.puntual} %)</small></span><span class="de"><b>${fechaCorta(llega)}</b></span></div>
      ${otro?`<div class="fila"><span>Comparado con ${otro.n}<small>por ${i.u==='m'?'metro':i.u}, último precio</small></span><span class="de ${pu>po?'ambar':'verde'}"><b>${pu>po?'+':''}${N((pu/po-1)*100,1)} %</b></span></div>`:''}</div>
    <p class="muted" style="font-size:12.5px;margin-top:12px">Queda como «Por recibir». Al recibirlo en <b>Recibir</b> se abre el lote y el saldo sube.</p></div>
  <div class="ft">${btnPri('id="btnGuardarComp"','Registrar comprobante').replace('class="btn pri "','class="btn pri" style="flex:1"')}<button class="btn dis" data-cerrar type="button">Cancelar</button></div>`;
}
function renderPagar(){
  const cs=D.comps.filter(c=>ui.sel[c.id]&&saldoComp(c)>0), tot=sum(cs.map(saldoComp));
  $('#drw').innerHTML=`<div class="hd"><div><div class="lbl muted">Por pagar</div><h2 id="drwT">Pagar juntos</h2></div><button class="x" data-cerrar type="button" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="bd">${cs.map(c=>`<div class="cons"><span class="tipo">${ic('out')}</span><span>${c.prov}<small>${c.doc}${c.vence?' · vence '+fechaCorta(c.vence):''}</small></span><span class="v">${S(saldoComp(c))}</span></div>`).join('')}
    <div class="pv"><div class="fila"><span>Total a pagar</span><span class="de"><b>${S(tot)}</b></span></div><div class="fila"><span>Sale de<small>la cuenta de la empresa, no de la caja de tienda</small></span><span class="de"><b>Cuenta BCP</b></span></div></div></div>
  <div class="ft">${btnPri('id="btnConfirmarPago"','Confirmar pago de '+S(tot)).replace('class="btn pri "','class="btn pri" style="flex:1"')}<button class="btn dis" data-cerrar type="button">Cancelar</button></div>`;
}

/* ---------- eventos ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('button,[data-comp],[data-nueva],tr.click,input[data-sel]'); if(!t) return;
  const d=t.dataset;
  if(d.v){ return ir(d.v); }
  if(d.vIr) return ir(d.vIr);
  if(d.scroll){ const el=document.getElementById(d.scroll); return el&&el.scrollIntoView({behavior:REDUCE()?'auto':'smooth'}); }
  if(d.orden){ if(ui.vista!=='ordenes') ir('ordenes'); return abrirDrawer('orden',d.orden); }
  if(t.classList.contains('oc')) return abrirDrawer('orden',d.id);
  if(d.nueva!==undefined) return abrirNueva(d.nueva);
  if(d.pedir) return abrirComprobante(d.pedir);
  if(d.nuevocomp) return abrirComprobante();
  if(d.comp){ ui.abierto=d.comp; return abrirDrawer('detalle',d.comp); }
  if(t.hasAttribute('data-cerrar')||t.id==='veil') return cerrarDrawer();
  if(d.cf){ ui.cf=d.cf; return render(); }
  if(d.tog){ ui.insAbierto[d.tog]=!ui.insAbierto[d.tog]; t.closest('.ins').classList.toggle('abierto'); return t.setAttribute('aria-expanded',ui.insAbierto[d.tog]); }
  if(d.rol){ ui.rol=d.rol; document.querySelectorAll('[data-rol]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.rol===ui.rol)); cerrarDrawer(); return render(); }
  if(t.id==='btnFuentes'){ const on=document.body.classList.toggle('fuentes'); return t.setAttribute('aria-pressed',on); }
  if(t.id==='btnMov'){ const on=document.documentElement.classList.toggle('reducir'); return t.setAttribute('aria-pressed',on); }
  if(t.id==='btnReset'){ D=datosIniciales(); D.ordenes.forEach(o=>{o.lineas=distribuir(modelo(o.modelo),o.plan0,modelo(o.modelo).v60)}); ui.insAbierto={};ui.sel={};ui.rc={};ui.nuevoMov=null;ui.nuevoIns=null;ui.nuevoComp=null;
    [numCache,barCache,gaugeCache].forEach(c=>Object.keys(c).forEach(k=>delete c[k])); cerrarDrawer(); render(); return aviso('<b>Demo reiniciada</b>'); }

  /* --- Recibir / Por pagar --- */
  if(d.recibir){ const c=D.comps.find(x=>x.id===d.recibir); const cortables=[];
    c.lineas.forEach((l,j)=>{ if(l.k!=='ins') return; const it=insumo(l.ins), q=parseFloat(ui.rc[c.id+j]!==undefined?ui.rc[c.id+j]:l.qty)||0; if(q<=0) return;
      const cod=it.id[0].toUpperCase()+'-'+String(921+D.seq++).padStart(4,'0'); it.lotes.push({id:cod,prov:c.prov,ingreso:HOY,cant:q,costo:l.costo,doc:c.doc});
      ui.nuevoIns=it.id; ui.nuevoLote=cod; ui.nuevoMov='ing-'+cod; ui.insAbierto[it.id]=true; });
    c.recibido=true; ui.rc={}; trabajando();
    const dem=demandaTela(), destr=D.ordenes.filter(o=>o.etapas.corte!=='hecho'&&saldo(insumo(modelo(o.modelo).tela))>=(dem[modelo(o.modelo).tela]||0)&&c.lineas.some(l=>l.ins===modelo(o.modelo).tela)).map(nombreOrden);
    render(); return aviso(`<b>${c.doc} recibido</b>`,{sub:c.dest==='taller'?`Se abrió el lote y el saldo subió. ${destr.length?`Ya se puede cortar: ${destr.join(', ')}.`:''}`:'Entró al almacén de las tiendas.',dur:8}); }
  if(d.sel!==undefined){ ui.sel[d.sel]=t.checked; const pb=$('#pagbar'); const sel=D.comps.filter(c=>ui.sel[c.id]&&saldoComp(c)>0);
    pb.classList.toggle('on',sel.length>0); pb.querySelector('span').innerHTML=`${sel.length} comprobante${sel.length>1?'s':''} · <b class="tab">${S(sum(sel.map(saldoComp)))}</b>`; return; }
  if(d.pagar) return abrirDrawer('pagar');
  if(t.id==='btnConfirmarPago'){ const cs=D.comps.filter(c=>ui.sel[c.id]&&saldoComp(c)>0), tot=sum(cs.map(saldoComp)); cs.forEach(c=>c.pagado=totalComp(c)); ui.sel={}; cerrarDrawer(); trabajando(); render();
    return aviso(`<b>${cs.length} comprobante${cs.length>1?'s':''} pagado${cs.length>1?'s':''}</b>`,{sub:`${S(tot)} salieron de la cuenta de la empresa.`,dur:7}); }

  /* --- Registrar comprobante --- */
  if(d.rins){ const i=insumo(d.rins); ui.rcmp.ins=i.id; const provs=D.provs.filter(p=>p.rubro===(i.tipo==='tela'?'Tela':'Avíos')); ui.rcmp.prov=provs[0].n; ui.rcmp.costo=provs[0].serie[5]; return renderRegistrar(); }
  if(d.rcond){ ui.rcmp.cond=d.rcond; return renderRegistrar(); }
  if(t.id==='btnGuardarComp'){ const r=ui.rcmp, i=insumo(r.ins), p=prov(r.prov); if(!(r.qty>0&&r.costo>0)) return;
    const id='c'+(D.comps.length+1), n=D.comps.length+1; const doc=r.doc||('F00'+(4+(n%3))+'-0'+(900+n));
    D.comps.push({id,prov:r.prov,doc,fecha:HOY,dest:'taller',vence:r.cond==='credito'?sumaDias(HOY,p.plazo):null,pagado:r.cond==='contado'?r.qty*r.costo:0,recibido:false,lineas:[{k:'ins',ins:i.id,qty:r.qty,costo:r.costo}]});
    ui.nuevoComp=id; cerrarDrawer(); trabajando(); if(ui.vista==='insumos'||ui.vista==='resumen') render(); else ir('comprobantes');
    return aviso(`<b>Comprobante ${doc} registrado</b>`,{sub:`${N(r.qty)} ${i.u} de ${i.nombre} por ${S(r.qty*r.costo)}. ${r.cond==='credito'?`Vence el ${fechaCorta(sumaDias(HOY,p.plazo))}.`:'Pagado al contado.'} Aparece en Recibir.`,dur:8}); }

  /* --- Nueva orden --- */
  if(d.nmodelo){ const m=modelo(d.nmodelo), cv=curva(m), total=cv.sugerido||24; ui.no={modelo:m.id,total,mx:distribuir(m,total,cv.w)}; return renderNueva(); }
  if(d.nt){ const m=modelo(ui.no.modelo), cv=curva(m), nt=Math.max(6,sum(Object.values(ui.no.mx))+(+d.nt)); ui.no.mx=distribuir(m,nt,cv.w); return renderNueva(); }
  if(d.ncurva){ const m=modelo(ui.no.modelo), cv=curva(m); ui.no.mx=distribuir(m,cv.sugerido||24,cv.w); return renderNueva(); }
  if(t.id==='btnAbrirOrden'){ const a=analisisNueva(), m=a.m; if(a.n<=0) return; const id='o'+(D.ordenes.length+D.cerradas.length+1)+'n';
    flip(()=>{ D.ordenes.push({id,modelo:m.id,entrega:a.fecha,maquila:Math.round(a.n*m.maq),plan0:a.n,lineas:{...ui.no.mx},etapas:{corte:'pendiente',confeccion:'pendiente',acabado:'pendiente'}}); });
    cerrarDrawer(); trabajando(); if(ui.vista!=='ordenes') ir('ordenes'); else render();
    return aviso(`<b>Orden abierta: ${m.n}</b>`,{sub:`${a.n} prendas · entrega estimada ${fechaCorta(a.fecha)} · ${a.estTela.c==='verde'?'la tela alcanza':a.estTela.t.toLowerCase()}.`,dur:8}); }

  /* --- Orden: etapas, consumo, cierre --- */
  const o=ui.abierto&&D.ordenes.find(x=>x.id===ui.abierto);
  if(d.hecho&&o){ trabajando(); flip(()=>{o.etapas[d.hecho]='hecho'; renderLateral(); if(ui.vista==='ordenes') $('#vista').innerHTML=vOrdenes();}); const n=etapaActual(o); renderOrden();
    return aviso(`<b>${ETAPAS.find(x=>x.k===d.hecho).t} hecho</b>`,{sub:n==='listo'?`${nombreOrden(o)} está lista para cerrar al inventario`:`${nombreOrden(o)} pasa a ${COLS.find(c=>c.k===n).t.toLowerCase()}`,
      deshacer:()=>{flip(()=>{o.etapas[d.hecho]='pendiente'; if(ui.vista==='ordenes') $('#vista').innerHTML=vOrdenes(); renderLateral();}); if(ui.abierto===o.id) renderOrden();}}); }
  if(d.terc&&o){ const k=d.terc; o.etapas[k]=o.etapas[k]==='terc'?'pendiente':'terc'; render(); return aviso(o.etapas[k]==='terc'?`<b>${nombreOrden(o)}</b> salió a maquila externa`:`<b>${nombreOrden(o)}</b> volvió al Taller`); }
  if(d.pick&&o){ ui.form.insumo=d.pick; ui.form.qty=0; return renderOrden(); }
  if(d.q&&o){ const i=ui.form.insumo?insumo(ui.form.insumo):null; if(!i) return; const paso=i.u==='m'?.5:10; ui.form.qty=Math.max(0,+(((+ui.form.qty||0)+(+d.q)*paso).toFixed(2))); $('#qty').value=ui.form.qty||''; $('#prev').innerHTML=previewConsumo(o); $('#btnCons').disabled=!prevConsumo(o).v; return; }
  if(t.id==='btnCons'&&o){ const p=prevConsumo(o); if(!p.v) return; const id='m'+(D.consumos.length+1)+'n';
    D.consumos.push({id,orden:o.id,insumo:p.i.id,lote:p.l.id,qty:p.q,fecha:HOY}); ui.nuevoMov=id; ui.nuevoIns=p.i.id; trabajando(); ui.form={insumo:null,qty:0}; render();
    return aviso(`<b>${N(p.q,1)} ${p.i.u} de ${p.i.nombre}</b> descontados`,{sub:`Sale del lote ${p.l.id}.${L()?` ${nombreOrden(o)} ahora cuesta ${S(costos(o).cpp)} por prenda.`:''}`,deshacer:()=>{D.consumos=D.consumos.filter(x=>x.id!==id); ui.nuevoMov=null; render();},dur:7}); }
  if(t.id==='btnCerrarOrd'&&o){ ui.cierre={buenas:{...o.lineas}}; return renderOrden(); }
  if(t.id==='btnCancelarCierre'&&o){ ui.cierre=null; return renderOrden(); }
  if(t.id==='btnConfirmarCierre'&&o){ const b=sum(Object.values(ui.cierre.buenas)); if(b<=0) return; const cpp=costos({...o,buenas:b}).cpp; trabajando(1200);
    o.buenas=b; o.cerrada=HOY; D.stockTaller+=b; D.cerradas.push(o); cerrarDrawer();
    setTimeout(()=>{ flip(()=>{ D.ordenes=D.ordenes.filter(x=>x.id!==o.id); render(); }); aviso(`<b>${b} prendas entran al stock del Taller</b>`,{sub:`${nombreOrden(o)}${L()?` · costo real ${S(cpp)} por prenda, ya recalculado en cada variante`:''}. Siguiente paso: trasladarlas a las tiendas.`,dur:8}); },380); return; }
  if(t.id==='btnAnular'&&o){ cerrarDrawer(); setTimeout(()=>{ D.ordenes=D.ordenes.filter(x=>x.id!==o.id); D.consumos=D.consumos.filter(x=>x.orden!==o.id); render(); aviso(`<b>${nombreOrden(o)} anulada</b>`,{sub:'Lo consumido volvió a sus lotes con un movimiento de devolución.'}); },300); return; }
});
document.addEventListener('input',e=>{
  const o=ui.abierto&&D.ordenes.find(x=>x.id===ui.abierto), id=e.target.id, el=e.target;
  if(id==='qty'&&o){ ui.form.qty=parseFloat(el.value.replace(',','.'))||0; $('#prev').innerHTML=previewConsumo(o); $('#btnCons').disabled=!prevConsumo(o).v; }
  if(el.dataset.rc){ ui.rc[el.dataset.rc.replace('|','')]=el.value; }
  if(el.dataset.mx==='cierre'&&o){ const tope=o.lineas[el.dataset.k]||0, v=Math.min(tope,Math.max(0,parseInt(el.value)||0)); if(String(v)!==el.value) el.value=v; ui.cierre.buenas[el.dataset.k]=v; refrescarMatriz(modelo(o.modelo),ui.cierre.buenas);
    const c=costos(o), b=sum(Object.values(ui.cierre.buenas)), cpp=b?c.total/b:0, mg=margen(modelo(o.modelo).precio,cpp); const a=$('#ccpp'), z=$('#cmg'), ok=$('#cok'), sg=planDe(o)-b; if(ok) ok.innerHTML=`${ic('in')} Entran al stock del Taller · ${sg>0?`<span class="ambar">${sg} segunda${sg>1?'s':''} o perdida${sg>1?'s':''}</span>`:'sin segundas'}`; if(a) a.textContent=S(cpp); if(z) z.textContent=`costo real por prenda${mg!=null?` · margen ${Math.round(mg*100)}%`:''}`; }
  if(el.dataset.mx==='nueva'){ ui.no.mx[el.dataset.k]=Math.max(0,parseInt(el.value)||0); refrescarMatriz(modelo(ui.no.modelo),ui.no.mx); $('#ntotal').value=sum(Object.values(ui.no.mx)); $('#nprev').innerHTML=previewNueva(analisisNueva()); }
  if(id==='ntotal'){ const m=modelo(ui.no.modelo), n=Math.max(0,parseInt(el.value)||0); ui.no.mx=distribuir(m,n,curva(m).w); $('#nmx').innerHTML=matrizHTML(m,ui.no.mx,{id:'nueva'}); $('#nprev').innerHTML=previewNueva(analisisNueva()); }
  if(id==='rcQty'){ ui.rcmp.qty=parseFloat(el.value)||0; renderRegistradoLigero(); }
  if(id==='rcCosto'){ ui.rcmp.costo=parseFloat(el.value)||0; renderRegistradoLigero(); }
  if(id==='rcDoc') ui.rcmp.doc=el.value;
});
function renderRegistradoLigero(){ const f=document.activeElement, id=f&&f.id, pos=f&&f.selectionStart; renderRegistrar(); if(id){ const n=document.getElementById(id); if(n){ n.focus(); try{n.setSelectionRange(pos,pos)}catch(_){} } } }
document.addEventListener('change',e=>{ if(e.target.id==='rcProv'){ ui.rcmp.prov=e.target.value; ui.rcmp.costo=prov(e.target.value).serie.slice(-1)[0]; renderRegistrar(); } });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&ui.drawer) cerrarDrawer(); });

render();
