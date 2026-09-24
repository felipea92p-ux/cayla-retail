// ============ Gastos (piezas 1 y 3) ============
const ESTADO_GASTO = {pagado:['verde','Pagado'], porpagar:['ambar','Por pagar'], anulado:['taupe','Anulado']};
const medioTxt = g => g.medio ? cuenta(g.medio).n.replace(' · Cta. corriente','') : '—';

VISTAS.gastos = () => {
  const tab = tabActual('gastos','gastos');
  const gastos = GASTOS.filter(g=>enVista(g.u)).sort((a,b)=>(b.nuevo?1:0)-(a.nuevo?1:0) || b.f.localeCompare(a.f));
  const egresos = EGRESOS.filter(e=>enVista(e.u));
  const activos = ACTIVOS.filter(a=>enVista(a.u));
  const fijosPend = FIJOS.filter(f=>enVista(f.u) && f.estado!=='registrado').length;
  const vig = gastos.filter(g=>g.estado!=='anulado' && g.f.startsWith('2026-09'));
  const total = vig.reduce((a,g)=>a+g.total,0), igv = vig.reduce((a,g)=>a+g.igv,0);
  const sinIgv = vig.filter(g=>g.comp==='Boleta').length;
  const acc = filtroVer() + (tab==='activos'
    ? `<button class="btn btn-primario" data-accion="nuevo-activo">+ Registrar activo</button>`
    : `<button class="btn btn-primario" data-accion="nuevo-gasto">+ Registrar gasto</button>`);
  return `
  ${cabecera({sobre:'Finanzas · Gastos', titulo: verTodas()?'Gastos de septiembre':`Gastos de ${nombreUnidad(E.ver)}`,
    bajada:'Lo que se paga para que el negocio funcione y no es mercadería. Si llegó con comprobante de un proveedor, comparte la factura con Compras: un solo Por pagar y un solo IGV.', acciones:acc})}
  <section class="cifras">
    <div class="tile anim-sube"><span class="etq">Gastado en el mes</span><div class="valor">${S(total)}</div><div class="det">${vig.length} gastos vigentes · ${nombreVer()}</div>${F('nuevo','gastos + compras (naturaleza = gasto)')}</div>
    <div class="tile anim-sube"><span class="etq">IGV que puedes descontar</span><div class="valor">${S(igv)}</div><div class="det">Solo de facturas. ${sinIgv} boleta${sinIgv===1?'':'s'} sin IGV descontable.</div>${F('deriva','compras.igv')}</div>
    <div class="tile anim-sube"><span class="etq">Por pagar de gastos</span><div class="valor ambar">${S(gastos.filter(g=>g.estado==='porpagar').reduce((a,g)=>a+g.total,0))}</div><div class="det">${gastos.filter(g=>g.estado==='porpagar').length} con factura a crédito</div>${F('existe','compras_resumen.saldo')}</div>
    <div class="tile anim-sube"><span class="etq">Egresos de caja sin clasificar</span><div class="valor ${egresos.length?'ambar':''}">${egresos.length}</div><div class="det">${egresos.length?'No cuentan en ningún número hasta clasificarlos':'Todo clasificado'}</div>${F('existe','caja_movimientos')}</div>
  </section>
  ${pestanas('gastos', [['gastos','Gastos'],['fijos','Fijos del mes', fijosPend||''],['activos','Activos fijos', activos.length],['egresos','Egresos de caja por clasificar', egresos.length||'']])}
  ${tab==='gastos' ? tablaGastos(gastos) : tab==='fijos' ? vistaFijos() : tab==='activos' ? tablaActivos(activos) : tablaEgresos(egresos)}`;
};

