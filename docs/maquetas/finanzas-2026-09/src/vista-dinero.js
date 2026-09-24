// ============ Cuentas y dinero (piezas 2, 5 y 6) ============
VISTAS.dinero = () => {
  const tabs = [['cuentas','Cuentas'],['efectivo','Efectivo por tienda'],['porpagar','Por pagar', POR_PAGAR.filter(p=>saldoPorPagar(p)>0&&enVista(p.u)).length]];
  if (esLider()) tabs.push(['conciliacion','Conciliación', EXTRACTO_IBK.length - Object.keys(E.parejas).length || '']);
  const tab = tabActual('dinero','cuentas');
  const cuerpo = {cuentas:vistaCuentas, efectivo:vistaEfectivo, porpagar:vistaPorPagar, conciliacion:vistaConciliacion}[tab]();
  return `${cabecera({sobre:'Finanzas · Cuentas y dinero', titulo:'¿Dónde está la plata?',
    bajada:'Cada lugar donde CAYLA tiene dinero: bancos, tarjeta por abonar y cajones. Un saldo nunca se escribe a mano: se suma de los movimientos.',
    acciones:`${tab==='conciliacion'?filtroVer('empresa'):filtroVer()}<button class="btn btn-primario" data-accion="nuevo-mov">+ Registrar movimiento</button>`})}
    ${pestanas('dinero', tabs)}${cuerpo}`;
};

