/* Camino B · «Tablero» — el pulso del mes, para leer en el escritorio de un vistazo.
   El héroe es «¿Ya pagaste el mes?» (ya existe en el Resumen) dibujado como lo dibuja un contador: lo que deja cada venta se va
   sumando hasta cruzar la raya de los gastos fijos; ese cruce es el día en que empiezas a ganar. Al lado, el veredicto. Debajo,
   ocho cifras que se abren, cada tienda junta (con «sueldos y alquiler» como parte de la venta, como Toast), en qué se va la plata
   y el mes en un calendario: lo que vendiste en los días que pasaron y lo que pagas en los que vienen.
   «Contra» elige con qué se compara: el mes pasado o el mismo mes del año pasado (Toast, Square), siempre al mismo punto. */
(function () {
  "use strict";
  const C = window.CAYLA, Z = window.PZ, H = window.HOJAS;
  const { ico, S, cifra, delta } = Z;
  let comp = "mes";

  function comparacion(m) {
    const corte = m.mes.diaHoy;
    const clave = comp === "mes" ? C.mesAnterior(m.mes.clave) : `${m.mes.anio - 1}-${String(m.mes.mes + 1).padStart(2, "0")}`;
    const p = C.punto(m.sede, clave, corte);
    p.etq = comp === "mes" ? p.nombre : `${p.nombre.slice(0, 3)}. ${p.anio}`;
    p.frase = comp === "mes" ? (m.mes.enCurso ? `a esta altura de ${p.nombre}` : p.nombre) : (m.mes.enCurso ? `a esta altura de ${p.nombre} ${p.anio}` : `${p.nombre} ${p.anio}`);
    return p;
  }

  function frase(m) {
    const p = comparacion(m), v = m.ventas;
    const cambio = v.hoy / p.venta - 1;
    const como = Math.abs(cambio) < 0.01 ? `casi lo mismo que ${p.frase}` : cambio > 0 ? `${C.pct(cambio)} más que ${p.frase}` : `${C.pct(-cambio)} menos que ${p.frase}`;
    const nom = m.mes.nombre[0].toUpperCase() + m.mes.nombre.slice(1);
    if (!m.mes.enCurso) return `${nom} cerró con <b>${S(m.teDeja.mes)}</b> ${m.teDeja.mes >= 0 ? "de ganancia" : "de pérdida"}. Vendiste ${S(v.hoy)}, ${como}.`;
    /* el veredicto compara mes contra mes (lo estimado de hoy contra lo que dejó el otro mes entero): una sola medida, sin contradecirse */
    const ref = p.teDeja, t = m.teDeja.mes;
    const va = t < 0 ? "va en contra" : t >= ref * 1.05 ? `va mejor que ${p.etq}` : t >= ref * 0.9 ? `va parecido a ${p.etq}` : `va por debajo de ${p.etq}`;
    return `${nom} ${va}: al ritmo de hoy te deja unos <b>${S(t)}</b>, y ${p.etq} dejó ${S(ref)}. Vendiste ${S(v.hoy)}, ${como}.`;
  }

  /* ---------- el héroe: ¿ya pagaste el mes? ---------- */
  function heroe(m) {
    const p = comparacion(m), eq = m.equilibrio, t = m.teDeja, enC = m.mes.enCurso;
    const n = m.mes.dias, hoy = m.mes.diaHoy;
    const real = m.curva.map((v, i) => (i < hoy ? v : null));
    const proy = m.curva.map((v, i) => (i >= hoy - 1 && enC ? v : null));
    const ref = p.curva.slice(0, n).concat(Array(Math.max(0, n - p.curva.length)).fill(null)).map((v, i) => (v == null && i > 0 ? p.curva[p.curva.length - 1] : v));
    const fij = eq.fijosMes;
    const marcas = [];
    if (eq.dia) marcas.push({ i: eq.dia - 1, y: m.curva[eq.dia - 1], etiqueta: eq.cubierto ? `Día ${eq.dia}: cubriste el mes` : `Día ${eq.dia}: empiezas a ganar`, color: "var(--verde)", relleno: "var(--verde)", r: 5 });
    if (enC) marcas.push({ i: hoy - 1, y: m.curva[hoy - 1], etiqueta: "Hoy", abajo: true });
    const ticks = [[0, "1"], [Math.round(n / 4), String(Math.round(n / 4) + 1)], [Math.round(n / 2), String(Math.round(n / 2) + 1)], [Math.round((3 * n) / 4), String(Math.round((3 * n) / 4) + 1)], [n - 1, String(n)]];
    const graf = Z.linea({
      n, alto: 300, aria: "Lo que dejan las ventas, sumado día a día, contra los gastos fijos del mes", padL: 4, padR: 4, padT: 26, inicio: hoy - 1,
      series: [{ vals: ref, clase: "ref" }, { vals: proy, clase: "proy" }, { vals: real, clase: "real", area: true }],
      lineas: [{ y: fij, etiqueta: `Gastos fijos del mes (sin los que varían) · ${S(fij)}`, color: "var(--tinta)", colorTexto: "var(--tinta)", izq: true }],
      marcas, ejeX: ticks,
      leer: (i) => {
        const d = i + 1, v = m.curva[i], pct = Math.min(999, Math.round((v / fij) * 100));
        const fut = enC && d > hoy;
        return { y: v, html: `<b>${pct >= 100 ? `Ya ganas ${S(v - fij)}` : `${pct} % del mes cubierto`}</b>${fut ? "Si sigue así, al" : "Al"} ${C.NOMBRE_DIA[new Date(m.mes.anio, m.mes.mes, d).getDay()]} ${d}: ${S(v)} de ${S(fij)}<small>${p.etq}: ${S(p.curva[Math.min(i, p.curva.length - 1)])}</small>` };
      },
    });
    const dif = t.mes - p.teDeja;
    const cambioV = m.ventas.hoy / p.venta - 1;
    const pctContrib = Math.round(m.contrib * 100);
    return `<section class="b-heroe vidrio entra" data-cifra="b-heroe">
      <div class="b-heroe-graf">
        <div class="b-heroe-cab"><div><h2 class="titulo-sec">¿Ya pagaste el mes?</h2><p class="bajada">Cada venta deja algo para pagar los gastos fijos. Cuando la línea cruza la raya, empiezas a ganar.</p></div>
          <div class="seg seg-chico" role="group" aria-label="Contra qué se compara"><button aria-pressed="${comp === "mes"}" data-comp="mes">Contra ${C.NOMBRE_MES[(m.mes.mes + 11) % 12]}</button><button aria-pressed="${comp === "anio"}" data-comp="anio">Contra el año pasado</button><span class="gota"></span></div></div>
        ${graf}
        <div class="leyenda"><span><i class="ley-l"></i>${enC ? "Hasta hoy" : m.mes.nombre[0].toUpperCase() + m.mes.nombre.slice(1)}</span>${enC ? `<span><i class="ley-l punteada"></i>Si sigue así</span>` : ""}<span><i class="ley-l ref"></i>${p.etq[0].toUpperCase() + p.etq.slice(1)}</span></div>
      </div>
      <aside class="b-veredicto">
        <span class="etq">${enC ? "Te deja (estimado)" : t.mes >= 0 ? "Te dejó" : "Te faltó"}</span>
        <div class="b-ver-cifra">${cifra(t.mes, { tam: "clamp(48px,4.4vw,72px)" })}</div>
        <p class="bajada">${enC ? `Entre ${S(t.rango[0])} y ${S(t.rango[1])}. Se afina cada día.` : `De cada S/ 100 que vendiste, ${Math.max(0, t.porCien).toFixed(0)} fueron ganancia.`}</p>
        <div class="b-ver-comp ${dif >= 0 ? "bien" : "mal"}">${ico(dif >= 0 ? "sube" : "baja")}<span><b>${S(Math.abs(dif))} ${dif >= 0 ? "más" : "menos"}</b> que todo ${p.etq}${enC ? ", si el mes sigue así" : ""} (${p.etq[0].toUpperCase() + p.etq.slice(1)} dejó ${S(p.teDeja)}).</span></div>
        <dl class="b-ver-dl">
          <div><dt>Vendiste</dt><dd><b class="num">${S(m.ventas.hoy)}</b>${delta(cambioV, { contra: p.frase })}</dd></div>
          <div><dt>De cada S/ 100 vendidos</dt><dd><b class="num">S/ ${pctContrib}</b><span class="texto-sec">quedan para los gastos</span></dd></div>
          <div><dt>${eq.cubierto ? "Cubriste el mes" : "Para pagar el mes hay que vender"}</dt><dd><b class="num">${eq.cubierto ? `el día ${eq.dia}` : S(eq.necesitas)}</b><span class="texto-sec">${eq.cubierto ? "" : `llevas el ${Math.round(eq.avance * 100)} %${eq.dia ? `; a tu ritmo, llegas el ${eq.dia}` : ""}`}</span></dd></div>
        </dl>
        <button class="btn" data-hoja="deja">La cuenta completa${ico("der", "ava")}</button>
      </aside>
    </section>`;
  }

  /* ---------- las ocho cifras ---------- */
  function cifras(m) {
    const p = comparacion(m), v = m.ventas, enC = m.mes.enCurso, pl = m.plata;
    const acum = (arr) => { let a = 0; return arr.map((x) => (a += x)); };
    const diasReal = m.diario.filter((d) => d.real);
    const margenPct = 1 - m.costo.hoy / v.sinIgvHoy;
    const t = [
      { h: "ventas", etq: "Vendiste", v: v.hoy, d: delta(v.hoy / p.venta - 1, { contra: p.etq }), sub: `${v.tickets} ventas · ticket ${S(v.ticketProm)}` },
      { h: "ventas", etq: "Cuántas ventas", txt: `${v.tickets}`, d: delta(v.tickets / p.tickets - 1, { contra: p.etq }), sub: `Contra ${p.tickets} ${p.frase}` },
      { h: "deja", etq: "Lo que queda de la ropa", txt: `${Math.round(margenPct * 100)}<span class="mon" style="margin-left:.35em">de cada 100</span>`, sub: "De cada S/ 100 que vendes sin el impuesto (IGV), lo que queda después de pagar la prenda", bar: margenPct },
      { h: "gastos", etq: enC ? "Gastos, hasta hoy" : "Gastaste", v: enC ? m.gastos.totalHoy : m.gastos.totalMes, sub: `${Math.round((m.gastos.totalMes / v.mes) * 100)} de cada S/ 100 vendidos · el mes: ${S(m.gastos.totalMes)}`, bar: (enC ? m.gastos.totalHoy : m.gastos.totalMes) / m.gastos.totalMes },
      pl.enCurso && m.todas ? { h: "plata", etq: "Libre para usar", v: pl.libre, sub: `De ${S(pl.tienes)} que tienes`, bar: pl.libre / pl.tienes, color: "var(--verde)" }
        : pl.enCurso ? { h: "plata", etq: "En la tienda", v: pl.tienes, sub: "Efectivo y POS por abonar" } : { h: "plata", etq: "Plata al cierre", v: pl.tienes, sub: "En bancos y cajas" },
      enC ? { h: "pagos", etq: "Pagas en 14 días", v: pl.pagos14, sub: `${pl.en14.length} pagos · el más grande: quincena el 15` } : { h: "pagos", etq: "Fijos del mes", v: m.gastos.fijosMes, sub: "Sueldos, alquiler, servicios" },
      { h: "sunat", etq: `SUNAT · lo de ${m.sunat.nombrePeriodo}`, v: m.sunat.pagar.total, sub: enC ? "IGV, renta y EsSalud · vence el miércoles 18" : "IGV, renta y EsSalud", alerta: enC },
      { h: "inventario", etq: "La ropa que tienes", v: m.inventario.total, sub: `A lo que te costó. Alcanza para vender unos ${m.inventario.cobertura.toFixed(1).replace(".", ",")} meses` },
    ];
    return `<div class="b-cifras">${t.map((x, k) => `<button class="b-cifra vidrio entra tocable" data-hoja="${x.h}" style="--i:${k + 1}" data-cifra="b-c${k}">
      <span class="b-cifra-cab"><span class="etq">${x.etq}</span>${x.alerta ? '<span class="chip ambar sin-punto">En 9 días</span>' : ico("der", "abre")}</span>
      <span class="b-cifra-v">${x.v != null ? cifra(x.v, { tam: "30px" }) : `<span class="cifra" style="font-size:30px">${x.txt}</span>`}</span>
      ${x.d ? `<span class="b-cifra-d">${x.d}</span>` : ""}
      <span class="b-cifra-sub">${x.sub}</span>
      ${x.sp ? `<span class="b-cifra-sp">${x.sp}</span>` : x.bar != null ? `<span class="b-cifra-sp"><span class="avance fina"><span style="width:${Math.max(0, Math.min(1, x.bar)) * 100}%;--c:${x.color || "var(--tinta)"}"></span></span></span>` : ""}
    </button>`).join("")}</div>`;
  }

  /* ---------- cada sede, junta ---------- */
  function sedes(m) {
    const base = m.todas ? m : C.modelo("todas", m.mes.clave);
    const filas = C.CLAVES_SEDE.map((s) => {
      const mm = C.modelo(s, m.mes.clave), x = base.porSede[s];
      return { s, x, mm, pctFijo: (mm.gastos.mes.sueldos + mm.gastos.mes.alquiler) / mm.ventas.mes, caja: mm.mes.enCurso ? mm.plata.tienes : null };
    });
    const max = Math.max(...filas.map((f) => f.x.venta));
    const gen = base.gastos.totalMes - C.suma(filas.map((f) => f.mm.gastos.totalMes));
    return `<section class="vidrio pad entra b-sedes"><div class="cab-sec"><div><h2 class="titulo-sec">Cada sede, junta</h2><p class="bajada">«Sueldos y alquiler» como parte de lo que vende: así se comparan tiendas de distinto tamaño.</p></div></div>
      <div class="b-tabla" role="table" aria-label="Cada sede">
        <div class="b-tr b-th" role="row"><span role="columnheader">Tienda</span><span role="columnheader">Vendió</span><span role="columnheader" class="der">${m.mes.enCurso ? "Contra octubre" : "Contra el anterior"}</span><span role="columnheader" class="der">Sueldos y alquiler</span><span role="columnheader" class="der">${m.mes.enCurso ? "Te deja (est.)" : "Te dejó"}</span><span role="columnheader" class="der">En caja</span><span></span></div>
        ${filas.map((f) => `<button class="b-tr ${!m.todas && f.s === m.sede ? "esta" : ""}" role="row" data-hoja="sede-${f.s}">
          <span class="b-td-n"><i style="background:${H.COLOR_SEDE[f.s]}"></i>${C.SEDES[f.s].nombre}</span>
          <span class="b-td-v"><b class="num">${S(f.x.venta)}</b><span class="avance fina"><span style="width:${(f.x.venta / max) * 100}%;--c:${H.COLOR_SEDE[f.s]}"></span></span></span>
          <span class="der">${delta(f.x.cambio)}</span>
          <span class="der"><span class="b-pct ${f.pctFijo > 0.3 ? "alto" : ""}">${Math.round(f.pctFijo * 100)} %</span></span>
          <span class="der num ${f.mm.teDeja.mes < 0 ? "rojo-t" : ""}">${S(f.mm.teDeja.mes)}</span>
          <span class="der num texto-sec">${f.caja != null ? S(f.caja) : "—"}</span>${ico("der", "abre")}</button>`).join("")}
        ${m.todas ? `<div class="b-tr b-gen" role="row"><span class="b-td-n b-gen-n"><i style="background:var(--sede-emp)"></i><span>Gastos generales<small>Contador, taller, publicidad de la marca</small></span></span><span></span><span class="der num">−${S(gen)}</span><span></span><span></span></div>
        <div class="b-tr b-total" role="row"><span class="b-td-n">Toda la empresa</span><span class="b-td-v"><b class="num">${S(base.ventas.hoy)}</b></span><span class="der">${delta(base.ventas.cambio)}</span><span></span><span class="der num">${S(base.teDeja.mes)}</span><span></span><span></span></div>` : ""}
      </div></section>`;
  }

  /* ---------- en qué se va ---------- */
  function gastos(m) {
    const g = m.gastos;
    const tipos = C.TIPOS_GASTO.map((t) => ({ ...t, v: g.mes[t.clave] })).filter((t) => t.v > 0).sort((a, b) => b.v - a.v);
    const max = tipos[0].v;
    return `<section class="vidrio pad entra tocable b-gastos" data-hoja="gastos" role="button" tabindex="0"><div class="cab-sec"><div><h2 class="titulo-sec">En qué se va</h2><p class="bajada">Los gastos del mes, de cada S/ 100 que vendes.</p></div>${ico("der", "abre")}</div>
      <div class="b-g-lista">${tipos.map((t) => `<div class="b-g"><span class="b-g-n">${t.corto}${t.fijo ? "" : '<small> · varía</small>'}</span><span class="avance" style="height:8px"><span style="width:${(t.v / max) * 100}%;--c:${H.COLOR_GASTO[t.clave]}"></span></span><span class="num b-g-v">${S(t.v)}</span><span class="num b-g-p">S/ ${((t.v / m.ventas.mes) * 100).toFixed(1).replace(".", ",")}</span></div>`).join("")}</div>
      <div class="b-g-pie"><span>Total del mes</span><b class="num">${S(g.totalMes)}</b><span class="num texto-sec">S/ ${Math.round((g.totalMes / m.ventas.mes) * 100)} de cada 100</span></div></section>`;
  }

  /* ---------- el mes en un calendario ---------- */
  function calendario(m) {
    const p = m.mes, primero = new Date(p.anio, p.mes, 1).getDay();
    const hueco = (primero + 6) % 7;
    const max = Math.max(...m.diario.filter((d) => d.real).map((d) => d.venta));
    const pagosDia = {};
    m.pagos.forEach((x) => { if (x.fecha.getMonth() === p.mes && x.fecha.getFullYear() === p.anio) (pagosDia[x.fecha.getDate()] ||= []).push(x); });
    const celdas = [];
    for (let i = 0; i < hueco; i++) celdas.push('<span class="b-dia vacio"></span>');
    m.diario.forEach((d) => {
      const ps = pagosDia[d.dia] || [];
      const tot = C.suma(ps.map((x) => x.monto));
      const esHoy = p.enCurso && d.dia === p.diaHoy;
      const intens = d.real ? 4 + (d.venta / max) * 16 : 0;
      const sunat = ps.some((x) => x.tipo === "sunat"), venc = ps.some((x) => x.vencida);
      celdas.push(`<button class="b-dia ${d.real ? "real" : "fut"} ${esHoy ? "hoy" : ""}" style="--int:${intens}%" data-hoja="${d.real ? "ventas" : ps.length ? (sunat ? "sunat" : "pagos") : "ventas"}"
        title="${d.real ? `${C.NOMBRE_DIA[d.fecha.getDay()]} ${d.dia}: vendiste ${C.soles(d.venta)}` : ps.length ? ps.map((x) => `${x.concepto}: ${C.soles(x.monto)}`).join(" · ") : "Todavía no llega"}">
        <span class="b-dia-n">${d.dia}</span>${d.real ? `<span class="b-dia-v num">${Z.K(d.venta)}</span><span class="b-dia-barra"><i style="width:${(d.venta / max) * 100}%"></i></span>` : ""}
        ${ps.length ? `<span class="b-dia-p ${sunat ? "sunat" : ""} ${venc ? "venc" : ""}">${sunat ? "SUNAT " : ""}−${Z.K(tot)}</span>` : ""}</button>`);
    });
    const vencidas = m.pagos.filter((x) => x.vencida);
    return `<section class="vidrio pad entra b-cal"><div class="cab-sec"><div><h2 class="titulo-sec">${p.nombre[0].toUpperCase() + p.nombre.slice(1)} en un calendario</h2><p class="bajada">${p.enCurso ? "Lo que vendiste en los días que pasaron y lo que pagas en los que vienen." : "Lo que vendiste cada día. Más oscuro, más venta."}</p></div></div>
      <div class="b-semana">${["L", "M", "M", "J", "V", "S", "D"].map((x) => `<span>${x}</span>`).join("")}</div>
      <div class="b-mes">${celdas.join("")}</div>
      <div class="leyenda" style="margin-top:12px"><span><i class="ley-c"></i>Lo vendido, en miles de soles</span>${p.enCurso ? `<span><i class="ley-p"></i>Un pago ese día</span><span><i class="ley-p sunat"></i>SUNAT</span>${vencidas.length ? `<span class="rojo-t">${vencidas.length} pago vencido el ${vencidas[0].fecha.getDate()}</span>` : ""}` : ""}</div></section>`;
  }

  function lateral(m) {
    const v = m.ventas;
    const medios = v.medios.map((x, j) => ({ nombre: C.MEDIOS[j], v: x, c: H.COLOR_MEDIO[j] }));
    const av = m.avisos.length ? `<section class="vidrio pad entra"><div class="cab-sec"><h2 class="titulo-sec">Hoy te toca<span class="globo">${m.avisos.length}</span></h2></div>
      <div class="avisos">${m.avisos.map((a) => `<button class="aviso-fila ${a.tono}" data-hoja="${a.hoja}"><span class="punto-tono"></span><span class="aviso-txt"><b>${a.titulo}</b><small>${a.texto}</small></span>${ico("der", "abre")}</button>`).join("")}</div></section>` : "";
    return `${av}<section class="vidrio pad entra tocable" data-hoja="ventas" role="button" tabindex="0"><div class="cab-sec"><h2 class="titulo-sec">Cómo te pagaron</h2>${ico("der", "abre")}</div>
      ${Z.apilada(medios, { cls: "gruesa" })}
      <div class="b-medios">${medios.map((x) => `<div><span class="muestra" style="--c:${x.c}"></span><span>${x.nombre}</span><b class="num">${C.pct(x.v / v.hoy)}</b></div>`).join("")}</div>
      <p class="bajada" style="margin-top:10px">${C.pct(v.medios[2] / v.hoy)} con tarjeta: el POS se queda con ${S(v.medios[2] * 0.032)} de comisión.</p></section>`;
  }

  function render(m) {
    return `${cifras(m)}${heroe(m)}
      <div class="b-fila"><div class="b-fila-a">${sedes(m)}</div><div class="b-fila-b">${gastos(m)}</div></div>
      <div class="b-fila"><div class="b-fila-a">${calendario(m)}</div><div class="b-fila-b b-pila">${lateral(m)}</div></div>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-comp]");
    if (!b) return;
    comp = b.dataset.comp;
    window.APP.pintar({ suave: true });
  });

  window.CAMINOS = window.CAMINOS || {};
  window.CAMINOS.b = { frase, render };
})();
