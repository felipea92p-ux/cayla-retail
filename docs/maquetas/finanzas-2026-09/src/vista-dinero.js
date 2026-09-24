// ============ Cuentas y dinero (piezas 2, 5 y 6) ============
VISTAS.dinero = () => {
  const tabs = [['cuentas','Cuentas'],['efectivo','Efectivo por tienda'],['porpagar','Por pagar', POR_PAGAR.filter(p=>saldoPorPagar(p)>0&&veUnidad(p.u)).length]];
  if (esLider()) tabs.push(['conciliacion','Conciliación', E.conciliado.ibk?'':'1']);
  const tab = tabActual('dinero','cuentas');
  const cuerpo = {cuentas:vistaCuentas, efectivo:vistaEfectivo, porpagar:vistaPorPagar, conciliacion:vistaConciliacion}[tab]();
  return `${cabecera({sobre:'Finanzas · Cuentas y dinero', titulo:'¿Dónde está la plata?',
    bajada:'Cada lugar donde CAYLA tiene dinero: bancos, tarjeta por abonar y cajones. Un saldo nunca se escribe a mano: se suma de los movimientos.',
    acciones:`<button class="btn btn-primario" data-accion="nuevo-mov">+ Registrar movimiento</button>`})}
    ${pestanas('dinero', tabs)}${cuerpo}`;
};

