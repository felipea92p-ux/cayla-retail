// ============ Cálculos compartidos ============
// Septiembre «a la fecha» (24 de 30 días): lo variable se escala, lo fijo del mes ya está entero.
function resultadosDe(mes){
  if (mes === '2026-08') return RESULTADOS_AGO;
  const f = 0.8, r = {};
  for (const [k, fila] of Object.entries(RESULTADOS_AGO)){
    const fijo = ['alquiler','planilla','depreciacion','personal'].includes(k);
    r[k] = {}; for (const u in fila) r[k][u] = Math.round(fila[u] * (fijo ? 1 : f) * (k==='ventas'&&u==='LIM' ? 1.18 : 1));
  }
  return r;
}
const LINEAS_GASTO = [['planilla','Planilla (Dynamic)'],['alquiler','Alquileres'],['servicios','Servicios básicos'],['personal','Honorarios'],
  ['publicidad','Publicidad'],['transporte','Transporte'],['suministros','Suministros'],['mantenimiento','Mantenimiento'],['depreciacion','Depreciación']];
function totalesDe(r, u){
  const us = u ? [u] : UNIDADES.map(x=>x.k);
  const s = k => us.reduce((a,x)=>a+(r[k][x]||0), 0);
  const margen = s('ventas') - s('costo') - s('flete') - s('mermas');
  const gastos = LINEAS_GASTO.reduce((a,[k])=>a+s(k), 0);
  return {ventas:s('ventas'), margen, gastos, absorbido:s('absorbido'), utilidad: margen - gastos + s('absorbido')};
}
const disponible = () => CUENTAS.filter(c=>veUnidad(c.unidad||'EMP')||esLider()).reduce((a,c)=>a+c.saldo, 0);
const saldoPorPagar = p => p.total - p.pagado;

