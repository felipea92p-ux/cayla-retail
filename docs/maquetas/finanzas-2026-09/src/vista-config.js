// ============ Gestión ▸ Configuración (solo el líder) ============
// Un módulo general del ERP: hoy trae Empresa y lo de Finanzas; mañana otras secciones.
VISTAS.config = () => {
  const tab = tabActual('config','cuentas');
  const cuerpo = {empresa:cfgEmpresa, cuentas:cfgCuentas, caja:cfgCaja, fijos:cfgFijos, presupuesto:cfgPresupuesto, impuestos:cfgImpuestos}[tab]();
  return `${cabecera({sobre:'Gestión · Configuración', titulo:'Configuración',
    bajada:'Lo que se ajusta una vez y todas las pantallas leen. Cada cambio queda en la historia con quién lo hizo. Solo el líder entra aquí.'})}
    ${pestanas('config', [['empresa','Empresa'],['cuentas','Cuentas y cobros'],['caja','Caja y avisos'],['fijos','Gastos fijos'],['presupuesto','Presupuesto'],['impuestos','Impuestos']])}
    ${cuerpo}`;
};
const guardado = txt => `<p class="sub" style="font-size:12px;margin:10px 0 0">${txt||'Se guarda solo al cambiar un valor.'}</p>`;

function cfgEmpresa(){
  const e = CONFIG.empresa;
  return `<section class="dos-col par"><div class="superficie pad anim-sube">
    <div class="prioridades-cab"><div><h2>Datos de la empresa</h2><p>Salen en boletas, facturas y reportes para el contador.</p></div>${F('existe','configuracion_empresa')}</div>
    <div class="campo"><label>RUC</label><input class="control" value="${e.ruc}" data-cfg-emp="ruc"></div>
    <div class="campo"><label>Razón social</label><input class="control" value="${esc(e.razon)}" data-cfg-emp="razon"></div>
    <div class="campo"><label>Nombre comercial</label><input class="control" value="${esc(e.comercial)}" data-cfg-emp="comercial"></div>${guardado()}
  </div><div class="superficie pad anim-sube"><div class="prioridades-cab"><div><h2>Datos fiscales por tienda</h2><p>Dirección y serie de cada punto de emisión.</p></div>${F('existe','ubicacion_datos_fiscales')}</div>
    <ul class="lista-mov" style="margin:0">${TIENDAS.map(u=>`<li>${nombreUnidad(u)}<span>Serie B00${TIENDAS.indexOf(u)+1} · F00${TIENDAS.indexOf(u)+1}</span></li>`).join('')}</ul></div></section>`;
}

