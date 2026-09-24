// ============ Cálculos compartidos ============
// Septiembre «a la fecha» (24 de 30 días): lo variable se escala, lo fijo del mes ya está entero.
const FIJAS = ['alquiler','planilla','depreciacion','personal'];
const AVANCE_MES = 24/30;
function resultadosDe(mes){
  if (mes === '2026-08') return RESULTADOS_AGO;
  const r = {};
  for (const [k, fila] of Object.entries(RESULTADOS_AGO)){
    r[k] = {}; for (const u in fila) r[k][u] = Math.round(fila[u] * (FIJAS.includes(k) ? 1 : AVANCE_MES) * (k==='ventas'&&u==='LIM' ? 1.18 : 1));
  }
  return r;
}
const LINEAS_GASTO = [['planilla','Planilla (Dynamic)'],['alquiler','Alquileres'],['servicios','Servicios básicos'],['personal','Honorarios'],
  ['publicidad','Publicidad'],['transporte','Transporte'],['suministros','Suministros'],['mantenimiento','Mantenimiento'],['depreciacion','Depreciación']];
const TIENDAS = ['TRU','AQP','LIM'];
function totalesDe(r, u){
  const us = u ? [u] : UNIDADES.map(x=>x.k);
  const s = k => us.reduce((a,x)=>a+(r[k][x]||0), 0);
  const margen = s('ventas') - s('costo') - s('flete') - s('mermas');
  const gastos = LINEAS_GASTO.reduce((a,[k])=>a+s(k), 0);
  return {ventas:s('ventas'), margen, gastos, absorbido:s('absorbido'), utilidad: margen - gastos + s('absorbido')};
}
// Punto de equilibrio: cuánto hay que vender en el mes para cubrir los costos, con el margen que se tiene.
function equilibrio(u, r=RESULTADOS_AGO){
  const t = u ? totalesDe(r, u) : totalesDe(r);
  const fijos = t.gastos - t.absorbido, pm = t.ventas ? t.margen / t.ventas : 0;
  const pe = pm ? fijos / pm : null;
  const dia = pe ? Math.ceil(pe / (t.ventas / 31)) : null;
  return {pe, ventas:t.ventas, cubre: pe ? t.ventas / pe : 0, dia, pm, fijos};
}
// La tarjeta de crédito es deuda, no plata disponible.
const disponible = () => CUENTAS.filter(c=>c.tipo!=='credito' && (veUnidad(c.unidad||'EMP')||esLider())).reduce((a,c)=>a+c.saldo, 0);
const sumaTipo = (...ts) => CUENTAS.filter(c=>ts.includes(c.tipo)).reduce((a,c)=>a+c.saldo, 0);

