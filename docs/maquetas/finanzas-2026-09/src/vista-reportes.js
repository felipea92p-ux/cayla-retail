// ============ Reportes (piezas 7, 8 y 9) ============
VISTAS.reportes = () => {
  const tab = tabActual('reportes','resultados');
  const cuerpo = {resultados:vistaResultados, presupuesto:vistaPresupuesto, campanas:vistaCampanas, escenarios:vistaEscenarios, flujo:vistaFlujo, balance:vistaBalance}[tab]();
  const alcance = ['resultados','presupuesto'].includes(tab) ? filtroVer() : filtroVer('empresa');
  return `${cabecera({sobre:'Finanzas · Reportes', titulo:{resultados:'¿Ganamos?', presupuesto:'¿Vamos según lo planeado?', campanas:'¿Valen la pena las campañas?', escenarios:'¿Qué pasa si…?', flujo:'¿Por qué vendí bien y no hay plata?', balance:'¿Cuánto vale CAYLA?'}[tab],
    bajada:{resultados:'Salen solos del diario que arma el sistema con cada venta, compra, gasto y movimiento de caja (ADR-0198). Nadie escribe un asiento.',
      presupuesto:'Lo que pusiste como meta y como tope en Configuración, contra lo que va pasando. La proyección supone que el resto del mes sigue al mismo ritmo.',
      campanas:'Cada campaña contra lo que la tienda vende en días normales: cuánto más vendió, cuánto se descontó y si al final dejó más o menos margen.',
      escenarios:'Mueve los valores y mira qué pasa con la utilidad de cada tienda y con tu caja. No se guarda nada: es para pensar antes de decidir.',
      flujo:'Lo que ya entró y salió, y lo que viene en las próximas semanas.', balance:'Lo que CAYLA tiene, contra lo que debe y lo que es tuyo.'}[tab],
    acciones:`${alcance}<button class="btn btn-secundario" data-accion="exportar">Descargar Excel</button>`})}
    ${pestanas('reportes', [['resultados','Estado de resultados'],['presupuesto','Presupuesto'],['campanas','Campañas'],['escenarios','Escenarios'],['flujo','Flujo de caja'],['balance','Balance']])}${cuerpo}`;
};

const FILAS_ER = [
  {k:'ventas', n:'Ventas', cta:'70'},
  {k:'costo', n:'Costo de lo vendido', cta:'69', neg:1},
  {k:'flete', n:'Fletes de compra', cta:'609', neg:1},
  {k:'mermas', n:'Mermas', cta:'659', neg:1},
  {sub:'margen', n:'Margen bruto'},
  ...LINEAS_GASTO.map(([k,n]) => ({k, n, cta:{planilla:'62',alquiler:'635',servicios:'636',personal:'62',publicidad:'637',transporte:'631',suministros:'656',mantenimiento:'634',depreciacion:'68'}[k], neg:1})),
  {k:'absorbido', n:'Absorbido en las prendas del Taller', cta:'71'},
  {total:true, n:'Utilidad operativa'},
];

