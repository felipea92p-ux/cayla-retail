import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import {
  alDia,
  avisosParaDecidir,
  bajadaResumen,
  barrasSemanas,
  caminoEquilibrio,
  cifrasResumen,
  claveVer,
  coberturaTiendas,
  debesPronto,
  deUnidad,
  diasDelMes,
  equilibrio,
  frasesSalud,
  leerResumen,
  leerVerResumen,
  miniPresupuesto,
  noRevisado,
  notaUnidad,
  ordenarAvisos,
  tituloResumen,
  type Acceso,
  type Aviso,
} from "./resumen-finanzas-reglas";

// Las reglas del Resumen de Finanzas (ADR-0195 F10). Las cifras las da la base (cada fase); aquí se prueba qué se dice
// primero y cómo: las frases, las cinco cifras, los avisos de «Para decidir hoy» con su orden, su origen y su enlace, y los
// gráficos. El fixture tiene la forma de `fn_resumen_finanzas` con los números del spike: si el Resumen calza con el spike,
// estas pruebas lo dicen con los mismos números (S/ 80,851 vendido, 14 días de caja, «día 30», LIM «no cubre»…).

const todas = () => leerResumen(fixture.todas);
const tru = () => leerResumen(fixture.tru);
const LIDER: Acceso = { lider: true, modulos: [] };
const TODO_MODULO: Acceso = { lider: false, modulos: ["reportes_financieros", "cuentas_dinero", "gastos"] };
const claves = (as: readonly Aviso[]) => as.map((a) => a.clave.split(":")[0]);

describe("leer lo que manda la base", () => {
  it("cada parte llega como la dijo su fase, o dice por qué no está", () => {
    const r = todas();
    expect(r.mes).toBe("2026-09");
    expect(r.mesAnterior).toBe("2026-08");
    expect(r.ver).toEqual({ ubicacionId: null, soloEmpresa: false, todas: true, tipo: "todas", nombre: "CAYLA" });
    expect(r.flujo.estado).toBe("ok");
    expect(r.porPagar.estado === "ok" && r.porPagar.datos.filas.length).toBe(3);
    const c = leerResumen(fixture.colaboradora);
    expect(c.cuentas).toEqual({ estado: "sin_permiso", mensaje: expect.stringContaining("Cuentas y dinero") });
    expect(c.flujo).toEqual({ estado: "no_aplica" });
    expect(c.lider).toBe(false);
  });

  it("una parte que no llegó o que falló es una falla, nunca un cero", () => {
    const r = leerResumen({ hoy: "2026-09-24", mes: "2026-09-01", flujo: { falla: "no existe la función" } });
    expect(r.flujo).toEqual({ estado: "falla", mensaje: "no existe la función" });
    expect(r.porPagar.estado).toBe("falla");
    expect(cifrasResumen(r).find((x) => x.clave === "debes")?.valor).toBe("—");
  });

  it("«Ver»: el líder mira CAYLA entera por defecto; quien no es líder no elige", () => {
    expect(leerVerResumen(undefined, true)).toEqual({ clave: "todas", ubicacionId: null, soloEmpresa: false });
    expect(leerVerResumen("empresa", true)).toEqual({ clave: "empresa", ubicacionId: null, soloEmpresa: true });
    const id = "f775651f-62c8-4ff4-a414-b5614026d0cd";
    expect(leerVerResumen(id, true)).toEqual({ clave: id, ubicacionId: id, soloEmpresa: false });
    expect(leerVerResumen("cualquier-cosa", true).clave).toBe("todas");
    expect(leerVerResumen(id, false)).toEqual({ clave: "propia", ubicacionId: null, soloEmpresa: false });
    expect(claveVer(tru().ver)).toBe(tru().ver.ubicacionId);
    expect(claveVer(leerResumen(fixture.empresa).ver)).toBe("empresa");
  });
});