function vistaCuentas(){
  const visibles = CUENTAS.filter(c => esLider() || c.unidad === unidadPropia());
  const grupos = [['banco','Bancos','104'],['transito','Por abonar','105'],['cajon','Cajones y fondo fijo','101']];
  const movs = MOV_DINERO.filter(m => esLider() || m.u === unidadPropia());
  return `
  ${grupos.map(([t,n,cta]) => { const cs = visibles.filter(c=>c.tipo===t); if (!cs.length) return '';
    return `<section class="anim-sube"><p class="etq" style="margin:4px 0 10px">${n} · cuenta ${cta} ${t==='banco'?F('nuevo','cuentas_dinero'):t==='cajon'?F('existe','cajas + caja_movimientos'):F('deriva','venta_pagos con tarjeta − abonos')}</p>
      <div class="cuentas">${cs.map(c=>`<article class="cuenta-c">
        <div class="fila-top"><b>${c.n}</b>${c.tipo==='banco'?`<span class="badge" data-tono="${dias(HOY,c.conciliado)>7&&!E.conciliado[c.id]?'ambar':'verde'}">${E.conciliado[c.id]?'conciliada hoy':'conciliada '+fecha(c.conciliado)}</span>`:c.tipo==='transito'?'<span class="badge" data-tono="pizarra">5 días sin abonar</span>':''}</div>
        <div class="valor">${S(c.saldo)}</div>
        <p>${c.recibe || (c.unidad==='TAL'?'Para gastos chicos del Taller':'Caja abierta hoy')}</p>
      </article>`).join('')}</div></section>`; }).join('')}
  ${esLider() ? `<section class="superficie anim-sube"><div class="herramientas" style="justify-content:space-between"><div><b>A qué cuenta entra cada cobro</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Por eso Vender no cambia: el cobro guarda el medio y Finanzas sabe a qué cuenta llegó.</p></div>${F('nuevo','medios_de_cobro')}</div>
    <div class="tabla-wrap"><table class="t medios"><thead><tr><th>Tienda</th><th>Efectivo</th><th>Yape</th><th>Plin</th><th>Tarjeta</th><th>Transferencia</th></tr></thead>
    <tbody>${MEDIOS.map(m=>`<tr><td data-l="Tienda"><b>${nombreUnidad(m.u)}</b></td>${['efectivo','yape','plin','tarjeta','transferencia'].map(k=>`<td data-l="${k}"><span class="metodo" data-m="${k}"></span>${cuenta(m[k]).n.replace(' · Cta. corriente','').replace('Cajón · ','Cajón ')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : ''}
  <section class="superficie anim-sube">
    <div class="herramientas"><b>Movimientos entre cuentas</b><span class="sub" style="font-size:12.5px">Depósitos, abonos de tarjeta, transferencias y retiros. No son ventas ni gastos: la plata cambia de lugar.</span></div>
    <div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Qué</th><th>De</th><th>A</th><th class="num">Monto</th><th>Responsable</th></tr></thead>
    <tbody>${movs.map(m=>`<tr class="${m.nuevo?'fila-nueva':''}"><td data-l="Fecha">${fecha(m.f)}</td><td class="c-prenda" data-l="Qué"><b>${m.tipo}</b><span class="sub" style="display:block;font-size:12px">${esc(m.ref)}${m.comision?` · comisión ${S(m.comision,1)} → gasto 639`:''}</span></td>
      <td data-l="De">${cuenta(m.de).n.replace(' · Cta. corriente','')}</td><td data-l="A">${m.a?cuenta(m.a).n.replace(' · Cta. corriente',''):'<span class="sub">Sale del negocio</span>'}</td>
      <td class="num" data-l="Monto">${S(m.monto)}</td><td data-l="Responsable">${m.por}</td></tr>`).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>Solo se agregan filas; un error se anula con motivo.</span>${F('nuevo','movimientos_dinero')}</div>
  </section>`;
}

function vistaEfectivo(){
  const filas = EFECTIVO.filter(f=>veUnidad(f.u));
  const deberia = f => f.apertura + f.ventas + f.ingresos - f.egresos - f.depositos - f.traslados;
  return `<div class="superficie anim-sube">
    <div class="herramientas" style="justify-content:space-between"><div><b>Hoy, jueves 24</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Lo que debería haber en cada cajón ahora mismo. El conteo lo hace cada tienda al cerrar su caja.</p></div>${F('existe','fn_resumen_caja (ADR-0191)')}</div>
    <div class="tabla-wrap"><table class="t"><thead><tr><th>Tienda</th><th>Caja</th><th class="num">Apertura</th><th class="num">+ Ventas en efectivo</th><th class="num">− Egresos</th><th class="num">− Depósitos</th><th class="num">Debería haber</th></tr></thead>
    <tbody>${filas.map(f=>`<tr><td class="c-prenda" data-l="Tienda"><b>${nombreUnidad(f.u)}</b></td><td data-l="Caja"><span class="badge" data-tono="verde">abierta ${f.abre}</span><span class="sub" style="display:block;font-size:12px">${f.por}</span></td>
      <td class="num" data-l="Apertura">${S(f.apertura)}</td><td class="num" data-l="Ventas">${S(f.ventas)}</td><td class="num" data-l="Egresos">${S(f.egresos)}</td><td class="num" data-l="Depósitos">${S(f.depositos)}</td>
      <td class="num" data-l="Debería haber"><b class="serif" style="font-size:19px">${S(deberia(f))}</b></td></tr>`).join('')}</tbody></table></div>
  </div>
  <section class="superficie anim-sube"><div class="herramientas"><b>Últimos cierres con diferencia</b></div>
    <ul class="lista-mov" style="margin:0;padding:0 14px 6px">
      ${veUnidad('AQP')?`<li>AQP · martes 22 · faltaron S/ 20.00 <span>Explicado: vuelto mal dado. Lo cerró Lucía Mamani.</span></li>`:''}
      ${veUnidad('TRU')?`<li>TRU · sábado 19 · sobraron S/ 5.00 <span>Sin explicar.</span></li>`:''}
    </ul></section>
  <div class="nota-cayla">Esto ya lo calcula Caja, tienda por tienda. Finanzas solo lo junta. Los gastos pagados con plata del cajón bajan este número el mismo día (ADR-0117, camino B).</div>`;
}

function vistaPorPagar(){
  const lista = POR_PAGAR.filter(p=>saldoPorPagar(p)>0 && veUnidad(p.u)).sort((a,b)=>a.vence.localeCompare(b.vence));
  const tramo = p => { const d = dias(p.vence, HOY); return d < 0 ? 'Vencidas' : d <= 7 ? 'Esta semana' : d <= 14 ? 'La próxima semana' : 'Más adelante'; };
  const tramos = ['Vencidas','Esta semana','La próxima semana','Más adelante'];
  const suma = t => lista.filter(p=>tramo(p)===t).reduce((a,p)=>a+saldoPorPagar(p),0);
  const sel = [...E.seleccion].map(id=>POR_PAGAR.find(p=>p.id===id)).filter(Boolean);
  return `
  <section class="cifras">${tramos.map(t=>`<div class="tile anim-sube"><span class="etq">${t}</span><div class="valor ${t==='Vencidas'&&suma(t)?'rojo':''}">${S(suma(t))}</div><div class="det">${lista.filter(p=>tramo(p)===t).length} facturas</div></div>`).join('')}</section>
  <div class="superficie anim-sube">
    <div class="herramientas" style="justify-content:space-between">
      <div><b>Todo lo que CAYLA debe${esLider()?'':' · la parte de TRU'}</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Mercadería, gastos, activos e insumos del Taller en una sola lista.</p></div>
      <div style="display:flex;gap:8px;align-items:center">${F('existe','compras_resumen')} ${F('existe','comprobantes_produccion')} ${F('nuevo','vista consolidada')}
        <button class="btn btn-primario btn-sm" data-accion="pagar" ${sel.length?'':'disabled'}>Pagar ${sel.length?sel.length+' · '+S(sel.reduce((a,p)=>a+saldoPorPagar(p),0)):'seleccionadas'}</button></div>
    </div>
    <div class="tabla-wrap"><table class="t"><thead><tr><th style="width:36px"></th><th>Vence</th><th>Proveedor · factura</th><th>Tipo</th>${esLider()?'<th>Unidad</th>':''}<th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th></tr></thead>
    <tbody>${lista.map(p=>{ const d = dias(p.vence, HOY); return `<tr class="${p.nuevo?'fila-nueva':''}">
      <td data-l=""><input type="checkbox" data-sel="${p.id}" ${E.seleccion.has(p.id)?'checked':''} aria-label="Elegir ${esc(p.prov)}"></td>
      <td data-l="Vence">${fecha(p.vence)}<span class="sub" style="display:block;font-size:12px;${d<0?'color:var(--rojo-profundo)':''}">${d<0?`vencida hace ${-d} días`:d===0?'vence hoy':`en ${d} días`}</span></td>
      <td class="c-prenda" data-l="Proveedor"><b>${esc(p.prov)}</b><span class="sub" style="display:block;font-size:12px">${p.num}</span></td>
      <td data-l="Tipo"><span class="badge sin-punto" data-tono="${{mercaderia:'taupe',gasto:'pizarra',activo:'pizarra',insumo:'taupe'}[p.nat]}">${NATURALEZA[p.nat]}</span></td>
      ${esLider()?`<td data-l="Unidad">${nombreUnidad(p.u)}</td>`:''}
      <td class="num" data-l="Total">${S(p.total)}</td><td class="num" data-l="Pagado">${S(p.pagado)}</td><td class="num" data-l="Saldo"><b>${S(saldoPorPagar(p))}</b></td></tr>`; }).join('')}</tbody></table></div>
  </div>
  <div class="nota-cayla">La planilla del 30 (${S(29800)}) no está en esta lista porque la paga Dynamic, pero sí cuenta en el <button class="btn-enlace" data-ir="reportes:flujo">flujo de caja</button>. Pagar desde aquí usa la misma función que Compras: el pago queda en la factura y en la cuenta de la que salió.</div>`;
}

function vistaConciliacion(){
  const bancos = CUENTAS.filter(c=>c.tipo==='banco');
  return `<div class="superficie pad anim-sube">
    <h2 class="serif" style="font-weight:500;font-size:22px;margin:0 0 4px">Conciliar es comparar con el banco</h2>
    <p class="sub" style="margin:0 0 16px;max-width:64ch">Abre tu banca por internet, escribe el saldo que ves y el sistema te dice si coincide. La regla es <b>cada viernes</b>: así el cierre de mes se vuelve un trámite de minutos.</p>
    <div class="conciliar">${bancos.map(c=>{ const esc_ = E.conciliado[c.id]; const dif = esc_!=null ? esc_ - c.saldo : null; return `<article class="cuenta-c">
      <div class="fila-top"><b>${c.n}</b><span class="badge" data-tono="${esc_!=null?(dif===0?'verde':'ambar'):(dias(HOY,c.conciliado)>7?'ambar':'verde')}">${esc_!=null?(dif===0?'coincide':'diferencia'):'última: '+fecha(c.conciliado)}</span></div>
      <div class="dos-campos" style="margin-top:10px"><div><span class="etq">Según el sistema</span><div class="valor" style="font-size:24px">${S(c.saldo)}</div></div>
      <div><label class="etq" for="b-${c.id}">Según el banco</label><input class="control" id="b-${c.id}" inputmode="decimal" value="${esc_ ?? ''}" placeholder="${c.id==='ibk'?'Ej. 12,880':''}"></div></div>
      ${dif!=null&&dif!==0?`<p class="sub" style="font-size:12.5px;margin:10px 0 0">Diferencia ${S(dif,1)}. Movimientos sin pareja en el sistema: <b>comisión de mantenimiento S/ 25.00</b> (22-sep).</p>`:''}
      <div style="margin-top:12px"><button class="btn btn-secundario btn-sm" data-accion="conciliar" data-id="${c.id}">Comparar</button></div>
    </article>`; }).join('')}</div>
    <p class="sub" style="font-size:12.5px;margin:16px 0 0">Más adelante: subir el extracto del banco (CSV) y que el sistema empareje solo. ${F('nuevo','conciliaciones')}</p>
  </div>`;
}

function modalMovimiento(){
  const lider = esLider();
  const tipos = lider ? ['Depósito del cajón','Abono de tarjeta','Entre cuentas','Retiro del dueño','Aporte del dueño'] : ['Depósito del cajón'];
  const origenes = CUENTAS.filter(c=>lider || c.unidad===unidadPropia());
  ventana(`<h3>Registrar movimiento</h3><p class="bajada">La plata cambia de lugar: no es venta ni gasto. ${lider?'':'Tu rol solo registra depósitos de tu cajón.'}</p>
    <div class="campo"><label for="mT">Qué pasó</label><select class="control" id="mT" style="width:100%">${tipos.map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="dos-campos"><div class="campo"><label for="mDe">De</label><select class="control" id="mDe" style="width:100%">${origenes.map(c=>`<option value="${c.id}">${c.n}</option>`).join('')}</select></div>
      <div class="campo"><label for="mA">A</label><select class="control" id="mA" style="width:100%">${CUENTAS.filter(c=>c.tipo==='banco').map(c=>`<option value="${c.id}">${c.n}</option>`).join('')}</select></div></div>
    <div class="dos-campos"><div class="campo"><label for="mM">Monto</label><input class="control" id="mM" value="1500"></div><div class="campo"><label for="mR">Voucher o referencia</label><input class="control" id="mR" value="Voucher 120441"></div></div>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okM">Registrar</button></div>`, {ancho:560});
  $('#okM').onclick = () => { const m = {f:HOY, tipo:$('#mT').value, de:$('#mDe').value, a:$('#mA').value, monto:+$('#mM').value||0, ref:$('#mR').value, u:cuenta($('#mDe').value).unidad||null, por:$('#fResp').value, nuevo:true};
    guardar('Movimiento registrado.', () => { MOV_DINERO.forEach(x=>x.nuevo=false); MOV_DINERO.unshift(m); cuenta(m.de).saldo -= m.monto; if (m.a) cuenta(m.a).saldo += m.monto; }); };
}

function modalPagar(){
  const sel = [...E.seleccion].map(id=>POR_PAGAR.find(p=>p.id===id));
  const tot = sel.reduce((a,p)=>a+saldoPorPagar(p),0);
  ventana(`<h3>Pagar ${sel.length} factura${sel.length>1?'s':''}</h3><p class="bajada">Total ${S(tot)}. Cada pago queda en su factura y descuenta la cuenta de la que sale.</p>
    <ul class="lista-mov">${sel.map(p=>`<li>${esc(p.prov)} · ${p.num}<b>${S(saldoPorPagar(p))}</b></li>`).join('')}</ul>
    <div class="campo"><label for="pC">Sale de</label><select class="control" id="pC" style="width:100%">${CUENTAS.filter(c=>c.tipo==='banco').map(c=>`<option value="${c.id}">${c.n} · ${S(c.saldo)}</option>`).join('')}</select></div>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okP">Registrar pago</button></div>`);
  $('#okP').onclick = () => guardar(`Pago de ${S(tot)} registrado.`, () => { sel.forEach(p=>{ p.pagado = p.total; }); cuenta($('#pC').value).saldo -= tot; E.seleccion.clear(); });
}
