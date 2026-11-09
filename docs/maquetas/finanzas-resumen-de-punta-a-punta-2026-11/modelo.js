/* Finanzas ▸ Resumen · maqueta 2026-11-09 · EL MODELO.
   Todas las cifras son DE EJEMPLO (el repo es público): ninguna sale de la base. Un solo modelo alimenta los tres caminos,
   así que lo vendido, lo gastado, lo que te deja, la plata y los pagos cuadran entre sí en cada sede y en cada mes.
   Hoy, en la maqueta: lunes 9 de noviembre de 2026 (noviembre va en curso; junio a octubre están cerrados; diciembre no llega).

   Reglas de negocio que usa (las que el ERP NO calcula hoy están marcadas «NUEVA», y esperan a Felipe):
   - Lo que te deja = lo vendido sin IGV − lo que costó esa ropa − los gastos del mes.
   - Gastos «fijos» (sueldos, beneficios, alquiler, servicios, contador): se cuentan por días mientras el mes corre.
   - Punto de equilibrio: lo que hay que vender para cubrir los fijos con lo que deja cada venta (ya existe en el Resumen).
   - NUEVA · Libre para usar = lo que tienes − la plata de CLAURE − lo que pagas en 14 días − el IGV que vas juntando.
   - NUEVA · Proyección del mes con su rango (más ancho mientras menos días van).
   - NUEVA · CTS y gratificación como «la parte del mes» (una provisión): depende del régimen laboral de CAYLA. */