// ---- Meta del día y fondo de caja: lo que rige en una tienda en una fecha (en la base: fn_parametros_caja) ----
const diaSemana = f => (new Date(f+'T12:00:00').getDay() + 6) % 7;   // 0 = lunes
// Las campañas que rigen en una tienda un día (con fechas y con efecto en caja para esa tienda).
const campanasDe = (u, f) => CAMPANAS.filter(c => c.desde && f >= c.desde && f <= c.hasta && c.caja && c.caja[u]);
// Si se cruzan varias, gana la mayor: la que más sube la meta y el fondo más alto (como el descuento de una prenda).
function parametrosCaja(u, f){
  const base = TIENDAS_CAJA[u]; if (!base) return null;
  const cs = campanasDe(u, f);
  const pct = cs.length ? Math.max(...cs.map(c => c.caja[u].pct)) : 0;
  const fondos = cs.map(c => c.caja[u].fondo).filter(v => v != null);
  const fondo = fondos.length ? Math.max(base.fondo, ...fondos) : base.fondo;
  const metaBase = base.metas[diaSemana(f)];
  const manda = cs.length ? cs.reduce((a,c) => c.caja[u].pct > a.caja[u].pct ? c : a) : null;   // la que fija la meta
  return {meta: Math.round(metaBase * (1 + pct/100)), metaBase, fondo, pct, campanas: cs, manda};
}
// Meta del mes = suma de las metas de cada día (una sola meta, no dos). Sin IGV para Finanzas.
function metaMes(u, mes='2026-09'){
  const [y,m] = mes.split('-').map(Number), n = new Date(y, m, 0).getDate(); let t = 0;
  for (let d=1; d<=n; d++){ const f = `${mes}-${String(d).padStart(2,'0')}`; const p = parametrosCaja(u, f); if (p) t += p.meta; }
  return Math.round(t / 1.18);
}
const saldoPorPagar = p => p.total - p.pagado;
const salidasDiarias = () => FLUJO_REAL.salidas.reduce((a,x)=>a+x[1],0) / 24;
// Proyección semana a semana. Con «retrasar Distribuidora Norte», su pago pasa a la semana siguiente.
function proyeccion(esc = {}){
  let saldo = disponible();
  const sem = FLUJO_SEMANAS.map(w=>({...w}));
  if (esc.retrasarNorte){ sem[2].sale -= 15300; sem[3].sale += 15300; }
  if (esc.ventasTodas){ sem.forEach(w=> w.entra = Math.round(w.entra * (1 + esc.ventasTodas/100))); }
  return sem.map(w => { saldo += w.entra - w.sale; return {...w, saldo}; });
}

