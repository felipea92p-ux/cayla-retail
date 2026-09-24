// ============ Reportes (piezas 7, 8 y 9) ============
VISTAS.reportes = () => {
  const tab = tabActual('reportes','resultados');
  const cuerpo = {resultados:vistaResultados, flujo:vistaFlujo, balance:vistaBalance}[tab]();
  return `${cabecera({sobre:'Finanzas · Reportes', titulo:{resultados:'¿Ganamos?', flujo:'¿Por qué vendí bien y no hay plata?', balance:'¿Cuánto vale CAYLA?'}[tab],
    bajada:'Los tres estados salen solos del diario que arma el sistema con cada venta, compra, gasto y movimiento de caja (ADR-0109). Nadie escribe un asiento.',
    acciones:`<button class="btn btn-secundario" data-accion="exportar">Descargar Excel</button>`})}
    ${pestanas('reportes', [['resultados','Estado de resultados'],['flujo','Flujo de caja'],['balance','Balance']])}${cuerpo}`;
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
  const cols = [...UNIDADES.map(u=>u.k), 'CONS'];
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
  let saldo = disponible(); const proy = FLUJO_SEMANAS.map(w => { saldo += w.entra - w.sale; return {...w, saldo}; });
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
      ${barras(proy.map(w=>({n:w.s.split(' – ')[0], v:w.saldo, malo:w.saldo<MINIMO_CAJA, maloTxt:'bajo el mínimo', tip:`<b>${w.s}</b><br>Entra ${S(w.entra)} · Sale ${S(w.sale)}<br>${esc(w.que)}`})), {alto:230, umbral:MINIMO_CAJA, umbralTxt:'mínimo de caja '+S(MINIMO_CAJA)+' (lo defines tú)'})}
      <div class="tabla-wrap" style="margin-top:12px"><table class="t" style="min-width:560px"><thead><tr><th>Semana</th><th class="num">Entra</th><th class="num">Sale</th><th class="num">Queda</th><th>Qué vence</th></tr></thead>
        <tbody>${proy.map(w=>`<tr><td data-l="Semana">${w.s}</td><td class="num" data-l="Entra">${S(w.entra)}</td><td class="num" data-l="Sale">${S(w.sale)}</td><td class="num" data-l="Queda"><b style="${w.saldo<MINIMO_CAJA?'color:var(--rojo-profundo)':''}">${S(w.saldo)}</b></td><td data-l="Qué vence" class="sub" style="font-size:12.5px">${esc(w.que)}</td></tr>`).join('')}</tbody></table></div>
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
    ${F('nuevo','fn_conciliacion_contable (ADR-0109)')}
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