describe("punto de equilibrio (la regla de F5) y el día en que se cubre", () => {
  it("con los números del spike: TRU cubre el día 18; CAYLA, el 30; LIM no llega", () => {
    const r = todas();
    const er = r.resultadosAnterior.estado === "ok" ? r.resultadosAnterior.datos : [];
    const de = (u: string) => equilibrio(er.find((f) => f.nombre === u), 31);
    expect(de("Tienda TRU")).toMatchObject({ dia: 18 });
    expect(Math.round(de("Tienda TRU")!.pe)).toBe(25165);
    expect(de("CAYLA")).toMatchObject({ dia: 30 });
    expect(Math.round(de("CAYLA")!.pe)).toBe(91653);
    expect(de("Tienda LIM")).toMatchObject({ dia: null });
    expect(Math.round(de("Tienda LIM")!.pe)).toBe(24763);
  });

  it("sin ventas o sin margen no hay punto de equilibrio", () => {
    expect(equilibrio({ ventas: 0, margen: 0, gastos: 100 }, 30)).toBeNull();
    expect(equilibrio({ ventas: 1000, margen: -10, gastos: 100 }, 30)).toBeNull();
    expect(equilibrio(undefined, 30)).toBeNull();
    // Gastos cero o negativos (un sobrante de caja): cubre desde el día 1.
    expect(equilibrio({ ventas: 1000, margen: 500, gastos: -20 }, 30)?.dia).toBe(1);
  });

  it("los días de cada mes", () => {
    expect(diasDelMes("2026-08")).toBe(31);
    expect(diasDelMes("2026-02")).toBe(28);
    expect(diasDelMes("2028-02")).toBe(29);
  });
});

describe("la salud, en frases", () => {
  it("CAYLA entera: días de caja, el día en que cubre sus costos y la meta del mes (spike)", () => {
    const fs = frasesSalud(todas());
    expect(fs.map((f) => f.n)).toEqual(["14 días", "día 30", "97,2 %"]);
    expect(fs.map((f) => f.tono)).toEqual(["ambar", "ambar", "verde"]);
    expect(fs[0]!.d).toBe("S/ 60,410 disponibles contra S/ 4,092 que salen en un día normal. La semana del 12 – 18 oct bajas de tu mínimo.");
    expect(fs[1]!.d).toContain("Lo que vende después del día 30 (solo 1 día) es la ganancia.");
    expect(fs[2]!.d).toBe("Meta S/ 103,958; vas en S/ 80,851 y al cierre llegarías a S/ 101,064.");
  });

  it("una tienda: cuándo cubre sus costos y cuánto se va en alquiler", () => {
    const fs = frasesSalud(tru());
    expect(fs.map((f) => [f.n, f.tono])).toEqual([
      ["día 18", "verde"],
      ["10,2 %", "verde"],
    ]);
  });

  it("el Taller y la empresa: lo que costaron y en qué se fue", () => {
    const [f] = frasesSalud(leerResumen(fixture.taller));
    expect(f!.n).toBe("S/ 1,170");
    expect(f!.t).toBe("costó el Taller en agosto");
    expect(f!.d).toMatch(/^Alquileres S\/ 1,800 · Servicios básicos S\/ 710 · Suministros S\/ 520 · lo demás/);
    expect(frasesSalud(leerResumen(fixture.empresa))[0]!.t).toBe("costó lo de la empresa en agosto");
  });

  it("sin datos, se dice por qué, sin inventar un número", () => {
    const r = leerResumen(fixture.colaboradora);
    const [f] = frasesSalud(r);
    expect(f!.n).toBe("—");
    expect(f!.d).toBe("Sin ventas en agosto para calcularlo.");
  });
});