function tablaGastos(gastos){
  return `<div class="superficie anim-sube">
    <div class="herramientas">
      <div class="buscar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input class="control" placeholder="Buscar por descripción, proveedor o número"></div>
      <select class="control"><option>Todas las categorías</option>${CATEGORIAS.map(c=>`<option>${c.n}</option>`).join('')}</select>
      <select class="control"><option>Septiembre 2026</option><option>Agosto 2026 · cerrado</option></select>
    </div>
    <div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Gasto</th><th>Categoría · cuenta</th>${verTodas()?'<th>Unidad</th>':''}<th>Comprobante</th><th>Cómo se pagó</th><th class="num">Monto</th><th>Estado</th></tr></thead>
    <tbody>${gastos.map(g=>{ const [t,e]=ESTADO_GASTO[g.estado]; const c=cat(g.c); return `<tr class="${g.nuevo?'fila-nueva':''}${g.estado==='anulado'?' anulada':''}" data-accion="ver-gasto" data-id="${g.id}">
      <td data-l="Fecha">${fecha(g.f)}</td>
      <td class="c-prenda" data-l="Gasto"><b>${esc(g.d)}</b><span class="sub" style="display:block;font-size:12px">${esc(g.prov||'Sin proveedor')}</span>${g.raro?`<span class="badge sin-punto" data-tono="pizarra" title="${esc(g.raro)}" style="margin-top:4px">fuera de lo normal · ${esc(g.raro)}</span>`:''}</td>
      <td data-l="Categoría">${c.n} <span class="sub">· ${c.cta}</span></td>
      ${verTodas()?`<td data-l="Unidad">${nombreUnidad(g.u)}</td>`:''}
      <td data-l="Comprobante">${g.comp}${g.num?`<span class="sub" style="display:block;font-size:12px">${g.num}</span>`:''}</td>
      <td data-l="Pago">${g.cond==='credito'&&g.estado==='porpagar'?`<span class="sub">vence ${fecha(g.vence)}</span>`:medioTxt(g)}</td>
      <td class="num" data-l="Monto"><b>${S(g.total,1)}</b>${g.igv?`<span class="sub" style="display:block;font-size:12px">IGV ${S(g.igv,1)}</span>`:''}</td>
      <td data-l="Estado"><span class="badge" data-tono="${t}">${e}</span></td></tr>`; }).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>${gastos.length} gastos · los anulados se quedan a la vista, nunca se borran</span><span>${F('nuevo','fn_gastos_lista (PR #170, adaptada)')}</span></div>
  </div>
  <div class="nota-cayla">La planilla <b>no se registra aquí</b>: se lee de Dynamic (D-33). La mercadería va por Compras y la tela por Producción; aquí solo lo que se consume en el mes. No existe la categoría «Otros»: si un gasto no calza, falta una categoría.</div>`;
}

function mesesUso(a, hasta='2026-09-30'){ const [y1,m1]=a.f.split('-').map(Number), [y2,m2]=hasta.split('-').map(Number); return Math.max(0,(y2-y1)*12 + (m2-m1)); }
function tablaActivos(activos){
  const tot = activos.reduce((x,a)=>x+a.costo,0), dep = activos.reduce((x,a)=>x+Math.min(a.costo, a.costo/a.vida*mesesUso(a)),0);
  return `<div class="superficie anim-sube">
    <div class="tabla-wrap"><table class="t"><thead><tr><th>Bien</th>${esLider()?'<th>Unidad</th>':''}<th>Comprado</th><th>Factura</th><th class="num">Costo</th><th>Vida útil</th><th class="num">Se deprecia al mes</th><th class="num">Vale hoy</th></tr></thead>
    <tbody>${activos.map(a=>{ const m=mesesUso(a), mens=a.costo/a.vida, hoy=a.costo-Math.min(a.costo,mens*m); return `<tr class="${a.nuevo?'fila-nueva':''}">
      <td class="c-prenda" data-l="Bien"><b>${esc(a.n)}</b><span class="sub" style="display:block;font-size:12px">${esc(a.prov)}</span></td>
      ${esLider()?`<td data-l="Unidad">${nombreUnidad(a.u)}</td>`:''}
      <td data-l="Comprado">${fecha(a.f)} ${a.f.slice(0,4)}</td><td data-l="Factura">${a.num}</td>
      <td class="num" data-l="Costo">${S(a.costo)}</td><td data-l="Vida útil">${a.vida/12} años</td>
      <td class="num" data-l="Al mes">${S(mens,1)}</td>
      <td class="num" data-l="Vale hoy"><b>${S(hoy)}</b><div class="split" style="width:90px;margin-left:auto"><i class="piso" style="width:${hoy/a.costo*100}%"></i></div></td></tr>`; }).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>Total ${S(tot)} · depreciado ${S(dep)} · vale hoy ${S(tot-dep)}</span><span>${F('existe','activos_fijos (0 filas hoy)')} ${F('nuevo','activos_fijos.compra_id')}</span></div>
  </div>
  <div class="nota-cayla">Un activo no se resta entero del mes en que se compra: se reparte en su vida útil (<b>depreciación</b>). Así marzo no «pierde» S/ 3,200 por comprar un mostrador que sigue ahí. Las vidas útiles las confirma el contador.</div>`;
}

