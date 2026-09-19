/* ====================================================================
   ABASTECER — las 4 pantallas de Compras, dentro de Producción.
   La factura del proveedor sigue siendo el eje (ADR-0035); lo nuevo es
   que una factura de tela o avíos, al recibirse, abre el lote que la
   Orden consume, y se puede seguir de la factura a la prenda.
   ==================================================================== */
const destChip = d => d==='taller' ? '<span class="chip neutro">Taller</span>' : '<span class="chip neutro" style="border-style:dashed">Tiendas</span>';
const recChip = c => c.recibido ? (c.lineas.some(l=>l.k==='srv') ? '<span class="chip neutro">Servicio</span>' : '<span class="chip verde">Recibido</span>') : '<span class="chip ambar">Por recibir</span>';

/* ---------- Proveedores ---------- */
function spark(serie,w=90,h=28){
  const mn=Math.min(...serie), mx=Math.max(...serie), r=(mx-mn)||1;
  const pts = serie.map((v,i)=>`${(i/(serie.length-1)*w).toFixed(1)},${(h-3-(v-mn)/r*(h-6)).toFixed(1)}`).join(' ');
  const sube = serie[serie.length-1] > serie[0]*1.03;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline class="draw" pathLength="1" points="${pts}" fill="none" stroke="${sube?'var(--ambar)':'var(--tinta)'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function vProveedores(){
  const filas = D.provs.map((p,i)=>{
    const cs = D.comps.filter(c=>c.prov===p.n), deuda = sum(cs.map(c=>Math.max(0,saldoComp(c)))), comprado = sum(cs.map(totalComp));
    const venc = sum(cs.filter(c=>saldoComp(c)>0&&c.vence&&dias(c.vence)<0).map(saldoComp));
    const v = p.serie ? (p.serie[p.serie.length-1]/p.serie[0]-1) : null;
    return `<tr class="e" style="--i:${i}"><td class="nm"><b>${p.n}</b><span>${p.rubro} · ${p.plazo?`crédito ${p.plazo} d`:'contado'}</span></td>
      <td class="r">${S0(comprado)}</td><td class="r">${deuda?`${S0(deuda)}${venc?` <span class="chip rojo">vencido</span>`:''}`:'—'}</td>
      <td class="r"><span class="${p.puntual<80?'ambar':''}">${p.puntual} %</span><div class="muted" style="font-size:11.5px">llega en ${p.dias} d</div></td>
      <td>${p.serie?`<div style="display:flex;align-items:center;gap:10px">${spark(p.serie)}<span class="${v>.05?'ambar':''}" style="font-size:12.5px;font-variant-numeric:tabular-nums">${v>0?'+':''}${N(v*100,1)} %</span></div>`:'<span class="muted">—</span>'}</td></tr>`; }).join('');
  const ls = D.provs.filter(p=>p.rubro==='Tela'||p.rubro==='Avíos').map(p=>p);
  const lino = [prov('Textiles Gamarra'), prov('Lino Andino SAC')];
  const cmp = lino.map(p=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--t10)"><span><b style="font-weight:500">${p.n}</b><br><span class="muted" style="font-size:12px">llega en ${p.dias} d · puntual ${p.puntual} %</span></span><span class="tab" style="text-align:right"><b>${S(p.serie[p.serie.length-1])}</b> / m<br><span class="muted" style="font-size:12px">crédito ${p.plazo} d</span></span></div>`).join('');
  return `${cab('Proveedores','Quién te abastece, cuánto le debes y si cumple. Los precios de tela se comparan por metro, no por factura.',
      `<button class="btn dis" type="button" disabled style="opacity:.5">Nuevo proveedor</button>`)}
    <div class="dos" style="margin-top:20px"><div class="card e"><table class="tb"><thead><tr><th>Proveedor</th><th class="r">Comprado</th><th class="r">Saldo</th><th class="r">Cumplimiento</th><th>Precio (6 meses)</th></tr></thead><tbody>${filas}</tbody></table></div>
    <aside class="card pad e"><div class="lbl muted">Comparar · Lino lavado crudo ${src('deriva')}</div>${cmp}
      <p style="font-size:13px;margin-top:12px">Lino Andino cobra <b>${N((19.8/18.5-1)*100,1)} % más</b> y tarda el doble, pero da 15 días de crédito. Si el corte no urge, Textiles Gamarra sale más barato.</p>
      <p class="muted" style="font-size:12px;margin-top:10px">Cumplimiento y precio se derivan de los comprobantes y recepciones; nada se digita aparte.</p></aside></div>`;
}

