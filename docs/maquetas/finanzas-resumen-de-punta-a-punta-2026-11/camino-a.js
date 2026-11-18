/* Camino A · «Bolsillos» — la plata contada como en la app del banco.
   La primera pregunta es la de cualquiera que abre su banco: ¿cuánto tengo y cuánto puedo usar? La plata se parte en bolsillos con
   nombre («Para el equipo», «Para SUNAT»…), como las cajitas de Nubank, la carpeta de impuestos de Square o los sobres de Relay; lo
   que viene se lee como «Próximos» y lo que pasó, como la lista de movimientos de tu banco. El mes (lo que te deja) va al lado. */
(function () {
  "use strict";
  const C = window.CAYLA, Z = window.PZ, H = window.HOJAS;
  const { ico, S, cifra, delta } = Z;

  /* ---------- los bolsillos: en qué se reparte lo que tienes ---------- */
  function bolsillos(m) {
    const p = m.plata;
    if (!p.enCurso || !m.todas) return [];
    const en14 = p.en14;
    const de = (tipos) => C.suma(en14.filter((x) => tipos.includes(x.tipo)).map((x) => x.monto));
    const prox = (tipos) => en14.filter((x) => tipos.includes(x.tipo)).sort((a, b) => a.fecha - b.fecha)[0];
    const b = [
      { id: "libre", nombre: "Libre para usar", v: p.libre, c: "var(--verde)", icono: "billetera", nota: "Sin dejar de pagar nada", hoja: "plata" },
      { id: "equipo", nombre: "Para el equipo", v: de(["equipo"]), c: "var(--pizarra)", icono: "equipo", nota: `Quincena y CTS · ${prox(["equipo"]) ? `el ${prox(["equipo"]).fecha.getDate()}` : ""}`, hoja: "pagos" },
      { id: "sunat", nombre: "Para SUNAT", v: de(["sunat"]) + p.igvJuntando, c: "var(--r-terracota)", icono: "sunat", nota: `${S(de(["sunat"]))} vence el 18 · ${S(p.igvJuntando)} en diciembre`, hoja: "sunat" },
      { id: "prov", nombre: "Para proveedores", v: de(["proveedor"]), c: "var(--r-ocre)", icono: "recibo", nota: `${en14.filter((x) => x.tipo === "proveedor").length} facturas, una vencida`, hoja: "pagos" },
      { id: "recibos", nombre: "Recibos", v: de(["servicio", "otro", "alquiler"]), c: "var(--neutro)", icono: "rayo", nota: "Luz, agua e internet", hoja: "pagos" },
      { id: "claudia", nombre: "De CLAURE", v: p.deClaudia, c: "var(--sede-lim)", icono: "tienda", nota: "Lo que Claudia vendió en Lima: no es de CAYLA", hoja: "plata" },
    ];
    return b.filter((x) => x.v > 0.5);
  }

  /* ---------- los movimientos: lo que entró y salió, día por día (como tu banco) ---------- */
  const PAGADOS = [
    { dia: 1, concepto: "Alquiler de Trujillo", detalle: "Noviembre", monto: 6500, sede: "tru", tipo: "alquiler" },
    { dia: 1, concepto: "Alquiler de Arequipa", detalle: "Noviembre", monto: 5800, sede: "aqp", tipo: "alquiler" },
    { dia: 1, concepto: "Alquiler de Lima", detalle: "Noviembre", monto: 7200, sede: "lim", tipo: "alquiler" },
    { dia: 3, concepto: "Factura de Telas del Norte", detalle: "F002-2350 · pagada", monto: 4120, tipo: "proveedor" },
    { dia: 4, concepto: "Estudio contable", detalle: "Octubre", monto: 1650, tipo: "otro" },
    { dia: 5, concepto: "Anuncios en Instagram", detalle: "Semana del 5", monto: 640, tipo: "otro" },
    { dia: 6, concepto: "A Claudia (CLAURE)", detalle: "Lo que vendió en octubre", monto: 2300, tipo: "claudia", neutro: true },
    { dia: 7, concepto: "Bolsas y papel de seda", detalle: "Para Black Friday", monto: 380, tipo: "otro", sede: "tru" },
    { dia: 2, concepto: "De la caja de Trujillo al BCP", detalle: "Depósito · entre tus cuentas", monto: 3200, tipo: "mover", neutro: true, sede: "tru" },
    { dia: 5, concepto: "De la caja de Arequipa al BCP", detalle: "Depósito · entre tus cuentas", monto: 2650, tipo: "mover", neutro: true, sede: "aqp" },
  ];
  function movimientos(m) {
    const dias = [];
    const hoyD = m.mes.diaHoy;
    for (let d = hoyD; d >= Math.max(1, hoyD - 5); d--) {
      const fila = m.diario[d - 1];
      const items = [];
      if (fila.venta > 0) {
        const partes = m.todas ? C.CLAVES_SEDE.map((s) => `${C.SEDES[s].corto} ${Z.SC(fila.porSede[s])}`).join(" · ") : `ticket promedio ${S(fila.venta / fila.tickets)}`;
        items.push({ ico: "venta", c: "var(--verde)", titulo: d === hoyD && m.mes.enCurso ? "Ventas de hoy, hasta ahora" : "Ventas del día", sub: `${fila.tickets} ventas · ${partes}`, monto: fila.venta, signo: "+", hoja: "ventas" });
      }
      if (m.mes.enCurso) PAGADOS.filter((x) => x.dia === d && (m.todas || x.sede === m.sede)).forEach((x) => {
        items.push({ ico: x.tipo === "mover" ? "camino" : x.tipo === "claudia" ? "tienda" : H.ICO_PAGO[x.tipo === "otro" ? "otro" : x.tipo]?.[0] || "recibo", c: x.neutro ? "var(--sec)" : "var(--tinta)",
          titulo: x.concepto, sub: x.detalle, monto: x.monto, signo: x.neutro ? "" : "−", neutro: x.neutro, hoja: x.tipo === "mover" || x.tipo === "claudia" ? "plata" : "gastos" });
      });
      const neto = C.suma(items.map((x) => (x.signo === "+" ? x.monto : x.signo === "−" ? -x.monto : 0)));
      dias.push({ fecha: fila.fecha, items, neto });
    }
    return dias;
  }
  function nombreDia(f) {
    const n = Math.round((C.HOY - f) / 86400000);
    const base = `${C.NOMBRE_DIA[f.getDay()]} ${f.getDate()}`;
    return n === 0 ? `Hoy · ${base}` : n === 1 ? `Ayer · ${base}` : base[0].toUpperCase() + base.slice(1);
  }

  /* ---------- el camino ---------- */
  function frase(m) {
    if (!m.mes.enCurso) return `${m.mes.nombre[0].toUpperCase() + m.mes.nombre.slice(1)} ${m.teDeja.mes >= 0 ? "te dejó" : "te faltó"} <b>${S(Math.abs(m.teDeja.mes))}</b>. Vendiste ${S(m.ventas.hoy)} y el mes costó ${S(m.gastos.totalMes)}.`;
    if (!m.todas) return `En la tienda hay <b>${S(m.plata.tienes)}</b>. ${m.nombreSede} vendió ${S(m.ventas.hoy)}, ${Math.abs(m.ventas.cambio) < 0.01 ? "lo mismo que" : m.ventas.cambio > 0 ? `${C.pct(m.ventas.cambio)} más que` : `${C.pct(-m.ventas.cambio)} menos que`} a esta altura de octubre.`;
    return `Tienes ${S(m.plata.tienes)} y puedes usar <b>${S(m.plata.libre)}</b> sin dejar de pagar nada. Al ritmo de hoy, noviembre te deja unos ${S(m.teDeja.mes)}.`;
  }

  function tarjetaSaldo(m) {
    const p = m.plata;
    if (!p.enCurso) {
      return `<section class="a-saldo vidrio entra" data-cifra="a-saldo"><div class="a-saldo-cab"><span class="etq">Al cierre de ${m.mes.nombre}</span><span class="chip verde">Mes cerrado</span></div>
        <div class="a-saldo-cifra">${cifra(p.tienes, { tam: "clamp(52px,7vw,104px)" })}</div>
        <p class="a-saldo-sub">Lo que había en bancos y cajas el ${C.partesMes(m.mes.clave).dias} de ${m.mes.nombre}. Los bolsillos solo se ven en el mes en curso.</p>
        <div class="a-saldo-pie"><button class="btn" data-mes-ir="${C.MES_HOY}">Ir a noviembre${ico("der", "ava")}</button></div></section>`;
    }
    if (!m.todas) {
      const ls = p.lugares;
      return `<section class="a-saldo vidrio entra" data-cifra="a-saldo-${m.sede}"><div class="a-saldo-cab"><span class="etq">En la tienda</span><button class="porque" data-hoja="plata"><span class="q">?</span>¿Y el banco?</button></div>
        <div class="a-saldo-cifra">${cifra(p.tienes, { tam: "clamp(52px,7vw,104px)" })}</div>
        <p class="a-saldo-sub">El efectivo de la caja y lo que el POS todavía no abona. La plata del banco es de toda la empresa: mírala con «Todas».</p>
        <div class="a-lugares">${ls.map((l) => `<div><span class="etq">${l.tipo === "caja" ? "En caja" : "Por llegar"}</span><b class="num">${S(l.monto, true)}</b><small>${l.nota}</small></div>`).join("")}</div></section>`;
    }
    const b = bolsillos(m);
    return `<section class="a-saldo vidrio entra" data-cifra="a-saldo">
      <div class="a-saldo-cab"><span class="etq">Libre para usar</span><button class="porque" data-hoja="plata"><span class="q">?</span>¿Cómo se calcula?</button></div>
      <div class="a-saldo-cifra">${cifra(p.libre, { tam: "clamp(56px,7.4vw,112px)" })}</div>
      <p class="a-saldo-sub">de <b class="num">${S(p.tienes)}</b> que tienes. Lo demás ya tiene dueño.</p>
      <div class="a-reparto">${Z.apilada(b.map((x) => ({ nombre: x.nombre, v: x.v, c: x.c })), { cls: "gruesa" })}
        <div class="a-reparto-ley"><span><i style="background:var(--verde)"></i>Libre</span><span>Lo demás, en sus bolsillos:</span></div></div>
      <ul class="a-bolsillos">${b.filter((x) => x.id !== "libre").map((x, k) => `<li><button class="a-bolsillo ${x.id === "libre" ? "es-libre" : ""}" data-hoja="${x.hoja}" style="--c:${x.c};--k:${k}">
          <span class="a-bol-ico">${ico(x.icono)}</span><span class="a-bol-txt"><span class="a-bol-nom">${x.nombre}</span><small>${x.nota}</small></span><b class="num">${S(x.v)}</b></button></li>`).join("")}</ul>
    </section>`;
  }

  function tarjetaMes(m) {
    const t = m.teDeja, enC = m.mes.enCurso, eq = m.equilibrio, v = m.ventas;
    const nombre = m.mes.nombre[0].toUpperCase() + m.mes.nombre.slice(1);
    const comp = t.antPunto != null && enC ? t.hoy - t.antPunto : null;
    return `<section class="a-mes vidrio pad entra tocable" data-hoja="deja" role="button" tabindex="0" data-cifra="a-mes">
      <div class="cab-sec" style="margin-bottom:6px"><h2 class="titulo-sec">${enC ? `${nombre} va así` : `Así cerró ${m.mes.nombre}`}</h2>${ico("der", "abre")}</div>
      <span class="etq">${enC ? "Te deja (estimado)" : t.mes >= 0 ? "Te dejó" : "Te faltó"}</span>
      <div style="margin:6px 0 4px">${cifra(t.mes, { tam: "clamp(40px,4vw,56px)" })}</div>
      <p class="bajada">${enC ? `Si el mes sigue así: puede quedar entre ${S(t.rango[0])} y ${S(t.rango[1])}. Hasta hoy te deja <b class="num" style="color:var(--tinta)">${S(t.hoy)}</b>: es poco porque los gastos fijos se cuentan desde el día 1 y las ventas llegan de a poco.` : `De cada S/ 100 vendidos, ${Math.max(0, t.porCien).toFixed(0)} fueron ganancia.`}</p>
      <dl class="a-tres">
        <div><dt>Vendiste</dt><dd class="num">${S(v.hoy)}</dd><dd>${delta(v.cambio, { contra: C.NOMBRE_MES[(m.mes.mes + 11) % 12] })}</dd></div>
        <div><dt>${enC ? "Gastos, hasta hoy" : "Gastaste"}</dt><dd class="num">${S(enC ? m.gastos.totalHoy : m.gastos.totalMes)}</dd><dd class="texto-sec" style="font-size:13px">${enC ? `de ${S(m.gastos.totalMes)} del mes` : `${Math.round((m.gastos.totalMes / v.mes) * 100)} de cada S/ 100`}</dd></div>
      </dl>
      <div class="a-eq"><p class="a-eq-txt">${eq.cubierto ? `Cubriste los gastos fijos el día <b>${eq.dia}</b>: desde ahí, cada venta es ganancia.` : `Llevas el <b>${Math.round(eq.avance * 100)} %</b> de lo que hay que vender para pagar el mes${eq.dia ? `; al ritmo de hoy lo cubres el <b>${eq.dia}</b>` : ", y a este ritmo no alcanza"}.`}</p>
        <div class="avance"><span style="width:${eq.avance * 100}%;--c:${eq.cubierto ? "var(--verde)" : "var(--tinta)"}"></span>${enC ? `<i class="marca" style="left:${(m.mes.diaHoy / m.mes.dias) * 100}%" title="Hoy"></i>` : ""}</div>
        ${enC ? `<small class="texto-sec" style="font-size:12.5px">La rayita marca hoy: día ${m.mes.diaHoy} de ${m.mes.dias}.${t.antMes != null ? ` Octubre cerró con ${S(t.antMes)}.` : ""}</small>` : ""}</div>
    </section>`;
  }

  function preguntas(m) {
    if (!m.mes.enCurso) return "";
    const qs = m.todas
      ? [["¿Puedo comprar mercadería?", "plata"], ["¿Cuánto le debo a SUNAT?", "sunat"], ["¿Gané plata este mes?", "deja"], ["¿Qué tienda vende más?", "ventas"], ["¿En qué se va la plata?", "gastos"]]
      : [["¿Cómo le va a esta tienda?", `sede-${m.sede}`], ["¿Cuánto vendió hoy?", "ventas"], ["¿Qué paga esta tienda?", "pagos"]];
    return `<div class="a-preguntas entra" role="list" aria-label="Lo que más se pregunta">${qs.map(([q, h]) => `<button class="a-preg" role="listitem" data-hoja="${h}">${q}</button>`).join("")}</div>`;
  }

  function avisosHtml(m) {
    if (!m.avisos.length) return "";
    return `<section class="vidrio pad entra"><div class="cab-sec"><h2 class="titulo-sec">Hoy te toca<span class="globo">${m.avisos.length}</span></h2></div>
      <div class="avisos">${m.avisos.map((a) => `<button class="aviso-fila ${a.tono}" data-hoja="${a.hoja}"><span class="punto-tono"></span><span class="aviso-txt"><b>${a.titulo}</b><small>${a.texto}</small></span>${ico("der", "abre")}</button>`).join("")}</div></section>`;
  }

  function proximos(m) {
    if (!m.mes.enCurso) {
      const h = m.historia.slice(-4);
      return `<section class="vidrio pad entra"><div class="cab-sec"><h2 class="titulo-sec">Mes a mes</h2></div>
        <div class="renglones">${h.map((x) => `<div class="renglon"><div class="que"><b style="text-transform:capitalize">${C.NOMBRE_MES[Number(x.clave.split("-")[1]) - 1]}</b><small>Vendiste ${S(x.venta)}</small></div><div class="monto">${S(x.teDeja)}<small>${x.proyectado ? "estimado" : x.teDeja >= 0 ? "te dejó" : "te faltó"}</small></div></div>`).join("")}</div></section>`;
    }
    const lista = m.pagos.filter((x) => !x.lejos && +x.fecha <= +C.HOY + 14 * 86400000);
    const min = m.plata.minimo;
    return `<section class="vidrio pad entra"><div class="cab-sec"><h2 class="titulo-sec">Próximos<span class="globo">${lista.length}</span></h2><button class="ver" data-hoja="pagos">Ver todo${ico("flecha")}</button></div>
      ${min ? `<div class="a-justo tocable" data-hoja="plata" role="button" tabindex="0"><div><span class="etq">El día más justo</span><b class="num">${C.NOMBRE_DIA[min.fecha.getDay()]} ${min.fecha.getDate()} · ${S(min.saldo)}</b><small>Lo que te quedaría tras la quincena, la CTS y SUNAT. Alcanza.</small></div>${Z.spark([m.plata.tienes - m.plata.deClaudia, ...m.plata.proy.slice(0, 14).map((x) => x.saldo)], { alto: 44 })}</div>` : ""}
      <ol class="a-prox">${lista.slice(0, 7).map((x) => {
        const [ic, c] = H.ICO_PAGO[x.tipo];
        return `<li><button class="a-prox-fila" data-hoja="${x.tipo === "sunat" ? "sunat" : "pagos"}"><span class="a-fecha ${x.vencida ? "vencida" : ""}"><b>${x.fecha.getDate()}</b><small>${C.NOMBRE_MES[x.fecha.getMonth()].slice(0, 3)}</small></span>
          <span class="que"><b>${x.concepto}</b><small>${x.vencida ? "Venció el viernes" : C.cuandoRel(x.fecha)[0].toUpperCase() + C.cuandoRel(x.fecha).slice(1)}</small></span><span class="num a-prox-m">−${S(x.monto)}</span></button></li>`;
      }).join("")}</ol>
      ${lista.length > 7 ? `<button class="btn chico" style="margin-top:10px" data-hoja="pagos">Ver ${lista.length - 7} más</button>` : ""}</section>`;
  }

  function feed(m) {
    if (!m.mes.enCurso) {
      /* un mes cerrado se cuenta por semanas */
      const semanas = [];
      for (let i = 0; i < m.diario.length; i += 7) {
        const xs = m.diario.slice(i, i + 7);
        semanas.push({ desde: xs[0].dia, hasta: xs[xs.length - 1].dia, v: C.suma(xs.map((d) => d.venta)), t: C.suma(xs.map((d) => d.tickets)) });
      }
      const max = Math.max(...semanas.map((s) => s.v));
      return `<section class="vidrio pad entra a-feed"><div class="cab-sec"><h2 class="titulo-sec">${m.mes.nombre[0].toUpperCase() + m.mes.nombre.slice(1)}, semana a semana</h2><button class="ver" data-hoja="ventas">Lo vendido${ico("flecha")}</button></div>
        <div class="renglones">${semanas.map((s) => `<div class="renglon"><span class="ico-redondo" style="--c:var(--verde)">${ico("venta")}</span><div class="que"><b>Del ${s.desde} al ${s.hasta}</b><small>${s.t} ventas</small><div class="avance fina" style="margin-top:6px;max-width:260px"><span style="width:${(s.v / max) * 100}%"></span></div></div><div class="monto">+${S(s.v)}</div></div>`).join("")}</div></section>`;
    }
    const dias = movimientos(m);
    return `<section class="vidrio pad entra a-feed"><div class="cab-sec"><h2 class="titulo-sec">Movimientos</h2><button class="ver" data-otra="Cuentas y dinero">Todos${ico("flecha")}</button></div>
      ${dias.map((d) => `<div class="a-dia"><div class="a-dia-cab"><span>${nombreDia(d.fecha)}</span><span class="num ${d.neto >= 0 ? "" : "texto-sec"}">${d.neto >= 0 ? "+" : "−"}${S(Math.abs(d.neto))}</span></div>
        ${d.items.map((x) => `<button class="a-mov" data-hoja="${x.hoja}"><span class="ico-redondo" style="--c:${x.c}">${ico(x.ico)}</span><span class="que"><b>${x.titulo}</b><small>${x.sub}</small></span><span class="num a-mov-m ${x.signo === "+" ? "entra-plata" : ""} ${x.neutro ? "neutro" : ""}">${x.signo}${S(x.monto)}</span></button>`).join("")}</div>`).join("")}
      <p class="nota" style="margin-top:14px">Los depósitos de una caja al banco y lo que le pasas a Claudia no son gasto: la plata solo cambia de lugar, o vuelve a su dueña.</p></section>`;
  }

  function tiendas(m) {
    if (!m.todas) return `<section class="vidrio pad entra tocable" data-hoja="sede-${m.sede}" role="button" tabindex="0"><div class="cab-sec"><h2 class="titulo-sec">${m.nombreSede}, día por día</h2>${ico("der", "abre")}</div>${Z.barrasDia(m, { alto: 96, leer: false })}</section>`;
    const s = Object.entries(m.porSede);
    return `<section class="vidrio pad entra"><div class="cab-sec"><h2 class="titulo-sec">Tus tiendas</h2><span class="dato">${m.mes.enCurso ? "contra octubre a esta altura" : "contra el mes anterior"}</span></div>
      <div class="a-tiendas">${s.map(([k, x]) => `<button class="a-tienda" data-hoja="sede-${k}"><span class="a-tienda-nom"><i style="background:${H.COLOR_SEDE[k]}"></i>${C.SEDES[k].nombre}</span><span class="num a-tienda-v">${S(x.venta)}</span>${delta(x.cambio)}${Z.spark(x.diario, { alto: 30, color: H.COLOR_SEDE[k] })}</button>`).join("")}</div></section>`;
  }

  function render(m) {
    return `<div class="a-grid">
      <div class="a-col-izq"><div class="o1">${tarjetaSaldo(m)}</div><div class="o3">${preguntas(m)}</div><div class="o6">${feed(m)}</div></div>
      <div class="a-col-der"><div class="o2">${tarjetaMes(m)}</div><div class="o4">${avisosHtml(m)}</div><div class="o5">${proximos(m)}</div><div class="o7">${tiendas(m)}</div></div>
    </div>`;
  }

  window.CAMINOS = window.CAMINOS || {};
  window.CAMINOS.a = { frase, render };
})();