function tablaEgresos(egresos){
  if (!egresos.length) return `<div class="guia anim-sube"><p class="etq">Todo en orden</p><h2>No hay egresos de caja por clasificar</h2><p>Cada salida de plata de los cajones ya dice si fue gasto, depósito o retiro.</p></div>`;
  return `<div class="superficie anim-sube">
    <div class="tabla-wrap"><table class="t"><thead><tr><th>Fecha</th><th>Tienda</th><th>Lo que escribió la tienda</th><th class="num">Monto</th><th></th></tr></thead>
    <tbody>${egresos.map(e=>`<tr><td data-l="Fecha">${fecha(e.f)}${e.mes?` <span class="badge" data-tono="rojo">traba el cierre de agosto</span>`:''}</td><td data-l="Tienda">${nombreUnidad(e.u)}</td>
      <td class="c-prenda" data-l="Motivo"><b>${esc(e.motivo)}</b>${e.nota?`<span class="sub" style="display:block;font-size:12px">${esc(e.nota)}</span>`:''}</td>
      <td class="num" data-l="Monto">${S(e.monto,1)}</td>
      <td class="c-acc"><div class="acc"><button class="btn btn-secundario btn-sm" data-accion="clasificar" data-id="${e.id}">Clasificar</button></div></td></tr>`).join('')}</tbody></table></div>
  </div>
  <div class="nota-cayla">Un egreso de caja es <b>cómo salió la plata</b>, no qué se compró (ADR-0117). Solo cuenta como gasto cuando alguien dice qué fue; un depósito al banco o un retiro del dueño no son gastos.</div>`;
}