(function () {
  "use strict";

  const HOY = new Date(2026, 10, 9);
  const NOMBRE_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DIA_CORTO = ["D", "L", "M", "M", "J", "V", "S"];

  const SEDES = {
    tru: { clave: "tru", nombre: "Trujillo", corto: "TRU" },
    aqp: { clave: "aqp", nombre: "Arequipa", corto: "AQP" },
    lim: { clave: "lim", nombre: "Lima", corto: "LIM" },
  };
  const CLAVES_SEDE = ["tru", "aqp", "lim"];

  /* Lo que vende y gasta cada tienda en un mes «normal» (octubre = 1). medios: efectivo, Yape/Plin, tarjeta, transferencia. */
  const BASE = {
    tru: { venta: 62000, costo: 0.37, ticket: 118, sueldos: 9800, alquiler: 6500, servicios: 820, medios: [0.2, 0.36, 0.34, 0.1] },
    aqp: { venta: 48500, costo: 0.385, ticket: 124, sueldos: 8200, alquiler: 5800, servicios: 760, medios: [0.27, 0.31, 0.31, 0.11] },
    lim: { venta: 41000, costo: 0.39, ticket: 139, sueldos: 7400, alquiler: 7200, servicios: 690, medios: [0.15, 0.33, 0.4, 0.12] },
  };
  /* Lo que no es de ninguna tienda: solo cuenta con «Todas las sedes». */
  const GENERALES = { sueldos: 5600, contador: 1650, publicidad: 2600, envios: 1100, empaque: 900, otros: 830 };

  const MESES = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  const MES_HOY = "2026-11";
  const ESTACION = { "2026-06": 0.92, "2026-07": 1.18, "2026-08": 0.95, "2026-09": 0.97, "2026-10": 1.0, "2026-11": 1.06, "2026-12": 1.45,
    /* el año pasado, para comparar la misma temporada (12 % menos que hoy) */
    "2025-06": 0.81, "2025-07": 1.04, "2025-08": 0.84, "2025-09": 0.85, "2025-10": 0.88, "2025-11": 0.93 };
  /* Cómo le va a cada tienda contra su base, mes a mes (Arequipa afloja en noviembre: de ahí sale un aviso). */
  const RUMBO = {
    tru: { "2026-06": 0.97, "2026-07": 1.02, "2026-08": 0.98, "2026-09": 1.0, "2026-10": 1.01, "2026-11": 1.04 },
    aqp: { "2026-06": 1.03, "2026-07": 1.04, "2026-08": 1.01, "2026-09": 1.02, "2026-10": 1.03, "2026-11": 0.88 },
    lim: { "2026-06": 0.9, "2026-07": 0.95, "2026-08": 0.97, "2026-09": 1.0, "2026-10": 1.02, "2026-11": 1.09 },
  };

  const TIPOS_GASTO = [
    { clave: "sueldos", nombre: "Sueldos y EsSalud", corto: "Sueldos", fijo: true, que: "Lo que se paga al equipo cada quincena, más el 9 % de EsSalud que pone la empresa." },
    { clave: "alquiler", nombre: "Alquiler de las tiendas", corto: "Alquiler", fijo: true, que: "El local de cada tienda." },
    { clave: "beneficios", nombre: "CTS y gratificación (la parte del mes)", corto: "CTS y grati", fijo: true, que: "Se pagan en mayo, julio, noviembre y diciembre, pero se ganan un poco cada mes. Aquí va la parte de este mes, para que diciembre no te sorprenda." },
    { clave: "servicios", nombre: "Luz, agua e internet", corto: "Servicios", fijo: true, que: "Los recibos de cada tienda y del taller." },
    { clave: "contador", nombre: "Contador y sistemas", corto: "Contador", fijo: true, que: "El estudio contable y los programas que se pagan cada mes." },
    { clave: "comisiones", nombre: "Comisión de las tarjetas", corto: "Comisiones", fijo: false, que: "El POS se queda con una parte de cada pago con tarjeta (aquí, 3,2 %)." },
    { clave: "publicidad", nombre: "Publicidad y redes", corto: "Publicidad", fijo: false, que: "Anuncios en Instagram y TikTok, y lo que se paga a quien los hace." },
    { clave: "envios", nombre: "Envíos y movilidad", corto: "Envíos", fijo: false, que: "Traslados entre tiendas, envíos de la tienda web y taxis." },
    { clave: "empaque", nombre: "Bolsas y empaque", corto: "Empaque", fijo: false, que: "Bolsas, papel de seda y etiquetas." },
    { clave: "otros", nombre: "Otros", corto: "Otros", fijo: false, que: "Mantenimiento de cuentas, útiles y gastos chicos." },
  ];

  /* ---------- azar con semilla: la misma sede y el mismo mes dan siempre lo mismo ---------- */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function azar(semilla) {
    let a = hash(semilla);
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const suma = (a) => a.reduce((x, y) => x + y, 0);

  function partesMes(clave) {
    const [a, m] = clave.split("-").map(Number);
    const dias = new Date(a, m, 0).getDate();
    const enCurso = clave === MES_HOY;
    return { clave, anio: a, mes: m - 1, dias, enCurso, diaHoy: enCurso ? HOY.getDate() : dias, nombre: NOMBRE_MES[m - 1], futuro: clave > MES_HOY };
  }
  function mesAnterior(clave) {
    const [a, m] = clave.split("-").map(Number);
    const d = new Date(a, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  /* El peso de cada día: los sábados venden más, los lunes menos; la quincena y fin de mes empujan; Black Friday y Fiestas Patrias. */
  function pesoDia(anio, mes, d) {
    const fecha = new Date(anio, mes, d);
    const dow = fecha.getDay();
    let p = [1.25, 0.72, 0.8, 0.86, 0.95, 1.15, 1.62][dow];
    const ultimo = new Date(anio, mes + 1, 0).getDate();
    if (d === 15 || d === 16 || d >= ultimo - 1 || d === 1) p *= 1.14;
    if (mes === 10 && d >= 27 && d <= 29) p *= 1.8;
    if (mes === 6 && d >= 26 && d <= 29) p *= 1.5;
    return p;
  }

  /* ---------- una tienda en un mes: lo diario ---------- */
  const cacheTienda = new Map();
  function tienda(s, clave) {
    const k = s + clave;
    if (cacheTienda.has(k)) return cacheTienda.get(k);
    const b = BASE[s];
    const p = partesMes(clave);
    const rnd = azar(`cayla-${s}-${clave}`);
    const total = b.venta * (ESTACION[clave] || 1) * ((RUMBO[s] || {})[clave] || 1);
    const pesos = [];
    for (let d = 1; d <= p.dias; d++) pesos.push(pesoDia(p.anio, p.mes, d) * (0.88 + rnd() * 0.24));
    const sp = suma(pesos);
    const dias = pesos.map((w, i) => {
      const venta = r2((total * w) / sp);
      const ruido = 0.9 + rnd() * 0.2;
      const tickets = Math.max(1, Math.round((venta / b.ticket) * ruido));
      const m = b.medios.map((x) => x * (0.9 + rnd() * 0.2));
      const sm = suma(m);
      const medios = m.map((x) => r2((venta * x) / sm));
      return { dia: i + 1, venta, tickets, medios, costo: r2((venta / 1.18) * b.costo * (0.97 + rnd() * 0.06)) };
    });
    const out = { s, p, total, dias };
    cacheTienda.set(k, out);
    return out;
  }

  /* Los gastos del mes COMPLETO de un conjunto de sedes, por tipo. */
  function gastosMes(sedes, clave, ventasTarjeta) {
    const est = ESTACION[clave] || 1;
    const g = Object.fromEntries(TIPOS_GASTO.map((t) => [t.clave, 0]));
    let sueldosBase = 0;
    for (const s of sedes) {
      const b = BASE[s];
      sueldosBase += b.sueldos;
      g.alquiler += b.alquiler;
      g.servicios += b.servicios * (clave === "2026-07" || clave === "2026-08" ? 1.08 : 1);
      g.envios += 240 + b.venta * 0.003;
      g.empaque += b.venta * 0.0045 * est;
      g.publicidad += 380;
      g.otros += 120;
    }
    if (sedes.length === 3) {
      sueldosBase += GENERALES.sueldos;
      g.contador += GENERALES.contador;
      g.publicidad += GENERALES.publicidad * (clave === "2026-11" ? 1.25 : clave === "2026-07" ? 1.2 : 1);
      g.envios += GENERALES.envios;
      g.empaque += GENERALES.empaque;
      g.otros += GENERALES.otros;
    }
    g.sueldos = sueldosBase * 1.09;
    g.beneficios = sueldosBase * 0.12;
    g.comisiones = ventasTarjeta * 0.032;
    for (const k in g) g[k] = r2(g[k]);
    return g;
  }

  /* ---------- lo que se paga (de hoy en adelante) y lo que se pagó ---------- */
  function porPagar(sedes) {
    const todas = sedes.length === 3;
    const f = (d, m = 10) => new Date(2026, m, d);
    const lista = [];
    const sedeTxt = (s) => SEDES[s].nombre;
    if (todas) lista.push({ id: "f-avios", fecha: f(6), concepto: "Factura de Avíos Rímac", detalle: "F001-0912 · botones y cierres", monto: 860.4, tipo: "proveedor", vencida: true });
    for (const s of sedes) {
      const luz = { tru: 10, aqp: 11, lim: 12 }[s];
      lista.push({ id: `luz-${s}`, fecha: f(luz), concepto: `Luz y agua de ${sedeTxt(s)}`, detalle: "Recibos del mes", monto: r2(BASE[s].servicios * 0.62), tipo: "servicio", sede: s });
    }
    if (todas) {
      lista.push({ id: "f-telas", fecha: f(12), concepto: "Factura de Telas del Norte", detalle: "F002-2381 · 140 m de lino y popelina", monto: 5840, tipo: "proveedor" });
      lista.push({ id: "internet", fecha: f(13), concepto: "Internet y teléfonos", detalle: "Las tres tiendas y el taller", monto: 389.9, tipo: "servicio" });
    }
    const sb = suma(sedes.map((s) => BASE[s].sueldos)) + (todas ? GENERALES.sueldos : 0);
    lista.push({ id: "cts", fecha: f(15), concepto: "CTS de noviembre", detalle: "Se deposita en el banco de cada integrante", monto: r2(sb * 0.5 * 0.97), tipo: "equipo" });
    lista.push({ id: "quincena", fecha: f(15), concepto: "Quincena", detalle: todas ? "Sueldos de las tres tiendas y el taller" : `Sueldos de ${sedeTxt(sedes[0])}`, monto: r2(sb / 2), tipo: "equipo" });
    if (todas) {
      lista.push({ id: "sunat", fecha: f(18), concepto: "SUNAT · lo de octubre", detalle: "IGV, renta y EsSalud de octubre", monto: 0, tipo: "sunat" });
      lista.push({ id: "f-hilos", fecha: f(20), concepto: "Factura de Hilos Misti", detalle: "F001-4410 · hilos y entretelas", monto: 3960, tipo: "proveedor" });
      lista.push({ id: "f-boton", fecha: f(24), concepto: "Factura de Etiquetas Lima", detalle: "E001-118 · etiquetas tejidas", monto: 1280.5, tipo: "proveedor" });
      lista.push({ id: "publi", fecha: f(25), concepto: "Publicidad de Black Friday", detalle: "Anuncios del 20 al 29", monto: 1450, tipo: "otro" });
    }
    lista.push({ id: "finmes", fecha: f(30), concepto: "Sueldos de fin de mes", detalle: "La segunda quincena", monto: r2(sb / 2), tipo: "equipo" });
    for (const s of sedes) lista.push({ id: `alq-${s}`, fecha: f(1, 11), concepto: `Alquiler de ${sedeTxt(s)}`, detalle: "Diciembre, se paga adelantado", monto: BASE[s].alquiler, tipo: "alquiler", sede: s });
    if (todas) lista.push({ id: "f-telas2", fecha: f(4, 11), concepto: "Factura de Telas del Norte", detalle: "F002-2420 · pedido de Navidad", monto: 9200, tipo: "proveedor" });
    lista.push({ id: "grati", fecha: f(15, 11), concepto: "Gratificación de diciembre", detalle: "Medio sueldo por integrante (régimen de pequeña empresa)", monto: r2(sb * 0.5), tipo: "equipo", lejos: true });
    return lista.sort((a, b) => a.fecha - b.fecha);
  }

  /* ---------- el modelo de una sede (o todas) en un mes ---------- */
  const cache = new Map();
  function modelo(sede, clave) {
    const k = sede + clave;
    if (cache.has(k)) return cache.get(k);
    const p = partesMes(clave);
    const sedes = sede === "todas" ? CLAVES_SEDE : [sede];
    const todas = sedes.length === 3;
    const ts = sedes.map((s) => tienda(s, clave));
    const hoyD = p.diaHoy;

    /* lo diario sumado: una fila por día del mes; los días que no llegan van en null */
    const diario = [];
    for (let i = 0; i < p.dias; i++) {
      const fila = { dia: i + 1, fecha: new Date(p.anio, p.mes, i + 1), venta: 0, tickets: 0, costo: 0, medios: [0, 0, 0, 0], porSede: {} };
      for (const t of ts) {
        const x = t.dias[i];
        fila.venta += x.venta; fila.tickets += x.tickets; fila.costo += x.costo;
        x.medios.forEach((m, j) => (fila.medios[j] += m));
        fila.porSede[t.s] = x.venta;
      }
      fila.real = i + 1 <= hoyD;
      diario.push(fila);
    }
    const reales = diario.filter((d) => d.real);
    const vHoy = suma(reales.map((d) => d.venta));
    const vMes = suma(diario.map((d) => d.venta));
    const tarjetaHoy = suma(reales.map((d) => d.medios[2]));
    const tarjetaMes = suma(diario.map((d) => d.medios[2]));

    /* el mes anterior, para comparar con EL MISMO PUNTO (no con el mes entero) */
    const ant = mesAnterior(clave);
    const tsAnt = sedes.map((s) => tienda(s, ant));
    const diasAnt = tsAnt[0].p.dias;
    const corte = Math.min(hoyD, diasAnt);
    const vAntPunto = suma(tsAnt.map((t) => suma(t.dias.slice(0, corte).map((d) => d.venta))));
    const vAntMes = suma(tsAnt.map((t) => t.total));
    const tickAntPunto = suma(tsAnt.map((t) => suma(t.dias.slice(0, corte).map((d) => d.tickets))));

    const gMes = gastosMes(sedes, clave, tarjetaMes);
    const fijosMes = suma(TIPOS_GASTO.filter((t) => t.fijo).map((t) => gMes[t.clave]));
    const varMes = suma(TIPOS_GASTO.filter((t) => !t.fijo).map((t) => gMes[t.clave]));
    const frac = vMes ? vHoy / vMes : 0;
    const fracDias = hoyD / p.dias;
    const gHoy = {};
    for (const t of TIPOS_GASTO) gHoy[t.clave] = r2(gMes[t.clave] * (t.fijo ? fracDias : frac));
    const gastosHoy = suma(Object.values(gHoy));
    const gastosMesTotal = fijosMes + varMes;

    const costoHoy = suma(reales.map((d) => d.costo));
    const costoMes = suma(diario.map((d) => d.costo));
    const sinIgvHoy = vHoy / 1.18;
    const sinIgvMes = vMes / 1.18;
    const igvHoy = vHoy - sinIgvHoy;

    /* lo que deja cada S/ 1 vendido después de la ropa y los gastos que suben con la venta */
    const contrib = (sinIgvMes - costoMes - varMes) / vMes; // por sol vendido CON IGV
    const necesitas = fijosMes / contrib;
    /* el día en que lo acumulado cubre los fijos del mes */
    let acum = 0, diaEq = null;
    const curva = diario.map((d) => {
      acum += d.venta * contrib;
      if (diaEq == null && acum >= fijosMes) diaEq = d.dia;
      return acum;
    });

    const teDejaHoy = sinIgvHoy - costoHoy - gastosHoy;
    const teDejaMes = sinIgvMes - costoMes - gastosMesTotal;
    /* rango de la proyección: ±(35 % a 5 %) de lo que falta, más ancho mientras menos días van */
    const incert = p.enCurso ? 0.04 + 0.16 * (1 - fracDias) : 0;
    const falta = vMes - vHoy;
    const rango = [teDejaMes - falta * incert * contrib, teDejaMes + falta * incert * contrib];

    /* lo mismo en el mes anterior al mismo punto, para «te deja» comparable */
    const mAnt = clave === MESES[0] ? null : modeloSimple(sedes, ant, corte);

    const medios = [0, 1, 2, 3].map((j) => suma(reales.map((d) => d.medios[j])));
    const ticketsHoy = suma(reales.map((d) => d.tickets));

    const porSede = {};
    for (const t of ts) {
      const vs = suma(t.dias.slice(0, hoyD).map((d) => d.venta));
      const tAnt = tienda(t.s, ant);
      const va = suma(tAnt.dias.slice(0, corte).map((d) => d.venta));
      const gS = gastosMes([t.s], clave, suma(t.dias.map((d) => d.medios[2])));
      const fS = suma(TIPOS_GASTO.filter((x) => x.fijo).map((x) => gS[x.clave]));
      const vS = suma(TIPOS_GASTO.filter((x) => !x.fijo).map((x) => gS[x.clave]));
      const cs = suma(t.dias.slice(0, hoyD).map((d) => d.costo));
      const vsMes = t.total, csMes = suma(t.dias.map((d) => d.costo));
      const tick = suma(t.dias.slice(0, hoyD).map((d) => d.tickets));
      porSede[t.s] = {
        venta: vs, ventaAnt: va, cambio: va ? vs / va - 1 : 0, tickets: tick, ticketProm: vs / tick,
        ticketsAnt: suma(tAnt.dias.slice(0, corte).map((d) => d.tickets)),
        teDejaMes: vsMes / 1.18 - csMes - fS - vS,
        teDejaHoy: vs / 1.18 - cs - fS * fracDias - vS * (vsMes ? vs / vsMes : 0),
        gastosMes: fS + vS, costoHoy: cs, diario: t.dias.slice(0, hoyD).map((d) => d.venta),
      };
    }

    /* la historia: seis meses (el de hoy, proyectado) */
    const historia = MESES.map((c) => {
      const h = c === clave ? null : modeloSimple(sedes, c, null);
      return h ? { clave: c, ...h } : { clave: c, venta: vMes, gastos: gastosMesTotal, costo: costoMes, teDeja: teDejaMes, proyectado: p.enCurso };
    });

    /* ---------- SUNAT: lo de octubre se paga en noviembre ---------- */
    const sunat = calcularSunat(clave);
    /* ---------- la plata ---------- */
    const pagos = p.enCurso ? porPagar(sedes).map((x) => (x.id === "sunat" ? { ...x, monto: sunat.pagar.total } : x)) : [];
    const plata = p.enCurso ? calcularPlata(sedes, diario, pagos, sunat, contrib) : plataAlCierre(sedes, clave, teDejaMes);

    /* ---------- inventario (ropa al costo) ---------- */
    const invBase = { tru: 64200, aqp: 52800, lim: 47100 };
    const inv = todas ? { ...invBase, almacen: 23400 } : { [sede]: invBase[sede] };
    const invTotal = suma(Object.values(inv));
    const quietaPct = { tru: 0.09, aqp: 0.15, lim: 0.1, almacen: 0.12 };
    const quieta = suma(Object.entries(inv).map(([s, v]) => v * quietaPct[s]));
    const inventario = { porLugar: inv, total: invTotal, quieta, cobertura: invTotal / (costoMes || 1), comprasMes: r2(costoMes * (clave === "2026-11" ? 1.32 : 0.98)) };

    const m = {
      sede, sedes, todas, nombreSede: todas ? "Todas las sedes" : SEDES[sede].nombre, mes: p,
      ventas: {
        hoy: vHoy, mes: vMes, sinIgvHoy, igvHoy, antPunto: vAntPunto, antMes: vAntMes, cambio: vAntPunto ? vHoy / vAntPunto - 1 : 0,
        tickets: ticketsHoy, ticketsAnt: tickAntPunto, ticketProm: vHoy / ticketsHoy, ticketPromAnt: vAntPunto / tickAntPunto, medios,
        mejorDia: reales.reduce((a, b) => (b.venta > a.venta ? b : a), reales[0]),
        hoyDia: reales[reales.length - 1],
        ayer: reales[reales.length - 2] || null,
      },
      diario, curva, contrib,
      costo: { hoy: costoHoy, mes: costoMes },
      gastos: { mes: gMes, hoy: gHoy, totalMes: gastosMesTotal, totalHoy: gastosHoy, fijosMes, varMes },
      teDeja: {
        hoy: teDejaHoy, mes: teDejaMes, rango, pctMes: teDejaMes / sinIgvMes, porCien: (teDejaMes / vMes) * 100,
        antPunto: mAnt ? mAnt.teDejaPunto : null, antMes: mAnt ? mAnt.teDeja : null,
      },
      equilibrio: { necesitas, llevas: vHoy, avance: Math.min(1, vHoy / necesitas), dia: diaEq, cubierto: diaEq != null && diaEq <= hoyD, fijosMes },
      porSede, historia, sunat, plata, pagos, inventario,
    };
    m.avisos = avisos(m);
    cache.set(k, m);
    return m;
  }

  /* El mismo cálculo, solo los totales (para la historia y la comparación) */
  function modeloSimple(sedes, clave, corte) {
    const ts = sedes.map((s) => tienda(s, clave));
    const p = ts[0].p;
    const venta = suma(ts.map((t) => t.total));
    const costo = suma(ts.map((t) => suma(t.dias.map((d) => d.costo))));
    const tarjeta = suma(ts.map((t) => suma(t.dias.map((d) => d.medios[2]))));
    const g = gastosMes(sedes, clave, tarjeta);
    const gastos = suma(Object.values(g));
    const teDeja = venta / 1.18 - costo - gastos;
    let teDejaPunto = null;
    if (corte != null) {
      const vp = suma(ts.map((t) => suma(t.dias.slice(0, corte).map((d) => d.venta))));
      const cp = suma(ts.map((t) => suma(t.dias.slice(0, corte).map((d) => d.costo))));
      const fij = suma(TIPOS_GASTO.filter((x) => x.fijo).map((x) => g[x.clave]));
      const vr = gastos - fij;
      teDejaPunto = vp / 1.18 - cp - fij * (corte / p.dias) - vr * (vp / venta);
    }
    return { venta, costo, gastos, teDeja, teDejaPunto, g };
  }

  /* El mismo punto de otro mes (para «Contra: octubre / el año pasado»): lo vendido, las ventas, la curva de lo que deja cada venta
     y lo que dejaba a esa altura. */
  function punto(sede, clave, corte) {
    const sedes = sede === "todas" ? CLAVES_SEDE : [sede];
    const ts = sedes.map((s) => tienda(s, clave));
    const dias = ts[0].p.dias;
    const c = Math.min(corte, dias);
    const s = modeloSimple(sedes, clave, c);
    const fij = suma(TIPOS_GASTO.filter((x) => x.fijo).map((x) => s.g[x.clave]));
    const contrib = (s.venta / 1.18 - s.costo - (s.gastos - fij)) / s.venta;
    let acum = 0;
    const curva = [];
    for (let i = 0; i < dias; i++) { acum += suma(ts.map((t) => t.dias[i].venta)) * contrib; curva.push(acum); }
    return {
      clave, nombre: NOMBRE_MES[Number(clave.split("-")[1]) - 1], anio: Number(clave.split("-")[0]),
      venta: suma(ts.map((t) => suma(t.dias.slice(0, c).map((d) => d.venta)))), tickets: suma(ts.map((t) => suma(t.dias.slice(0, c).map((d) => d.tickets)))),
      teDejaPunto: s.teDejaPunto, teDeja: s.teDeja, ventaMes: s.venta, curva, fijos: fij, gastosPunto: fij * (c / dias) + (s.gastos - fij) * (suma(ts.map((t) => suma(t.dias.slice(0, c).map((d) => d.venta)))) / s.venta),
    };
  }

  function calcularSunat(clave) {
    /* El IGV y la renta de un mes se declaran y pagan el mes siguiente (cronograma por el último dígito del RUC: aquí, el 18). */
    const per = mesAnterior(clave);
    const o = modeloSimple(CLAVES_SEDE, per, null);
    const igvVentas = o.venta - o.venta / 1.18;
    const comprasConFactura = o.costo * 1.04 + o.g.servicios + o.g.publicidad + o.g.contador + o.g.envios + o.g.empaque + o.g.alquiler * 0.6;
    const igvCompras = comprasConFactura * 0.18;
    const igv = Math.max(0, igvVentas - igvCompras);
    const renta = (o.venta / 1.18) * 0.01;
    const sueldosBase = suma(CLAVES_SEDE.map((s) => BASE[s].sueldos)) + GENERALES.sueldos;
    const essalud = sueldosBase * 0.09;
    /* lo que vas juntando del mes en curso (se paga el mes que viene) */
    const n = modeloSimple(CLAVES_SEDE, clave, partesMes(clave).diaHoy);
    const tsN = CLAVES_SEDE.map((s) => tienda(s, clave));
    const dHoy = partesMes(clave).diaHoy;
    const vN = suma(tsN.map((t) => suma(t.dias.slice(0, dHoy).map((d) => d.venta))));
    const cN = suma(tsN.map((t) => suma(t.dias.slice(0, dHoy).map((d) => d.costo))));
    const igvJuntando = Math.max(0, (vN - vN / 1.18) - (cN * 1.04 + (n.g.servicios + n.g.publicidad + n.g.contador + n.g.alquiler * 0.6) * (dHoy / partesMes(clave).dias)) * 0.18);
    return {
      periodo: per, nombrePeriodo: NOMBRE_MES[Number(per.split("-")[1]) - 1], vence: new Date(2026, 10, 18),
      igvVentas, igvCompras, igv, renta, essalud,
      pagar: { igv: r2(igv), renta: r2(renta), essalud: r2(essalud), total: r2(igv + renta + essalud) },
      igvJuntando: r2(igvJuntando),
    };
  }

  function calcularPlata(sedes, diario, pagos, sunat, contrib) {
    const todas = sedes.length === 3;
    const ult2 = diario.filter((d) => d.real).slice(-2);
    const porAbonar = r2(suma(ult2.map((d) => d.medios[2])) * 0.968);
    const cajas = { tru: 2140.5, aqp: 1780.2, lim: 1352.8 };
    const lugares = [];
    if (todas) {
      lugares.push({ id: "bcp", nombre: "BCP · cuenta corriente", tipo: "banco", monto: 52340.75, nota: "Aquí entra Yape y Plin" });
      lugares.push({ id: "ibk", nombre: "Interbank · ahorros", tipo: "banco", monto: 18920.1, nota: "Aquí abona el POS" });
    }
    for (const s of sedes) lugares.push({ id: `caja-${s}`, nombre: `Caja de ${SEDES[s].nombre}`, tipo: "caja", sede: s, monto: cajas[s], nota: "Efectivo en la tienda" });
    lugares.push({ id: "pos", nombre: "Tarjetas por abonar", tipo: "camino", monto: todas ? porAbonar : r2(porAbonar * 0.3), nota: "Llega en 1 o 2 días" });
    const tienes = suma(lugares.map((l) => l.monto));
    const deClaudia = todas ? 4860 : 0;
    const limite = new Date(2026, 10, 9 + 14);
    const en14 = pagos.filter((x) => x.fecha <= limite);
    const pagos14 = suma(en14.map((x) => x.monto));
    const igvJuntando = todas ? sunat.igvJuntando : 0;
    const libre = todas ? tienes - deClaudia - pagos14 - igvJuntando : null;

    /* los próximos 30 días, día por día: lo que se espera vender (lo de hoy no cuenta dos veces) menos lo que se paga */
    const proy = [];
    let saldo = tienes - deClaudia;
    const ritmo = suma(diario.filter((d) => d.real).slice(-7).map((d) => d.venta)) / 7;
    const reposicion = 0.42; // lo que se va en reponer ropa de lo que se vende (NUEVA: la real es fn_flujo_caja_proyeccion)
    for (let i = 1; i <= 30; i++) {
      const fecha = new Date(2026, 10, 9 + i);
      const peso = pesoDia(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
      const entra = ritmo * (peso / 1.04) * (1 - reposicion);
      const sale = suma(pagos.filter((x) => +x.fecha === +fecha).map((x) => x.monto));
      saldo += entra - sale;
      proy.push({ fecha, entra, sale, saldo });
    }
    const minimo = !todas ? null : proy.slice(0, 14).reduce((a, b) => (b.saldo < a.saldo ? b : a), proy[0]);
    return { enCurso: true, lugares, tienes, deClaudia, pagos14, en14, igvJuntando, libre, proy, minimo, porAbonar };
  }

  function plataAlCierre(sedes, clave, teDeja) {
    const todas = sedes.length === 3;
    const idx = MESES.indexOf(clave);
    const base = todas ? 58000 + idx * 4200 + teDeja * 0.2 : 1500 + idx * 90;
    return { enCurso: false, tienes: base, lugares: [], libre: null };
  }

  /* ---------- «Hoy te toca»: como mucho 3, y solo si pasan su umbral ---------- */
  function avisos(m) {
    const a = [];
    if (!m.mes.enCurso) return a;
    const vencida = m.pagos.find((x) => x.vencida);
    if (vencida) a.push({ tono: "rojo", id: "vencida", titulo: `Paga la factura de Avíos Rímac`, texto: `Venció el viernes 6. Son ${soles(vencida.monto, true)}.`, hoja: "pagos" });
    const sun = m.pagos.find((x) => x.tipo === "sunat");
    if (sun) a.push({ tono: "ambar", id: "sunat", titulo: `Separa ${soles(sun.monto)} para SUNAT`, texto: "IGV, renta y EsSalud de octubre. Vence el miércoles 18.", hoja: "sunat" });
    /* una tienda que vende 8 % menos que a esta altura del mes pasado, con volumen suficiente (S/ 3,000 o más) */
    const caida = Object.entries(m.porSede).filter(([, v]) => v.cambio <= -0.08 && v.ventaAnt >= 3000).sort((x, y) => x[1].cambio - y[1].cambio)[0];
    if (caida) {
      const [s, v] = caida;
      const menosTickets = v.tickets < v.ticketsAnt;
      a.push({ tono: "ambar", id: "caida", titulo: `${SEDES[s].nombre} vende ${pct(-v.cambio)} menos`, texto: menosTickets ? `Que a esta altura de octubre. Entraron menos clientes; cada uno compró parecido.` : "Que a esta altura de octubre. Entró la misma gente, pero compró menos.", hoja: `sede-${s}` });
    }
    if (a.length < 3 && m.plata.minimo && m.plata.minimo.saldo > 0) {
      a.push({ tono: "verde", id: "justo", titulo: "La quincena está cubierta", texto: `El día más justo será el ${m.plata.minimo.fecha.getDate()}: te quedarían ${soles(m.plata.minimo.saldo)}.`, hoja: "plata" });
    }
    return a.slice(0, 3);
  }

  /* ---------- cómo se escribe ---------- */
  function soles(v, centimos) {
    const abs = Math.abs(v);
    const cuerpo = abs.toLocaleString("es-PE", { minimumFractionDigits: centimos ? 2 : 0, maximumFractionDigits: centimos ? 2 : 0 });
    const cero = Math.round(abs * (centimos ? 100 : 1)) === 0;
    return `${v < 0 && !cero ? "−" : ""}S/ ${cuerpo}`;
  }
  function solesCorto(v) {
    const abs = Math.abs(v), s = v < 0 ? "−" : "";
    if (abs >= 1000) return `${s}S/ ${(abs / 1000).toLocaleString("es-PE", { maximumFractionDigits: abs >= 100000 ? 0 : 1 }).replace(".", ",")} mil`;
    return `${s}S/ ${Math.round(abs)}`;
  }
  function pct(x, dec = 0) {
    return `${(Math.abs(x) * 100).toFixed(dec).replace(".", ",")} %`;
  }
  function fecha(d, conDia) {
    const t = `${d.getDate()} de ${NOMBRE_MES[d.getMonth()]}`;
    return conDia ? `${NOMBRE_DIA[d.getDay()]} ${t}` : t;
  }
  function cuandoRel(d) {
    const dias = Math.round((d - HOY) / 86400000);
    if (dias === 0) return "hoy";
    if (dias === 1) return "mañana";
    if (dias === -1) return "ayer";
    if (dias < 0) return `hace ${-dias} días`;
    if (dias < 7) return `el ${NOMBRE_DIA[d.getDay()]}`;
    return `en ${dias} días`;
  }

  window.CAYLA = {
    HOY, MESES, MES_HOY, SEDES, CLAVES_SEDE, TIPOS_GASTO, NOMBRE_MES, NOMBRE_DIA, DIA_CORTO,
    modelo, punto, partesMes, mesAnterior, soles, solesCorto, pct, fecha, cuandoRel, suma,
    MEDIOS: ["Efectivo", "Yape y Plin", "Tarjeta", "Transferencia"],
  };
})();