function vistaResultados(){
  const mes = E.mesResultados, r = resultadosDe(mes), prev = mes==='2026-09' ? RESULTADOS_AGO : null;
  const cols = verTodas() ? [...UNIDADES.map(u=>u.k), 'CONS'] : [E.ver, 'CONS'];
  const val = (fila, u, rr=r) => {
    const us = u==='CONS' ? UNIDADES.map(x=>x.k) : [u];
    if (fila.sub) return us.reduce((a,x)=>a+totalesDe(rr,x).margen,0);
    if (fila.total) return us.reduce((a,x)=>a+totalesDe(rr,x).utilidad,0);
    return us.reduce((a,x)=>a+(rr[fila.k][x]||0),0) * (fila.neg?-1:1);
  };
  const cerrado = u => u==='CONS' ? Object.values(CIERRE['2026-08']).every(x=>x.c) : (CIERRE[mes]||{})[u]?.c;
  const celda = (fila, u) => {
    const v = val(fila, u); if (!v && !fila.total && !(fila.sub && val(FILAS_ER[0],u))) return `<td class="${u==='CONS'?'cons':''} sub">—</td>`;
    const d = E.comparar && prev ? v - val(fila, u, prev) : null;
    return `<td class="${u==='CONS'?'cons ':''}${v<0&&(fila.total||fila.sub)?'neg ':''}${fila.k?'celda':''}" ${fila.k?`data-accion="origen" data-id="${fila.k}|${u}"`:''}>${S(v)}${d!=null&&(fila.total||fila.sub||fila.k==='ventas')?`<span class="delta">${d>=0?'+':'−'}${S(Math.abs(d)).replace('S/ ','')} vs ago.</span>`:''}</td>`;
  };
  return `
  <div class="superficie anim-sube">
    <div class="herramientas">
      <select class="control" data-cambia="mesResultados"><option value="2026-08"${mes==='2026-08'?' selected':''}>Agosto 2026</option><option value="2026-09"${mes==='2026-09'?' selected':''}>Septiembre 2026 · a la fecha</option></select>
      ${mes==='2026-09'?`<label class="btn btn-sutil btn-sm" style="gap:8px"><input type="checkbox" data-cambia="comparar" ${E.comparar?'checked':''}> Comparar con agosto</label>`:''}
      <span class="sub" style="font-size:12.5px;margin-left:auto">Toca una cifra para ver de qué filas sale.</span>
      ${F('deriva','fn_estado_resultados ← fn_asientos (ADR-0120)')} ${F('existe','planilla_por_sede (Dynamic)')}
    </div>
    <div class="tabla-wrap"><table class="eerr">
      <thead><tr><th>Concepto</th><th style="text-align:left">Cuenta</th>${cols.map(u=>`<th class="${u==='CONS'?'cons':''}">${u==='CONS'?'CAYLA':nombreUnidad(u).replace('Tienda ','')}<span class="delta">${u==='CONS'?(Object.values(CIERRE['2026-08']).every(x=>x.c)||mes!=='2026-08'?'':'2 de 5 cerradas'):(mes==='2026-08'?(cerrado(u)?'cerrado':'abierto'):'abierto')}</span></th>`).join('')}</tr></thead>
      <tbody>${FILAS_ER.map(f => {
        if (f.k==='absorbido' && !UNIDADES.some(u=>r.absorbido[u.k])) return '';
        const cls = f.sub ? 'sub' : f.total ? 'total' : '';
        const fila = `<tr class="${cls}"><td>${f.n}</td><td class="cta">${f.cta||''}</td>${cols.map(u=>celda(f,u)).join('')}</tr>`;
        const pctFila = (f.sub||f.total) ? `<tr class="pct"><td></td><td></td>${cols.map(u=>{ const vt = val(FILAS_ER[0],u); return `<td class="${u==='CONS'?'cons':''}">${vt?pct(val(f,u)/vt)+' de la venta':''}</td>`; }).join('')}</tr>` : '';
        return fila + pctFila;
      }).join('')}</tbody>
    </table></div>
  </div>
  <div class="dos-col par">
    <div class="nota-cayla"><b>El Taller no le vende a las tiendas</b> (D-31): lo que cuesta producir se pega a cada prenda y aparece en el «costo de lo vendido» de la tienda que la vende. Por eso su columna muestra lo que gastó y, en positivo, lo que absorbieron sus prendas: si queda en negativo, es costo que <b>no</b> alcanzó a entrar a ninguna prenda (eficiencia).</div>
    <div class="nota-cayla"><b>«De la empresa»</b> son los gastos que no son de ninguna tienda (contador, publicidad, software, sueldo de oficina, D-32). Aparecen solo aquí y en CAYLA. No se reparten entre tiendas: repartirlos sería inventar un número.</div>
  </div>`;
}