// ---------- Registrar gasto ----------
function modalGasto(){
  const unidades = esLider() ? UNIDADES : UNIDADES.filter(u=>u.k===unidadPropia());
  const cuentasPago = CUENTAS.filter(c=>c.tipo!=='transito' && (esLider() || c.unidad===unidadPropia()));
  ventana(`
    <h3>Registrar gasto</h3>
    <p class="bajada">Lo que se paga para que el negocio funcione. La planilla no va aquí: viene de Dynamic.</p>
    <div class="campo"><label>¿Tiene comprobante de un proveedor?</label>
      <div class="radios" id="fComp">${['Factura','Boleta','Recibo por honorarios','Sin comprobante'].map((c,i)=>`<label><input type="radio" name="comp" value="${c}"${i===0?' checked':''}> ${c}</label>`).join('')}</div></div>
    <div class="dos-campos" id="bloqueProv">
      <div class="campo"><label for="fProv">Proveedor</label><input class="control" id="fProv" value="Hidrandina" list="provs"><datalist id="provs"><option>Hidrandina</option><option>Inmobiliaria San Isidro</option><option>Estudio contable Ríos</option></datalist></div>
      <div class="campo"><label for="fNum">Serie y número</label><input class="control" id="fNum" value="S120-560233"></div>
    </div>
    <div class="campo"><label for="fDesc">Qué se pagó</label><input class="control" id="fDesc" value="Luz de septiembre"></div>
    <div class="dos-campos">
      <div class="campo"><label for="fCat">Categoría</label><select class="control" id="fCat" style="width:100%">${CATEGORIAS.map(c=>`<option value="${c.c}"${c.c==='servicios'?' selected':''}>${c.n}${c.ej?' — '+c.ej:''}</option>`).join('')}</select><span class="ayuda" id="ctaAyuda">Va a la cuenta 636. Nadie la elige: viene con la categoría.</span></div>
      <div class="campo"><label for="fUni">A quién se le carga</label><select class="control" id="fUni" style="width:100%">${unidades.map(u=>`<option value="${u.k}">${u.n}</option>`).join('')}</select></div>
    </div>
    <div class="dos-campos">
      <div class="campo"><label for="fTot">Total pagado (con IGV)</label><input class="control" id="fTot" inputmode="decimal" value="648.00"></div>
      <div class="campo"><label>IGV</label><output class="control" id="fIgv" style="display:block">S/ 98.85</output><span class="ayuda">Solo la factura da IGV descontable.</span></div>
    </div>
    <div class="campo"><label>¿Cómo se paga?</label>
      <div class="radios" id="fCond"><label><input type="radio" name="cond" value="contado" checked> Ya se pagó</label><label><input type="radio" name="cond" value="credito"> A crédito</label></div></div>
    <div class="dos-campos" id="bloquePago">
      <div class="campo"><label for="fMedio">Salió de</label><select class="control" id="fMedio" style="width:100%">${cuentasPago.map(c=>`<option value="${c.id}">${c.n}</option>`).join('')}</select><span class="ayuda">Si sale de un cajón, se crea su egreso de caja en la misma operación.</span></div>
      <div class="campo" id="bloqueVence" hidden><label for="fVence">Vence</label><input class="control" id="fVence" type="date" value="2026-10-12"></div>
    </div>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okGasto">Registrar gasto</button></div>`, {ancho:620});
  const v = $('#velo');
  const sync = () => {
    const comp = v.querySelector('[name=comp]:checked').value, cred = v.querySelector('[name=cond]:checked').value==='credito';
    v.querySelector('#bloqueProv').style.display = comp==='Sin comprobante' ? 'none' : '';
    const tot = parseFloat(v.querySelector('#fTot').value)||0;
    v.querySelector('#fIgv').textContent = comp==='Factura' ? S(tot - tot/1.18, 1) : 'S/ 0.00';
    v.querySelector('#fMedio').closest('.campo').hidden = cred;
    v.querySelector('#bloqueVence').hidden = !cred;
    v.querySelector('#fCond').querySelectorAll('label')[1].style.opacity = comp==='Sin comprobante' ? .4 : 1;
    if (comp==='Sin comprobante' && cred) v.querySelector('[name=cond][value=contado]').checked = true;
    v.querySelector('#ctaAyuda').textContent = `Va a la cuenta ${cat(v.querySelector('#fCat').value).cta}. Nadie la elige: viene con la categoría.`;
  };
  v.addEventListener('input', sync); v.addEventListener('change', sync); sync();
  v.querySelector('#okGasto').onclick = () => {
    const comp = v.querySelector('[name=comp]:checked').value, cred = v.querySelector('[name=cond]:checked').value==='credito';
    const tot = parseFloat(v.querySelector('#fTot').value)||0, u = v.querySelector('#fUni').value;
    const g = {id:Date.now(), f:HOY, u, c:v.querySelector('#fCat').value, d:v.querySelector('#fDesc').value, prov: comp==='Sin comprobante'?'':v.querySelector('#fProv').value,
      comp, num: comp==='Sin comprobante'?'':v.querySelector('#fNum').value, total:tot, igv: comp==='Factura'?Math.round((tot-tot/1.18)*100)/100:0,
      medio: cred?null:v.querySelector('#fMedio').value, cond: cred?'credito':'contado', vence: cred?v.querySelector('#fVence').value:null, estado: cred?'porpagar':'pagado', nuevo:true};
    guardar(cred ? `Gasto registrado. Quedó en Por pagar hasta el ${fecha(g.vence)}.` : 'Gasto registrado.', () => {
      GASTOS.forEach(x=>x.nuevo=false); GASTOS.unshift(g);
      if (cred) POR_PAGAR.push({id:'p'+g.id, nat:'gasto', prov:g.prov, num:g.num, u, total:tot, pagado:0, vence:g.vence, nuevo:true});
      else { const c = cuenta(g.medio); c.saldo -= tot; }
    });
  };
}