/* ---------- Comprobantes ---------- */
function vComprobantes(){
  const cs = D.comps.filter(c=>ui.cf==='todos'||c.dest===ui.cf).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const mes = D.comps.filter(c=>c.fecha.startsWith('2026-09')), tMes=sum(mes.map(totalComp));
  const tTal = sum(mes.filter(c=>c.dest==='taller').map(totalComp));
  const filas = cs.map((c,i)=>`<tr class="click e ${ui.nuevoComp===c.id?'flash':''}" style="--i:${i}" data-comp="${c.id}"><td>${fechaCorta(c.fecha)}</td>
    <td class="nm"><b>${c.prov}</b><span>${c.doc}</span></td><td>${destChip(c.dest)}</td><td class="muted" style="max-width:280px">${conceptoComp(c)}</td>
    <td class="r">${S(totalComp(c))}</td><td>${chipPago(c)}</td><td>${recChip(c)}</td></tr>`).join('');
  return `${cab('Comprobantes','La factura del proveedor es el eje: de ella cuelgan lo que llegó y lo que se pagó. Ahora dice también para qué es: Taller o tiendas.',
      btnPri('data-nuevocomp="1"',ic('plus')+'Registrar comprobante'))}
    <div class="kpis">${kpi(0,'verde','Comprado en septiembre','k1',tMes,'S/ ',`${mes.length} comprobantes`,'',src('hoy'))}
      ${kpi(1,'verde','Para el Taller','k2',Math.round(tTal/tMes*100),'',`de lo comprado este mes (${S0(tTal)})`,'',src('nuevo','destino'),0,' %')}
      ${kpi(2,'ambar','Por recibir','k3',D.comps.filter(c=>!c.recibido).length,'',D.comps.filter(c=>!c.recibido).map(c=>c.prov).join(' · ')||'nada pendiente','ambar',src('hoy'))}
      ${kpi(3,'verde','Tela ≈ por prenda','k4',costoModelo(modelo('aruma'))-modelo('aruma').maq,'S/ ','de insumos en una Blusa Aruma','',src('deriva'),2)}</div>
    <div class="filtros e">${[['todos','Todos'],['taller','Taller'],['tiendas','Tiendas']].map(([k,t])=>`<button class="opt" data-cf="${k}" aria-pressed="${ui.cf===k}">${t}</button>`).join('')}</div>
    <div class="card e"><table class="tb"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Destino</th><th>Concepto</th><th class="r">Total</th><th>Pago</th><th>Recepción</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}
function detalleComp(c){
  const lotes = c.lineas.filter(l=>l.k==='ins').map(l=>{ const i=insumo(l.ins), lo=i.lotes.find(x=>x.doc===c.doc);
    if(!lo) return `<div class="cons"><span class="tipo">${ic('in')}</span><span>${i.nombre}<small>${N(l.qty)} ${i.u} · aún sin recibir</small></span><span class="v">${S(l.qty*l.costo)}</span></div>`;
    const usos = D.consumos.filter(x=>x.lote===lo.id).map(x=>`${nombreOrden(orden(x.orden))} ${N(x.qty,1)} ${i.u}`);
    return `<div class="cons"><span class="tipo">${ic('in')}</span><span>${i.nombre}<small>Lote ${lo.id} · saldo ${N(saldoLote(i,lo),1)} de ${N(lo.cant)} ${i.u}</small></span><span class="v">${S(l.qty*l.costo)}</span></div>
      <p class="muted" style="font-size:12.5px;margin:2px 0 10px 34px">${usos.length?'Se consumió en: '+usos.join(' · '):'Aún no se consume en ninguna orden.'}</p>`; }).join('');
  const otros = c.lineas.filter(l=>l.k!=='ins').map(l=>`<div class="cons"><span class="tipo">${ic('in')}</span><span>${l.desc}<small>${l.qty?N(l.qty)+' unid.':'servicio'}</small></span><span class="v">${S(l.total!=null?l.total:l.qty*l.costo)}</span></div>`).join('');
  return `<div class="hd"><div><div class="lbl muted">${c.prov} · ${fechaCorta(c.fecha)}</div><h2 id="drwT">${c.doc}</h2></div><button class="x" data-cerrar type="button" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="bd"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">${destChip(c.dest)}${chipPago(c)}${recChip(c)}</div>
    <div class="sec"><span class="lbl">De la factura a la prenda ${src('deriva')}</span>${lotes}${otros}</div>
    <div class="pv"><div class="fila"><span>Total del comprobante<small>el costo de la tela es sin IGV; el IGV es crédito fiscal</small></span><span class="de"><b>${S(totalComp(c))}</b></span></div>
      <div class="fila"><span>Pagado</span><span class="de">${S(c.pagado)}</span></div>
      <div class="fila"><span>Saldo${c.vence?`<small>vence el ${fechaCorta(c.vence)}</small>`:''}</span><span class="de"><b>${S(Math.max(0,saldoComp(c)))}</b></span></div></div></div>`;
}

/* ---------- Por pagar ---------- */
function semanasPago(){
  const b=[{t:'Vencido',v:0,x:true},{t:'Esta sem.',v:0},{t:'Sem. 2',v:0},{t:'Sem. 3',v:0},{t:'Sem. 4',v:0},{t:'Después',v:0}];
  D.comps.filter(c=>saldoComp(c)>0&&c.vence).forEach(c=>{ const d=dias(c.vence), s=saldoComp(c);
    if(d<0) b[0].v+=s; else if(d<7) b[1].v+=s; else if(d<14) b[2].v+=s; else if(d<21) b[3].v+=s; else if(d<28) b[4].v+=s; else b[5].v+=s; });
  return b;
}
function vPorPagar(){
  const pend = D.comps.filter(c=>saldoComp(c)>0.005).sort((a,b)=>(a.vence||'9').localeCompare(b.vence||'9'));
  const bs = semanasPago(), mx=Math.max(...bs.map(b=>b.v),1);
  const tot = sum(pend.map(saldoComp)), venc = bs[0].v, s7=bs[1].v;
  const selN = pend.filter(c=>ui.sel[c.id]).length, selT = sum(pend.filter(c=>ui.sel[c.id]).map(saldoComp));
  const filas = pend.map((c,i)=>`<tr class="e" style="--i:${i}"><td><input class="chk" type="checkbox" data-sel="${c.id}" ${ui.sel[c.id]?'checked':''} aria-label="Seleccionar ${c.doc}"></td>
    <td class="nm"><b>${c.prov}</b><span>${c.doc} · ${conceptoComp(c).slice(0,46)}</span></td><td>${destChip(c.dest)}</td>
    <td>${c.vence?fechaCorta(c.vence):'—'}</td><td>${chipPago(c)}</td><td class="r"><b style="font-weight:600">${S(saldoComp(c))}</b></td></tr>`).join('');
  return `${cab('Por pagar','Qué se debe, a quién y cuándo. Ordenado por vencimiento; marca varios y págalos juntos.','')}
    <div class="kpis">${kpi(0,venc?'rojo':'verde','Vencido','k1',venc,'S/ ',venc?'pagar primero':'al día',venc?'rojo':'verde',src('hoy'))}
      ${kpi(1,'ambar','Vence en 7 días','k2',s7,'S/ ','',s7?'ambar':'',src('hoy'))}${kpi(2,'verde','Total por pagar','k3',tot,'S/ ',`${pend.length} comprobantes`,'',src('hoy'))}
      ${kpi(3,'verde','Del Taller','k4',Math.round(sum(pend.filter(c=>c.dest==='taller').map(saldoComp))/Math.max(tot,1)*100),'',`del saldo es tela, avíos y maquila`,'',src('nuevo','destino'),0,' %')}</div>
    <h2 class="s e">Lo que vence, semana a semana <small>para decidir qué pagar primero y cuándo hace falta caja ${src('hoy')}</small></h2>
    <div class="card pad e"><div class="sem5">${bs.map(b=>`<div class="b"><em class="tab">${b.v?S0(b.v):''}</em><i class="${b.x?'v':''}" data-bar="sp-${b.t}" data-eje="y" data-val="1" style="height:${Math.max(3,b.v/mx*84)}px"></i><span>${b.t}</span></div>`).join('')}</div></div>
    <div class="card e" style="margin-top:14px"><table class="tb"><thead><tr><th style="width:34px"></th><th>Comprobante</th><th>Destino</th><th>Vence</th><th>Estado</th><th class="r">Saldo</th></tr></thead><tbody>${filas||'<tr><td colspan="6" class="muted" style="padding:24px;text-align:center">Nada por pagar.</td></tr>'}</tbody></table></div>
    <div class="pagbar ${selN?'on':''}" id="pagbar"><span>${selN} comprobante${selN>1?'s':''} · <b class="tab">${S(selT)}</b></span><button class="btn pri s" style="background:var(--crema);color:var(--tinta)" data-pagar="1" type="button">Pagar juntos</button></div>`;
}

/* ---------- Recibir ---------- */
function vRecibir(){
  const pend = D.comps.filter(c=>!c.recibido);
  const dem = demandaTela();
  const tarjetas = pend.map((c,i)=>{
    const lin = c.lineas.map((l,j)=>{ if(l.k==='ins'){ const it=insumo(l.ins), v=(ui.rc[c.id+j]!==undefined?ui.rc[c.id+j]:l.qty);
        const falt = l.qty - (+v||0);
        return `<div class="cons" style="grid-template-columns:auto minmax(0,1fr) auto"><span class="tipo">${ic('in')}</span><span>${it.nombre}<small>pedido ${N(l.qty)} ${it.u}${L()?` · ${S(l.costo)} / ${it.u}`:''}${falt>0?` · <span class="ambar">faltan ${N(falt)}</span>`:''}</small></span>
          <span class="qty"><input data-rc="${c.id}|${j}" inputmode="decimal" value="${v}" aria-label="Llegó" style="width:72px"><span>${it.u}</span></span></div>`; }
      return `<div class="cons"><span class="tipo">${ic('in')}</span><span>${l.desc}<small>${N(l.qty)} unid. · entrarán al almacén de las tiendas</small></span><span class="v">${L()?S(l.qty*l.costo):''}</span></div>`; }).join('');
    const bloq = c.lineas.filter(l=>l.k==='ins'&&(dem[l.ins]||0)>saldo(insumo(l.ins))).map(l=>D.ordenes.filter(o=>o.etapas.corte!=='hecho'&&modelo(o.modelo).tela===l.ins).map(nombreOrden)).flat();
    return `<div class="card pad e" style="margin-bottom:12px;--i:${i}"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div><b style="font-weight:600">${c.prov}</b> <span class="muted">· ${c.doc} · ${fechaCorta(c.fecha)}</span><div style="margin-top:6px">${destChip(c.dest)}</div></div>
      ${btnPri(`data-recibir="${c.id}"`,'Recibir','s')}</div>
      ${bloq.length?`<div class="aviso" style="margin-top:12px"><span class="dot ambar vivo"></span><span>Esta tela destraba el corte de <b>${bloq.join(' y ')}</b>.</span></div>`:''}
      <div style="margin-top:8px">${lin}</div>
      <p class="muted" style="font-size:12px;margin-top:8px">${c.dest==='taller'?'Al recibir se abre un lote por línea y el saldo del insumo sube.':'Al recibir entra a las tiendas por el almacén.'}</p></div>`; }).join('');
  return `${cab('Recibir','Lo que llegó contra su comprobante. En el Taller, cada línea recibida abre un lote con su costo y su proveedor.','')}
    <div class="kpis">${kpi(0,pend.length?'ambar':'verde','Por recibir','k1',pend.length,'',pend.length?'comprobantes con mercadería en camino':'todo recibido',pend.length?'ambar':'verde',src('hoy'))}
      ${kpi(1,'verde','Llegaron este mes','k2',D.comps.filter(c=>c.recibido&&c.fecha>='2026-09').length,'','comprobantes ya recibidos','',src('hoy'))}</div>
    <div style="margin-top:20px">${tarjetas||'<div class="card pad">Nada por recibir.</div>'}</div>`;
}
