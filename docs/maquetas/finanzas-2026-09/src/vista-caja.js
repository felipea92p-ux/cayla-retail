// ============ Ventas ▸ Caja (cómo se ve lo de Finanzas en el módulo de la tienda) ============
// No es de Finanzas: muestra cómo la meta, el fondo y las cuentas llegan a la caja de la tienda.
E.fechaCaja = HOY;   // la demo deja simular un viernes de Navidad
const MEDIOS_TXT = {efectivo:'Efectivo', yape:'Yape', plin:'Plin', tarjeta:'Tarjeta', transferencia:'Transferencia'};

function cajaDe(u){
  const f = EFECTIVO.find(x=>x.u===u), hoy = HOY_CAJA[u], p = parametrosCaja(u, E.fechaCaja);
  const navidad = E.fechaCaja !== HOY;
  const factor = navidad ? 1 + (p.pct||0)/100 * 1.2 : 1;            // un día de campaña vende más
  const cobros = Object.fromEntries(Object.entries(hoy).map(([k,v])=>[k, Math.round(v*factor)]));
  const vendido = Object.values(cobros).reduce((a,v)=>a+v,0);
  const esperado = f.apertura + cobros.efectivo + f.ingresos - f.egresos;
  // ritmo: desde que abrió hasta ahora, proyectado a la hora de cierre
  const hm = s => { const [h,m] = s.split(':').map(Number); return h + m/60; };
  const horas = hm(HOY_CAJA.hora) - hm(f.abre), faltan = hm(TIENDAS_CAJA[u].cierra) - hm(HOY_CAJA.hora);
  const alCierre = Math.round(vendido + vendido/horas*faltan);
  return {f, p, cobros, vendido, esperado, alCierre};
}