function modalVerGasto(id){
  const g = GASTOS.find(x=>x.id==id), c = cat(g.c);
  ventana(`<p class="etq">${c.n} · cuenta ${c.cta}</p><h3>${esc(g.d)}</h3>
    <p class="bajada">${nombreUnidad(g.u)} · ${fecha(g.f)} · ${g.comp}${g.num?' '+g.num:''}${g.prov?' · '+esc(g.prov):''}</p>
    <ul class="lista-mov">
      <li>Total <b>${S(g.total,1)}</b></li><li>IGV descontable <b>${S(g.igv,1)}</b></li>
      <li>Pago <b>${g.estado==='porpagar'?'A crédito, vence '+fecha(g.vence):medioTxt(g)}</b></li>
      <li>Asiento que genera solo <span>${c.cta} ${c.n} + 4011 IGV  ←  ${g.estado==='porpagar'?'421 Facturas por pagar':(cuenta(g.medio)?.cta||'')+' '+medioTxt(g)}</span></li>
      ${g.estado==='anulado'?`<li>Anulado <span>${esc(g.motivo)}</span></li>`:''}
    </ul>
    <div class="botones">${g.estado!=='anulado'?`<button class="btn btn-sutil" id="anular">Anular…</button>`:''}<button class="btn btn-secundario" data-cerrar>Cerrar</button></div>`);
  const b = $('#anular'); if (b) b.onclick = () => {
    ventana(`<h3>Anular gasto</h3><p class="bajada">No se borra: queda a la vista como anulado, con el motivo y quién lo hizo. Si salió de un cajón, la plata no vuelve sola: se corrige en la caja.</p>
      <div class="campo"><label for="fMot">Motivo</label><input class="control" id="fMot" placeholder="Ej. se registró dos veces"></div>${comboResponsable()}
      <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okAn">Anular gasto</button></div>`);
    $('#okAn').onclick = () => guardar('Gasto anulado.', () => { g.estado='anulado'; g.motivo=$('#fMot').value||'Sin motivo'; POR_PAGAR.splice(0, POR_PAGAR.length, ...POR_PAGAR.filter(p=>p.num!==g.num)); });
  };
}