function modalOrigen(id){
  const [k, u] = id.split('|'); const us = u==='CONS' ? UNIDADES.map(x=>x.k) : [u];
  const r = resultadosDe(E.mesResultados); const total = us.reduce((a,x)=>a+(r[k][x]||0),0);
  const fuentes = {
    ventas:['venta_items (sin IGV)', `${Math.round(total/96)} ventas del mes`, 'menos anulaciones y devoluciones aprobadas'],
    costo:['venta_items.costo_unitario', 'el costo sellado el día de cada venta, no el de hoy', 'incluye lo que costó producir en el Taller'],
    flete:['compras (flete de la factura)', 'cuenta 609: es parte de lo que cuesta la mercadería'], mermas:['prendas_danadas + movimientos', 'valorizadas con el costo de ese día'],
    planilla:['planilla_por_sede (Dynamic)', 'pagado + provisiones de cada persona de la sede'], depreciacion:['activos_fijos', 'costo ÷ vida útil, mes a mes'],
    absorbido:['órdenes de producción cerradas', 'materiales + conversión de las prendas terminadas'],
  }[k] || ['gastos (categoría '+(cat(k)?.n||k)+')', 'gastos vigentes con fecha del mes'];
  const ejemplos = GASTOS.filter(g=>g.c===k && us.includes(g.u) && g.estado!=='anulado').slice(0,4);
  ventana(`<p class="etq">De dónde sale</p><h3>${FILAS_ER.find(f=>f.k===k).n} · ${u==='CONS'?'CAYLA':nombreUnidad(u)}</h3>
    <p class="bajada">${mesLargo(E.mesResultados)} · <b>${S(total)}</b></p>
    <ul class="lista-mov">${fuentes.map((f,i)=>`<li>${i?'':'<b>Tabla</b>'}<span>${f}</span></li>`).join('')}
      ${ejemplos.map(g=>`<li>${fecha(g.f)} · ${esc(g.d)}<b>${S(g.total - g.igv)}</b></li>`).join('')}</ul>
    <p class="sub" style="font-size:12.5px">Cada cifra es la suma de líneas del diario, y cada línea sabe de qué fila salió. Nada se tipea aquí.</p>
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cerrar</button></div>`);
}

function vistaFlujo(){
  const ent = FLUJO_REAL.entradas.reduce((a,x)=>a+x[1],0), sal = FLUJO_REAL.salidas.reduce((a,x)=>a+x[1],0);
  const proy = proyeccion();
  const lista = (xs, signo) => xs.map(([n,v])=>`<li>${n}<b>${signo}${S(v)}</b></li>`).join('');
  return `
  <div class="dos-col der">
    <div class="superficie pad anim-sube">
      <p class="etq">Lo que ya pasó · septiembre al 24</p>
      <div>
        <div><h3 class="serif h-flujo">Entró ${S(ent)}</h3><ul class="lista-mov">${lista(FLUJO_REAL.entradas,'+')}</ul></div>
        <div><h3 class="serif h-flujo">Salió ${S(sal)}</h3><ul class="lista-mov">${lista(FLUJO_REAL.salidas,'−')}</ul></div>
      </div>
      <div class="nota-cayla" style="margin-top:6px">Vendiste bien, pero <b>salió ${S(sal-ent)} más de lo que entró</b>: pagaste la mercadería de la temporada antes de venderla. Eso es normal en moda; lo que hay que vigilar es que el saldo no baje del mínimo.</div>
      ${F('deriva','fn_asientos: cuentas 101, 104, 105')}
    </div>
    <div class="superficie pad anim-sube">
      <p class="etq">Lo que viene · próximas 6 semanas</p>
      <h3 class="serif" style="font-weight:500;font-size:22px;margin:4px 0 2px">Hoy tienes ${S(disponible())}</h3>
      <p class="sub" style="margin:0 0 8px;font-size:13px">Entra lo que vendes en una semana normal; sale lo que vence (facturas, planilla, alquileres, gastos fijos).</p>
      ${barras(proy.map(w=>({n:w.s.split(' – ')[0], v:w.saldo, malo:w.saldo<minimoCaja(), maloTxt:'bajo el mínimo', tip:`<b>${w.s}</b><br>Entra ${S(w.entra)} · Sale ${S(w.sale)}<br>${esc(w.que)}`})), {alto:230, umbral:minimoCaja(), umbralTxt:'tu mínimo de caja: '+S(minimoCaja())+' (se cambia en Configuración)'})}
      <div class="tabla-wrap" style="margin-top:12px"><table class="t" style="min-width:560px"><thead><tr><th>Semana</th><th class="num">Entra</th><th class="num">Sale</th><th class="num">Queda</th><th>Qué vence</th></tr></thead>
        <tbody>${proy.map(w=>`<tr><td data-l="Semana">${w.s}${w.campana?`<span class="chip-campana" style="display:block">${esc(w.campana)}</span>`:''}</td><td class="num" data-l="Entra">${S(w.entra)}</td><td class="num" data-l="Sale">${S(w.sale)}</td><td class="num" data-l="Queda"><b style="${w.saldo<minimoCaja()?'color:var(--rojo-profundo)':''}">${S(w.saldo)}</b></td><td data-l="Qué vence" class="sub" style="font-size:12.5px">${esc(w.que)}</td></tr>`).join('')}</tbody></table></div>
      ${F('deriva','vencimientos de compras + comprobantes_produccion')} ${F('nuevo','gastos recurrentes + mínimo de caja')}
    </div>
  </div>`;
}

