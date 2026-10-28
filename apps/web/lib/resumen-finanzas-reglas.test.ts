import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import {
  avisosParaDecidir,
  claveVer,
  debesPronto,
  deUnidad,
  diasDelMes,
  equilibrio,
  explicarFallaLectura,
  leerResumen,
  leerVerResumen,
  motivoSinEquilibrio,
  noRevisado,
  ordenarAvisos,
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
    // Gastos en cero, o solo un sobrante de caja: no hay con qué medir (antes decía «cubre desde el día 1»; auditoría v3, hallazgo 1).
    expect(equilibrio({ ventas: 1000, margen: 500, gastos: -20 }, 30)).toBeNull();
    expect(equilibrio({ ventas: 1000, margen: 500, gastos: -20, detalleGastos: [{ cuenta: "6599", nombre: "Diferencias de caja", monto: -20 }] }, 30)).toBeNull();
    // Un sobrante sobre gastos reales sigue contando: cubre desde el día 1.
    expect(equilibrio({ ventas: 1000, margen: 500, gastos: -20, detalleGastos: [{ cuenta: "63", nombre: "Alquiler", monto: 100 }, { cuenta: "6599", nombre: "Diferencias de caja", monto: -120 }] }, 30)?.dia).toBe(1);
  });

  it("los días de cada mes", () => {
    expect(diasDelMes("2026-08")).toBe(31);
    expect(diasDelMes("2026-02")).toBe(28);
    expect(diasDelMes("2028-02")).toBe(29);
  });
});

// Las frases de salud del spike («14 días de caja», «cubre sus costos el día 30») salieron del Resumen con el camino A
// (ADR-0417, 2026-10-15): lo que decían lo dice ahora El Pulso (`pulso-reglas.ts`), con su propia prueba.