function cfgCuentas(){
  return `<div class="superficie anim-sube">
    <div class="herramientas" style="justify-content:space-between"><div><b>Cuentas de CAYLA</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Cada lugar donde hay plata. Una cuenta con movimientos no se borra: se archiva.</p></div>
      <button class="btn btn-primario btn-sm" data-accion="cfg-cuenta">+ Agregar cuenta</button></div>
    <div class="tabla-wrap"><table class="t" style="min-width:640px"><thead><tr><th>Cuenta</th><th>Tipo</th><th>Cuenta contable</th><th class="num">Saldo hoy</th><th>Estado</th></tr></thead>
    <tbody>${CUENTAS.map(c=>`<tr class="${c.nuevo?'fila-nueva':''}"><td class="c-prenda" data-l="Cuenta"><b>${esc(c.n)}</b>${c.recibe?`<span class="sub" style="display:block;font-size:12px">${esc(c.recibe)}</span>`:''}</td>
      <td data-l="Tipo">${{banco:'Banco',transito:'Por abonar',cajon:'Cajón o fondo fijo'}[c.tipo]}</td><td data-l="Contable">${c.cta}</td><td class="num" data-l="Saldo">${S(c.saldo)}</td><td data-l="Estado"><span class="badge" data-tono="verde">activa</span></td></tr>`).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>Los cajones se crean con cada tienda; aquí solo se ven.</span>${F('nuevo','cuentas_dinero')}</div>
  </div>
  <div class="superficie anim-sube">
    <div class="herramientas"><b>A qué cuenta entra cada cobro</b><span class="sub" style="font-size:12.5px">Si cambias el Yape de una tienda a otra cuenta, desde hoy Finanzas lo cuenta ahí. Lo pasado no se mueve.</span></div>
    <div class="tabla-wrap"><table class="t medios"><thead><tr><th>Tienda</th><th>Yape</th><th>Plin</th><th>Tarjeta</th><th>Transferencia</th></tr></thead>
    <tbody>${MEDIOS.map(m=>`<tr><td data-l="Tienda"><b>${nombreUnidad(m.u)}</b></td>${['yape','plin','tarjeta','transferencia'].map(k=>`<td data-l="${k}"><select class="control" data-medio="${m.u}|${k}">${CUENTAS.filter(c=>c.tipo!=='cajon').map(c=>`<option value="${c.id}"${m[k]===c.id?' selected':''}>${c.n.replace(' · Cta. corriente','')}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>El efectivo siempre cae al cajón de la tienda.</span>${F('nuevo','medios_de_cobro')}</div>
  </div>`;
}

function cfgCaja(){
  const campo = (k, n, ayuda, pre='', suf='') => `<div class="campo"><label for="cfg-${k}">${n}</label><div class="con-unidad">${pre?`<span>${pre}</span>`:''}<input class="control" id="cfg-${k}" inputmode="numeric" value="${CONFIG[k]}" data-cfg="${k}">${suf?`<span>${suf}</span>`:''}</div><span class="ayuda">${ayuda}</span></div>`;
  return `<section class="dos-col par"><div class="superficie pad anim-sube">
    <div class="prioridades-cab"><div><h2>Caja</h2><p>El piso que no quieres perforar.</p></div></div>
    ${campo('minimoCaja','Mínimo de caja','Si la proyección de alguna semana baja de aquí, el Resumen y el Flujo de caja avisan. Cámbialo y mira el Resumen.','S/')}
    ${guardado()}
  </div><div class="superficie pad anim-sube">
    <div class="prioridades-cab"><div><h2>Avisos</h2><p>Cuándo el sistema te llama la atención.</p></div></div>
    ${campo('avisoGastoPct','Un gasto está «fuera de lo normal» si supera su promedio en','Compara con los últimos 6 meses del mismo proveedor y tienda.','','%')}
    ${campo('avisoVenceDias','Avisar los vencimientos con','Las facturas que vencen dentro de ese plazo suben al Resumen.','','días')}
    ${guardado()}
  </div></section>`;
}

function cfgFijos(){
  return `<div class="superficie anim-sube">
    <div class="herramientas" style="justify-content:space-between"><div><b>Gastos que se repiten</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">El sistema los propone cada mes en Gastos ▸ Fijos del mes. Los variables (luz, agua) piden el monto del recibo.</p></div>
      <button class="btn btn-primario btn-sm" data-accion="exportar">+ Agregar fijo</button></div>
    <div class="tabla-wrap"><table class="t" style="min-width:720px"><thead><tr><th>Gasto</th><th>Unidad</th><th>Proveedor</th><th class="num">Monto</th><th class="num">Día</th><th>Sale de</th><th>Activo</th></tr></thead>
    <tbody>${FIJOS.map(f=>`<tr><td data-l="Gasto"><b>${f.n}</b><span class="sub" style="display:block;font-size:12px">${cat(f.c).n} · ${cat(f.c).cta}${f.variable?' · variable':''}</span></td><td data-l="Unidad">${nombreUnidad(f.u)}</td><td data-l="Proveedor">${esc(f.prov)}</td>
      <td class="num" data-l="Monto">${f.variable?'~':''}${S(f.monto)}</td><td class="num" data-l="Día">${f.dia}</td><td data-l="Sale de">${f.cuenta?cuenta(f.cuenta).n.replace(' · Cta. corriente',''):'A crédito'}</td>
      <td data-l="Activo"><input type="checkbox" checked aria-label="Activo"></td></tr>`).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>${FIJOS.length} fijos · suman ${S(FIJOS.reduce((a,f)=>a+f.monto,0))} al mes</span>${F('nuevo','gastos_fijos')}</div>
  </div>`;
}

function cfgPresupuesto(){
  const inp = (ruta, v) => `<input class="control num-input" inputmode="numeric" value="${v??''}" placeholder="—" data-ppto="${ruta}">`;
  const us = UNIDADES.map(u=>u.k);
  return `<div class="superficie anim-sube">
    <div class="herramientas" style="justify-content:space-between"><div><b>Septiembre 2026</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">Metas de ventas por tienda y topes de gasto por rubro. Vacío = sin tope. Se ven en Reportes ▸ Presupuesto.</p></div>
      <div style="display:flex;gap:8px"><button class="btn btn-secundario btn-sm" data-accion="exportar">Copiar de agosto</button><button class="btn btn-secundario btn-sm" data-accion="exportar">Sugerir según los últimos 3 meses</button></div></div>
    <div class="tabla-wrap"><table class="t ppto-edit fija"><thead><tr><th>Rubro</th>${us.map(u=>`<th class="num">${nombreUnidad(u).replace('Tienda ','')}</th>`).join('')}</tr></thead>
    <tbody><tr class="grupo"><td>Meta de ventas</td>${us.map(u=>`<td class="num">${TIENDAS.includes(u)?inp('ventas|'+u, PRESUPUESTO.ventas[u]):'<span class="sub">—</span>'}</td>`).join('')}</tr>
    ${Object.entries(PRESUPUESTO.gastos).map(([k,m])=>`<tr><td>${cat(k).n} <span class="sub">(tope)</span></td>${us.map(u=>`<td class="num">${inp('gastos|'+k+'|'+u, m[u])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>La planilla no lleva tope aquí: la decide Dynamic.</span>${F('nuevo','presupuestos')}</div>
  </div>`;
}

function cfgImpuestos(){
  return `<section class="dos-col par"><div class="superficie pad anim-sube">
    <div class="prioridades-cab"><div><h2>Tasa de IGV</h2><p>Solo se agregan filas: el pasado no se reescribe.</p></div>${F('nuevo','parametros_tributarios')}</div>
    <ul class="lista-mov" style="margin:0">${CONFIG.tasas.map(t=>`<li>Desde ${fecha(t.desde)} ${t.desde.slice(0,4)}<b>${t.igv} %</b></li>`).join('')}</ul>
    <button class="btn btn-sutil btn-sm" data-accion="exportar" style="margin-top:12px">+ Nueva tasa desde una fecha</button>
  </div><div class="superficie pad anim-sube">
    <div class="prioridades-cab"><div><h2>Valor de la UIT</h2><p>Para el límite de 300 UIT y la renta.</p></div></div>
    <ul class="lista-mov" style="margin:0">${CONFIG.uits.map(t=>`<li>${t.anio}${t.nota?` <span>${t.nota}</span>`:''}<b>${S(t.valor)}</b></li>`).join('')}</ul>
    <button class="btn btn-sutil btn-sm" data-accion="exportar" style="margin-top:12px">+ UIT de un año nuevo</button>
  </div></section>
  <div class="nota-cayla">El régimen de renta y la retención del recibo por honorarios los define el contador. Cuando los confirme, se configuran aquí.</div>`;
}

function modalCuenta(){
  ventana(`<h3>Agregar cuenta</h3><p class="bajada">Un banco, una billetera que no cae a un banco, o un POS.</p>
    <div class="campo"><label for="cN">Nombre</label><input class="control" id="cN" value="BBVA · Cta. corriente"></div>
    <div class="dos-campos"><div class="campo"><label for="cT">Tipo</label><select class="control" id="cT" style="width:100%"><option value="banco">Banco (104)</option><option value="transito">Por abonar (105)</option></select></div>
    <div class="campo"><label for="cS">Saldo con el que empieza</label><input class="control" id="cS" value="0"></div></div>
    <p class="sub" style="font-size:12.5px">El saldo inicial se registra una vez; después el saldo solo cambia con movimientos.</p>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okCu">Agregar</button></div>`);
  $('#okCu').onclick = () => { const t = $('#cT').value;
    guardar('Cuenta agregada.', () => { CUENTAS.forEach(c=>c.nuevo=false); CUENTAS.splice(2,0,{id:'c'+Date.now(), n:$('#cN').value, tipo:t, cta:t==='banco'?'104':'105', saldo:+$('#cS').value||0, conciliado:HOY, recibe:'Sin cobros asignados todavía', nuevo:true}); }); };
}
