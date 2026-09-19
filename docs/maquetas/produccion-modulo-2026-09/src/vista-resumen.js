/* ====================================================================
   RESUMEN — «¿Qué necesita mi decisión hoy?»
   Cada tarjeta nace de datos que ya existen o se derivan; ninguna es
   un texto fijo. Al recibir tela, pagar o cerrar una orden, cambian.
   ==================================================================== */
function decisiones(){
  const out = [];
  const nom = nombreOrden;
  // 1 · órdenes vencidas o que llegarán tarde
  D.ordenes.forEach(o=>{ const r=riesgo(o); if(r.rest===0) return;
    if(r.vencida) out.push({sev:3, ico:'alerta', t:`«${nom(o)}» debía entregarse hace ${-r.d} día${-r.d>1?'s':''} y aún no se corta`,
      p:`Faltan ~${r.rest} días de trabajo. Cada día de atraso son ${N(ventasSem(modelo(o.modelo))/7,1)} ventas perdidas de ${modelo(o.modelo).n} en tienda.`,
      ops:[{t:'Ver la orden',a:`data-orden="${o.id}"`,pri:1}]});
    else if(r.tarde>0) out.push({sev:2, ico:'reloj', t:`«${nom(o)}» llegará ~${r.tarde} días tarde a su entrega (${fechaCorta(o.entrega)})`,
      p:`Faltan ~${r.rest} días de trabajo y hay ${r.d}.${Object.values(o.etapas).includes('terc')?' La confección está con maquila externa (Confecciones Rosales, puntualidad 74 %).':''}`,
      ops:[{t:'Ver la orden',a:`data-orden="${o.id}"`,pri:1}]});
  });
  // 2 · tela que las órdenes sin cortar necesitan
  const dem = demandaTela();
  Object.entries(dem).forEach(([tid,need])=>{ const i=insumo(tid), s=saldo(i), cam=enCamino(tid);
    if(need<=s) return;
    const falta = need-s;
    const cf = D.comps.find(c=>!c.recibido && c.lineas.some(l=>l.ins===tid));
    if(cam>=falta && cf) out.push({sev:3, ico:'caja', t:`Faltan ${N(falta)} m de ${i.nombre} para cortar lo pendiente — pero ya llegó ${cf.doc}`,
      p:`Las órdenes por cortar piden ${N(need)} m (con merma) y hay ${N(s)} m. ${cf.prov} entregó ${N(cam)} m que aún no se reciben: recibirlos destraba el corte.`,
      ops:[{t:'Recibir '+cf.doc,a:'data-v-ir="recibir"',pri:1}]});
    else out.push({sev:3, ico:'caja', t:`Faltan ${N(falta)} m de ${i.nombre} para cortar lo pendiente`,
      p:`Las órdenes por cortar piden ${N(need)} m (con merma) y hay ${N(s)} m${cam?` más ${N(cam)} m en camino`:''}.`,
      ops:[{t:'Pedir '+i.nombre.toLowerCase(),a:`data-pedir="${tid}"`,pri:1}]});
  });
  // 3 · plata que vence
  const venc = D.comps.filter(c=>saldoComp(c)>0 && c.vence && dias(c.vence)<0);
  const prox = D.comps.filter(c=>saldoComp(c)>0 && c.vence && dias(c.vence)>=0 && dias(c.vence)<=7);
  if(venc.length||prox.length){ const tv=sum(venc.map(saldoComp)), tp=sum(prox.map(saldoComp));
    out.push({sev: venc.length?3:2, ico:'plata', t:`${venc.length?`${S(tv)} vencidos`:''}${venc.length&&prox.length?' y ':''}${prox.length?`${S(tp)} por vencer en 7 días`:''}`,
      p: venc.length? `${venc.map(c=>c.prov+' '+c.doc).join(', ')}. Pagar tarde a un proveedor de tela pone en riesgo el crédito del que depende el Taller.` : `Vence: ${prox.map(c=>c.prov+' '+fechaCorta(c.vence)).join(', ')}.`,
      ops:[{t:'Ir a Por pagar',a:'data-v-ir="porpagar"',pri:1}]}); }
  // 4 · qué producir
  MODELOS.forEach(m=>{ const e=estadoModelo(m);
    if(e.t==='Producir ya'){ const w=TALLAS.filter(t=>m.st[t]/(m.v60[t]/8.57)<SEM_LEAD).join(', ');
      out.push({sev:3, ico:'tendencia', t:`«${m.n}» se agota en ~${N(e.c1,1)} semanas y no hay orden abierta`,
        p:`Vendes ${N(ventasSem(m),1)}/semana y quedan ${stockTot(m)}. Tallas más apretadas: ${w}. Una corrida tarda ~${SEM_LEAD} semanas.`,
        ops:[{t:'Abrir orden sugerida',a:`data-nueva="${m.id}"`,pri:1}]}); }
    if(e.t==='Sobrestock') out.push({sev:1, ico:'pausa', t:`«${m.n}» tiene ${N(e.c1,0)} semanas de stock: no produzcas más`,
      p:`Vendes ${N(ventasSem(m),1)}/semana y hay ${stockTot(m)} en tiendas y almacén. Es capital parado: ${S0(stockTot(m)*costoModelo(m))} a costo.`,
      ops:[{t:'Ver qué producir',a:'data-scroll="produce"'}]});
  });
  // 5 · avíos bajo mínimo sin pedido en camino
  const bajos = D.insumos.filter(i=>estadoIns(i).c!=='verde' && !enCamino(i.id) && !(i.tipo==='tela' && dem[i.id]>saldo(i)));
  if(bajos.length) out.push({sev:2, ico:'caja', t:`${bajos.map(i=>i.nombre).join(' y ')} ${bajos.length>1?'están':'está'} bajo el mínimo`,
    p:bajos.map(i=>`${i.nombre}: ${N(saldo(i),i.u==='m'?1:0)} ${i.u} (mínimo ${i.min}, alcanza ~${N(saldo(i)/Math.max(.1,consumoSem(i)),1)} semanas)`).join(' · '),
    ops:[{t:'Pedir '+bajos[0].nombre.toLowerCase(),a:`data-pedir="${bajos[0].id}"`,pri:1}]});
  // 6 · producir o maquilar
  const cm = MODELOS.map(m=>({m,c:comparaMaquila(m)})).filter(x=>x.c.v.c==='ambar').sort((a,b)=>b.c.d-a.c.d)[0];
  if(cm) out.push({sev:1, ico:'balanza', t:`Para «${cm.m.n}», maquilar afuera costaría ${N(cm.c.d*100,0)} % menos que fabricarlo`,
    p:`Interno ${S(cm.c.interno)} contra ${S(cm.c.externo)} con la cotización externa. Es la mitad del criterio D-31 para medir al Taller.`,
    ops:[{t:'Ver eficiencia',a:'data-v-ir="eficiencia"',pri:1}]});
  return out.sort((a,b)=>b.sev-a.sev).slice(0,7);
}
const costoModelo = m => m.rend*precioRef(m.tela) + m.maq + sum(Object.entries(m.avios).map(([k,q])=>q*precioRef(k)));
const ICONOS = {alerta:'M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z', reloj:'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  caja:'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8', plata:'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', tendencia:'M3 17l6-6 4 4 8-8M15 7h6v6',
  pausa:'M10 5v14M14 5v14', balanza:'M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 006 0L6 7zM18 7l-3 7a3 3 0 006 0l-3-7z'};