function vistaBalance(){
  const suma = xs => xs.reduce((a,x)=>a+x[2],0);
  const ta = suma(BALANCE.activo), tp = suma(BALANCE.pasivo), tpat = suma(BALANCE.patrimonio);
  const cuadra = !E.descuadre;
  const chequeos = CONCILIACION.map((c,i) => (E.descuadre && i===2) ? {...c, b:c.b-420} : c);
  const lista = (xs) => xs.map(([c,n,v])=>`<li><span>${c}</span><span>${n}</span><span>${S(v)}</span></li>`).join('');
  return `
  <div class="superficie pad anim-sube">
    <div class="prioridades-cab"><div><h2>Antes de dibujarlo, el sistema lo comprueba</h2><p>Cada cuenta se calcula por dos caminos distintos. Si no coinciden, el Balance no se muestra: un número falso es peor que ninguno.</p></div>
      <label class="btn btn-sutil btn-sm" style="gap:8px"><input type="checkbox" data-cambia="descuadre" ${E.descuadre?'checked':''}> Demo: simular un descuadre</label></div>
    <ul class="chequeos">${chequeos.map(c=>`<li><span class="ok-ic ${c.a===c.b?'':'no-ic'}">${c.a===c.b?'✓':'!'}</span><div><b>${c.cta}</b><p>contra ${c.contra}</p></div><span>${c.a===c.b?S(c.a):`${S(c.a)} ≠ ${S(c.b)}`}</span></li>`).join('')}</ul>
    ${F('nuevo','fn_conciliacion_contable (ADR-0198)')}
  </div>
  ${cuadra ? `
  <div class="superficie pad anim-sube">
    <div class="prioridades-cab"><div><h2>Al 31 de agosto</h2><p>Lo que CAYLA tiene, contra lo que debe y lo que es tuyo.</p></div><span class="badge" data-tono="verde">cuadra</span></div>
    <div class="balance">
      <div><h3>Lo que tiene</h3><ul>${lista(BALANCE.activo)}<li class="tot"><span></span><span>Total</span><span>${S(ta)}</span></li></ul></div>
      <div><h3>Lo que debe</h3><ul>${lista(BALANCE.pasivo)}<li class="tot"><span></span><span>Total</span><span>${S(tp)}</span></li></ul>
        <h3 style="margin-top:18px">Lo que es tuyo</h3><ul>${lista(BALANCE.patrimonio)}<li class="tot"><span></span><span>Deudas + lo tuyo</span><span>${S(tp+tpat)}</span></li></ul></div>
    </div>
    ${F('deriva','fn_balance_general')} ${F('nuevo','saldos_iniciales (capital al arrancar)')}
  </div>
  <div class="nota-cayla">El <b>capital</b> se registra una vez, al arrancar (lo que pusiste en el negocio). Nunca se calcula como «lo que falta para que cuadre»: si así fuera, el Balance cuadraría siempre y no probaría nada. Por tienda solo se puede mostrar lo que es suyo (su cajón, su mercadería, sus muebles); el banco y la deuda son de CAYLA entera. <b>Decisión pendiente</b>: ¿te basta así?</div>`
  : `<div class="guia anim-sube"><p class="etq" style="color:var(--rojo)">No cuadra</p><h2>El Balance no se muestra hasta resolver la diferencia</h2>
      <p>La cuenta 421 (facturas por pagar) dice ${S(64300)}, pero la suma de las facturas da ${S(63880)}. Diferencia: <b>${S(420)}</b>.</p>
      <div class="aviso-franja"><div><b>Causa probable:</b> un pago a Moda Lima EIRL (F002-00118) registrado sin la cuenta de la que salió. <button class="btn-enlace" data-ir="dinero:porpagar">Ir a Por pagar</button></div></div></div>`}`;
}

