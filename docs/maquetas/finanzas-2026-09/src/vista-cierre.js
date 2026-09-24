// ============ Cierre de mes (pieza 11) ============
E.unidadCierre = 'LIM';
function chequeosDe(u){
  const egresoLIM = EGRESOS.some(e=>e.mes==='2026-08' && e.u===u);
  const base = {
    tienda: [
      {t:'Cajas del mes cerradas', d:'31 de 31 días con cierre', ok:true},
      {t:'Egresos de caja clasificados', d: egresoLIM ? 'Falta 1: «Depósito bancario» del 31 ago por S/ 2,300' : 'Todos dicen si son gasto, depósito o retiro', ok:!egresoLIM, ir:'gastos:egresos'},
      {t:'Depósitos del mes registrados', d:'Cada depósito tiene su voucher', ok:true},
      {t:'Conteo de las 20 prendas de más valor', d:'Hecho el 30 ago, sin diferencias', ok:true},
    ],
    taller: [
      {t:'Órdenes del mes cerradas o en curso', d:'4 cerradas, 2 en curso', ok:true},
      {t:'Insumos recibidos con su factura', d:'Sin recepciones sueltas', ok:true},
      {t:'Egresos del fondo fijo clasificados', d:'Todos clasificados', ok:true},
    ],
    empresa: [
      {t:'Bancos conciliados al fin de mes', d: E.conciliado.ibk!=null ? 'BCP e Interbank coinciden' : 'Interbank: faltan confirmar movimientos del extracto', ok:E.conciliado.ibk!=null, ir:'dinero:conciliacion'},
      {t:'Facturas de proveedor del mes registradas', d:'Revisa que no quede ninguna en el cajón', ok:true},
      {t:'Planilla de agosto leída de Dynamic', d:'Período cerrado en Dynamic el 1 sep', ok:true},
    ],
  }[UNIDADES.find(x=>x.k===u).tipo];
  return [...base, {t:'El diario de la unidad cuadra', d:'Debe = haber en todas las líneas', ok:true}];
}

