/* ====================================================================
   FABRICAR · INSUMOS  y  MEDIR · EFICIENCIA DEL TALLER (D-31)
   ==================================================================== */
function topModelo(iid){ return MODELOS.filter(m=>m.tela===iid||m.avios[iid]).sort((a,b)=>ventasSem(b)-ventasSem(a))[0]; }
function filaInsumo(i,idx){
  const s=saldo(i), est=estadoIns(i), tope=Math.max(i.min*3,s,1), abierto=!!ui.insAbierto[i.id];
  const lotes=[...i.lotes].sort((a,b)=>a.ingreso.localeCompare(b.ingreso)), primero=loteActivo(i), cam=enCamino(i.id);
  const cs=consumoSem(i), sem=cs>0?s/cs:null, tm=topModelo(i.id);
  const rinde = tm ? Math.floor(s/(i.tipo==='tela'?tm.rend:tm.avios[i.id])) : null;
  const dur = est.c!=='verde' && !cam ? `<button class="btn dis s" data-pedir="${i.id}" type="button" style="margin-top:8px">Pedir</button>` : cam?`<span class="chip neutro" style="margin-top:8px">${N(cam)} ${i.u} en camino</span>`:'';
  return `<article class="card ins e ${abierto?'abierto':''} ${ui.nuevoIns===i.id?'flash':''}" style="--i:${idx}">
    <button class="cab2" type="button" aria-expanded="${abierto}" data-tog="${i.id}">
      <div class="nom"><b>${i.nombre}</b><span>${i.lotes.length} lote${i.lotes.length>1?'s':''}${sem?` · alcanza ~${N(sem,1)} sem.`:''}${rinde?` · ≈ ${N(rinde)} prendas de ${tm.n}`:''}</span></div>
      <div class="saldo"><div class="tk"><div class="fl ${est.c==='verde'?'':est.c}" data-bar="ins-${i.id}" data-val="${Math.min(1,s/tope)}"></div><div class="mn" style="left:${i.min/tope*100}%" title="Mínimo ${i.min} ${i.u}"></div></div>
        <div class="tx"><span>mínimo ${N(i.min)} ${i.u}</span><span class="${est.c}">${est.t}</span></div></div>
      <div class="num"><span data-num="s-${i.id}" data-val="${s}" data-d="${i.u==='m'?1:0}">${N(s,i.u==='m'?1:0)}</span><small>${i.u}</small></div><span class="caret">${ic('chev')}</span></button>
    <div class="lotes"><div><div class="in">
      ${lotes.map(l=>{const sl=saldoLote(i,l); return `<div class="lote ${ui.nuevoIns===i.id&&l.id===ui.nuevoLote?'flash':''}"><b>${l.id}</b>
        <div><div class="mb"><i data-bar="lt-${l.id}" data-val="${sl/l.cant}"></i></div><small class="muted">${l.prov} · ${l.doc}</small></div>
        <span class="tab">${N(sl,1)} / ${N(l.cant)}</span>${L()?`<span class="cs tab muted">${S(l.costo)}${l===primero?' <span class="chip neutro" style="font-size:9.5px" title="Se descuenta primero">1º</span>':''}</span>`:'<span class="cs"></span>'}</div>`}).join('')}
      ${dur?`<div style="padding-top:10px">${dur}</div>`:''}
    </div></div></div></article>`;
}
function vInsumos(){
  const bajos=D.insumos.filter(i=>estadoIns(i).c!=='verde').length, cap=sum(D.insumos.map(i=>sum(i.lotes.map(l=>saldoLote(i,l)*l.costo))));
  const grupo=(tipo,titulo,sub,base)=>`<div><h2 class="s e">${titulo}<small>${sub}</small></h2>${D.insumos.filter(i=>i.tipo===tipo).map((i,k)=>filaInsumo(i,base+k)).join('')}</div>`;
  const movs=[];
  D.insumos.forEach(i=>i.lotes.forEach(l=>movs.push({id:'ing-'+l.id,f:l.ingreso,t:'in',txt:`Entra ${l.id}`,sub:`${i.nombre} · ${l.prov}`,q:`+${N(l.cant)} ${i.u}`})));
  D.consumos.forEach(c=>{const i=insumo(c.insumo),o=orden(c.orden); movs.push({id:c.id,f:c.fecha,t:'out',txt:'Sale al cortar',sub:`${i.nombre} · ${nombreOrden(o)}`,q:`−${N(c.qty,i.u==='m'?1:0)} ${i.u}`})});
  movs.sort((a,b)=>b.f.localeCompare(a.f)||(b.id===ui.nuevoMov?1:0)-(a.id===ui.nuevoMov?1:0));
  return `${cab('Insumos','Tela y avíos del Taller: lo que hay por lote, cuánto dura y qué pedir. El saldo siempre es la suma de movimientos.',
      `<button class="btn dis" data-nuevocomp="1" type="button">${ic('cart')}Pedir a proveedor</button>`)}
    <div class="kpis">${kpi(0,bajos?'ambar':'verde','Bajo el mínimo','k1',bajos,'',bajos?'pide o espera lo que viene':'todo sobre el mínimo',bajos?'ambar':'verde',src('hoy'))}
      ${L()?kpi(1,'verde','Capital en insumos','k2',cap,'S/ ','a costo de cada lote','',src('deriva')):''}
      ${kpi(2,'verde','En camino','k3',D.comps.filter(c=>!c.recibido&&c.dest==='taller').length,'','comprobantes por recibir','',src('hoy'))}</div>
    <div class="dos"><div>${grupo('tela','Telas','se compran por metro',0)}${grupo('avio','Avíos','botones, cierres y etiquetas',4)}</div>
    <aside class="card libro e" style="margin-top:28px"><h3>Libro de movimientos</h3><p class="muted" style="font-size:12px;margin-bottom:6px">Solo se agrega, nunca se edita.</p>
      ${movs.slice(0,9).map(m=>`<div class="mov ${m.id===ui.nuevoMov?'nuevo':''}"><span class="tipo">${ic(m.t==='in'?'in':'out')}</span><span>${m.txt}<small>${m.sub}</small></span><span class="q ${m.t==='in'?'mas':''}">${m.q}</span></div>`).join('')}</aside></div>`;
}