const icoDec = k => `<svg class="ic" viewBox="0 0 24 24" style="width:17px;height:17px"><path d="${ICONOS[k]}"/></svg>`;

function vResumen(){
  const decs = decisiones();
  const capIns = sum(D.insumos.map(i=>sum(i.lotes.map(l=>saldoLote(i,l)*l.costo))));
  const enProc = sum(D.ordenes.map(o=>{const c=costos(o); return c.tela+c.avio;}));
  const porPagar = sum(D.comps.map(c=>Math.max(0,saldoComp(c))));
  const venc = sum(D.comps.filter(c=>saldoComp(c)>0&&c.vence&&dias(c.vence)<0).map(saldoComp));
  const ef = eficienciaMes(), rie = D.ordenes.filter(o=>riesgo(o).tarde>0).length;
  const kp = [
    kpi(0,'verde','Capital en insumos','r1',capIns,'S/ ',`${D.insumos.filter(i=>estadoIns(i).c!=='verde').length} insumos bajo el mínimo`, 'ambar', src('deriva'),0),
    kpi(1,'verde','Valor en proceso','r2',enProc,'S/ ',`tela y avíos ya descontados en ${D.ordenes.length} órdenes`,'',src('deriva'),0),
    kpi(2,venc?'rojo':'ambar','Por pagar a proveedores','r3',porPagar,'S/ ',venc?`${S0(venc)} ya vencidos`:'nada vencido', venc?'rojo':'verde',src('hoy'),0),
    kpi(3,ef.ef>=.7?'verde':'ambar','Eficiencia del Taller','r4',Math.round(ef.ef*100),'','gastado que ya es prenda o va a serlo',ef.ef>=.7?'verde':'ambar',src('nuevo','falta gastos'),0,'%'),
    kpi(4,rie?'ambar':'verde','Entregas en riesgo','r5',rie,'',rie?'órdenes que llegarían tarde':'todas a tiempo',rie?'ambar':'verde',src('deriva'),0),
  ].join('');
  const dcs = decs.length ? decs.map((d,i)=>`<div class="card dec e" style="--i:${i+3}"><span class="sev s${d.sev}">${icoDec(d.ico)}</span>
      <div><h3>${d.t}</h3><p>${d.p}</p></div><div class="ops">${d.ops.map(o=>`<button class="btn ${o.pri?'pri':'dis'} s" ${o.a} type="button">${o.pri?'<span class="brillo"></span>':''}${o.t}</button>`).join('')}</div></div>`).join('')
    : `<div class="card pad e"><b>Todo en orden.</b> <span class="muted">Nada pide tu decisión ahora.</span></div>`;
  // ¿qué producir?
  const ms = MODELOS.map(m=>({m,e:estadoModelo(m)})).sort((a,b)=>a.e.o-b.e.o||a.e.c1-b.e.c1);
  const maxSem = 20;
  const filas = ms.map(({m,e},i)=>{ const vs=ventasSem(m), st=stockTot(m)/vs, pr=enProd(m)/vs;
    return `<tr class="click" data-nueva="${m.id}"><td class="nm"><b>${m.n}</b><span>${m.cat} · ${S0(m.precio)}</span></td>
      <td class="r">${stockTot(m)}</td><td class="r">${N(vs,1)}</td>
      <td style="min-width:200px"><div class="barra"><div class="fill" data-bar="pd-${m.id}" data-val="1"><i class="c-tela" style="width:${Math.min(100,st/maxSem*100)}%"></i><i class="c-prod" style="width:${Math.min(100-Math.min(100,st/maxSem*100),pr/maxSem*100)}%"></i></div>
        <div class="mk" style="left:${SEM_LEAD/maxSem*100}%" title="Lo que tarda una corrida"></div></div>
        <div class="muted" style="font-size:11.5px;margin-top:5px">${N(st,1)} sem. en stock${enProd(m)?` + ${N(pr,1)} en producción`:''}</div></td>
      <td class="r">${enProd(m)||'—'}</td><td><span class="chip ${e.c}">${e.t}</span></td></tr>`; }).join('');
  // cobertura de insumos
  const dm = demandaTela();
  const cob = D.insumos.filter(i=>i.tipo==='tela').map(i=>{ const s=saldo(i), cam=enCamino(i.id), d=dm[i.id]||0, mx=Math.max(s+cam,d,1)*1.15;
    const ok = s>=d ? 'c-ok' : (s+cam>=d ? 'c-al':'c-no');
    return `<tr><td class="nm"><b>${i.nombre}</b><span>${N(s,1)} m hay · ${cam?N(cam)+' m en camino':'nada en camino'}</span></td>
      <td style="min-width:180px"><div class="barra"><div class="fill" data-bar="cb-${i.id}" data-val="1"><i class="${ok}" style="width:${s/mx*100}%"></i><i class="c-prod" style="width:${cam/mx*100}%"></i></div><div class="mk" style="left:${d/mx*100}%" title="Lo que piden las órdenes por cortar"></div></div></td>
      <td class="r">${d?N(d)+' m':'—'}</td><td>${d===0?'<span class="chip neutro">Sin demanda</span>':s>=d?'<span class="chip verde">Alcanza</span>':s+cam>=d?'<span class="chip ambar">Alcanza si llega</span>':'<span class="chip rojo">Falta '+N(d-s-cam)+' m</span>'}</td></tr>`; }).join('');
  return `${cab('¿Qué necesita mi decisión hoy?','Lo que pide acción en el Taller, ordenado por urgencia. Cada tarjeta sale de los datos de abajo y desaparece cuando lo resuelves.',
      `<button class="btn dis" data-v-ir="ordenes" type="button">Ver órdenes</button>${btnPri('data-nueva="auto"',ic('plus')+'Nueva orden')}`)}
    <div class="kpis">${kp}</div>
    <h2 class="s e">Para decidir <small>${decs.length} ${decs.length===1?'asunto':'asuntos'}</small></h2>${dcs}
    <h2 class="s e" id="produce">¿Qué producir? <small>semanas de ventas que cubre el stock · la línea marca lo que tarda una corrida (${SEM_LEAD} sem.) ${src('deriva','ventas + stock')}</small></h2>
    <div class="card e"><table class="tb"><thead><tr><th>Modelo</th><th class="r">Stock</th><th class="r">Ventas/sem</th><th>Cobertura</th><th class="r">En prod.</th><th>Sugerencia</th></tr></thead><tbody>${filas}</tbody></table></div>
    <h2 class="s e">¿Alcanza la tela? <small>lo que hay y lo que viene, contra lo que piden las órdenes por cortar (con merma) ${src('deriva')}</small></h2>
    <div class="card e"><table class="tb"><thead><tr><th>Tela</th><th>Hay + en camino</th><th class="r">Piden</th><th>Estado</th></tr></thead><tbody>${cob}</tbody></table></div>`;
}