describe("las cinco cifras", () => {
  it("CAYLA entera, con los números del spike", () => {
    const cs = cifrasResumen(todas());
    expect(cs.map((c) => c.etiqueta)).toEqual(["Vendido en el mes", "Plata disponible", "Debes en 7 días", "Utilidad de agosto", "IGV estimado de sept."]);
    expect(cs.map((c) => c.valor)).toEqual(["S/ 80,851", "S/ 60,410", "S/ 43,012", "S/ 3,060", "S/ 5,400"]);
    expect(cs[0]!.detalle).toBe("TRU S/ 35,280 · AQP S/ 26,880 · LIM S/ 18,691");
    expect(cs[1]!.detalle).toBe("Bancos S/ 51,300 · cajones y cajas fuertes S/ 6,800 · tarjeta por abonar S/ 2,310");
    expect(cs[2]).toMatchObject({ rojo: true, detalle: "Incluye la planilla del 30. 1 vencida" });
    expect(cs[3]!.detalle).toBe("Margen bruto 52,3 %");
    expect(cs[4]!.detalle).toBe("Se declara en octubre · agosto: S/ 6,840 por declarar");
    for (const c of cs) expect(c.origen).not.toBe("");
  });

  it("una tienda: su efectivo, su parte de lo que se debe (sin planilla) y su meta", () => {
    const cs = cifrasResumen(tru());
    expect(cs.map((c) => c.valor)).toEqual(["S/ 35,280", "S/ 2,830", "S/ 7,012", "S/ 10,163", "95,8 %"]);
    expect(cs.map((c) => c.etiqueta)).toEqual(["Vendido en el mes", "Efectivo en la tienda", "Debes en 7 días", "Utilidad de agosto", "Meta de ventas"]);
    expect(cs[4]!.detalle).toBe("Proyección al cierre S/ 44,100 de S/ 46,017");
  });

  it("el Taller no vende; la empresa suma sus bancos sin la tarjeta de crédito", () => {
    const t = cifrasResumen(leerResumen(fixture.taller));
    expect(t.map((c) => c.valor)).toEqual(["—", "S/ 630", "S/ 0", "−S/ 1,170", "S/ 1,170"]);
    expect(t[0]!.detalle).toBe("El Taller no vende");
    const e = cifrasResumen(leerResumen(fixture.empresa));
    expect(e[1]).toMatchObject({ etiqueta: "Bancos y cuentas", valor: "S/ 53,610" });
  });

  it("lo que la cuenta no ve se explica en la cifra, no se esconde ni se vuelve cero", () => {
    const cs = cifrasResumen(leerResumen(fixture.colaboradora));
    expect(cs.find((c) => c.clave === "plata")).toMatchObject({ valor: "—", detalle: "Lo ve quien tiene Cuentas y dinero" });
    expect(cs.find((c) => c.clave === "debes")).toMatchObject({ valor: "—", detalle: "Lo ve quien tiene Cuentas y dinero" });
    expect(cs.find((c) => c.clave === "utilidad")?.detalle).toBe("Sin ventas en agosto");
  });

  it("«Debes en 7 días»: lo vencido, lo que vence en los días de Configuración y la planilla de esos días", () => {
    const d = debesPronto(todas())!;
    expect(d.vencidas.map((f) => f.proveedor)).toEqual(["Confecciones Andina SAC"]);
    expect(d.proximas.map((f) => f.proveedor)).toEqual(["Hidrandina", "Inmobiliaria San Isidro"]);
    expect(d.planilla).toEqual({ monto: 29800, fecha: "2026-09-30" });
    expect(d.monto).toBe(43012);
    expect(debesPronto(tru())!.planilla).toBeNull();
  });
});