/* ---------- Eficiencia del Taller ---------- */
function vEficiencia(){
  const ef=eficienciaMes(), mx=ef.gasto;
  const serie=[...HIST_MESES.map(h=>({m:h.m,cpp:h.cpp,ef:h.ef})), {m:'Sep',cpp:ef.absorbido? (D.cerradas.filter(o=>o.cerrada).reduce((a,o)=>a+costos(o).cpp,0)/D.cerradas.filter(o=>o.cerrada).length):37.4, ef:ef.ef}];
  const W=340,H=140,xs=i=>26+i*(W-52)/(serie.length-1), mn=34, mxc=44, ys=v=>H-16-(v-mn)/(mxc-mn)*(H-40);
  const pts=serie.map((s,i)=>`${xs(i).toFixed(1)},${ys(s.cpp).toFixed(1)}`).join(' ');
  const lin=`<svg class="lin" viewBox="0 0 ${W} ${H+12}"><polyline class="draw" pathLength="1" points="${pts}" fill="none" stroke="var(--tinta)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${serie.map((s,i)=>`<circle cx="${xs(i)}" cy="${ys(s.cpp)}" r="3.5" fill="var(--crema)" stroke="var(--tinta)" stroke-width="1.6"/><text x="${xs(i)}" y="${ys(s.cpp)-10}" text-anchor="middle">${N(s.cpp,1)}</text><text x="${xs(i)}" y="${H+6}" text-anchor="middle">${s.m}</text>`).join('')}</svg>`;
  const cas=[['Gastado',ef.gasto,'c-tela'],['Ya es prenda',ef.absorbido,'c-ok'],['En proceso',ef.proceso,'c-prod'],['No absorbido',ef.fijos,'c-no']];
  const modelos=MODELOS.map(m=>({m,c:comparaMaquila(m)})).sort((a,b)=>b.c.d-a.c.d);
  const filas=modelos.map(({m,c},i)=>`<tr class="e" style="--i:${i}"><td class="nm"><b>${m.n}</b><span>${m.cat}</span></td><td class="r">${S(c.interno)}</td><td class="r">${S(c.externo)}</td>
    <td class="r ${c.d>=.05?'ambar':c.d<=-.05?'verde':''}">${c.d>0?'+':''}${N(c.d*100,1)} %</td><td><span class="chip ${c.v.c}">${c.v.t}</span></td></tr>`).join('');
  const rend=MODELOS.map((m,i)=>{ const d=(m.real.rend/m.rend-1); const merma=MERMA[m.tela]; return `<tr class="e" style="--i:${i}"><td class="nm"><b>${m.n}</b><span>${insumo(m.tela).nombre}</span></td><td class="r">${m.rend}</td><td class="r">${m.real.rend}</td>
    <td class="r ${d>.05?'ambar':''}">${d>0?'+':''}${N(d*100,1)} %</td><td class="r">${N(m.real.seg*100)} %</td><td>${d>merma?`<span class="chip ambar">Gasta más que la merma (${N(merma*100)} %)</span>`:'<span class="chip verde">Dentro de la merma</span>'}</td></tr>`; }).join('');
  return `${cab('Eficiencia del Taller','¿Conviene fabricar acá o mandarlo a maquilar? El Taller se mide por lo gastado contra lo que absorbió en prendas (D-31), y contra una cotización real de maquila externa.','')}
    <div class="kpis">${kpi(0,ef.ef>=.7?'verde':'ambar','Eficiencia de septiembre','k1',Math.round(ef.ef*100),'','(ya es prenda + en proceso) ÷ gastado',ef.ef>=.7?'verde':'ambar',src('nuevo','falta gastos'),0,' %')}
      ${kpi(1,'verde','Ya es prenda','k2',ef.absorbido,'S/ ','órdenes cerradas este mes','',src('deriva'))}${kpi(2,'ambar','No absorbido','k3',ef.fijos,'S/ ','sueldos fijos y servicios del Taller','ambar',src('nuevo','gasto Taller'))}</div>
    <div class="dos" style="margin-top:8px"><div><h2 class="s e">¿A dónde fue lo gastado en septiembre? <small>lo que no llega a ser prenda es la capacidad que sobra ${src('nuevo')}</small></h2>
      <div class="card pad e"><div class="cascada">${cas.map(([t,v,cl])=>`<div class="c"><em class="tab">${S0(v)}</em><i class="${cl}" data-bar="ca-${t}" data-eje="y" data-val="1" style="height:${Math.max(4,v/mx*120)}px"></i><span>${t}</span></div>`).join('')}</div></div></div>
      <div><h2 class="s e">Costo por prenda, mes a mes <small>${src('deriva')}</small></h2><div class="card pad e">${lin}</div></div></div>
    <h2 class="s e">¿Fabricar o maquilar? <small>costo interno contra tela y avíos propios + la cotización externa de la confección ${src('nuevo','cotización')}</small></h2>
    <div class="card e"><table class="tb"><thead><tr><th>Modelo</th><th class="r">Interno</th><th class="r">Externo</th><th class="r">Diferencia</th><th>Veredicto</th></tr></thead><tbody>${filas}</tbody></table></div>
    <h2 class="s e">Rendimiento de tela <small>metros por prenda: estándar contra lo que realmente se gasta ${src('deriva')}</small></h2>
    <div class="card e"><table class="tb"><thead><tr><th>Modelo</th><th class="r">Estándar</th><th class="r">Real</th><th class="r">Desvío</th><th class="r">Segundas</th><th>Lectura</th></tr></thead><tbody>${rend}</tbody></table></div>`;
}