describe("las cinco cifras", () => {

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
      detalle: "Saldo S/\u00a06,400, venció hace 2 días.",
      impacto: "S/\u00a06,400 en juego",
      boton: "Pagar",
      origen: "Cuentas y dinero ▸ Por pagar",
    });
    expect(as[0]!.href).toMatch(/^\/finanzas\/dinero\/por-pagar\?ver=todas&pagar=/);
    expect(as[1]).toMatchObject({ tono: "ambar", titulo: "La semana del 12 – 18 oct quedas bajo tu mínimo de caja", impacto: "faltan S/\u00a0490", href: "/finanzas/reportes/escenarios" });
    expect(as[1]!.detalle).toContain("Distribuidora Norte S/\u00a015,300");
    expect(as[3]).toMatchObject({ titulo: "LIM perdió S/\u00a02,484 en agosto", detalle: "Necesita vender S/\u00a024,763 al mes y vendió S/\u00a019,800." });
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
    expect(g.detalle).toContain("S/\u00a0662 en septiembre contra S/\u00a0480 de promedio en 6 meses");
    expect(g.impacto).toBe("S/\u00a0182 más de lo normal (avisa desde +25 %)");
    expect(g.href).toBe("/finanzas/gastos?mes=2026-09&ver=00000000-0000-4000-8000-000000000002");
  });

  describe("el aviso anticipado del límite (parámetro)", () => {
    const conAviso = (cambios: Record<string, unknown>) => {
      const r = todas();
      if (r.igv.estado !== "ok") throw new Error("el fixture trae Impuestos");
      Object.assign(r.igv.datos.umbral, { anio: 2026, ventasAnio: 1_400_000, ventasAnioErp: 1_400_000, avisoSoles: 1_375_000, avisoAlcanzado: true, ...cambios });
      return r;
    };

    it("sin aviso configurado, o lejos de él, el aviso del límite es el de siempre: «Vas al X %»", () => {
      const u = avisosParaDecidir(todas(), LIDER).find((a) => a.clave === "umbral")!;
      expect(u.titulo).toMatch(/^Vas al 73[.,]6 % del límite de 300 UIT$/);
      expect(claves(avisosParaDecidir(todas(), LIDER))).not.toContain("umbral_aviso");
    });

    it("al llegar al aviso sale «Llevas S/ X vendidos este año, a S/ Y de las 300 UIT: habla con tu contador» y REEMPLAZA al «Vas al X %»", () => {
      const as = avisosParaDecidir(conAviso({}), LIDER);
      const a = as.find((x) => x.clave === "umbral_aviso")!;
      expect(a).toMatchObject({
        tono: "ambar",
        titulo: "Llevas S/\u00a01,400,000 vendidos este año, a S/\u00a0250,000 de las 300 UIT: habla con tu contador.",
        href: "/finanzas/impuestos",
        origen: "Impuestos",
      });
      expect(claves(as)).not.toContain("umbral");
    });

    it("el mismo aviso dice qué cuenta: lo registrado en el sistema, que puede quedar por debajo de la cifra real", () => {
      const a = avisosParaDecidir(conAviso({ primerMes: "2026-09" }), LIDER).find((x) => x.clave === "umbral_aviso")!;
      expect(a.detalle).toContain("El aviso cuenta lo registrado en el sistema: puede quedar por debajo de la cifra real.");
    });

    it("pasado el límite manda el aviso rojo de siempre y no se repite", () => {
      const as = avisosParaDecidir(conAviso({ ventasAnio: 1_700_000, avisoAlcanzado: false, cruzado: true, avance: 1.03 }), LIDER);
      expect(as.find((x) => x.clave === "umbral")).toMatchObject({ tono: "rojo", titulo: "Cruzaste el límite de 300 UIT" });
      expect(claves(as)).not.toContain("umbral_aviso");
    });

    it("una cuenta sin el módulo Impuestos lo lee igual, sin enlace", () => {
      const a = avisosParaDecidir(conAviso({}), { lider: false, modulos: ["gastos"] }).find((x) => x.clave === "umbral_aviso")!;
      expect(a.href).toBeNull();
    });
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
    expect(ps[1]!.detalle).toBe("Al cierre llegaría en S/\u00a0380 contra un tope de S/\u00a0320 (te pasas 18,8 %); lleva S/\u00a0304.");
  });

  it("más de tres vencidas: las tres más grandes y el resto juntas", () => {
    const r = todas();
    if (r.porPagar.estado !== "ok") throw new Error("fixture");
    const base = r.porPagar.datos.filas[0]!;
    r.porPagar.datos.filas = [100, 900, 300, 500, 700].map((saldo, i) => ({ ...base, id: `v${i}`, saldo, vence: "2026-09-20" }));
    const vs = avisosParaDecidir(r, LIDER).filter((a) => a.clave.startsWith("vencida"));
    expect(vs.map((a) => a.peso)).toEqual([900, 700, 500, 400]);
    expect(vs[3]).toMatchObject({ titulo: "2 deudas vencidas más", detalle: "Por S/\u00a0400 en total." });
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


describe("la cabecera", () => {

  it("el nombre de una unidad dentro de una frase", () => {
    expect(deUnidad("Tienda Trujillo")).toBe("de Trujillo");
    expect(deUnidad("Taller")).toBe("del Taller");
    expect(deUnidad("De la empresa")).toBe("de la empresa");
  });
});

// ---- Finanzas cuenta desde una fecha (ADR-0332) -------------------------------------------------------------------------
// El caso real del 2026-10-04: el sistema arrancó en octubre y el «último mes completo» (septiembre) solo tiene la planilla de
// Dynamic contra 15 ventas de piloto. Con el corte puesto, esa utilidad no se muestra; lo que viene (caja) y el IGV sí.

describe("Finanzas cuenta desde una fecha", () => {
  const conCorte = (base: unknown, inicio: string | null, mesAnt: string) => {
    const b = base as Record<string, unknown>;
    return leerResumen({ ...b, mes_anterior: `${mesAnt}-01`, parametros: { ...(b.parametros as object), inicio_finanzas: inicio } });
  };

  it("con el corte DESPUÉS del último mes completo, ese mes no se mide ni se pide cerrar", () => {
    const r = conCorte(fixture.todas, "2026-09-01", "2026-08");
    expect(r.antesDelCorte).toBe("2026-09-01");
    expect(r.resultadosAnterior).toEqual({ estado: "no_aplica" });
    expect(r.cierre).toEqual({ estado: "no_aplica" });
    expect(claves(avisosParaDecidir(r, LIDER))).not.toContain("cierre");
    expect(claves(avisosParaDecidir(r, LIDER))).not.toContain("pierde");
  });

  it("un corte que NO es posterior al último mes completo no cambia nada (el mes anterior ya cuenta)", () => {
    const r = conCorte(fixture.todas, "2026-08-01", "2026-08");
    expect(r.antesDelCorte).toBeNull();
    expect(r.resultadosAnterior.estado).toBe("ok");
    const r2 = conCorte(fixture.todas, "2026-01-01", "2026-08");
    expect(r2.antesDelCorte).toBeNull();
  });

  it("una base sin la migración (sin la clave) se lee como sin corte", () => {
    const b = fixture.todas as Record<string, unknown>;
    const r = leerResumen({ ...b, parametros: { minimo_caja: 15000, aviso_gasto_pct: 25, aviso_vence_dias: 7 } });
    expect(r.antesDelCorte).toBeNull();
    expect(r.resultadosAnterior.estado).toBe("ok");
  });
});


describe("que el número diga la verdad (auditoría v3 del Resumen, 2026-10-23)", () => {
  it("cada motivo por su nombre", () => {
    expect(motivoSinEquilibrio({ ventas: 0, margen: 0, gastos: 500 })).toBe("sin_ventas");
    expect(motivoSinEquilibrio({ ventas: 500, margen: -10, gastos: 500 })).toBe("sin_margen");
    expect(motivoSinEquilibrio({ ventas: 500, margen: 200, gastos: 0 })).toBe("sin_gastos");
    expect(motivoSinEquilibrio({ ventas: 500, margen: 200, gastos: 100 })).toBeNull();
  });

  it("una lectura que falla se explica sin el texto crudo de la base", () => {
    const sinFuncion = explicarFallaLectura({ code: "PGRST202", message: "Could not find the function retail.fn_finanzas_confianza(p_mes, p_ubicacion_id) in the schema cache" }, "medir qué tan seguro es este número");
    expect(sinFuncion).toBe("No se pudo medir qué tan seguro es este número: esta parte todavía no está instalada en la base. Lo demás del Resumen sigue al día. Avisa a Felipe.");
    expect(sinFuncion).not.toMatch(/schema|function|retail\./i);
    expect(explicarFallaLectura({ code: "42501", message: "permission denied" }, "leer el resumen")).toMatch(/permiso/);
    expect(explicarFallaLectura({ message: "TypeError: fetch failed" }, "leer el resumen")).toMatch(/conexión/);
    expect(explicarFallaLectura({ code: "XX000", message: "boom" }, "leer el resumen")).toBe("No se pudo leer el resumen. Vuelve a cargar la página; si sigue igual, avisa a Felipe.");
  });
});