// ============ Resumen (pieza 4) ============
VISTAS.resumen = () => {
  const todas = verTodas(), u = todas ? null : E.ver;
  const sep = resultadosDe('2026-09'), ago = RESULTADOS_AGO;
  const tAgo = u ? totalesDe(ago, u) : totalesDe(ago);
  const vendidoSep = u ? (sep.ventas[u]||0) : totalesDe(sep).ventas;
  const pp = POR_PAGAR.filter(p=>saldoPorPagar(p)>0 && enVista(p.u));
  const debe7 = pp.filter(p=>dias(p.vence, HOY) <= CONFIG.avisoVenceDias).reduce((a,p)=>a+saldoPorPagar(p),0) + (todas ? 29800 : 0);
  const vencidas = pp.filter(p=>dias(p.vence, HOY) < 0);
  const proy = proyeccion(), riesgo = proy.find(w => w.saldo < minimoCaja());
  const diasCaja = Math.floor(disponible() / salidasDiarias());
  const eq = equilibrio(u);
  const esTienda = !u || TIENDAS.includes(u);
  const metaVentas = u ? metaMes(u) : TIENDAS.reduce((a,x)=>a+metaMes(x),0);
  const proyVentas = Math.round(vendidoSep / AVANCE_MES);
  const efectivoU = u ? CUENTAS.filter(c=>c.unidad===u).reduce((a,c)=>a+c.saldo,0) : disponible();

  // ---- La salud, en frases (lo primero que se lee) ----
  const frases = [];
  if (todas){
    frases.push({n:`${diasCaja} días`, t:'Si mañana no vendieras nada, tu plata alcanza para pagar esto', d:`${S(disponible())} disponibles contra ${S(Math.round(salidasDiarias()))} que salen en un día normal.`, tono: diasCaja < 10 ? 'rojo' : diasCaja < 20 ? 'ambar' : 'verde'});
    frases.push({n:`día ${eq.dia}`, t:'CAYLA cubre sus costos del mes ese día', d:`Necesita vender ${S(eq.pe)} al mes; en agosto vendió ${S(eq.ventas)}. ${eq.dia >= 31 ? 'No alcanza a cubrirlos en el mes.' : `Lo que vende después ${31-eq.dia===1?'del día '+eq.dia+' (solo 1 día)':'(los últimos '+(31-eq.dia)+' días)'} es la ganancia.`}`, tono: eq.dia > 27 ? 'ambar' : 'verde'});
  } else if (esTienda){
    frases.push({n: eq.cubre >= 1 ? `día ${eq.dia}` : `${Math.round(eq.cubre*100)} %`, t: eq.cubre >= 1 ? `${nombreUnidad(u)} cubre sus costos del mes ese día` : `${nombreUnidad(u)} no llega a cubrir sus costos`,
      d:`Necesita vender ${S(eq.pe)} al mes para no perder; en agosto vendió ${S(eq.ventas)}.`, tono: eq.cubre < 1 ? 'rojo' : eq.dia > 25 ? 'ambar' : 'verde'});
    const alq = ago.alquiler[u] / ago.ventas[u];
    frases.push({n:pct(alq), t:'de lo que vende se va en alquiler', d: alq > .15 ? 'Por encima de lo que suele considerarse sano en tiendas de ropa (alrededor de 10–15 %). Es la palanca más grande que tiene.' : 'Dentro de lo que suele considerarse sano en tiendas de ropa (alrededor de 10–15 %).', tono: alq > .2 ? 'rojo' : alq > .15 ? 'ambar' : 'verde'});
  } else {
    frases.push({n:S(tAgo.gastos), t: u==='TAL' ? 'costó el Taller en agosto' : 'costó lo de la empresa en agosto', d: u==='TAL' ? `Sus prendas absorbieron ${S(tAgo.absorbido)}: quedaron ${S(tAgo.gastos - tAgo.absorbido)} sin entrar a ninguna prenda.` : 'Contador, publicidad, software y sueldo de oficina. Lo pagan las tiendas con su margen.', tono:'pizarra'});
  }
  if (todas) frases.push({n:pct(proyVentas/metaVentas), t:'de la meta de ventas de septiembre, al ritmo de hoy', d:`Meta ${S(metaVentas)}; vas en ${S(vendidoSep)} y al cierre llegarías a ${S(proyVentas)}.`, tono: proyVentas/metaVentas < .9 ? 'ambar' : 'verde'});

  // ---- Para decidir hoy: cada aviso dice cuánto está en juego y a dónde ir ----
  const lim = equilibrio('LIM');
  const decidir = [
    ...vencidas.map(p=>({tono:'rojo', t:`Factura vencida: ${p.prov}`, d:`Saldo ${S(saldoPorPagar(p))}, venció hace ${dias(HOY, p.vence)} días.`, imp:`${S(saldoPorPagar(p))} en juego`, ir:'dinero:porpagar', b:'Pagar'})),
    todas && riesgo && {tono:'ambar', t:`La semana del ${riesgo.s} quedas bajo tu mínimo de caja`, d:`Quedarías con ${S(riesgo.saldo)} (tu mínimo es ${S(minimoCaja())}). Pasar el pago a Distribuidora Norte una semana lo resuelve.`, imp:`faltan ${S(minimoCaja()-riesgo.saldo)}`, ir:'reportes:escenarios', b:'Probar escenario'},
    (todas || u==='LIM') && (() => { const e = escenarioResultado({alqLIM:5000, ventasLIM:15}); const antes = totalesDe(ago,'LIM').utilidad, despues = e.LIM.utilidad;
      return {tono:'ambar', t:`LIM pierde ${S(-antes)} al mes`, d:`Necesita vender ${S(lim.pe)} y vende ${S(lim.ventas)}. Con el alquiler a S/ 5,000 y 15 % más de ventas, ${despues>=0?'dejaría '+S(despues):'perdería '+S(-despues)} al mes.`, imp:`${S(despues-antes)} al mes de diferencia`, ir:'reportes:escenarios', b:'Probar escenario'}; })(),
    ...FIJOS.filter(f=>f.estado==='falta' && enVista(f.u)).map(f=>({tono:'ambar', t:`No se registró la ${f.n.toLowerCase()} de ${nombreUnidad(f.u)}`, d:`Suele llegar el día ${f.dia} por unos ${S(f.monto)}. Si no está, el resultado del mes sale mejor de lo que es.`, imp:`~${S(f.monto)}`, ir:'gastos:fijos', b:'Ver fijos'})),
    ...FIJOS.filter(f=>f.estado==='propuesto' && enVista(f.u)).slice(0,1).map(f=>({tono:'pizarra', t:`${FIJOS.filter(x=>x.estado==='propuesto'&&enVista(x.u)).length} gastos fijos listos para confirmar`, d:`Por ejemplo: ${f.n.toLowerCase()} de ${nombreUnidad(f.u)}, ${S(f.monto)}, vence el ${f.dia}. Se confirman con un clic.`, imp:'', ir:'gastos:fijos', b:'Confirmar'})),
    ...RAROS.filter(x=>x.u==null ? todas : enVista(x.u)).map(x=>({tono:'pizarra', t:x.t, d:x.d, imp:'', ir:x.ir, b:'Revisar', raro:true})),
    EGRESOS.some(e=>enVista(e.u)) && (n => ({tono:'pizarra', t:`${n} ${n===1?'egreso':'egresos'} de caja sin clasificar`, d:'Mientras no se diga si son gasto, depósito o retiro, no cuentan en ningún número.', imp:'', ir:'gastos:egresos', b:'Clasificar'}))(EGRESOS.filter(e=>enVista(e.u)).length),
    todas && Object.keys(E.parejas).length < EXTRACTO_IBK.length && {tono:'pizarra', t:'Interbank tiene 6 movimientos por confirmar', d:'El sistema ya propuso la pareja de cada uno. Confirmar toma un minuto.', imp:'', ir:'dinero:conciliacion', b:'Conciliar'},
    todas && (() => { const c = CAMPANAS.filter(x => x.desde && x.desde > HOY).sort((a,b)=>a.desde.localeCompare(b.desde))[0]; if (!c || dias(c.desde, HOY) > 14) return null;
      const need = c.dcto ? extraNecesario(c.dcto) : 0, sube = c.caja ? Math.max(...Object.values(c.caja).map(a=>a.pct)) : 0;
      return {tono: c.dcto && need > sube/100 ? 'ambar' : 'pizarra', t:`${c.n} empieza en ${dias(c.desde, HOY)} días`, d: c.dcto ? `Con ${c.dcto} % de descuento, para ganar lo mismo que un día normal hay que vender ${pct(need)} más; la meta sube ${sube} %. ${need > sube/100 ? 'Aunque se cumpla, dejaría menos margen.' : 'Si se cumple, deja más.'}` : `Sin descuento: la meta sube ${sube} % y el fondo de caja también.`, imp:'', ir:'reportes:campanas', b:'Ver campaña'}; })(),
    todas && {tono:'pizarra', t:`Vas al ${pct(VENTAS_12M/(300*UIT))} del límite de 300 UIT`, d:'Al cruzarlo, SUNAT exige libros electrónicos. A este ritmo, a mediados de 2027.', imp:'', ir:'impuestos', b:'Ver'},
  ].filter(Boolean);

  const coberturas = TIENDAS.filter(x=>todas).map(x=>{ const e = equilibrio(x); return {n:nombreUnidad(x).replace('Tienda ',''), v:Math.round(e.cubre*100), malo:e.cubre<1, maloTxt:'no cubre',
    tip:`<b>${nombreUnidad(x)}</b><br>Necesita ${S(e.pe)} · vendió ${S(e.ventas)}<br>${e.cubre>=1?'Cubre sus costos el día '+e.dia:'Le faltan '+S(e.pe-e.ventas)+' al mes'}`}; });

  return `
  ${cabecera({sobre:'Finanzas · Resumen', titulo: todas ? 'CAYLA, al jueves 24 de septiembre' : `${nombreUnidad(u)}, al jueves 24`,
    bajada: todas ? 'Cómo está el negocio y qué conviene decidir hoy. Todo sale de lo que ya registran Ventas, Caja, Compras, Producción y Dynamic.' : `Solo ${nombreUnidad(u)}. Para ver el negocio entero, elige «Todas las tiendas».`,
    acciones: filtroVer()})}
  <section class="salud anim-sube">${frases.map(f=>`<div class="frase" data-tono="${f.tono}"><b class="serif">${f.n}</b><div><p class="t">${f.t}</p><p class="d">${f.d}</p></div></div>`).join('')}</section>
  <section class="cifras cinco">
    <div class="tile anim-sube"><span class="etq">Vendido en el mes</span><div class="valor">${esTienda?S(vendidoSep):'—'}</div><div class="det">${todas?TIENDAS.map(x=>x+' '+S(sep.ventas[x])).join(' · '):'Sin IGV'}</div>${F('existe','venta_items')}</div>
    <div class="tile anim-sube"><span class="etq">${todas?'Plata disponible':'Efectivo en la tienda'}</span><div class="valor">${S(efectivoU)}</div><div class="det">${todas?`Bancos ${S(sumaTipo('banco'))} · cajones y cajas fuertes ${S(sumaTipo('cajon','caja_fuerte','rendir'))} · tarjeta por abonar ${S(sumaTipo('transito'))}`:'Cajón y caja fuerte. Los bancos son de CAYLA entera'}</div>${F('nuevo','cuentas_dinero + movimientos')}</div>
    <div class="tile anim-sube"><span class="etq">Debes en ${CONFIG.avisoVenceDias} días</span><div class="valor ${vencidas.length?'rojo':''}">${S(debe7)}</div><div class="det">${todas?'Incluye la planilla del 30. ':''}${vencidas.length} vencida${vencidas.length===1?'':'s'}</div>${F('deriva','compras + comprobantes_produccion')}</div>
    <div class="tile anim-sube"><span class="etq">Utilidad de agosto</span><div class="valor ${tAgo.utilidad<0?'rojo':''}">${S(tAgo.utilidad)}</div><div class="det">${tAgo.ventas?'Margen bruto '+pct(tAgo.margen/tAgo.ventas):'Unidad sin ventas propias'}</div>${F('deriva','fn_estado_resultados')}</div>
    ${todas ? `<div class="tile anim-sube"><span class="etq">IGV estimado de sept.</span><div class="valor">${S(IGV_MESES[5].deb-IGV_MESES[5].cred)}</div><div class="det">Se paga en octubre según tu cronograma</div>${F('deriva','comprobantes − facturas de proveedor')}</div>`
      : esTienda ? `<div class="tile anim-sube"><span class="etq">Meta de ventas</span><div class="valor">${pct(proyVentas/metaVentas)}</div><div class="det">Proyección al cierre ${S(proyVentas)} de ${S(metaVentas)}</div>${F('nuevo','presupuestos (Configuración)')}</div>`
      : `<div class="tile anim-sube"><span class="etq">${u==='TAL'?'Sin absorber en prendas':'Gastos de agosto'}</span><div class="valor">${S(u==='TAL'?tAgo.gastos-tAgo.absorbido:tAgo.gastos)}</div><div class="det">${u==='TAL'?'Costo del Taller que no entró a ninguna prenda':'Lo pagan las tiendas con su margen'}</div></div>`}
  </section>
  <section class="dos-col">
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>Para decidir hoy</h2><p>Primero lo que más cuesta si se deja pasar. Cada aviso dice cuánto está en juego.</p></div></div>
      <ul class="decidir">${decidir.slice(0, E.verMas ? 99 : 5).map(x=>`<li><span class="punto" data-tono="${x.tono}"></span><div><b>${x.t}</b>${x.raro?' <span class="badge sin-punto" data-tono="pizarra">fuera de lo normal</span>':''}<p>${x.d}</p>${x.imp?`<p class="impacto">${x.imp}</p>`:''}</div><button class="btn btn-sutil btn-sm" data-ir="${x.ir}">${x.b}</button></li>`).join('') || '<li><span></span><div><b>Nada urgente</b><p>No hay vencidas, faltantes ni nada fuera de lo normal.</p></div></li>'}</ul>
      ${decidir.length > 5 ? `<button class="btn btn-enlace" data-accion="ver-mas" style="margin-top:8px">${E.verMas ? 'Ver menos' : `Ver ${decidir.length-5} más`}</button>` : ''}
    </div>
    <div class="columna">
      ${todas ? `<div class="superficie pad anim-sube">
        <div class="prioridades-cab"><div><h2>¿Cada tienda cubre sus costos?</h2><p>Agosto: lo que vendió contra lo que necesitaba vender (100 %).</p></div></div>
        ${barras(coberturas, {alto:190, umbral:100, umbralTxt:'100 % = cubre sus costos justos', etiquetaValor:v=>v+' %'})}
        ${F('deriva','punto de equilibrio = gastos ÷ margen %')}
      </div>
      <div class="superficie pad anim-sube">
        <div class="prioridades-cab"><div><h2>Saldo de las próximas 6 semanas</h2><p>Lo que hay hoy + lo que entra − lo que vence.</p></div></div>
        ${barras(proy.map(w=>({n:w.s.split(' – ')[0], v:w.saldo, malo:w.saldo<minimoCaja(), maloTxt:'bajo el mínimo', tip:`<b>${w.s}</b><br>Entra ${S(w.entra)} · Sale ${S(w.sale)}<br>${esc(w.que)}`})), {alto:200, umbral:minimoCaja(), umbralTxt:'tu mínimo de caja: '+S(minimoCaja())+' (se cambia en Configuración)'})}
      </div>` : esTienda ? `<div class="superficie pad anim-sube">
        <div class="prioridades-cab"><div><h2>Camino al punto de equilibrio</h2><p>Septiembre al día 24 contra lo que necesita vender en el mes.</p></div></div>
        <div class="umbral-barra alto" role="img" aria-label="${pct(vendidoSep/eq.pe)} del punto de equilibrio"><i style="width:${Math.min(100, vendidoSep/eq.pe*100)}%"></i></div>
        <div class="marcas"><span>Vendido ${S(vendidoSep)}</span><span>Necesita ${S(eq.pe)}</span></div>
        <p class="sub" style="font-size:13px;margin:12px 0 0">${vendidoSep >= eq.pe ? `Ya cubrió los costos del mes: desde aquí, cada sol de margen es ganancia.` : `Le faltan ${S(eq.pe - vendidoSep)} en 6 días: unos ${S((eq.pe - vendidoSep)/6)} diarios. Hoy vende ${S(vendidoSep/24)} al día.`}</p>
      </div>
      <div class="superficie pad anim-sube"><div class="prioridades-cab"><div><h2>Presupuesto del mes</h2><p>Gastado a la fecha contra su tope; el % es la proyección al cierre.</p></div><button class="btn btn-sutil btn-sm" data-ir="reportes:presupuesto">Ver todo</button></div>${miniPresupuesto(u)}</div>`
      : `<div class="nota-cayla">${u==='TAL'?'El Taller no vende: lo que cuesta se pega a cada prenda (D-31). Se mide por lo que quedó sin absorber y por el costo de cada prenda (Producción ▸ Eficiencia).':'Lo de la empresa no es de ninguna tienda y no se reparte (D-32). Las tiendas lo pagan con su margen: por eso el punto de equilibrio de CAYLA entera es más alto que la suma de las tiendas.'}</div>`}
    </div>
  </section>`;
};

function miniPresupuesto(u){
  const sep = resultadosDe('2026-09');
  const filas = Object.entries(PRESUPUESTO.gastos).filter(([k,m])=>m[u]).map(([k,m])=>{ const real = sep[k]?.[u]||0, proy = FIJAS.includes(k) ? real : Math.round(real/AVANCE_MES); return {n:cat(k)?.n||k, meta:m[u], real, p:proy/m[u]}; });
  return `<ul class="lista-mov" style="margin:0">${filas.map(f=>`<li>${f.n}<span>${S(f.real)} de ${S(f.meta)} · <b style="color:${f.p>1.05?'var(--rojo-profundo)':f.p>1?'var(--ambar)':'var(--verde)'}">${pct(f.p)}</b></span></li>`).join('')}</ul>`;
}