// ============ Presupuesto (decidir: ¿en qué me estoy pasando?) ============
function vistaPresupuesto(){
  const sep = resultadosDe('2026-09');
  const us = (verTodas() ? UNIDADES.map(u=>u.k) : [E.ver]).filter(veUnidad);
  const chip = p => p > 1.05 ? `<span class="badge" data-tono="rojo">te pasas ${pct(p-1)}</span>` : p > 1 ? '<span class="badge" data-tono="ambar">al filo</span>' : '<span class="badge" data-tono="verde">dentro del tope</span>';
  const bloques = us.map(u => {
    const filas = [];
    if (TIENDAS_CAJA[u]){ const real = sep.ventas[u], proy = Math.round(real/AVANCE_MES), meta = metaMes(u);
      filas.push(`<tr class="fila-ventas"><td data-l="Rubro"><b>Ventas</b> <span class="sub">(suma de las metas del día, sin IGV)</span></td><td class="num" data-l="Meta">${S(meta)}</td><td class="num" data-l="A la fecha">${S(real)}</td><td class="num" data-l="Al cierre">${S(proy)}</td>
        <td data-l="Avance"><div class="umbral-barra fina"><i style="width:${Math.min(100,proy/meta*100)}%"></i></div></td><td data-l="Estado">${proy/meta < .95 ? '<span class="badge" data-tono="ambar">bajo la meta</span>' : '<span class="badge" data-tono="verde">en camino</span>'}</td></tr>`); }
    for (const [k, m] of Object.entries(PRESUPUESTO.gastos)){ if (!m[u]) continue;
      const real = sep[k]?.[u] || 0, proy = FIJAS.includes(k) ? real : Math.round(real/AVANCE_MES), p = proy/m[u];
      filas.push(`<tr><td data-l="Rubro">${cat(k)?.n||k} <span class="sub">(tope)</span></td><td class="num" data-l="Tope">${S(m[u])}</td><td class="num" data-l="A la fecha">${S(real)}</td><td class="num" data-l="Al cierre">${S(proy)}</td>
        <td data-l="Avance"><div class="umbral-barra fina ${p>1.05?'mala':''}"><i style="width:${Math.min(100,p*100)}%"></i></div></td><td data-l="Estado">${chip(p)}</td></tr>`); }
    return `<tbody><tr class="grupo"><td colspan="6">${nombreUnidad(u)}</td></tr>${filas.join('')}</tbody>`;
  }).join('');
  return `<div class="superficie anim-sube">
    <div class="herramientas" style="justify-content:space-between"><div><b>Septiembre · al día 24 de 30</b><p class="sub" style="margin:2px 0 0;font-size:12.5px">«Al cierre» proyecta lo variable al ritmo de hoy; lo fijo (alquiler, planilla) ya está entero.</p></div>
      <div style="display:flex;gap:8px;align-items:center">${F('nuevo','presupuestos')}<button class="btn btn-secundario btn-sm" data-ir="config:presupuesto">Cambiar metas y topes</button></div></div>
    <div class="tabla-wrap"><table class="t ppto"><thead><tr><th>Rubro</th><th class="num">Meta o tope</th><th class="num">A la fecha</th><th class="num">Al cierre</th><th style="width:160px">Avance</th><th>Estado</th></tr></thead>${bloques}</table></div>
  </div>
  <div class="nota-cayla">El presupuesto no frena nada: nadie queda bloqueado por pasarse. Sirve para ver <b>a tiempo</b> en qué se va la plata, antes de que el mes cierre.</div>`;
}