function vistaCuentas(){
  const visibles = CUENTAS.filter(c => esLider() ? (c.tipo !== 'cajon' || enVista(c.unidad)) : c.unidad === unidadPropia());
  const grupos = [['banco','Bancos','104'],['transito','Por abonar','105'],['cajon','Cajones y fondo fijo','101'],['caja_fuerte','Cajas fuertes y efectivo por rendir','101'],['credito','Tarjetas de crédito de CAYLA · lo que se debe','pasivo']];
  const movs = MOV_DINERO.filter(m => esLider() ? (verTodas() || m.u === E.ver) : m.u === unidadPropia());
  const debe = PRESTAMOS_DUENO.reduce((a,p)=>a+p.monto-p.devuelto,0);
  return `
  ${!verTodas()&&esLider()?`<div class="nota-cayla">Los bancos son de CAYLA entera: se ven igual en cualquier tienda. El cajón es el de ${nombreUnidad(E.ver)}.</div>`:''}
  ${grupos.map(([t,n,cta]) => { const cs = visibles.filter(c=>c.tipo===t || (t==='caja_fuerte' && c.tipo==='rendir')); if (!cs.length) return '';
    return `<section class="anim-sube"><p class="etq" style="margin:4px 0 10px">${n} · cuenta ${cta} ${t==='banco'?F('nuevo','cuentas_dinero'):t==='cajon'?F('existe','cajas + caja_movimientos'):F('deriva','venta_pagos con tarjeta − abonos')}</p>
      <div class="cuentas">${cs.map(c=>`<article class="cuenta-c">
        <div class="fila-top"><b>${c.n}</b>${c.tipo==='banco'?`<span class="badge" data-tono="${dias(HOY,c.conciliado)>7&&!E.conciliado[c.id]?'ambar':'verde'}">${E.conciliado[c.id]?'conciliada hoy':'conciliada '+fecha(c.conciliado)}</span>`:c.tipo==='transito'?'<span class="badge" data-tono="pizarra">5 días sin abonar</span>':''}</div>
        <div class="valor" style="${c.saldo<0?'color:var(--rojo-profundo)':''}">${S(c.saldo)}</div>
        <p>${c.recibe || (c.tipo==='caja_fuerte'?'Lo que los cierres guardan en la tienda':c.unidad==='TAL'?'Para gastos chicos del Taller':'Caja abierta hoy')}</p>
      </article>`).join('')}</div></section>`; }).join('')}
  ${esLider() && verTodas() ? `<section class="superficie pad anim-sube dueno">
    <div class="prioridades-cab"><div><h2>Plata del dueño</h2><p>Cuando pones plata en un mal momento, eliges si es un <b>aporte</b> (se queda en CAYLA) o un <b>préstamo</b> (CAYLA te lo devuelve).</p></div>
      <div style="display:flex;gap:8px"><button class="btn btn-secundario btn-sm" data-accion="nuevo-mov" data-id="Poner plata del dueño">Poner plata</button><button class="btn btn-sutil btn-sm" data-accion="nuevo-mov" data-id="Sacar plata del dueño">Sacar plata</button></div></div>
    <div class="dueno-cifras"><div><span class="etq">CAYLA te debe</span><div class="valor serif">${S(debe)}</div></div>
      <ul class="lista-mov" style="margin:0;flex:1">${PRESTAMOS_DUENO.map(p=>`<li>${fecha(p.f)} · préstamo · ${esc(p.nota)}<span>${S(p.monto)} · devuelto ${S(p.devuelto)}</span></li>`).join('')}</ul></div>
    ${F('nuevo','movimientos_dinero (aporte · préstamo · retiro · devolución)')}
  </section>` : ''}
  ${esLider() && verTodas() ? `<section class="superficie anim-sube"><div class="herramientas" style="justify-content:space-between"><div><b>A qué cuenta entra cada cobro</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Por eso Vender no cambia: el cobro guarda el medio y Finanzas sabe a qué cuenta llegó.</p></div><button class="btn btn-sutil btn-sm" data-ir="config:cuentas">Cambiar en Configuración</button></div>
    <div class="tabla-wrap"><table class="t medios"><thead><tr><th>Tienda</th><th>Efectivo</th><th>Yape</th><th>Plin</th><th>Tarjeta</th><th>Transferencia</th></tr></thead>
    <tbody>${MEDIOS.map(m=>`<tr><td data-l="Tienda"><b>${nombreUnidad(m.u)}</b></td>${['efectivo','yape','plin','tarjeta','transferencia'].map(k=>`<td data-l="${k}"><span class="metodo" data-m="${k}"></span>${cuenta(m[k]).n.replace(' · Cta. corriente','').replace('Cajón · ','Cajón ')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : ''}
  <section class="superficie anim-sube">
    <div class="herramientas"><b>Movimientos entre cuentas</b><span class="sub" style="font-size:12.5px">Depósitos, abonos de tarjeta, transferencias y retiros. No son ventas ni gastos: la plata cambia de lugar.</span></div>
    <div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Qué</th><th>De</th><th>A</th><th class="num">Monto</th><th>Responsable</th></tr></thead>
    <tbody>${movs.map(m=>`<tr class="${m.nuevo?'fila-nueva':''}"><td data-l="Fecha">${fecha(m.f)}</td><td class="c-prenda" data-l="Qué"><b>${m.tipo}</b><span class="sub" style="display:block;font-size:12px">${esc(m.ref)}${m.comision?` · comisión ${S(m.comision,1)} → gasto 639`:''}</span></td>
      <td data-l="De">${m.de==='dueno'?'<span class="sub">El dueño</span>':cuenta(m.de).n.replace(' · Cta. corriente','')}</td><td data-l="A">${m.a?cuenta(m.a).n.replace(' · Cta. corriente',''):'<span class="sub">Sale del negocio</span>'}</td>
      <td class="num" data-l="Monto">${S(m.monto)}</td><td data-l="Responsable">${m.por}</td></tr>`).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>Solo se agregan filas; un error se anula con motivo.</span>${F('nuevo','movimientos_dinero')}</div>
  </section>`;
}

function vistaEfectivo(){
  const filas = EFECTIVO.filter(f=>enVista(f.u));
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
  const lista = POR_PAGAR.filter(p=>saldoPorPagar(p)>0 && enVista(p.u)).sort((a,b)=>a.vence.localeCompare(b.vence));
  const tramo = p => { const d = dias(p.vence, HOY); return d < 0 ? 'Vencidas' : d <= 7 ? 'Esta semana' : d <= 14 ? 'La próxima semana' : 'Más adelante'; };
  const tramos = ['Vencidas','Esta semana','La próxima semana','Más adelante'];
  const suma = t => lista.filter(p=>tramo(p)===t).reduce((a,p)=>a+saldoPorPagar(p),0);
  const sel = [...E.seleccion].map(id=>POR_PAGAR.find(p=>p.id===id)).filter(Boolean);
  return `
  <section class="cifras">${tramos.map(t=>`<div class="tile anim-sube"><span class="etq">${t}</span><div class="valor ${t==='Vencidas'&&suma(t)?'rojo':''}">${S(suma(t))}</div><div class="det">${lista.filter(p=>tramo(p)===t).length} facturas</div></div>`).join('')}</section>
  <div class="superficie anim-sube">
    <div class="herramientas" style="justify-content:space-between">
      <div><b>${verTodas()?'Todo lo que CAYLA debe':'Lo que debe '+nombreUnidad(E.ver)}</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Mercadería, gastos, activos e insumos del Taller en una sola lista.</p></div>
      <div style="display:flex;gap:8px;align-items:center">${F('existe','compras_resumen')} ${F('existe','comprobantes_produccion')} ${F('nuevo','vista consolidada')}
        <button class="btn btn-primario btn-sm" data-accion="pagar" ${sel.length?'':'disabled'}>Pagar ${sel.length?sel.length+' · '+S(sel.reduce((a,p)=>a+saldoPorPagar(p),0)):'seleccionadas'}</button></div>
    </div>
    <div class="tabla-wrap"><table class="t"><thead><tr><th style="width:36px"></th><th>Vence</th><th>Proveedor · factura</th><th>Tipo</th>${verTodas()?'<th>Unidad</th>':''}<th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th></tr></thead>
    <tbody>${lista.map(p=>{ const d = dias(p.vence, HOY); return `<tr class="${p.nuevo?'fila-nueva':''}">
      <td data-l=""><input type="checkbox" data-sel="${p.id}" ${E.seleccion.has(p.id)?'checked':''} aria-label="Elegir ${esc(p.prov)}"></td>
      <td data-l="Vence">${fecha(p.vence)}<span class="sub" style="display:block;font-size:12px;${d<0?'color:var(--rojo-profundo)':''}">${d<0?`vencida hace ${-d} días`:d===0?'vence hoy':`en ${d} días`}</span></td>
      <td class="c-prenda" data-l="Proveedor"><b>${esc(p.prov)}</b><span class="sub" style="display:block;font-size:12px">${p.num}</span></td>
      <td data-l="Tipo"><span class="badge sin-punto" data-tono="${{mercaderia:'taupe',gasto:'pizarra',activo:'pizarra',insumo:'taupe'}[p.nat]}">${NATURALEZA[p.nat]}</span></td>
      ${verTodas()?`<td data-l="Unidad">${nombreUnidad(p.u)}</td>`:''}
      <td class="num" data-l="Total">${S(p.total)}</td><td class="num" data-l="Pagado">${S(p.pagado)}</td><td class="num" data-l="Saldo"><b>${S(saldoPorPagar(p))}</b></td></tr>`; }).join('')}</tbody></table></div>
  </div>
  <div class="nota-cayla">La planilla del 30 (${S(29800)}) no está en esta lista porque la paga Dynamic, pero sí cuenta en el <button class="btn-enlace" data-ir="reportes:flujo">flujo de caja</button>. Pagar desde aquí usa la misma función que Compras: el pago queda en la factura y en la cuenta de la que salió.</div>`;
}

function vistaConciliacion(){
  const hechas = Object.keys(E.parejas).length, total = EXTRACTO_IBK.length;
  const bcp = cuenta('bcp');
  return `<div class="superficie anim-sube">
    <div class="herramientas" style="justify-content:space-between">
      <div><b>Interbank · extracto del 1 al 23 de septiembre</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Subiste el extracto del banco. Para cada línea, el sistema busca su pareja en lo registrado: tú solo confirmas.</p></div>
      <div style="display:flex;gap:8px;align-items:center"><span class="badge" data-tono="${hechas===total?'verde':'pizarra'}">${hechas} de ${total} confirmadas</span>
        ${hechas<total?`<button class="btn btn-primario btn-sm" data-accion="parejas-todas">Confirmar las ${EXTRACTO_IBK.filter(x=>x.pareja&&!E.parejas[x.id]).length} propuestas</button>`:''}</div>
    </div>
    <div class="tabla-wrap"><table class="t conc"><thead><tr><th>Fecha</th><th>Lo que dice el banco</th><th class="num">Monto</th><th>Pareja en el sistema</th><th></th></tr></thead>
    <tbody>${EXTRACTO_IBK.map(x=>{ const est = E.parejas[x.id]; return `<tr class="${est?'hecha':''}">
      <td data-l="Fecha">${fecha(x.f)}</td><td class="c-prenda" data-l="Banco"><b class="mono">${esc(x.d)}</b></td>
      <td class="num" data-l="Monto" style="${x.monto<0?'color:var(--rojo-profundo)':''}">${x.monto<0?'−':'+'}${S(Math.abs(x.monto),1).replace('S/ ','S/ ')}</td>
      <td data-l="Pareja">${x.pareja ? `<span class="pareja">${esc(x.pareja)}</span>` : `<span class="sin-pareja">Sin pareja. Sugerencia: ${esc(x.sugerir)}</span>`}</td>
      <td class="c-acc"><div class="acc">${est ? '<span class="badge" data-tono="verde">confirmada</span>' : x.pareja ? `<button class="btn btn-secundario btn-sm" data-accion="pareja" data-id="${x.id}">Confirmar</button>` : `<button class="btn btn-secundario btn-sm" data-accion="pareja-gasto" data-id="${x.id}">Registrar gasto</button>`}</div></td></tr>`; }).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>${hechas===total ? `<b style="color:var(--verde)">Interbank coincide con el banco.</b>` : 'Cuando todas estén confirmadas, el saldo del sistema y el del banco coinciden.'}</span>${F('nuevo','conciliaciones + parejas propuestas por monto, fecha y referencia')}</div>
  </div>
  <div class="superficie pad anim-sube"><div class="fila-top" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div><b>BCP · Cta. corriente</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Conciliada el ${fecha(bcp.conciliado)}. El sistema dice ${S(bcp.saldo)}.</p></div>
    <button class="btn btn-secundario btn-sm" data-accion="exportar">Subir extracto (Excel o CSV)</button></div></div>
  <div class="nota-cayla">Si el banco no deja descargar el extracto, se escribe el saldo que muestra la banca por internet y el sistema dice si coincide. Lo ideal es hacerlo <b>cada viernes</b>.</div>`;
}

function modalMovimiento(a){
  const lider = esLider();
  const tipos = lider ? ['Depósito del cajón','Abono de tarjeta','Entre cuentas','Poner plata del dueño','Sacar plata del dueño'] : ['Depósito del cajón'];
  const inicial = a && a.dataset && a.dataset.id ? a.dataset.id : tipos[0];
  const debe = PRESTAMOS_DUENO.reduce((x,p)=>x+p.monto-p.devuelto,0);
  const origenes = CUENTAS.filter(c=>lider || c.unidad===unidadPropia());
  ventana(`<h3>Registrar movimiento</h3><p class="bajada">La plata cambia de lugar: no es venta ni gasto. ${lider?'':'Tu rol solo registra depósitos de tu cajón.'}</p>
    <div class="campo"><label for="mT">Qué pasó</label><select class="control" id="mT" style="width:100%">${tipos.map(t=>`<option${t===inicial?' selected':''}>${t}</option>`).join('')}</select></div>
    <div class="campo" id="bDueno" hidden><label>¿Cómo entra esta plata?</label>
      <div class="opciones"><label><input type="radio" name="dn" value="aporte" checked><b>Aporte</b><span>Se queda en CAYLA para siempre. Sube lo que es tuyo en el Balance.</span></label>
      <label><input type="radio" name="dn" value="prestamo"><b>Préstamo</b><span>CAYLA te lo devuelve después. Aparece como deuda de CAYLA contigo.</span></label></div></div>
    <div class="campo" id="bSaca" hidden><label>¿Qué es esta salida?</label>
      <div class="opciones"><label><input type="radio" name="sc" value="devolucion" ${debe?'checked':'disabled'}><b>Devolución de préstamo</b><span>CAYLA te debe ${S(debe)}. Baja esa deuda.</span></label>
      <label><input type="radio" name="sc" value="retiro" ${debe?'':'checked'}><b>Retiro de utilidades</b><span>Te llevas ganancia del negocio. No es un gasto: no baja la utilidad.</span></label></div></div>
    <div class="dos-campos"><div class="campo" id="bDe"><label for="mDe">De</label><select class="control" id="mDe" style="width:100%">${origenes.map(c=>`<option value="${c.id}">${c.n}</option>`).join('')}</select></div>
      <div class="campo" id="bA"><label for="mA">A</label><select class="control" id="mA" style="width:100%">${CUENTAS.filter(c=>c.tipo==='banco').map(c=>`<option value="${c.id}">${c.n}</option>`).join('')}</select></div></div>
    <div class="dos-campos"><div class="campo"><label for="mM">Monto</label><input class="control" id="mM" value="1500"></div><div class="campo"><label for="mR">Voucher o nota</label><input class="control" id="mR" value="Voucher 120441"></div></div>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okM">Registrar</button></div>`, {ancho:580});
  const v = $('#velo');
  const sync = () => { const t = v.querySelector('#mT').value;
    v.querySelector('#bDueno').hidden = t !== 'Poner plata del dueño'; v.querySelector('#bSaca').hidden = t !== 'Sacar plata del dueño';
    v.querySelector('#bDe').hidden = t === 'Poner plata del dueño'; v.querySelector('#bA').hidden = t === 'Sacar plata del dueño'; };
  v.addEventListener('change', sync); sync();
  $('#okM').onclick = () => {
    const t = $('#mT').value, monto = +$('#mM').value || 0;
    const clase = t==='Poner plata del dueño' ? v.querySelector('[name=dn]:checked').value : t==='Sacar plata del dueño' ? v.querySelector('[name=sc]:checked').value : null;
    const nombre = {aporte:'Aporte del dueño', prestamo:'Préstamo del dueño', devolucion:'Devolución de préstamo al dueño', retiro:'Retiro de utilidades'}[clase] || t;
    const de = t==='Poner plata del dueño' ? null : $('#mDe').value, aCta = t==='Sacar plata del dueño' ? null : $('#mA').value;
    guardar(`${nombre} registrado.`, () => {
      MOV_DINERO.forEach(x=>x.nuevo=false);
      MOV_DINERO.unshift({f:HOY, tipo:nombre, de: de || 'dueno', a:aCta, monto, ref:$('#mR').value, u: de ? (cuenta(de).unidad||null) : null, por:$('#fResp').value, nuevo:true});
      if (de) cuenta(de).saldo -= monto; if (aCta) cuenta(aCta).saldo += monto;
      if (clase==='prestamo') PRESTAMOS_DUENO.unshift({f:HOY, monto, nota:$('#mR').value, devuelto:0});
      if (clase==='devolucion'){ let r = monto; for (const p of PRESTAMOS_DUENO){ const d = Math.min(r, p.monto-p.devuelto); p.devuelto += d; r -= d; } }
    });
  };
}

function modalPagar(){
  const sel = [...E.seleccion].map(id=>POR_PAGAR.find(p=>p.id===id));
  const tot = sel.reduce((a,p)=>a+saldoPorPagar(p),0);
  ventana(`<h3>Pagar ${sel.length} factura${sel.length>1?'s':''}</h3><p class="bajada">Total ${S(tot)}. Cada pago queda en su factura y descuenta la cuenta de la que sale.</p>
    <ul class="lista-mov">${sel.map(p=>`<li>${esc(p.prov)} · ${p.num}<b>${S(saldoPorPagar(p))}</b></li>`).join('')}</ul>
    <div class="campo"><label for="pC">Sale de</label><select class="control" id="pC" style="width:100%">${[['banco','Bancos'],['caja_fuerte','Cajas fuertes'],['rendir','Efectivo por rendir'],['cajon','Cajones (resta del cierre de esa caja)'],['credito','Tarjeta de crédito']].map(([t,n])=>`<optgroup label="${n}">${CUENTAS.filter(c=>c.tipo===t && (esLider()||c.unidad===unidadPropia())).map(c=>`<option value="${c.id}">${c.n} · ${S(c.saldo)}</option>`).join('')}</optgroup>`).join('')}</select>
      <span class="ayuda">Hoy un pago en efectivo no dice de dónde salió: hay 12 así, por S/ 15,661. Si sale de un cajón, se registra también la salida de esa caja.</span></div>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okP">Registrar pago</button></div>`);
  $('#okP').onclick = () => guardar(`Pago de ${S(tot)} registrado.`, () => { sel.forEach(p=>{ p.pagado = p.total; }); cuenta($('#pC').value).saldo -= tot; E.seleccion.clear(); });
}