function modalActivo(){
  ventana(`<h3>Registrar activo fijo</h3><p class="bajada">Algo que sirve varios años: muebles, equipos, remodelación, máquinas del Taller.</p>
    <div class="campo"><label for="aN">Qué es</label><input class="control" id="aN" value="Estante de exhibición en L"></div>
    <div class="dos-campos"><div class="campo"><label for="aU">Dónde está</label><select class="control" id="aU" style="width:100%">${UNIDADES.filter(u=>u.k!=='EMP'&&veUnidad(u.k)).map(u=>`<option value="${u.k}">${u.n}</option>`).join('')}</select></div>
      <div class="campo"><label for="aV">Vida útil</label><select class="control" id="aV" style="width:100%"><option value="120">10 años · muebles</option><option value="48">4 años · computadoras</option><option value="60">5 años · equipos y máquinas</option></select></div></div>
    <div class="dos-campos"><div class="campo"><label for="aP">Proveedor y factura</label><input class="control" id="aP" value="Muebles Roble · F001-00140"></div>
      <div class="campo"><label for="aC">Costo (con IGV)</label><input class="control" id="aC" value="2400"></div></div>
    <div class="campo"><label>¿Cómo se paga?</label><div class="radios"><label><input type="radio" name="ac" checked> Ya se pagó</label><label><input type="radio" name="ac"> A crédito</label></div></div>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okA">Registrar activo</button></div>`, {ancho:600});
  $('#okA').onclick = () => { const [prov,num] = $('#aP').value.split(' · ');
    guardar('Activo registrado. Se depreciará desde el próximo mes.', () => { ACTIVOS.forEach(a=>a.nuevo=false); ACTIVOS.unshift({id:Date.now(), n:$('#aN').value, u:$('#aU').value, f:HOY, costo:+$('#aC').value||0, vida:+$('#aV').value, prov, num:num||'', nuevo:true}); }); };
}

function modalClasificar(id){
  const e = EGRESOS.find(x=>x.id===id);
  ventana(`<h3>¿Qué fue esta salida?</h3><p class="bajada">${nombreUnidad(e.u)} · ${fecha(e.f)} · <b>${S(e.monto,1)}</b> · «${esc(e.motivo)}${e.nota?' — '+esc(e.nota):''}»</p>
    <div class="opciones" id="op">
      <label><input type="radio" name="q" value="gasto"${e.motivo.startsWith('Dep')?'':' checked'}><b>Un gasto</b><span>Se consumió en el negocio: movilidad, insumos, útiles.</span></label>
      <label><input type="radio" name="q" value="deposito"${e.motivo.startsWith('Dep')?' checked':''}><b>Un depósito al banco</b><span>La plata no se fue: pasó del cajón a una cuenta.</span></label>
      <label><input type="radio" name="q" value="retiro"><b>Un retiro del dueño</b><span>Sale del negocio, pero no es un gasto.</span></label>
      <label><input type="radio" name="q" value="ajuste"><b>Un ajuste de caja</b><span>Corrige un conteo. Solo el líder.</span></label>
    </div>
    <div class="campo" id="qCat"><label>Categoría</label><select class="control" style="width:100%">${CATEGORIAS.map(c=>`<option>${c.n}</option>`).join('')}</select></div>
    <div class="campo" id="qCta" hidden><label>¿A qué cuenta llegó?</label><select class="control" style="width:100%"><option>BCP · Cta. corriente</option><option>Interbank · Cta. corriente</option></select></div>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okC">Guardar</button></div>`, {ancho:560});
  const v = $('#velo'); const sync = () => { const q = v.querySelector('[name=q]:checked').value; v.querySelector('#qCat').hidden = q!=='gasto'; v.querySelector('#qCta').hidden = q!=='deposito'; };
  v.addEventListener('change', sync); sync();
  $('#okC').onclick = () => { const q = v.querySelector('[name=q]:checked').value;
    guardar({gasto:'Registrado como gasto.', deposito:'Registrado como depósito: el banco lo verá en la conciliación.', retiro:'Registrado como retiro del dueño.', ajuste:'Registrado como ajuste.'}[q],
      () => { EGRESOS.splice(EGRESOS.indexOf(e), 1); if (q==='deposito') MOV_DINERO.unshift({f:e.f, tipo:'Depósito del cajón', de:'c'+e.u, a:'bcp', monto:e.monto, ref:e.nota, u:e.u, por:responsableDefecto()}); }); };
}