// ============ Escenarios («¿qué pasa si…?») ============
// Parte de agosto (el último mes cerrado) y le aplica los cambios. Nada se guarda.
function escenarioResultado(esc){
  const r = JSON.parse(JSON.stringify(RESULTADOS_AGO));
  const escala = (u, f) => ['ventas','costo','flete','mermas'].forEach(k => r[k][u] = Math.round(r[k][u] * f));
  if (esc.ventasTodas) TIENDAS.forEach(u => escala(u, 1 + esc.ventasTodas/100));
  if (esc.ventasLIM) escala('LIM', 1 + esc.ventasLIM/100);
  if (esc.alqLIM != null) r.alquiler.LIM = esc.alqLIM;
  if (esc.cerrarLIM) for (const k in r) if (k !== 'depreciacion') r[k].LIM = 0;   // la remodelación se sigue depreciando
  const out = {}; UNIDADES.forEach(u => out[u.k] = totalesDe(r, u.k)); out.CONS = totalesDe(r); out.r = r;
  return out;
}
function vistaEscenarios(){
  const e = E.escenario, base = escenarioResultado({}), nuevo = escenarioResultado(e);
  const pb = proyeccion(), pn = proyeccion(e);
  const minB = Math.min(...pb.map(w=>w.saldo)), minN = Math.min(...pn.map(w=>w.saldo));
  const dif = nuevo.CONS.utilidad - base.CONS.utilidad;
  const conclusiones = [];
  conclusiones.push(`CAYLA pasaría de <b>${S(base.CONS.utilidad)}</b> a <b>${S(nuevo.CONS.utilidad)}</b> al mes (${dif>=0?'+':'−'}${S(Math.abs(dif)).replace('S/ ','S/ ')}).`);
  if (!e.cerrarLIM) conclusiones.push(`LIM ${nuevo.LIM.utilidad>=0?'dejaría':'perdería'} <b>${S(Math.abs(nuevo.LIM.utilidad))}</b> al mes; necesitaría vender ${S(equilibrio('LIM', nuevo.r).pe)}.`);
  else conclusiones.push(`Cerrar LIM quita <b>${S(RESULTADOS_AGO.ventas.LIM)}</b> de ventas al mes y la remodelación (${S(18500)}) se sigue depreciando sin uso. También hay que ver a dónde va su mercadería y su equipo.`);
  conclusiones.push(minN < minimoCaja() ? `La caja seguiría bajando del mínimo: lo más bajo sería <b>${S(minN)}</b>.` : `La caja no bajaría de tu mínimo en 6 semanas (lo más bajo: <b>${S(minN)}</b>${minB<minimoCaja()?`; hoy bajaría a ${S(minB)}`:''}).`);
  const ctrl = (k, n, min, max, paso, fmt) => `<div class="campo-esc"><label for="esc-${k}">${n}<b>${fmt(e[k])}</b></label><input type="range" id="esc-${k}" min="${min}" max="${max}" step="${paso}" value="${e[k]}" data-esc="${k}"></div>`;
  return `<section class="dos-col izq">
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>Mueve los valores</h2><p>Parte de agosto, el último mes cerrado.</p></div><button class="btn btn-sutil btn-sm" data-accion="esc-reset">Volver a como está</button></div>
      ${ctrl('alqLIM','Alquiler de LIM', 3000, 7000, 100, v=>S(v))}
      ${ctrl('ventasLIM','Ventas de LIM', -20, 40, 1, v=>(v>0?'+':'')+v+' %')}
      ${ctrl('ventasTodas','Ventas de todas las tiendas', -20, 30, 1, v=>(v>0?'+':'')+v+' %')}
      <label class="opcion-esc"><input type="checkbox" data-esc-check="retrasarNorte" ${e.retrasarNorte?'checked':''}><span><b>Pasar el pago a Distribuidora Norte una semana</b><br><span class="sub">${S(15300)} del 12 al 19 de octubre. Hay que hablarlo con el proveedor.</span></span></label>
      <label class="opcion-esc"><input type="checkbox" data-esc-check="cerrarLIM" ${e.cerrarLIM?'checked':''}><span><b>Cerrar LIM</b><br><span class="sub">Sin sus ventas ni sus costos; la remodelación se sigue depreciando.</span></span></label>
    </div>
    <div class="columna">
      <div class="superficie pad anim-sube"><div class="prioridades-cab"><div><h2>Qué pasaría</h2><p>Comparado con cómo está hoy.</p></div></div>
        <ul class="conclusiones">${conclusiones.map(c=>`<li>${c}</li>`).join('')}</ul></div>
      <div class="superficie anim-sube"><div class="tabla-wrap"><table class="t" style="min-width:420px"><thead><tr><th>Utilidad al mes</th><th class="num">Hoy</th><th class="num">Con el cambio</th><th class="num">Diferencia</th></tr></thead>
        <tbody>${[...UNIDADES.map(u=>u.k),'CONS'].map(k=>{ const a = base[k].utilidad, b = nuevo[k].utilidad; return `<tr${k==='CONS'?' class="total-t"':''}><td data-l="Unidad">${k==='CONS'?'<b>CAYLA</b>':nombreUnidad(k)}</td><td class="num" data-l="Hoy">${S(a)}</td><td class="num" data-l="Con el cambio"><b>${S(b)}</b></td><td class="num" data-l="Diferencia" style="${b-a<0?'color:var(--rojo-profundo)':b-a>0?'color:var(--verde)':''}">${b===a?'—':(b>a?'+':'−')+S(Math.abs(b-a)).replace('S/ ','S/ ')}</td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="superficie pad anim-sube"><div class="prioridades-cab"><div><h2>Tu caja con el cambio</h2><p>Próximas 6 semanas.</p></div></div>
        ${barras(pn.map(w=>({n:w.s.split(' – ')[0], v:w.saldo, malo:w.saldo<minimoCaja(), maloTxt:'bajo el mínimo', tip:`<b>${w.s}</b><br>Entra ${S(w.entra)} · Sale ${S(w.sale)}`})), {alto:190, umbral:minimoCaja(), umbralTxt:'tu mínimo de caja: '+S(minimoCaja())})}
      </div>
    </div>
  </section>
  <div class="nota-cayla">Un escenario no reemplaza la conversación: bajar un alquiler hay que negociarlo y vender 15 % más requiere un plan. Lo que sí hace es decirte <b>cuánto vale</b> cada decisión antes de tomarla. ${F('deriva','mismo cálculo que el estado de resultados')}</div>`;
}

// ============ Campañas: ¿valió la pena? (y cuánto hay que vender en las que vienen) ============
const MARGEN_NORMAL = 0.52;   // margen bruto de un día sin campaña (estado de resultados de agosto)
// Con un descuento d, cada prenda deja (1 − d − costo) en vez de (1 − costo). Cuánto más hay que vender para ganar lo mismo:
const extraNecesario = d => { const costo = 1 - MARGEN_NORMAL, m = 1 - d/100 - costo; return m > 0 ? MARGEN_NORMAL / m - 1 : Infinity; };
function vistaCampanas(){
  const pasadas = CAMPANAS.filter(c => CAMPANA_RESULTADOS[c.id]).map(c => { const r = CAMPANA_RESULTADOS[c.id];
    const extra = Math.round(r.ventas*r.margenPct - r.normal*MARGEN_NORMAL); return {...c, r, extra, lift: r.ventas/r.normal - 1}; });
  const vienen = CAMPANAS.filter(c => c.desde && c.desde > HOY);
  const sumaMeta = (c, conCampana) => { let t = 0; for (let d = new Date(c.desde+'T12:00:00'); d <= new Date(c.hasta+'T12:00:00'); d.setDate(d.getDate()+1)){
      const f = d.toISOString().slice(0,10); TIENDAS.forEach(u => { const p = parametrosCaja(u, f); t += conCampana ? p.meta : p.metaBase; }); } return Math.round(t/1.18); };
  const malas = pasadas.filter(x => x.extra < 0);
  return `
  <section class="dos-col der">
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>Margen extra de cada campaña</h2><p>Lo que dejó contra lo que habría dejado en días normales.</p></div></div>
      ${barras(pasadas.map(x=>({n:x.n.replace('Día Internacional del ','Día del '), v:x.extra, malo:x.extra<0, maloTxt:'no se pagó', tip:`<b>${esc(x.n)}</b><br>Vendió ${S(x.r.ventas)} (normal ${S(x.r.normal)})<br>Descuento ${S(x.r.descuento)} · margen ${pct(x.r.margenPct)}`})), {alto:210})}
      ${malas.length ? `<p class="sub" style="font-size:13px;margin:10px 0 0"><b style="color:var(--tinta)">${malas.map(x=>x.n.replace('Día Internacional del ','Día del ')).join(' y ')}</b> vendieron casi lo mismo que un día normal (${malas.map(x=>(x.lift>=0?'+':'')+pct(x.lift)).join(' y ')}) y se descontaron ${S(malas.reduce((a,x)=>a+x.r.descuento,0))}: dejaron ${S(-malas.reduce((a,x)=>a+x.extra,0))} menos que no hacerlas.</p>` : ''}
    </div>
    <div class="superficie anim-sube">
      <div class="tabla-wrap"><table class="t" style="min-width:600px"><thead><tr><th>Campaña</th><th class="num">Vendió</th><th class="num">vs normal</th><th class="num">Descuento</th><th class="num">Margen extra</th></tr></thead>
      <tbody>${pasadas.map(x=>`<tr><td class="c-prenda" data-l="Campaña"><b>${esc(x.n)}</b><span class="sub" style="display:block;font-size:12px">${fecha(x.desde)} – ${fecha(x.hasta)} · ${x.r.prendas} prendas</span></td>
        <td class="num" data-l="Vendió">${S(x.r.ventas)}</td><td class="num" data-l="vs normal">${x.lift>=0?'+':''}${pct(x.lift)}</td><td class="num" data-l="Descuento">${x.r.descuento?S(x.r.descuento):'—'}</td>
        <td class="num" data-l="Margen extra"><b style="color:${x.extra<0?'var(--rojo-profundo)':'var(--verde)'}">${x.extra>=0?'+':'−'}${S(Math.abs(x.extra))}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="pie-tabla"><span>«Normal» = lo que vendió la tienda los mismos días sin campaña.</span>${F('existe','venta_items.descuento_etiqueta_id')} ${F('deriva','ventas en fechas de campaña vs días normales')}</div>
    </div>
  </section>
  <div class="superficie anim-sube">
    <div class="herramientas"><b>Las que vienen</b><span class="sub" style="font-size:12.5px">Antes de lanzarla: con ese descuento, ¿cuánto más hay que vender para ganar lo mismo que un día normal?</span></div>
    <div class="tabla-wrap"><table class="t" style="min-width:820px"><thead><tr><th>Campaña</th><th class="num">Descuento</th><th class="num">Para ganar lo mismo, vender</th><th class="num">La meta sube</th><th class="num">Meta de la campaña</th><th>Qué dice el sistema</th></tr></thead>
    <tbody>${vienen.map(c=>{ const need = c.dcto ? extraNecesario(c.dcto) : 0; const sube = c.caja ? Math.max(...Object.values(c.caja).map(a=>a.pct)) : 0; const ok = need <= sube/100 + 1e-9;
      return `<tr><td class="c-prenda" data-l="Campaña"><b>${esc(c.n)}</b><span class="sub" style="display:block;font-size:12px">${fecha(c.desde)} – ${fecha(c.hasta)} · empieza en ${dias(c.desde, HOY)} días</span></td>
      <td class="num" data-l="Descuento">${c.dcto?c.dcto+' %':'—'}</td><td class="num" data-l="Vender">${c.dcto?'+'+pct(need)+' más':'lo mismo'}</td><td class="num" data-l="Meta sube">${c.caja?'+'+sube+' %':'<span class="sub">sin efecto en caja</span>'}</td>
      <td class="num" data-l="Meta">${c.caja?S(sumaMeta(c,true)):'—'}${c.caja?`<span class="sub" style="display:block;font-size:11.5px">normal ${S(sumaMeta(c,false))}</span>`:''}</td>
      <td data-l="Qué dice">${!c.dcto ? (c.caja?'<span class="badge" data-tono="verde">sin descuento: todo lo extra es ganancia</span>':'<span class="badge" data-tono="taupe">solo etiqueta</span>') : ok ? '<span class="badge" data-tono="verde">si llega a la meta, gana más</span>' : `<span class="badge" data-tono="ambar">aunque llegue a la meta, gana menos</span>`}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="pie-tabla"><span>Con 15 % de descuento cada prenda deja ${pct(1-(1-.15-(1-MARGEN_NORMAL))/MARGEN_NORMAL)} menos de margen; con 30 %, ${pct(1-(1-.30-(1-MARGEN_NORMAL))/MARGEN_NORMAL)} menos. Por eso una campaña con descuento necesita vender mucho más para valer la pena.</span></div>
  </div>
  <div class="nota-cayla">Una campaña también puede valer por otras cosas (clientas nuevas, sacar mercadería que no rota). El sistema no decide por ti: te dice <b>cuánto cuesta</b> en margen, para que la decisión sea a sabiendas. Las fechas, el descuento y las categorías se cambian en Catálogo ▸ Etiquetas; la meta y el fondo, en <button class="btn-enlace" data-ir="config:tiendas">Configuración ▸ Tiendas y caja</button>.</div>`;
}
