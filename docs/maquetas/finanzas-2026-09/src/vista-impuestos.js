// ============ Impuestos (pieza 10) ============
VISTAS.impuestos = () => {
  const ago = IGV_MESES[4], neto = ago.deb - ago.cred;
  const umbral = 300 * UIT, av = VENTAS_12M / umbral;
  const boletas = GASTOS.filter(g=>g.estado!=='anulado'&&g.comp==='Boleta');
  return `
  ${cabecera({sobre:'Finanzas · Impuestos', titulo:'IGV de agosto', bajada:'Lo que cobraste de IGV al vender, menos lo que pagaste de IGV al comprar con factura. Los libros electrónicos los presenta el contador con el reporte de aquí (D-36).',
    acciones:`<button class="btn btn-secundario" data-accion="exportar">Registro de ventas</button><button class="btn btn-secundario" data-accion="exportar">Registro de compras</button><button class="btn btn-primario" data-accion="exportar">Paquete para el contador</button>`})}
  <section class="cifras">
    <div class="tile anim-sube"><span class="etq">IGV cobrado al vender</span><div class="valor">${S(ago.deb)}</div><div class="det">18 % de las ventas del mes, de los comprobantes emitidos</div>${F('existe','comprobantes')}</div>
    <div class="tile anim-sube"><span class="etq">IGV que descuentas</span><div class="valor">${S(ago.cred)}</div><div class="det">Facturas de mercadería, gastos, activos e insumos</div>${F('existe','compras.igv')} ${F('existe','comprobantes_produccion.igv')}</div>
    <div class="tile anim-sube"><span class="etq">IGV a pagar en septiembre</span><div class="valor">${S(neto)}</div><div class="det">Vence según el último dígito de tu RUC</div>${F('deriva','débito − crédito')}</div>
    <div class="tile anim-sube"><span class="etq">Pago a cuenta de renta</span><div class="valor">${S(975)}</div><div class="det">1 % de la venta neta. <b>Confirmar régimen con el contador</b></div>${F('nuevo','parametros_tributarios')}</div>
  </section>
  <section class="dos-col">
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>El límite de 300 UIT</h2><p>Al cruzarlo, SUNAT te exige llevar el Libro Diario y el Mayor electrónicos.</p></div><span class="badge" data-tono="ambar">${pct(av)}</span></div>
      <div class="umbral-barra" role="img" aria-label="${pct(av)} del límite"><i class="proy" style="width:92%"></i><i style="width:${av*100}%"></i></div>
      <div class="marcas"><span>S/ 0</span><span>Vendido en 12 meses: <b style="color:var(--tinta)">${S(VENTAS_12M)}</b></span><span>${S(umbral)}</span></div>
      <p class="sub" style="font-size:12.5px;margin:12px 0 0">La franja rayada es lo proyectado a diciembre. A este ritmo lo cruzas a <b style="color:var(--tinta)">mediados de 2027</b>: el diario del sistema ya se congela cada mes, así que llegar ahí no exige rehacer nada. UIT 2026 = ${S(UIT)} · <b>por confirmar con el contador</b>.</p>
    </div>
    <div class="superficie pad anim-sube">
      <div class="prioridades-cab"><div><h2>Para revisar antes de declarar</h2><p>Lo que puede hacer que pagues de más.</p></div></div>
      <ul class="decidir">
        <li><span class="punto" data-tono="ambar"></span><div><b>${boletas.length} ${boletas.length===1?'gasto':'gastos'} con boleta este mes</b><p>Una boleta no da IGV descontable. Si el proveedor emite factura, pídela: ${boletas.map(b=>esc(b.prov)).join(', ')}.</p></div><button class="btn btn-sutil btn-sm" data-ir="gastos">Ver gastos</button></li>
        <li><span class="punto" data-tono="pizarra"></span><div><b>2 ventas de agosto sin comprobante aceptado</b><p>El IGV se reconoce al vender, pero SUNAT debe tenerlos. Siguen reintentándose solos.</p></div><button class="btn btn-sutil btn-sm">Ver en Facturación</button></li>
        <li><span class="punto" data-tono="pizarra"></span><div><b>Recibos por honorarios: retención del 8 %</b><p>El contador define si CAYLA debe retener. Mientras tanto, se paga el total.</p></div></li>
      </ul>
    </div>
  </section>
  <div class="superficie anim-sube">
    <div class="herramientas"><b>Últimos 6 meses</b><span class="sub" style="font-size:12.5px">Septiembre (*) va a la fecha y todavía puede cambiar.</span></div>
    <div class="tabla-wrap"><table class="t" style="min-width:560px"><thead><tr><th>Mes</th><th class="num">IGV cobrado</th><th class="num">IGV descontado</th><th class="num">A pagar</th><th>Estado</th></tr></thead>
    <tbody>${IGV_MESES.map((m,i)=>`<tr><td data-l="Mes">${m.m}</td><td class="num" data-l="Cobrado">${S(m.deb)}</td><td class="num" data-l="Descontado">${S(m.cred)}</td><td class="num" data-l="A pagar"><b>${S(m.deb-m.cred)}</b></td>
      <td data-l="Estado">${i<4?'<span class="badge" data-tono="verde">declarado</span>':i===4?'<span class="badge" data-tono="ambar">por declarar</span>':'<span class="badge" data-tono="pizarra">en curso</span>'}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
};