VISTAS.cierre = () => {
  const mes = E.mesCierre, est = CIERRE[mes] || {};
  const todas = UNIDADES.every(u=>est[u.k]?.c);
  const consolidado = est.CONS;
  const u = E.unidadCierre, ch = chequeosDe(u), listo = ch.every(c=>c.ok), cerrada = est[u]?.c;
  return `
  ${cabecera({sobre:'Finanzas · Cierre de mes', titulo:'Cerrar ' + mesLargo(mes), bajada:'Cerrar un mes lo congela: nadie puede registrar ni cambiar nada con fecha de ese mes, y el diario queda guardado con su huella. Se cierra cada tienda y el Taller; CAYLA entera, cuando cerraron todas (ADR-0109).',
    acciones:`${filtroVer('empresa')}<select class="control" data-cambia="mesCierre"><option value="2026-07"${mes==='2026-07'?' selected':''}>Julio 2026</option><option value="2026-08"${mes==='2026-08'?' selected':''}>Agosto 2026</option></select>`})}
  <div class="matriz anim-sube">
    ${UNIDADES.map(x=>{ const s = est[x.k]||{}; return `<button class="unidad-c" data-accion="unidad-cierre" data-id="${x.k}" aria-pressed="${x.k===u}">
      <span class="n">${x.n}</span>${s.c?`<span class="badge" data-tono="verde">cerrado</span><span class="sub" style="font-size:12px">${fecha(s.f)} · ${s.por.split(' ')[0]}</span><span class="h">${s.hash}</span>`
      : `<span class="badge" data-tono="${chequeosDe(x.k).every(c=>c.ok)?'pizarra':'ambar'}">${chequeosDe(x.k).every(c=>c.ok)?'lista para cerrar':chequeosDe(x.k).filter(c=>!c.ok).length+' pendiente'}</span>`}
    </button>`; }).join('')}
    <div class="unidad-c consolidado"><span class="n">CAYLA entera</span>
      ${consolidado||mes==='2026-07'?`<span class="badge" data-tono="verde">cerrado</span><span class="h">${mes==='2026-07'?'f2c9…80d1':consolidado.hash}</span>`
        : todas ? `<button class="btn btn-primario btn-sm" data-accion="cerrar-cons">Cerrar ${MESES_L[+mes.slice(5)-1]}</button>`
        : `<span class="badge" data-tono="taupe">faltan ${UNIDADES.filter(x=>!est[x.k]?.c).length}</span><span class="sub" style="font-size:12px">Se habilita cuando cierran todas</span>`}
    </div>
  </div>
  <section class="dos-col izq">
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>${nombreUnidad(u)} · ${mesLargo(mes)}</h2><p>${cerrada?`Cerrado el ${fecha(est[u].f)} por ${est[u].por}.`:'Lo que el sistema revisa antes de dejarte cerrar.'}</p></div></div>
      <ul class="chequeos">${ch.map(c=>`<li><span class="ok-ic ${c.ok?'':'no-ic'}">${c.ok?'✓':'!'}</span><div><b>${c.t}</b><p>${c.d}</p></div>${!c.ok&&c.ir&&!cerrada?`<button class="btn btn-sutil btn-sm" data-ir="${c.ir}">Resolver</button>`:'<span></span>'}</li>`).join('')}</ul>
      <div class="botones" style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">
        ${cerrada ? `<button class="btn btn-sutil" data-accion="reabrir" data-id="${u}">Reabrir…</button>`
          : `<button class="btn btn-primario" data-accion="cerrar-unidad" data-id="${u}" ${listo?'':'disabled'}>Cerrar ${MESES_L[+mes.slice(5)-1]} de ${nombreUnidad(u).replace('Tienda ','')}</button>`}
      </div>
      ${F('nuevo','periodos + asientos (materializa fn_asientos con hash)')}
    </div>
    <div class="superficie pad anim-sube">
      <p class="etq">La rutina de fin de mes</p>
      <div class="pasos-cierre" style="grid-template-columns:1fr;gap:14px;margin-top:8px">
        <div><h3>Día 1 · cada tienda (20 min)</h3><p class="sub" style="margin:0;font-size:13px">Cerrar la última caja, registrar los depósitos que falten y contar las 20 prendas de más valor.</p></div>
        <div><h3>Día 2 · el líder (40 min)</h3><p class="sub" style="margin:0;font-size:13px">Revisar que estén todos los gastos y facturas, conciliar el banco y explicar cualquier diferencia de caja.</p></div>
        <div><h3>Día 3 · el sistema (5 min)</h3><p class="sub" style="margin:0;font-size:13px">Mirar los tres estados contra el mes anterior y cerrar. Desde ahí, el mes ya no cambia.</p></div>
      </div>
      <div class="nota-cayla" style="margin-top:14px">Solo el líder cierra y reabre (el módulo no se puede delegar). Reabrir pide motivo y queda en la historia; reabrir una tienda reabre también CAYLA entera.</div>
    </div>
  </section>`;
};