VISTAS.caja = () => {
  const u = esLider() ? (TIENDAS.includes(E.sedeActiva) ? E.sedeActiva : 'TRU') : 'TRU';
  const c = cajaDe(u), p = c.p, falta = Math.max(0, p.meta - c.vendido), pctMeta = Math.min(100, c.vendido/p.meta*100);
  const medios = MEDIOS.find(m=>m.u===u);
  const demoFecha = `<label class="ver"><span class="etq">Demo · día</span><select class="control" style="min-width:min(360px, 70vw)" data-cambia="fechaCaja">
      <option value="${HOY}"${E.fechaCaja===HOY?' selected':''}>Hoy, jueves 24 sep (lo normal)</option>
      <option value="2026-10-02"${E.fechaCaja==='2026-10-02'?' selected':''}>Viernes 2 oct (Aniversario CAYLA)</option>
      <option value="2026-07-27"${E.fechaCaja==='2026-07-27'?' selected':''}>Lunes 27 jul (Fiestas Patrias + Día del Gato)</option>
      <option value="2026-12-11"${E.fechaCaja==='2026-12-11'?' selected':''}>Viernes 11 dic (Navidad)</option></select></label>`;
  return `
  ${cabecera({sobre:'Ventas · Caja', titulo:`Caja de ${nombreUnidad(u)}`, bajada:`Abierta a las ${c.f.abre} por ${c.f.por}. Así llega lo que se configura en Finanzas a la caja de la tienda: la meta, el fondo y a qué cuenta entra cada cobro.`,
    acciones:`${demoFecha}<button class="btn btn-secundario" type="button">Registrar movimiento</button><button class="btn btn-primario" data-accion="cerrar-caja" data-id="${u}">Cerrar caja</button>`})}
  <section class="superficie pad anim-sube meta-caja">
    <div class="prioridades-cab"><div><h2>Meta de hoy · ${S(p.meta)}</h2><p>${p.manda?`Lo normal de un ${DIAS_L[diaSemana(E.fechaCaja)]} es ${S(p.metaBase)}; por ${esc(p.manda.n)} sube ${p.pct} %.${p.campanas.length>1?` Rigen ${p.campanas.length} campañas (${p.campanas.map(c=>esc(c.n)).join(' y ')}): se usa la que más sube.`:''}`:`Lo normal de un ${DIAS_L[diaSemana(E.fechaCaja)]} en ${nombreUnidad(u)}. Hoy no rige ninguna campaña.`}</p></div>
      <span style="display:flex;gap:6px;flex-wrap:wrap">${p.campanas.map(c=>`<span class="badge" data-tono="ambar">${esc(c.n)}</span>`).join('')}</span></div>
    <div class="umbral-barra alto" role="img" aria-label="${Math.round(pctMeta)} % de la meta"><i style="width:${pctMeta}%"></i></div>
    <div class="meta-cifras">
      <div><span class="etq">Llevas</span><b class="serif">${S(c.vendido)}</b></div>
      <div><span class="etq">${falta?'Te faltan':'Meta cumplida'}</span><b class="serif" style="${falta?'':'color:var(--verde)'}">${falta?S(falta):'+'+S(c.vendido-p.meta)}</b></div>
      <div><span class="etq">Al ritmo de hoy cierras en</span><b class="serif">${S(c.alCierre)}</b><span class="sub" style="font-size:12px">${c.alCierre>=p.meta?'Llegas a la meta.':`Te quedarían ${S(p.meta-c.alCierre)} por vender. Son las ${HOY_CAJA.hora}; cierras a las ${TIENDAS_CAJA[u].cierra}.`}</span></div>
    </div>
    ${F('existe','ubicaciones.meta_venta_diaria (barra de hoy)')} ${F('nuevo','fn_parametros_caja: día de la semana + campañas')}
  </section>
  <section class="dos-col par">
    <div class="superficie anim-sube">
      <div class="herramientas"><b>Cobrado hoy y a dónde entró</b><span class="sub" style="font-size:12.5px">Nadie elige la cuenta al cobrar: sale de Configuración y se sella en cada cobro.</span></div>
      <div class="tabla-wrap"><table class="t" style="min-width:420px"><thead><tr><th>Medio</th><th>Entra a</th><th class="num">Monto</th></tr></thead>
      <tbody>${Object.entries(c.cobros).filter(([,v])=>v).map(([k,v])=>`<tr><td data-l="Medio"><span class="metodo" data-m="${k}"></span>${MEDIOS_TXT[k]}</td><td data-l="Entra a">${cuenta(medios[k]).n.replace(' · Cta. corriente','')}</td><td class="num" data-l="Monto">${S(v)}</td></tr>`).join('')}</tbody></table></div>
      ${F('nuevo','venta_pagos.cuenta_id (sellada al cobrar)')}
    </div>
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>Al cerrar</h2><p>Lo que el cierre te va a pedir.</p></div></div>
      <ul class="lista-mov" style="margin:0">
        <li>Debería haber en el cajón <b>${S(c.esperado)}</b></li>
        <li>Deja para el próximo turno <b>${S(p.fondo)}</b></li>
        <li>Lo demás se traslada <span>a la caja fuerte, al banco (eliges cuál) o al líder</span></li>
      </ul>
      <p class="sub" style="font-size:12.5px;margin:12px 0 0">${p.fondo>TIENDAS_CAJA[u].fondo?`El fondo sube a ${S(p.fondo)} por ${esc(p.campanas.filter(c=>c.caja[u].fondo===p.fondo).map(c=>c.n).join(' y '))}: hay más ventas en efectivo y se necesita más sencillo.`:'El fondo normal lo pone el líder en Configuración ▸ Tiendas y caja; cada campaña puede subirlo.'}</p>
    </div>
  </section>`;
};