// ============ Resumen (pieza 4) ============
VISTAS.resumen = () => {
  const ago = totalesDe(RESULTADOS_AGO), sep = totalesDe(resultadosDe('2026-09'));
  const semana = POR_PAGAR.filter(p=>saldoPorPagar(p)>0 && dias(p.vence, HOY) <= 7);
  const debe7 = semana.reduce((a,p)=>a+saldoPorPagar(p),0) + 29800;
  const vencidas = POR_PAGAR.filter(p=>saldoPorPagar(p)>0 && dias(p.vence, HOY) < 0);
  const igvSep = IGV_MESES[5].deb - IGV_MESES[5].cred;
  const sinClasificar = EGRESOS.length;
  const ibk = cuenta('ibk');
  const avance = VENTAS_12M / (300*UIT);

  // Proyección del saldo semana a semana
  let saldo = disponible(); const proy = FLUJO_SEMANAS.map(w => { saldo += w.entra - w.sale; return {...w, saldo}; });
  const riesgo = proy.find(w => w.saldo < MINIMO_CAJA);

  const decidir = [
    vencidas.length && {tono:'rojo', t:`${vencidas.length} factura vencida: ${vencidas.map(p=>p.prov).join(', ')}`, d:`Saldo ${S(vencidas.reduce((a,p)=>a+saldoPorPagar(p),0))}. Venció hace ${dias(HOY, vencidas[0].vence)} días.`, ir:'dinero:porpagar', b:'Ver por pagar'},
    riesgo && {tono:'ambar', t:`La semana del ${riesgo.s} quedas bajo tu mínimo de caja`, d:`Saldo proyectado ${S(riesgo.saldo)} contra un mínimo de ${S(MINIMO_CAJA)}. Mueve un pago o adelanta un depósito.`, ir:'reportes:flujo', b:'Ver flujo de caja'},
    {tono:'ambar', t:`LIM perdió ${S(-totalesDe(RESULTADOS_AGO,'LIM').utilidad)} en agosto`, d:`Vendió ${S(RESULTADOS_AGO.ventas.LIM)}, pero su alquiler (${S(RESULTADOS_AGO.alquiler.LIM)}) se come el margen. TRU la sostiene.`, ir:'reportes:resultados', b:'Ver resultados'},
    sinClasificar && {tono:'pizarra', t:`${sinClasificar} egresos de caja sin clasificar`, d:'Mientras no se diga si son gasto, depósito o retiro, no cuentan en ningún número. Uno traba el cierre de agosto de LIM.', ir:'gastos:egresos', b:'Clasificar'},
    !E.conciliado.ibk && {tono:'pizarra', t:`Interbank sin conciliar desde el ${fecha(ibk.conciliado)}`, d:'Cuatro semanas sin comparar con el banco. La regla es cada viernes.', ir:'dinero:conciliacion', b:'Conciliar'},
    {tono:'pizarra', t:`Vas al ${pct(avance)} del límite de 300 UIT`, d:'Al cruzarlo, SUNAT exige llevar libros electrónicos. A este ritmo, a mediados de 2027.', ir:'impuestos', b:'Ver impuestos'},
  ].filter(Boolean);

  const porUnidad = UNIDADES.map(u => { const t = totalesDe(RESULTADOS_AGO, u.k); return {n:u.k==='EMP'?'Empresa':u.n.replace('Tienda ',''), v:t.utilidad, malo:t.utilidad<0, maloTxt:'pierde',
    tip:`<b>${u.n}</b><br>Ventas ${S(t.ventas)} · Margen ${S(t.margen)}<br>Gastos ${S(t.gastos)}${t.absorbido?` · Absorbido ${S(t.absorbido)}`:''}`}; });

  return `
  ${cabecera({sobre:'Finanzas · Resumen', titulo:'Septiembre, al jueves 24', bajada:'Lo que miras primero cada día. Todo sale de lo que ya registran Ventas, Caja, Compras, Producción y Dynamic.',
    acciones:`<button class="btn btn-secundario" data-ir="reportes">Ver reportes</button>`})}
  <section class="cifras cinco">
    <div class="tile anim-sube"><div class="fila-top"><span class="etq">Vendido en el mes</span></div><div class="valor">${S(sep.ventas)}</div>
      <div class="det">TRU ${S(resultadosDe('2026-09').ventas.TRU)} · AQP ${S(resultadosDe('2026-09').ventas.AQP)} · LIM ${S(resultadosDe('2026-09').ventas.LIM)}. Sin IGV.</div>${F('existe','venta_items')}</div>
    <div class="tile anim-sube"><div class="fila-top"><span class="etq">Plata disponible</span></div><div class="valor">${S(disponible())}</div>
      <div class="det">Bancos ${S(38420+12880)} · cajones ${S(5900)} · tarjeta por abonar ${S(2310)}</div>${F('nuevo','cuentas_dinero + movimientos')}</div>
    <div class="tile anim-sube"><div class="fila-top"><span class="etq">Debes en 7 días</span></div><div class="valor ${debe7>disponible()?'rojo':''}">${S(debe7)}</div>
      <div class="det">Incluye la planilla del 30 (${S(29800)}) y ${vencidas.length} factura vencida.</div>${F('deriva','compras + comprobantes_produccion + Dynamic')}</div>
    <div class="tile anim-sube"><div class="fila-top"><span class="etq">Utilidad de agosto</span><span class="badge" data-tono="taupe">parcial</span></div><div class="valor">${S(ago.utilidad)}</div>
      <div class="det">Margen bruto ${pct(ago.margen/ago.ventas)}. LIM, Taller y Empresa aún sin cerrar.</div>${F('deriva','fn_estado_resultados')}</div>
    <div class="tile anim-sube"><div class="fila-top"><span class="etq">IGV estimado de sept.</span></div><div class="valor">${S(igvSep)}</div>
      <div class="det">Se paga en octubre según tu cronograma de SUNAT.</div>${F('deriva','comprobantes − facturas de proveedor')}</div>
  </section>

  <section class="dos-col">
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>Para decidir hoy</h2><p>Ordenado por lo que más cuesta si se deja pasar.</p></div></div>
      <ul class="decidir">${decidir.map(x=>`<li><span class="punto" data-tono="${x.tono}"></span><div><b>${x.t}</b><p>${x.d}</p></div><button class="btn btn-sutil btn-sm" data-ir="${x.ir}">${x.b}</button></li>`).join('')}</ul>
    </div>
    <div class="columna">
      <div class="superficie pad anim-sube">
        <div class="prioridades-cab"><div><h2>Utilidad por unidad · agosto</h2><p>Quién sostiene a quién. Pasa el mouse por una barra.</p></div></div>
        ${barras(porUnidad, {alto:210})}
        ${F('deriva','fn_estado_resultados por unidad')}
      </div>
      <div class="superficie pad anim-sube">
        <div class="prioridades-cab"><div><h2>Saldo de las próximas 6 semanas</h2><p>Lo que hay hoy + lo que entra − lo que vence.</p></div></div>
        ${barras(proy.map(w=>({n:w.s.split(' – ')[0], v:w.saldo, malo:w.saldo<MINIMO_CAJA, maloTxt:'bajo el mínimo', tip:`<b>${w.s}</b><br>Entra ${S(w.entra)} · Sale ${S(w.sale)}<br>${esc(w.que)}`})), {alto:200, umbral:MINIMO_CAJA, umbralTxt:'mínimo de caja '+S(MINIMO_CAJA)})}
      </div>
    </div>
  </section>
  <div class="nota-cayla">La utilidad de agosto dice «parcial» porque LIM, el Taller y lo de la empresa aún no cierran el mes: sus números todavía pueden cambiar. TRU y AQP ya están congelados (ver <button class="btn-enlace" data-ir="cierre">Cierre de mes</button>).</div>`;
};