const huella = () => Math.random().toString(16).slice(2,6) + '…' + Math.random().toString(16).slice(2,6);
const ACCIONES_EXTRA = {
  'unidad-cierre': a => { E.unidadCierre = a.dataset.id; render(); },
  'cerrar-unidad': a => { const u = a.dataset.id;
    ventana(`<h3>Cerrar ${mesLargo(E.mesCierre)} de ${nombreUnidad(u)}</h3>
      <p class="bajada">Desde ahora nadie podrá registrar ni cambiar ventas, gastos, pagos ni movimientos de ${nombreUnidad(u)} con fecha de ese mes. Se guarda el diario con su huella.</p>
      ${comboResponsable()}<div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okCi">Cerrar el mes</button></div>`);
    $('#okCi').onclick = () => guardar(`${mesLargo(E.mesCierre)} de ${nombreUnidad(u)} quedó cerrado.`, () => { CIERRE[E.mesCierre][u] = {c:true, por:$('#fResp').value, f:HOY, hash:huella()}; const sig = UNIDADES.find(x=>!CIERRE[E.mesCierre][x.k]?.c); if (sig) E.unidadCierre = sig.k; }); },
  'cerrar-cons': () => { ventana(`<h3>Cerrar ${mesLargo(E.mesCierre)} de CAYLA entera</h3><p class="bajada">Todas las unidades ya cerraron. El consolidado queda congelado y es el que se le entrega al contador.</p>
      ${comboResponsable()}<div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okCc">Cerrar consolidado</button></div>`);
    $('#okCc').onclick = () => guardar(`${mesLargo(E.mesCierre)} de CAYLA quedó cerrado.`, () => { CIERRE[E.mesCierre].CONS = {c:true, hash:huella()}; }); },
  'reabrir': a => { const u = a.dataset.id;
    ventana(`<h3>Reabrir ${mesLargo(E.mesCierre)} de ${nombreUnidad(u)}</h3><p class="bajada">Los números de ese mes pueden volver a cambiar. Queda en la historia quién, cuándo y por qué.</p>
      <div class="campo"><label for="fMotR">Motivo (obligatorio)</label><input class="control" id="fMotR" placeholder="Ej. llegó una factura de agosto tarde"></div>${comboResponsable()}
      <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okRe">Reabrir</button></div>`);
    $('#okRe').onclick = () => { if (!$('#fMotR').value.trim()){ $('#fMotR').focus(); $('#fMotR').style.borderColor='var(--rojo)'; return; }
      guardar('Mes reabierto. El motivo quedó en la historia.', () => { CIERRE[E.mesCierre][u] = {c:false}; delete CIERRE[E.mesCierre].CONS; }); }; },
  'origen': a => modalOrigen(a.dataset.id),
  'confirmar-fijo': a => { const f = FIJOS.find(x=>x.id===a.dataset.id); confirmarFijo(f, f.monto); },
  'fijo-variable': a => { const f = FIJOS.find(x=>x.id===a.dataset.id);
    ventana(`<h3>${f.n} de ${nombreUnidad(f.u)}</h3><p class="bajada">${esc(f.prov)}. Es un monto variable: escribe el del recibo. Su promedio es ${S(f.monto)}.</p>
      <div class="campo"><label for="fvM">Monto del recibo</label><input class="control" id="fvM" value="${f.monto}"></div>${comboResponsable()}
      <div class="botones"><button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn btn-primario" id="okFv">Registrar</button></div>`);
    $('#okFv').onclick = () => confirmarFijo(f, +$('#fvM').value || f.monto); },
  'marcar-fijo': a => { const d = DETECTADOS.find(x=>x.id===a.dataset.id); guardar(`${d.prov} quedó como gasto fijo.`, () => { DETECTADOS.splice(DETECTADOS.indexOf(d),1); FIJOS.push({id:'f'+Date.now(), n:cat(d.c).n, u:d.u, c:d.c, prov:d.prov, monto:d.monto, dia:20, cuenta:'bcp', estado:'registrado'}); }); },
  'no-fijo': a => { const d = DETECTADOS.find(x=>x.id===a.dataset.id); DETECTADOS.splice(DETECTADOS.indexOf(d),1); render(); avisar('Listo: no se volverá a proponer.'); },
  'pareja': a => { E.parejas[a.dataset.id] = 'ok'; render(); },
  'parejas-todas': () => { EXTRACTO_IBK.filter(x=>x.pareja).forEach(x=>E.parejas[x.id]='ok'); render(); avisar('Parejas confirmadas.'); },
  'pareja-gasto': a => { const x = EXTRACTO_IBK.find(y=>y.id===a.dataset.id);
    guardar('Comisión registrada como gasto de la empresa.', () => { E.parejas[x.id]='gasto'; GASTOS.forEach(g=>g.nuevo=false); GASTOS.unshift({id:Date.now(), f:x.f, u:'EMP', c:'comisiones', d:'Comisión de mantenimiento Interbank', prov:'Interbank', comp:'Sin comprobante', num:'', total:-x.monto, igv:0, medio:'ibk', cond:'contado', estado:'pagado', nuevo:true}); }); },
  'ver-mas': () => { E.verMas = !E.verMas; render(); },
  'cerrar-caja': a => modalCerrarCaja(a.dataset.id),
  'ir-campanas': () => avisar('Las campañas se crean en Catálogo ▸ Etiquetas (fechas, descuento, categorías). Aparecen aquí solas para ponerles su efecto en la caja.'),
  'esc-reset': () => { E.escenario = {alqLIM:6200, ventasLIM:0, ventasTodas:0, cerrarLIM:false, retrasarNorte:false}; render(); },
  'exportar': () => avisar('En el sistema real se descarga el archivo. En el spike no se genera nada.'),
};