function modalCerrarCaja(u){
  const c = cajaDe(u), p = c.p;
  ventana(`<h3>Cerrar caja de ${nombreUnidad(u)}</h3><p class="bajada">Cuenta el efectivo del cajón. Lo que no se traslada se queda para el próximo turno.</p>
    <div class="dos-campos"><div><span class="etq">Debería haber</span><div class="serif" style="font-size:26px">${S(c.esperado)}</div></div>
      <div class="campo"><label for="ccC">Contaste</label><input class="control" id="ccC" inputmode="decimal" value="${c.esperado}"></div></div>
    <div class="fondo-pide"><b>Deja ${S(p.fondo)} para el próximo turno</b><span>${p.fondo>TIENDAS_CAJA[u].fondo?'Por '+esc(p.campanas.filter(c=>c.caja[u].fondo===p.fondo).map(c=>c.n).join(' y ')):'Lo normal de '+nombreUnidad(u)}</span></div>
    <div class="dos-campos"><div class="campo"><label for="ccT">Trasladas</label><input class="control" id="ccT" inputmode="decimal" value="${Math.max(0, c.esperado - p.fondo)}"><span class="ayuda">Propuesto: lo contado menos el fondo.</span></div>
      <div class="campo"><label for="ccD">¿A dónde va?</label><select class="control" id="ccD" style="width:100%"><option value="fuerte">Caja fuerte de ${nombreUnidad(u).replace('Tienda ','')}</option><option value="banco">Depósito en el banco</option><option value="lider">Entregado al líder</option></select></div></div>
    <div class="campo" id="ccBanco" hidden><label for="ccB">¿A qué banco?</label><select class="control" id="ccB" style="width:100%">${CUENTAS.filter(x=>x.tipo==='banco').map(x=>`<option value="${x.id}">${x.n}</option>`).join('')}</select><span class="ayuda">Antes solo decía «banco». Ahora queda a qué cuenta llegó: la conciliación lo encuentra solo.</span></div>
    <div class="queda"><span>Queda en el cajón para el próximo turno</span><b class="serif" id="ccQ"></b></div>
    ${comboResponsable()}
    <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okCC">Cerrar caja</button></div>`, {ancho:560});
  const v = $('#velo');
  const queda = () => (parseFloat(v.querySelector('#ccC').value)||0) - (parseFloat(v.querySelector('#ccT').value)||0);
  const sync = () => { const q = queda(); const el = v.querySelector('#ccQ'); el.textContent = S(q); el.style.color = q < p.fondo ? 'var(--ambar)' : ''; v.querySelector('#ccBanco').hidden = v.querySelector('#ccD').value !== 'banco'; };
  v.addEventListener('input', sync); v.addEventListener('change', sync); sync();
  const cerrar = (menos) => { const q = queda(), destino = v.querySelector('#ccD').value, t = (parseFloat(v.querySelector('#ccT').value)||0);
    const idDestino = destino==='fuerte' ? 'f'+u : destino==='banco' ? v.querySelector('#ccB').value : 'rend';
    guardar(menos ? `Caja cerrada. Quedaron ${S(q)}, menos del fondo: el líder lo verá en Historial de cierres.` : 'Caja cerrada.', () => {
      if (t > 0 && E.fechaCaja === HOY){ MOV_DINERO.forEach(x=>x.nuevo=false); MOV_DINERO.unshift({f:HOY, tipo:'Traslado del cierre', de:'c'+u, a:idDestino, monto:t, ref:menos?'Dejó menos del fondo':'Cierre de caja', u, por:responsableDefecto(), nuevo:true});
        cuenta('c'+u).saldo -= t; cuenta(idDestino).saldo += t; }
    }); };
  $('#okCC').onclick = () => {
    const q = queda();
    if (q >= p.fondo) return cerrar(false);
    // Confirmación que NO bloquea: se puede cerrar igual.
    const conf = document.createElement('div'); conf.className = 'confirma';
    conf.innerHTML = `<b>Vas a dejar ${S(q)} y ${p.fondo>TIENDAS_CAJA[u].fondo?'la campaña':'lo normal'} pide ${S(p.fondo)}.</b><p>El próximo turno puede quedarse sin sencillo. Si cierras igual, queda anotado en el cierre.</p>
      <div class="botones" style="margin:10px 0 0"><button class="btn btn-secundario btn-sm" id="ccVolver">Volver y dejar ${S(p.fondo)}</button><button class="btn btn-primario btn-sm" id="ccIgual">Cerrar igual</button></div>`;
    v.querySelector('.confirma')?.remove(); v.querySelector('.botones').before(conf);
    conf.querySelector('#ccIgual').onclick = () => cerrar(true);
    conf.querySelector('#ccVolver').onclick = () => { v.querySelector('#ccT').value = Math.max(0, (parseFloat(v.querySelector('#ccC').value)||0) - p.fondo); sync(); conf.remove(); };
  };
}