describe("Para decidir hoy", () => {
  it("CAYLA entera: primero lo rojo; en lo ámbar, la caja bajo el mínimo antes que una luz que falta", () => {
    const as = avisosParaDecidir(todas(), LIDER);
    expect(claves(as)).toEqual(["vencida", "minimo", "vencen", "pierde", "fijo", "ppto", "ppto", "ppto", "campana", "cierre", "raro", "egresos", "umbral"]);
    expect(as[0]).toMatchObject({
      tono: "rojo",
      titulo: "Factura vencida: Confecciones Andina SAC",
      detalle: "Saldo S/ 6,400, venció hace 2 días.",
      impacto: "S/ 6,400 en juego",
      boton: "Pagar",
      origen: "Cuentas y dinero ▸ Por pagar",
    });
    expect(as[0]!.href).toMatch(/^\/finanzas\/dinero\/por-pagar\?ver=todas&pagar=/);
    expect(as[1]).toMatchObject({ tono: "ambar", titulo: "La semana del 12 – 18 oct quedas bajo tu mínimo de caja", impacto: "faltan S/ 490", href: "/finanzas/reportes/escenarios" });
    expect(as[1]!.detalle).toContain("Distribuidora Norte S/ 15,300");
    expect(as[3]).toMatchObject({ titulo: "LIM perdió S/ 2,484 en agosto", detalle: "Necesita vender S/ 24,763 al mes y vendió S/ 19,800." });
  });

  it("cada aviso dice de dónde sale y a dónde ir", () => {
    for (const a of avisosParaDecidir(todas(), LIDER)) {
      expect(a.origen, a.clave).not.toBe("");
      expect(a.href, a.clave).toMatch(/^\/finanzas\//);
    }
  });

  it("la campaña que viene: su meta sube menos de lo que su descuento exige (regla de F5)", () => {
    const c = avisosParaDecidir(todas(), LIDER).find((a) => a.clave.startsWith("campana"))!;
    expect(c.titulo).toBe("Aniversario CAYLA empieza en 7 días");
    expect(c.detalle).toBe(
      "Con 15 % de descuento, para ganar lo mismo que un día normal hay que vender 40,5 % más; la meta sube 30,0 %. Aunque llegue a la meta, gana menos."
    );
    // Con la meta subiendo lo que el descuento pide, no hay nada que decidir.
    const r = todas();
    if (r.campanas.estado === "ok") r.campanas.datos[0]!.metaPct = 45;
    expect(claves(avisosParaDecidir(r, LIDER))).not.toContain("campana");
  });

  it("el gasto fuera de lo normal lleva su insignia y el umbral de Configuración", () => {
    const g = avisosParaDecidir(todas(), LIDER).find((a) => a.raro)!;
    expect(g.titulo).toBe("SEAL de AQP vino 37,9 % más alto que su promedio");
    expect(g.detalle).toContain("S/ 662 en septiembre contra S/ 480 de promedio en 6 meses");
    expect(g.impacto).toBe("S/ 182 más de lo normal (avisa desde +25 %)");
    expect(g.href).toBe("/finanzas/gastos?mes=2026-09&ver=00000000-0000-4000-8000-000000000002");
  });

  it("el mes anterior sin cerrar: informativo en la primera semana, ámbar después", () => {
    const c = avisosParaDecidir(todas(), LIDER).find((a) => a.clave === "cierre")!;
    expect(c).toMatchObject({ tono: "ambar", titulo: "Agosto sigue abierto", href: "/finanzas/cierre?mes=2026-08" });
    expect(c.detalle).toContain("2 de 5 unidades cerradas; faltan LIM, Taller, De la empresa");
    const r = todas();
    r.hoy = "2026-09-03";
    expect(avisosParaDecidir(r, LIDER).find((a) => a.clave === "cierre")!.tono).toBe("pizarra");
    if (r.cierre.estado === "ok") r.cierre.datos.consolidado = true;
    expect(claves(avisosParaDecidir(r, LIDER))).not.toContain("cierre");
  });

  it("el presupuesto que se pasa: cada rubro de cada unidad, sin repetir la suma de CAYLA", () => {
    const ps = avisosParaDecidir(todas(), LIDER).filter((a) => a.clave.startsWith("ppto"));
    expect(ps.map((a) => a.titulo)).toEqual([
      "Publicidad y marketing de la empresa va a pasarse de su tope",
      "Suministros y útiles de TRU va a pasarse de su tope",
      "Servicios básicos de LIM va a pasarse de su tope",
    ]);
    expect(ps[1]!.detalle).toBe("Al cierre llegaría en S/ 380 contra un tope de S/ 320 (te pasas 18,8 %); lleva S/ 304.");
  });

  it("más de tres vencidas: las tres más grandes y el resto juntas", () => {
    const r = todas();
    if (r.porPagar.estado !== "ok") throw new Error("fixture");
    const base = r.porPagar.datos.filas[0]!;
    r.porPagar.datos.filas = [100, 900, 300, 500, 700].map((saldo, i) => ({ ...base, id: `v${i}`, saldo, vence: "2026-09-20" }));
    const vs = avisosParaDecidir(r, LIDER).filter((a) => a.clave.startsWith("vencida"));
    expect(vs.map((a) => a.peso)).toEqual([900, 700, 500, 400]);
    expect(vs[3]).toMatchObject({ titulo: "2 deudas vencidas más", detalle: "Por S/ 400 en total." });
  });

  it("sin nada pendiente no hay avisos (la pantalla dice «Nada urgente»)", () => {
    const vacio = leerResumen({
      hoy: "2026-09-24",
      mes: "2026-09-01",
      mes_anterior: "2026-08-01",
      lider: true,
      ver: { todas: true, tipo: "todas", nombre: "CAYLA" },
      por_pagar: { dias: 7, total: 0, n: 0, filas: [] },
      egresos: { n: 0, monto: 0, por_ubicacion: [] },
      fijos: { filas: [] },
      raros: { filas: [] },
      campanas: { filas: [] },
      presupuesto: { filas: [] },
      sin_cuenta: { filas: [] },
      cierre: { mes: "2026-08-01", consolidado: true, unidades: [] },
      resultados_anterior: { filas: [] },
      flujo: { saldo_hoy: 50000, minimo_caja: 15000, dias_de_caja: 40, salidas_diarias: 1000, semanas: [{ desde: "2026-09-25", hasta: "2026-10-01", entra: 1, sale: 1, saldo: 50000, bajo_minimo: false }], salidas: [] },
    });
    expect(avisosParaDecidir(vacio, LIDER)).toEqual([]);
    expect(noRevisado(vacio).filter((t) => !t.startsWith("Las campañas"))).toEqual([]);
  });

  it("sin el módulo de donde se actúa, el aviso se lee pero no ofrece un enlace que no abriría", () => {
    const r = todas();
    r.lider = false; // quien no es líder no manda `?ver=`: su pantalla ya mira su tienda
    const sinGastos = avisosParaDecidir(r, { lider: false, modulos: ["reportes_financieros", "cuentas_dinero"] });
    expect(sinGastos.find((a) => a.clave.startsWith("fijo"))!.href).toBeNull();
    expect(sinGastos.find((a) => a.clave === "egresos")!.href).toBeNull();
    expect(sinGastos.find((a) => a.clave === "vencen")!.href).toBe("/finanzas/dinero/por-pagar");
    // Quien no es líder no prueba escenarios (son de CAYLA entera): va a su estado de resultados.
    expect(avisosParaDecidir(todas(), TODO_MODULO).find((a) => a.clave.startsWith("pierde"))).toMatchObject({ href: "/finanzas/reportes", boton: "Ver resultados" });
  });

  it("lo que la cuenta no pudo revisar se lista, con quién lo ve", () => {
    expect(noRevisado(leerResumen(fixture.colaboradora))).toEqual([
      "Lo que vence: lo ve quien tiene Cuentas y dinero.",
      "Los egresos de caja: lo ve quien tiene Gastos.",
      "Los gastos fijos: lo ve quien tiene Gastos.",
    ]);
    expect(noRevisado(todas())).toEqual([]);
  });

  it("orden: tono, luego la clase del aviso, luego los soles en juego", () => {
    const a = (clave: string, tono: Aviso["tono"], orden: number, peso: number): Aviso => ({ clave, tono, orden, peso, titulo: "", detalle: "", impacto: null, href: null, boton: "", origen: "x" });
    expect(ordenarAvisos([a("p", "pizarra", 0, 9e9), a("a2", "ambar", 4, 900), a("a1", "ambar", 1, 10), a("r", "rojo", 11, 1), a("a3", "ambar", 4, 1000)]).map((x) => x.clave)).toEqual([
      "r",
      "a1",
      "a3",
      "a2",
      "p",
    ]);
  });

  it("una tienda ve solo lo suyo: su vencida, lo que vence, su rubro que se pasa, la campaña y sus egresos", () => {
    expect(claves(avisosParaDecidir(tru(), LIDER))).toEqual(["vencida", "vencen", "ppto", "campana", "egresos"]);
  });

  it("el Taller: su mes sin cerrar, «del Taller»", () => {
    expect(avisosParaDecidir(leerResumen(fixture.taller), LIDER).map((a) => a.titulo)).toEqual(["Agosto del Taller sigue abierto"]);
  });
});

describe("la columna derecha", () => {
  it("¿cada tienda cubre sus costos? (spike: 175 %, 155 %, LIM no cubre)", () => {
    const { barras, sinDatos } = coberturaTiendas(todas());
    expect(barras.map((b) => [b.nombre, b.valor, b.mala])).toEqual([
      ["TRU", 175, false],
      ["AQP", 155, false],
      ["LIM", 80, true],
    ]);
    expect(barras[2]!.lineas).toEqual(["Necesita S/ 24,763 · vendió S/ 19,800", "Le faltan S/ 4,963 al mes"]);
    expect(sinDatos).toEqual([]);
  });

  it("el saldo de las próximas 6 semanas contra el mínimo (F6)", () => {
    const r = todas();
    if (r.flujo.estado !== "ok") throw new Error("fixture");
    const bs = barrasSemanas(r.flujo.datos);
    expect(bs.map((b) => b.valor)).toEqual([26410, 33510, 14510, 26710, 17510, 24910]);
    expect(bs.map((b) => b.mala)).toEqual([false, false, true, false, false, false]);
    expect(bs.map((b) => b.nombre)).toEqual(["28 sep", "5 oct", "12", "19", "26", "2 nov"]);
    expect(bs[0]!.titulo).toBe("28 sep – 4 oct");
  });

  it("una tienda: el camino a su punto de equilibrio y su presupuesto", () => {
    expect(caminoEquilibrio(tru())).toMatchObject({ vendido: 35280, ancho: 100, texto: "Ya cubrió los costos del mes: desde aquí, cada sol de margen es ganancia." });
    const lim = leerResumen(fixture.todas);
    // Mirando LIM (con sus filas): le falta, y dice cuánto por día.
    lim.ver = { ubicacionId: "00000000-0000-4000-8000-000000000003", soloEmpresa: false, todas: false, tipo: "tienda", nombre: "Tienda LIM" };
    expect(caminoEquilibrio(lim)!.texto).toBe("Le faltan S/ 6,072 en 6 días: unos S/ 1,012 diarios. Hoy vende S/ 779 al día.");
    expect(miniPresupuesto(tru()).map((f) => [f.nombre, f.pct, f.tono])).toEqual([
      ["Alquileres", "100,0 %", "verde"],
      ["Servicios básicos", "95,4 %", "verde"],
      ["Suministros y útiles", "118,8 %", "rojo"],
      ["Transporte y movilidad", "80,0 %", "verde"],
    ]);
  });
});

describe("la cabecera", () => {
  it("el título dice qué se mira y a qué día (spike)", () => {
    expect(tituloResumen(todas())).toBe("CAYLA, al jueves 24 de septiembre");
    expect(tituloResumen(tru())).toBe("Tienda TRU, al jueves 24");
    expect(alDia("2026-09-28", false)).toBe("al lunes 28");
    expect(bajadaResumen(tru())).toBe("Solo Tienda TRU. Para ver el negocio entero, elige «Todas las tiendas».");
    expect(bajadaResumen(leerResumen(fixture.colaboradora))).toBe("Lo de Tienda Trujillo: sus ventas, sus gastos y lo que conviene decidir hoy.");
  });

  it("la nota del Taller y de la empresa; una tienda no lleva nota", () => {
    expect(notaUnidad(leerResumen(fixture.taller))).toContain("El Taller no vende");
    expect(notaUnidad(leerResumen(fixture.empresa))).toContain("no es de ninguna tienda");
    expect(notaUnidad(tru())).toBeNull();
  });

  it("el nombre de una unidad dentro de una frase", () => {
    expect(deUnidad("Tienda Trujillo")).toBe("de Trujillo");
    expect(deUnidad("Taller")).toBe("del Taller");
    expect(deUnidad("De la empresa")).toBe("de la empresa");
  });
});
