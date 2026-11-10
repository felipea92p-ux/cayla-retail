/* Finanzas ▸ Resumen · maqueta 2026-11-09 · LAS HOJAS: el detalle de cada cifra, igual en los tres caminos.
   Cada hoja responde una sola pregunta, empieza por la respuesta (la cifra y su frase) y termina en la lista que la explica
   (Mercury, Toast: «todo número se abre en su lista»). Las siete principales se recorren en orden con «Siguiente». */
(function () {
  "use strict";
  const C = window.CAYLA, Z = window.PZ;
  const { ico, S, cifra, delta } = Z;

  const ORDEN = ["ventas", "gastos", "deja", "plata", "pagos", "sunat", "inventario"];
  const NOMBRE = { ventas: "Lo vendido", gastos: "Lo gastado", deja: "Lo que te deja", plata: "Tu plata", pagos: "Lo que pagas", sunat: "SUNAT", inventario: "La ropa" };

  const COLOR_GASTO = { sueldos: "var(--tinta)", alquiler: "var(--sede-tru)", beneficios: "var(--r-pizarra)", servicios: "var(--r-ocre)", contador: "var(--sede-emp)", comisiones: "var(--m-tarjeta)", publicidad: "var(--r-terracota)", envios: "var(--sede-lim)", empaque: "var(--r-arcilla)", otros: "var(--neutro)" };
  const ICO_GASTO = { sueldos: "equipo", alquiler: "casa", beneficios: "corazon", servicios: "rayo", contador: "calculo", comisiones: "tarjeta", publicidad: "altavoz", envios: "camion", empaque: "caja", otros: "recibo" };
  const COLOR_MEDIO = ["var(--m-efectivo)", "var(--m-yape)", "var(--m-tarjeta)", "var(--m-transf)"];
  const COLOR_SEDE = { tru: "var(--sede-tru)", aqp: "var(--sede-aqp)", lim: "var(--sede-lim)", almacen: "var(--sede-tal)" };
  const ICO_PAGO = { proveedor: ["recibo", "var(--pizarra)"], servicio: ["rayo", "var(--ambar)"], equipo: ["equipo", "var(--verde)"], sunat: ["sunat", "var(--rojo)"], alquiler: ["casa", "var(--sede-tru)"], otro: ["altavoz", "var(--sec)"] };

  const mesDe = (m) => m.mes.nombre;
  const mesAntNombre = (m) => C.NOMBRE_MES[(m.mes.mes + 11) % 12];
  const puntoTxt = (m) => (m.mes.enCurso ? `a esta altura de ${mesAntNombre(m)}` : `${mesAntNombre(m)} completo`);

  function bloque(titulo, contenido, { dato = "", bajada = "" } = {}) {
    return `<section class="h-bloque"><div class="cab-sec"><h3 class="titulo-sec" style="font-size:19px">${titulo}</h3>${dato ? `<span class="dato">${dato}</span>` : ""}</div>${bajada ? `<p class="bajada" style="margin:-8px 0 12px">${bajada}</p>` : ""}${contenido}</section>`;
  }
  function respuesta(etq, v, frase, extra = "") {
    return `<div class="h-resp" data-cifra="h-${etq}"><span class="etq">${etq}</span><div style="margin-top:6px">${cifra(v, { tam: "clamp(44px,8vw,64px)" })}</div><p class="h-frase">${frase}</p>${extra}</div>`;
  }
  function filaBarra(nombre, v, max, { color = "var(--tinta)", extra = "", sub = "", hoja = "" } = {}) {
    return `<div class="fila-barra ${hoja ? "tocable" : ""}" ${hoja ? `data-hoja="${hoja}" role="button" tabindex="0"` : ""}>
      <div class="fb-nom"><b>${nombre}</b>${sub ? `<small>${sub}</small>` : ""}</div>
      <div class="fb-barra"><div class="avance" style="height:8px"><span style="width:${(Math.max(0, v) / max) * 100}%;--c:${color}"></span></div></div>
      <div class="fb-monto num">${S(v)}${extra ? `<small>${extra}</small>` : ""}</div>${hoja ? ico("der", "abre") : ""}</div>`;
  }

  /* ====================== LO VENDIDO ====================== */
  function ventas(m) {
    const v = m.ventas;
    const sedes = Object.entries(m.porSede);
    const maxS = Math.max(...sedes.map(([, x]) => x.venta));
    const frase = m.mes.enCurso
      ? `En ${m.mes.diaHoy} días. ${Math.abs(v.cambio) < 0.01 ? "Casi lo mismo que" : v.cambio > 0 ? `${C.pct(v.cambio)} más que` : `${C.pct(-v.cambio)} menos que`} ${puntoTxt(m)} (${S(v.antPunto)}).`
      : `${v.cambio >= 0 ? `${C.pct(v.cambio)} más` : `${C.pct(-v.cambio)} menos`} que ${mesAntNombre(m)} (${S(v.antPunto)}).`;
    const medios = v.medios.map((x, j) => ({ nombre: C.MEDIOS[j], v: x, c: COLOR_MEDIO[j] }));
    return {
      titulo: "Lo vendido", bajada: m.mes.enCurso ? `Del 1 al ${m.mes.diaHoy} de ${mesDe(m)}, con IGV, sin las devoluciones.` : `Todo ${mesDe(m)}, con IGV, sin las devoluciones.`, ancha: true,
      cuerpo: `${respuesta("Vendiste", v.hoy, frase)}
        ${bloque("Día por día", `${Z.barrasDia(m, { alto: 132 })}<div class="eje-dias"><span>1</span><span>${Math.ceil(m.mes.dias / 2)}</span><span>${m.mes.dias}</span></div>`, { dato: `Mejor día: ${C.NOMBRE_DIA[v.mejorDia.fecha.getDay()]} ${v.mejorDia.dia} · ${S(v.mejorDia.venta)}`, bajada: m.mes.enCurso ? "Lo rayado son los días que faltan. Pasa el mouse o el dedo para leer cada día." : "Pasa el mouse o el dedo para leer cada día." })}
        <div class="h-dos">
          ${m.todas ? bloque("Cada tienda", sedes.map(([s, x]) => filaBarra(C.SEDES[s].nombre, x.venta, maxS, { color: COLOR_SEDE[s], sub: `${x.tickets} ventas · ticket ${S(x.ticketProm)}`, extra: delta(x.cambio).replace('class="delta', 'class="delta mini'), hoja: `sede-${s}` })).join(""), { bajada: `Contra ${puntoTxt(m)}.` }) : bloque("La tienda", `<div class="renglones">
              <div class="renglon"><div class="que"><b>Ventas</b><small>${puntoTxt(m)}: ${m.ventas.ticketsAnt}</small></div><div class="monto">${v.tickets}</div></div>
              <div class="renglon"><div class="que"><b>Ticket promedio</b><small>Lo que gasta cada cliente</small></div><div class="monto">${S(v.ticketProm)}</div></div></div>`)}
          ${bloque("Cómo te pagaron", `${Z.apilada(medios, { cls: "gruesa" })}<div class="renglones" style="margin-top:10px">${medios.map((x) => `<div class="renglon" style="min-height:40px;padding:8px 0"><span class="muestra" style="--c:${x.c}"></span><div class="que"><b style="font-size:14px">${x.nombre}</b></div><div class="monto">${S(x.v)}<small>${C.pct(x.v / v.hoy)}</small></div></div>`).join("")}</div>`)}
        </div>
        ${bloque("Cuánto vendiste y cuánto es tuyo", `<div class="boleta">
          <div class="linea-b"><span class="signo"></span><div><b>Vendiste</b><small>Lo que pagaron los clientes</small></div><span class="m">${S(v.hoy)}</span></div>
          <div class="linea-b"><span class="signo">−</span><div><details><summary><b>IGV</b><span class="q">?</span></summary><small>El 18 % que va en el precio no es tuyo: lo cobras por SUNAT y se lo entregas el mes que viene.</small></details></div><span class="m">${S(v.igvHoy)}</span></div>
          <div class="linea-b res"><span class="signo">=</span><div><b>Es tuyo</b></div><span class="m">${S(v.sinIgvHoy)}</span></div></div>`)}
        <p class="nota">Ventas ▸ Reportes puede decir otra cifra: allá se cuenta con lo que se anuló después y por hora de cobro; aquí, por el día de la venta.</p>`,
    };
  }

  /* ====================== LO GASTADO ====================== */
  function gastos(m) {
    const g = m.gastos;
    const tipos = C.TIPOS_GASTO.map((t) => ({ ...t, v: g.mes[t.clave], hoy: g.hoy[t.clave] })).filter((t) => t.v > 0).sort((a, b) => b.v - a.v);
    const max = tipos[0].v;
    const vendeSin = m.ventas.mes / 1.18;
    const sueldoPct = (g.mes.sueldos / m.ventas.mes) * 100;
    return {
      titulo: "Lo gastado", bajada: m.mes.enCurso ? `Lo que cuesta ${mesDe(m)} completo para mantener las tiendas abiertas. No cuenta la ropa que compras: eso no es gasto (ve «La ropa»).` : `Lo que costó ${mesDe(m)} mantener las tiendas abiertas.`,
      cuerpo: `${respuesta(m.mes.enCurso ? "El mes cuesta" : "Gastaste", g.totalMes, m.mes.enCurso ? `Van ${S(g.totalHoy)} hasta hoy. De cada S/ 100 que vendes, ${Math.round((g.totalMes / m.ventas.mes) * 100)} se van en gastos; ${Math.round(sueldoPct)} son sueldos.` : `De cada S/ 100 que vendiste, ${Math.round((g.totalMes / m.ventas.mes) * 100)} se fueron en gastos.`)}
        ${bloque("En qué", `${Z.apilada(tipos.map((t) => ({ nombre: t.corto, v: t.v, c: COLOR_GASTO[t.clave] })), { cls: "gruesa" })}
          <div class="renglones" style="margin-top:8px">${tipos.map((t) => `<div class="renglon">
            <span class="ico-redondo" style="--c:${COLOR_GASTO[t.clave]}">${ico(ICO_GASTO[t.clave])}</span>
            <div class="que"><details><summary><b style="display:inline">${t.nombre}</b><span class="q-mini">?</span></summary><small>${t.que}</small></details><small>${t.fijo ? "Fijo: llega igual vendas o no" : "Sube y baja con lo que vendes"} · ${C.pct(t.v / m.ventas.mes, 1)} de la venta</small></div>
            <div class="monto">${S(t.v)}${m.mes.enCurso ? `<small>van ${S(t.hoy)}</small>` : ""}</div></div>`).join("")}
            <div class="renglon total"><div class="que"><b>Total del mes</b></div><div class="monto">${S(g.totalMes)}</div></div></div>`)}
        <p class="nota">Fijos: ${S(g.fijosMes)} (${Math.round((g.fijosMes / g.totalMes) * 100)} %). Son los que hay que cubrir antes de ganar algo: ve «Lo que te deja».</p>`,
    };
  }

  /* ====================== LO QUE TE DEJA ====================== */
  function deja(m) {
    const t = m.teDeja, enC = m.mes.enCurso;
    const valor = enC ? t.mes : t.mes;
    const h = m.historia;
    const maxH = Math.max(...h.map((x) => Math.abs(x.teDeja)));
    const eq = m.equilibrio;
    const frase = enC
      ? `Si sigue así. Puede quedar entre ${S(t.rango[0])} y ${S(t.rango[1])}: van ${m.mes.diaHoy} de ${m.mes.dias} días. Hasta hoy, ${t.hoy >= 0 ? `te deja ${S(t.hoy)}` : `te faltan ${S(-t.hoy)}`}.`
      : `${t.mes >= 0 ? `De cada S/ 100 que vendiste, te quedaron ${t.porCien.toFixed(1).replace(".", ",")}` : `Los gastos fueron más que lo que dejó la venta`}.`;
    const lin = (signo, nom, que, v, cls = "") => `<div class="linea-b ${cls}"><span class="signo">${signo}</span><div>${que ? `<details><summary><b>${nom}</b><span class="q">?</span></summary><small>${que}</small></details>` : `<b>${nom}</b>`}</div><span class="m">${S(v)}</span></div>`;
    const vMes = m.ventas.mes, sin = vMes / 1.18;
    return {
      titulo: enC ? `Lo que te deja ${mesDe(m)}` : `Lo que te dejó ${mesDe(m)}`, bajada: "Lo vendido sin IGV, menos lo que costó esa ropa y los gastos del mes.",
      cuerpo: `${respuesta(enC ? "Te deja (estimado)" : t.mes >= 0 ? "Te dejó" : "Te faltó", valor, frase, enC ? `<div class="chip pizarra" style="margin-top:10px">Estimado · se afina cada día</div>` : `<div class="chip verde" style="margin-top:10px">Mes cerrado</div>`)}
        ${bloque("La cuenta, línea por línea", `<div class="boleta">
          ${lin("", enC ? "Lo que venderías en el mes" : "Vendiste", "", vMes)}
          ${lin("−", "IGV", "Es de SUNAT: va en el precio, pero no es tuyo.", vMes - sin)}
          ${lin("−", "Lo que costaron las prendas", "Lo que pagaste por la ropa que se vendió (no por la que sigue en la tienda).", m.costo.mes)}
          ${lin("−", "Gastos del mes", "Sueldos, alquiler, servicios y todo lo demás. Ábrelo en «Lo gastado».", m.gastos.totalMes)}
          ${lin("=", t.mes >= 0 ? "Te deja" : "Te faltan", "", t.mes, "res")}</div>`, { bajada: enC ? "Con el mes completo estimado al ritmo de hoy." : "" })}
        ${bloque("¿Ya pagaste el mes?", `<div class="eq">
            <div class="avance gruesa"><span style="width:${eq.avance * 100}%;--c:${eq.cubierto ? "var(--verde)" : "var(--tinta)"}"></span></div>
            <div class="eq-pie"><span>Llevas <b>${S(eq.llevas)}</b></span><span>Necesitas <b>${S(eq.necesitas)}</b></span></div>
            <p class="bajada" style="margin-top:8px">${eq.cubierto ? `Lo cubriste el día ${eq.dia}: desde ahí, cada venta ya es ganancia.` : eq.dia ? `Para pagar los gastos fijos (${S(eq.fijosMes)}) hay que vender ${S(eq.necesitas)}. Al ritmo de hoy lo cubres el <b>${eq.dia} de ${mesDe(m)}</b>${m.mes.mes === 10 && eq.dia >= 27 ? ", con Black Friday" : ""}.` : `A este ritmo no se cubren los gastos fijos este mes.`}</p></div>`)}
        ${bloque("Los últimos seis meses", `<div class="hist">${h.map((x) => {
            const alto = (Math.abs(x.teDeja) / maxH) * 100;
            const nom = C.NOMBRE_MES[Number(x.clave.split("-")[1]) - 1];
            return `<div class="hist-col ${x.clave === m.mes.clave ? "esta" : ""}"><span class="hist-v num">${Z.K(x.teDeja)}</span><div class="hist-pista"><i class="${x.teDeja < 0 ? "neg" : ""} ${x.proyectado ? "proy" : ""}" style="height:${alto}%"></i></div><span class="hist-m">${nom.slice(0, 3)}</span></div>`;
          }).join("")}</div>`, { bajada: "En miles de soles, todas con la misma escala. Lo rayado es lo estimado." })}
        <p class="nota">Comprar ropa no baja lo que te deja: es plata que se vuelve prendas. Se vuelve costo recién cuando la prenda se vende.</p>`,
    };
  }

  /* ====================== TU PLATA ====================== */
  function plata(m) {
    const p = m.plata;
    if (!p.enCurso) {
      return { titulo: "Tu plata", bajada: `Al cierre de ${mesDe(m)}.`, cuerpo: `${respuesta("Tenías", p.tienes, `Lo que había en bancos y cajas el último día de ${mesDe(m)}. El detalle por cuenta está en Cuentas y dinero.`)}<p class="nota">El detalle de qué tenía dueño ese día solo se ve en el mes en curso.</p>` };
    }
    const grupos = [["banco", "En el banco"], ["caja", "En las cajas de las tiendas"], ["camino", "Por llegar"]];
    const icoL = { banco: "banco", caja: "billete", camino: "tarjeta" };
    const lugares = grupos.map(([tipo, nom]) => {
      const ls = p.lugares.filter((l) => l.tipo === tipo);
      if (!ls.length) return "";
      return `<div class="lug-grupo"><span class="etq">${nom}</span>${ls.map((l) => `<div class="renglon"><span class="ico-redondo" style="--c:${tipo === "caja" ? COLOR_SEDE[l.sede] : tipo === "banco" ? "var(--pizarra)" : "var(--m-tarjeta)"}">${ico(icoL[tipo])}</span><div class="que"><b>${l.nombre}</b><small>${l.nota}</small></div><div class="monto">${S(l.monto, true)}</div></div>`).join("")}</div>`;
    }).join("");
    if (!m.todas) {
      return { titulo: `La plata de ${m.nombreSede}`, bajada: "La plata del banco es de toda la empresa: aquí va solo lo que está en la tienda.",
        cuerpo: `${respuesta("En la tienda", p.tienes, `El efectivo de la caja y lo que el POS de ${m.nombreSede} todavía no abona. Para saber cuánto está libre, mira «Todas las sedes»: los pagos se hacen desde el banco.`)}${bloque("Dónde está", lugares)}` };
    }
    const proy = p.proy;
    const vals = [p.tienes - p.deClaudia, ...proy.map((x) => x.saldo)];
    const min = p.minimo, iMin = proy.indexOf(min) + 1;
    const causa = m.pagos.filter((x) => +x.fecha <= +min.fecha && +x.fecha >= +C.HOY).sort((a, b) => b.monto - a.monto)[0];
    return {
      titulo: "Tu plata", bajada: "Cuánta hay, dónde está y cuánta ya tiene dueño.", ancha: true,
      cuerpo: `${respuesta("Libre para usar", p.libre, `Tienes ${S(p.tienes)}, pero ${S(p.tienes - p.libre)} ya tienen dueño: los pagos de las próximas dos semanas, el IGV que vas juntando y la plata de Claudia.`)}
        <div class="h-dos">
          ${bloque("Dónde está", lugares, { dato: S(p.tienes) })}
          ${bloque("Lo que ya tiene dueño", `<div class="boleta">
            <div class="linea-b"><span class="signo"></span><div><b>Tienes</b><small>En bancos, cajas y por llegar</small></div><span class="m">${S(p.tienes)}</span></div>
            <div class="linea-b"><span class="signo">−</span><div><details><summary><b>Plata de Claudia (CLAURE)</b><span class="q">?</span></summary><small>Lo que CLAURE vendió en Lima con tarjeta, QR o Yape entró a las cuentas de CAYLA, pero es de ella.</small></details></div><span class="m">${S(p.deClaudia)}</span></div>
            <div class="linea-b"><span class="signo">−</span><div><b>Pagos de 14 días</b><small>${p.en14.length} pagos hasta el ${C.fecha(new Date(2026, 10, 23))} · <button class="enlace" data-hoja="pagos">ver</button></small></div><span class="m">${S(p.pagos14)}</span></div>
            <div class="linea-b"><span class="signo">−</span><div><details><summary><b>IGV que vas juntando</b><span class="q">?</span></summary><small>El IGV de lo que vendes en noviembre se paga en diciembre. Ya está en tu cuenta, pero no es tuyo.</small></details></div><span class="m">${S(p.igvJuntando)}</span></div>
            <div class="linea-b res"><span class="signo">=</span><div><b>Libre para usar</b></div><span class="m">${S(p.libre)}</span></div></div>`)}
        </div>
        ${bloque("Los próximos 30 días", Z.linea({ n: vals.length, alto: 230, aria: "Tu plata en los próximos 30 días", padL: 4, padR: 4,
            series: [{ vals, clase: "real", area: true }], lineas: [{ y: 0, etiqueta: "", punteada: false }],
            marcas: [{ i: iMin, y: min.saldo, etiqueta: `El día más justo: ${S(min.saldo)}`, abajo: true }],
            ejeX: [[0, "Hoy"], [6, C.fecha(proy[5].fecha).replace(" de ", " ")], [15, C.fecha(proy[14].fecha).replace(" de ", " ")], [30, C.fecha(proy[29].fecha).replace(" de ", " ")]],
            leer: (i) => i === 0 ? { y: vals[0], html: `<b>${S(vals[0])}</b>Hoy, sin la plata de Claudia` } : { y: proy[i - 1].saldo, html: `<b>${S(proy[i - 1].saldo)}</b>${C.fecha(proy[i - 1].fecha, true)}${proy[i - 1].sale ? `<small>Sale ${S(proy[i - 1].sale)} en pagos</small>` : `<small>Entran unos ${S(proy[i - 1].entra)}</small>`}` } }),
          { bajada: `Estimado: suma lo que se suele vender y resta los pagos. El día más justo es el ${C.fecha(min.fecha, true)}${causa ? `, por ${causa.concepto.toLowerCase()}` : ""}.` })}
        <p class="nota">«Libre» no cuenta lo que vas a vender: es lo que podrías usar hoy sin dejar de pagar nada. Es la lectura prudente.</p>`,
    };
  }

  /* ====================== LO QUE PAGAS ====================== */
  function pagos(m) {
    if (!m.mes.enCurso) return { titulo: "Lo que pagas", bajada: "", cuerpo: `${respuesta("Gastaste", m.gastos.totalMes, `En ${mesDe(m)}. Lo que toca pagar se ve en el mes en curso.`)}<p class="nota">Vuelve a ${C.NOMBRE_MES[C.HOY.getMonth()]} para ver lo que viene.</p>` };
    const l = m.pagos.filter((x) => !x.lejos);
    const hoy = +C.HOY, d = (n) => hoy + n * 86400000;
    const grupos = [
      ["Vencido", l.filter((x) => x.vencida)],
      ["Esta semana", l.filter((x) => !x.vencida && +x.fecha < d(7))],
      ["La próxima semana", l.filter((x) => !x.vencida && +x.fecha >= d(7) && +x.fecha < d(14))],
      ["Más adelante", l.filter((x) => +x.fecha >= d(14))],
    ].filter(([, xs]) => xs.length);
    const total14 = m.plata.pagos14;
    const lejos = m.pagos.find((x) => x.lejos);
    const fila = (x) => {
      const [ic, c] = ICO_PAGO[x.tipo];
      return `<div class="renglon ${x.vencida ? "vencida" : ""}"><span class="ico-redondo" style="--c:${c}">${ico(ic)}</span><div class="que"><b>${x.concepto}</b><small>${x.detalle}${x.sede ? ` · ${C.SEDES[x.sede].nombre}` : ""}</small></div>
        <div class="monto">${S(x.monto, true)}<small class="${x.vencida ? "rojo-t" : ""}">${x.vencida ? `venció ${C.cuandoRel(x.fecha)}` : `${C.cuandoRel(x.fecha)} · ${x.fecha.getDate()} ${C.NOMBRE_MES[x.fecha.getMonth()].slice(0, 3)}`}</small></div></div>`;
    };
    return {
      titulo: "Lo que pagas", bajada: "Lo que toca pagar en los próximos 30 días, en orden. Viene de Por pagar, la planilla y SUNAT.",
      cuerpo: `${respuesta("En 14 días pagas", total14, `${m.plata.en14.length} pagos. ${m.todas ? `Tu plata libre después de pagarlos: ${S(m.plata.libre)}.` : "Solo lo de esta tienda: proveedores y SUNAT se ven con «Todas las sedes»."}`)}
        ${grupos.map(([nom, xs]) => bloque(nom, `<div class="renglones">${xs.map(fila).join("")}</div>`, { dato: S(C.suma(xs.map((x) => x.monto))) })).join("")}
        ${lejos ? `<div class="guardar"><span class="ico-redondo" style="--c:var(--verde)">${ico("corazon")}</span><div><b>Ve guardando: ${lejos.concepto.toLowerCase()}</b><small>${S(lejos.monto)} el ${C.fecha(lejos.fecha)}. Si separas ${S(lejos.monto / 5)} por semana desde hoy, llegas sin apuro.</small></div></div>` : ""}
        <p class="nota">La fecha de SUNAT sale del último dígito del RUC: hoy el ERP usa el día 15 como referencia porque el RUC no está cargado.</p>`,
    };
  }

  /* ====================== SUNAT ====================== */
  function sunat(m) {
    const s = m.sunat;
    const per = s.nombrePeriodo;
    return {
      titulo: "SUNAT", bajada: `Lo de ${per} se declara y se paga en ${C.NOMBRE_MES[(Number(s.periodo.split("-")[1])) % 12]}. Es de toda la empresa: un solo RUC.`,
      cuerpo: `${respuesta(`Lo de ${per}`, s.pagar.total, `Vence el ${C.fecha(s.vence, true)} (ejemplo). Son tres cosas: el IGV, el adelanto de la renta y el EsSalud del equipo.`)}
        ${bloque("El IGV, en una resta", `<div class="boleta">
          <div class="linea-b"><span class="signo"></span><div><b>IGV que cobraste</b><small>El 18 % que iba en el precio de todo lo que vendiste en ${per}</small></div><span class="m">${S(s.igvVentas)}</span></div>
          <div class="linea-b"><span class="signo">−</span><div><b>IGV que pagaste</b><small>El que pagaste al comprar con factura: ropa, telas, servicios, publicidad</small></div><span class="m">${S(s.igvCompras)}</span></div>
          <div class="linea-b res"><span class="signo">=</span><div><b>IGV para SUNAT</b></div><span class="m">${S(s.pagar.igv)}</span></div></div>`, { bajada: "SUNAT solo cobra la diferencia: por eso cada compra con factura te ahorra." })}
        ${bloque("Todo lo que pagas a SUNAT", `<div class="renglones">
          <div class="renglon"><span class="ico-redondo" style="--c:var(--rojo)">${ico("recibo")}</span><div class="que"><b>IGV</b><small>La resta de arriba</small></div><div class="monto">${S(s.pagar.igv, true)}</div></div>
          <div class="renglon"><span class="ico-redondo" style="--c:var(--ambar)">${ico("calculo")}</span><div class="que"><details><summary><b style="display:inline">Adelanto de la renta</b><span class="q-mini">?</span></summary><small>Cada mes se adelanta el 1 % de lo vendido sin IGV. En marzo se compara con lo que de verdad ganaste en el año.</small></details></div><div class="monto">${S(s.pagar.renta, true)}</div></div>
          <div class="renglon"><span class="ico-redondo" style="--c:var(--verde)">${ico("corazon")}</span><div class="que"><details><summary><b style="display:inline">EsSalud</b><span class="q-mini">?</span></summary><small>El 9 % de los sueldos, para el seguro de salud del equipo. Lo pone la empresa, no se descuenta del sueldo.</small></details></div><div class="monto">${S(s.pagar.essalud, true)}</div></div>
          <div class="renglon total"><div class="que"><b>Total</b></div><div class="monto">${S(s.pagar.total, true)}</div></div></div>`)}
        ${m.mes.enCurso ? `<div class="guardar"><span class="ico-redondo" style="--c:var(--pizarra)">${ico("reloj")}</span><div><b>Lo de ${mesDe(m)} ya se va juntando: ${S(s.igvJuntando)} de IGV</b><small>Se paga en diciembre. Ya se descuenta de tu plata libre.</small></div></div>` : ""}
        <p class="nota">Pide siempre factura: por cada S/ 118 que compras con factura, SUNAT te cobra S/ 18 menos de IGV.</p>`,
    };
  }

  /* ====================== LA ROPA (inventario) ====================== */
  function inventario(m) {
    const inv = m.inventario;
    const lug = Object.entries(inv.porLugar);
    const max = Math.max(...lug.map(([, v]) => v));
    const nom = (k) => (k === "almacen" ? "Almacén y taller" : C.SEDES[k].nombre);
    return {
      titulo: "La ropa que tienes", bajada: "Toda la mercadería, a lo que te costó (no a lo que la vendes).",
      cuerpo: `${respuesta("En ropa", inv.total, `Te alcanza para unos ${inv.cobertura.toFixed(1).replace(".", ",")} meses de venta. ${S(inv.quieta)} no se mueve hace más de 90 días.`)}
        ${bloque("Dónde está", lug.map(([k, v]) => filaBarra(nom(k), v, max, { color: COLOR_SEDE[k] })).join(""))}
        ${bloque("Lo que conviene mirar", `<div class="renglones">
          <div class="renglon"><span class="ico-redondo" style="--c:var(--ambar)">${ico("reloj")}</span><div class="que"><b>Ropa quieta</b><small>Más de 90 días sin venderse. Frescura del piso dice cuál y dónde.</small></div><div class="monto">${S(inv.quieta)}<small>${C.pct(inv.quieta / inv.total)} del total</small></div></div>
          <div class="renglon"><span class="ico-redondo" style="--c:var(--pizarra)">${ico("compras")}</span><div class="que"><b>Compraste en ${mesDe(m)}</b><small>Ropa, telas y avíos, con IGV</small></div><div class="monto">${S(inv.comprasMes)}</div></div></div>`)}
        <p class="nota">Comprar ropa no es gasto: tu plata se vuelve prendas. Sale de tu caja cuando pagas la factura y se vuelve costo cuando la prenda se vende.</p>`,
    };
  }

  /* ====================== UNA TIENDA ====================== */
  function sede(m, s) {
    const mm = C.modelo(s, m.mes.clave);
    const x = m.porSede[s] || mm.porSede[s];
    const pctFijo = ((mm.gastos.mes.sueldos + mm.gastos.mes.alquiler) / mm.ventas.mes) * 100;
    return {
      titulo: C.SEDES[s].nombre, bajada: `${mm.mes.enCurso ? `Del 1 al ${mm.mes.diaHoy}` : "Todo"} ${mesDe(m)}. Sin los gastos generales (contador, taller, publicidad de la marca).`, ancha: true,
      cuerpo: `${respuesta("Vendió", x.venta, `${delta(x.cambio)} contra ${puntoTxt(m)}. ${x.tickets < x.ticketsAnt ? `Entraron menos clientes (${x.tickets} ventas contra ${x.ticketsAnt}).` : `Más ventas que entonces (${x.tickets} contra ${x.ticketsAnt}).`}`)}
        ${bloque("Día por día", `${Z.barrasDia(mm, { alto: 110 })}<div class="eje-dias"><span>1</span><span>${Math.ceil(mm.mes.dias / 2)}</span><span>${mm.mes.dias}</span></div>`)}
        <div class="h-cifras">
          <div><span class="etq">Ticket promedio</span><b class="num">${S(x.ticketProm)}</b></div>
          <div><span class="etq">${mm.mes.enCurso ? "Te deja (estimado)" : "Te dejó"}</span><b class="num">${S(mm.teDeja.mes)}</b></div>
          <div><span class="etq">Sueldos y alquiler</span><b class="num">${Math.round(pctFijo)} de cada S/ 100</b></div>
          <div><span class="etq">Ropa en la tienda</span><b class="num">${S(mm.inventario.total)}</b></div>
        </div>
        <p class="nota">«Sueldos y alquiler» sirve para comparar tiendas de distinto tamaño: mientras más baja, más le rinde cada sol de local y de equipo.</p>`,
    };
  }

  /* ====================== HOY TE TOCA ====================== */
  function tetoca(m) {
    const a = m.avisos;
    return {
      titulo: "Hoy te toca", bajada: "Lo urgente, primero. Como mucho tres, y solo si pasan su límite.",
      cuerpo: a.length ? `<div class="avisos-hoja">${a.map((x) => `<div class="aviso-h ${x.tono}"><span class="punto-tono"></span><div><b>${x.titulo}</b><small>${x.texto}</small></div><button class="btn chico" data-hoja="${x.hoja}">Ver${ico("der", "ava")}</button></div>`).join("")}</div>`
        : `<p class="bajada">Nada urgente. ${m.mes.enCurso ? "" : "En un mes cerrado no hay pendientes."}</p>`,
    };
  }

  function def(id, m) {
    if (id.startsWith("sede-")) return sede(m, id.slice(5));
    const f = { ventas, gastos, deja, plata, pagos, sunat, inventario, tetoca }[id];
    return f ? f(m) : null;
  }

  window.HOJAS = { def, ORDEN, NOMBRE, COLOR_GASTO, ICO_GASTO, COLOR_MEDIO, COLOR_SEDE, ICO_PAGO };
})();