// ---------- Fijos del mes: el sistema propone, el líder confirma ----------
function vistaFijos(){
  const fs = FIJOS.filter(f=>enVista(f.u));
  const prop = fs.filter(f=>f.estado==='propuesto'), falta = fs.filter(f=>f.estado==='falta'), ok = fs.filter(f=>f.estado==='registrado');
  const det = DETECTADOS.filter(d=>enVista(d.u));
  const fila = (f, boton) => `<li class="fijo"><div><b>${f.n} · ${nombreUnidad(f.u)}</b><span class="sub">${esc(f.prov)} · día ${f.dia}${f.variable?' · monto variable':''}</span></div><span class="monto">${f.variable?'~':''}${S(f.monto)}</span>${boton}</li>`;
  return `
  <section class="dos-col par">
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>Para confirmar</h2><p>Llegan en los próximos días. Un clic los registra con el monto y la cuenta de siempre.</p></div></div>
      <ul class="fijos">${prop.map(f=>fila(f, `<button class="btn btn-primario btn-sm" data-accion="confirmar-fijo" data-id="${f.id}">Registrar</button>`)).join('') || '<li class="sub">Nada por confirmar.</li>'}</ul>
      ${falta.length?`<div class="prioridades-cab" style="margin-top:18px"><div><h2>Faltan</h2><p>Deberían haber llegado y no están registrados.</p></div></div>
      <ul class="fijos">${falta.map(f=>fila(f, `<button class="btn btn-secundario btn-sm" data-accion="fijo-variable" data-id="${f.id}">Registrar monto</button>`)).join('')}</ul>`:''}
    </div>
    <div class="columna">
      ${det.length?`<div class="superficie pad anim-sube"><div class="prioridades-cab"><div><h2>Se repiten. ¿Los marco como fijos?</h2><p>El sistema los encontró mirando los gastos de los últimos meses.</p></div></div>
        <ul class="fijos">${det.map(d=>`<li class="fijo"><div><b>${esc(d.prov)} · ${nombreUnidad(d.u)}</b><span class="sub">${cat(d.c).n} · ${esc(d.patron)}</span></div><span class="monto">${S(d.monto)}</span>
          <span class="dos-botones"><button class="btn btn-secundario btn-sm" data-accion="marcar-fijo" data-id="${d.id}">Marcar fijo</button><button class="btn btn-enlace" data-accion="no-fijo" data-id="${d.id}">No es fijo</button></span></li>`).join('')}</ul></div>`:''}
      <div class="superficie pad anim-sube"><div class="prioridades-cab"><div><h2>Ya registrados este mes</h2><p>${ok.length} de ${fs.length} fijos.</p></div><button class="btn btn-sutil btn-sm" data-ir="config:fijos">Editar fijos</button></div>
        <ul class="fijos">${ok.map(f=>fila(f, '<span class="badge" data-tono="verde">registrado</span>')).join('')}</ul></div>
    </div>
  </section>
  <div class="nota-cayla">Los fijos también alimentan el <button class="btn-enlace" data-ir="reportes:flujo">flujo de caja</button>: por eso la proyección sabe que el alquiler sale el día 10. Si un recibo variable (luz, agua) viene muy distinto a su promedio, el sistema lo marca como «fuera de lo normal». ${F('nuevo','gastos_fijos + detección por proveedor, día y monto')}</div>`;
}
function confirmarFijo(f, monto){
  guardar(`${f.n} de ${nombreUnidad(f.u)} registrado: ${S(monto)}.`, () => {
    f.estado = 'registrado'; GASTOS.forEach(x=>x.nuevo=false);
    GASTOS.unshift({id:Date.now(), f:HOY, u:f.u, c:f.c, d:`${f.n} de septiembre`, prov:f.prov, comp:'Factura', num:'—', total:monto, igv:Math.round((monto-monto/1.18)*100)/100, medio:f.cuenta, cond:'contado', estado:'pagado', nuevo:true});
    if (f.cuenta) cuenta(f.cuenta).saldo -= monto;
  });
}
