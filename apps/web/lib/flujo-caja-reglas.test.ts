import { describe, expect, it } from "vitest";
import fixture from "./flujo-caja.fixture.json";
import { leerFilaER, type FilaER } from "./resultados-reglas";
import {
  solesCentimos,
  PALANCAS_INICIALES,
  SIN_COMPRA_DE_CAMPANA,
  alquilerDe,
  alquilerDePartida,
  alquilerDeFijos,
  cajaDiaria,
  campanasDeSemana,
  conclusiones,
  etiquetaMesBase,
  etiquetaSemana,
  etiquetasEje,
  hayCambios,
  leerFlujoReal,
  leerProyeccion,
  leerSemanas,
  csvEscenario,
  rangoDelMes,
  proyectar,
  queFaltaEnLaProyeccion,
  puntoMasBajo,
  queVence,
  salidasConPalancas,
  soles,
  solesConSigno,
  sumarMesesIso,
  textoCategoria,
  textoSinCuenta,
  textoSinAlquiler,
  tiendaInicial,
  tiendasDeLaProyeccion,
  tonoDiasDeCaja,
  utilidadConCambios,
  type Palancas,
  type Proyeccion,
} from "./flujo-caja-reglas";

// La proyección y el flujo real salen de la base local (escena de septiembre, deshecha): `flujo-caja.fixture.json`.
const REAL = leerFlujoReal(fixture.real);
const PROY = leerProyeccion(fixture.proyeccion);
const con = (p: Partial<Palancas>): Palancas => ({ ...PALANCAS_INICIALES, ...p });
const TRU = PROY.cobros.find((c) => c.tienda === "Tienda Trujillo")!.ubicacionId;
const LIM = PROY.cobros.find((c) => c.tienda === "Tienda Lima")!.ubicacionId;

/** Una proyección chica, a mano: dos semanas, dos tiendas, un pago y dos alquileres fijos. */
const CHICA: Proyeccion = {
  hoy: "2026-09-24",
  desde: "2026-09-25",
  hasta: "2026-10-08",
  saldoHoy: 10_000,
  minimoCaja: 5_000,
  salidasDiarias: 500,
  diasDeCaja: 20,
  salidas30: { conCuenta: 12_000, sinCuenta: 0, planilla: 3_000 },
  historiaDias: null,
  saldoInicialDeclarado: null,
  hayFacturasDeProveedor: null,
  incluyeImpuestos: null,
  saldoFavorIgvDeclarado: null,
  diasDeCajaConfiable: null,
  planillaVisible: true,
  semanas: [
    { desde: "2026-09-25", hasta: "2026-10-01", entra: 0, sale: 0, saldo: 0, bajoMinimo: false },
    { desde: "2026-10-02", hasta: "2026-10-08", entra: 0, sale: 0, saldo: 0, bajoMinimo: false },
  ],
  cobros: [
    { fecha: "2026-09-26", ubicacionId: "t1", tienda: "Tienda Uno", monto: 1_000, origen: "meta", metaPct: 0, campanas: [] },
    { fecha: "2026-09-26", ubicacionId: "t2", tienda: "Tienda Dos", monto: 500, origen: "promedio", metaPct: 0, campanas: [] },
    {
      fecha: "2026-10-03",
      ubicacionId: "t1",
      tienda: "Tienda Uno",
      monto: 1_300,
      origen: "meta",
      metaPct: 30,
      campanas: [{ nombre: "Aniversario CAYLA", desde: "2026-10-01", hasta: "2026-10-14", metaPct: 30 }],
    },
  ],
  salidas: [
    { tipo: "vencimiento", id: "compras:a", fecha: "2026-09-28", vence: "2026-09-28", titulo: "Distribuidora Norte", detalle: "F001-1", clase: "mercaderia", ubicacionId: "t1", unidad: "Tienda Uno", monto: 4_000, atrasada: false },
    { tipo: "fijo", id: "f1:2026-09", fecha: "2026-09-30", vence: "2026-09-30", titulo: "Alquiler Uno", detalle: "Tienda Uno", clase: "alquileres", ubicacionId: "t1", unidad: "Tienda Uno", monto: 3_000, atrasada: false },
    { tipo: "fijo", id: "f2:2026-10", fecha: "2026-10-05", vence: "2026-10-05", titulo: "Alquiler Dos", detalle: "Tienda Dos", clase: "alquileres", ubicacionId: "t2", unidad: "Tienda Dos", monto: 2_000, atrasada: false },
    { tipo: "planilla", id: "TRU:2026-10", fecha: "2026-10-05", vence: "2026-10-05", titulo: "Planilla · Tienda Uno", detalle: "", clase: "planilla", ubicacionId: "t1", unidad: "Tienda Uno", monto: 1_500, atrasada: false },
  ],
};

const pintar = (l: (string | { b: string })[]) => l.map((p) => (typeof p === "string" ? p : p.b)).join("");

describe("Lo que ya pasó (fn_flujo_caja_real)", () => {
  it("lee lo que devuelve la base (los numeric llegan como texto) y cuadra: inicial + entró − salió + ajustes = final", () => {
    const f = leerFlujoReal({ saldo_inicial: "100.50", saldo_final: "130.50", entro: "50", salio: "20", ajustes: "0", descuadre: "0", categorias: [], semanas: [] });
    expect(f.saldoInicial).toBe(100.5);
    expect(f.saldoInicial + f.entro - f.salio + f.ajustes).toBe(f.saldoFinal);
    expect(REAL.descuadre).toBe(0);
    expect(Math.round((REAL.saldoInicial + REAL.entro - REAL.salio + REAL.ajustes) * 100) / 100).toBe(REAL.saldoFinal);
  });

  it("las semanas de la base suman lo que entró y la última termina en el saldo final", () => {
    const suma = REAL.semanas.reduce((a, s) => a + s.entro, 0);
    expect(Math.round(suma * 100) / 100).toBe(REAL.entro);
    expect(REAL.semanas.at(-1)!.saldo).toBe(REAL.saldoFinal);
  });

  it("lo «sin cuenta» se dice aparte, de mayor a menor, sin ceros", () => {
    expect(textoSinCuenta([{ origen: "cobros", n: 3, monto: 384.6 }, { origen: "pago", n: 22, monto: -29596.08 }, { origen: "gasto", n: 1, monto: 0.2 }])).toBe(
      "S/\u00a029,596 en 22 movimientos de pagos a proveedores (en efectivo o de la empresa) · S/\u00a0385 en 3 movimientos de cobros de un medio que su tienda no dice a qué cuenta entra",
    );
    expect(textoSinCuenta([])).toBeNull();
  });
});

describe("Rótulos", () => {
  it("el QR tiene su rótulo y su lugar entre los medios de cobro (auditoría de Finanzas 2026-10-16, G05)", () => {
    expect(textoCategoria("qr")).toBe("QR");
  });

  it("soles con el signo delante del símbolo, sin céntimos", () => {
    expect(soles(-2484.4)).toBe("−S/\u00a02,484");
    expect(soles(38200)).toBe("S/\u00a038,200");
    expect(solesConSigno(8300)).toBe("+S/\u00a08,300");
    expect(solesConSigno(-41300)).toBe("−S/\u00a041,300");
  });

  it("semanas: «5 – 11 oct», «28 sep – 4 oct», un día; y el eje con el mes solo al cambiar", () => {
    expect(etiquetaSemana("2026-10-05", "2026-10-11")).toBe("5 – 11 oct");
    expect(etiquetaSemana("2026-09-28", "2026-10-04")).toBe("28 sep – 4 oct");
    expect(etiquetaSemana("2026-09-24", "2026-09-24")).toBe("24 sep");
    expect(etiquetasEje(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-26", "2026-11-02"])).toEqual(["28 sep", "5 oct", "12", "26", "2 nov"]);
  });

  it("qué vence: la planilla junta, los más grandes primero y el primero con su monto", () => {
    expect(queVence(CHICA.salidas, "2026-10-02", "2026-10-08")).toBe("Alquiler Dos S/\u00a02,000 · Planilla");
    expect(queVence(CHICA.salidas, "2026-09-25", "2026-10-01")).toBe("Distribuidora Norte S/\u00a04,000 · Alquiler Uno");
    expect(queVence([], "2026-09-25", "2026-10-01")).toBe("Nada vence");
  });

  it("la campaña de una semana dice desde o hasta qué día rige", () => {
    expect(campanasDeSemana(CHICA.cobros, "2026-09-25", "2026-10-01")).toEqual([]);
    expect(campanasDeSemana(CHICA.cobros, "2026-09-28", "2026-10-04")).toEqual(["Aniversario CAYLA desde el 1"]);
    expect(campanasDeSemana(CHICA.cobros, "2026-10-02", "2026-10-08")).toEqual(["Aniversario CAYLA"]);
    const c = [{ ...CHICA.cobros[2]!, fecha: "2026-10-01" }];
    expect(campanasDeSemana(c, "2026-09-28", "2026-10-04")).toEqual(["Aniversario CAYLA desde el 1"]);
    expect(campanasDeSemana([{ ...c[0]!, fecha: "2026-10-13" }], "2026-10-12", "2026-10-18")).toEqual(["Aniversario CAYLA hasta el 14"]);
  });

  it("días de caja: rojo bajo 10, ámbar bajo 20", () => {
    expect([tonoDiasDeCaja(null), tonoDiasDeCaja(4), tonoDiasDeCaja(12), tonoDiasDeCaja(39)]).toEqual(["neutro", "rojo", "ambar", "verde"]);
  });
});

describe("La cuenta de la proyección (la misma de la base)", () => {
  it("sin palancas, da EXACTAMENTE las semanas que calculó la base", () => {
    expect(proyectar(PROY)).toEqual(PROY.semanas);
  });

  it("la semana bajo el mínimo es la de la base (y una sola en este ejemplo)", () => {
    const bajo = proyectar(PROY).filter((w) => w.bajoMinimo);
    expect(bajo.map((w) => w.desde)).toEqual(PROY.semanas.filter((w) => w.bajoMinimo).map((w) => w.desde));
    expect(puntoMasBajo(proyectar(PROY))!.saldo).toBe(Math.min(...PROY.semanas.map((w) => w.saldo)));
  });

  it("de dónde sale lo que se espera cobrar de cada tienda: su meta o su promedio", () => {
    expect(tiendasDeLaProyeccion(CHICA)).toEqual([
      { id: "t2", nombre: "Tienda Dos", origen: "promedio", corto: false },
      { id: "t1", nombre: "Tienda Uno", origen: "meta", corto: false },
    ]);
  });

  it("a mano: saldo + lo que entra − lo que sale, semana por semana, y el mínimo", () => {
    const w = proyectar(CHICA);
    expect(w.map((x) => [x.entra, x.sale, x.saldo, x.bajoMinimo])).toEqual([
      [1_500, 7_000, 4_500, true],
      [1_300, 3_500, 2_300, true],
    ]);
  });
});

describe("Escenarios: las palancas", () => {
  it("ventas de todas las tiendas +10 %: lo que entra sube 10 % cada semana", () => {
    const w = proyectar(CHICA, con({ ventasTodas: 10 }));
    expect(w.map((x) => x.entra)).toEqual([1_650, 1_430]);
    expect(w[1]!.saldo).toBe(10_000 + 1_650 - 7_000 + 1_430 - 3_500);
  });

  it("ventas de una tienda +20 %: solo esa; cerrarla: sin sus cobros (lo que se debe sigue)", () => {
    expect(proyectar(CHICA, con({ tienda: "t2", ventasTienda: 20 })).map((x) => x.entra)).toEqual([1_600, 1_300]);
    const cerrada = proyectar(CHICA, con({ tienda: "t1", cerrarTienda: true, ventasTienda: 20 }));
    expect(cerrada.map((x) => [x.entra, x.sale])).toEqual([
      [500, 7_000],
      [0, 3_500],
    ]);
  });

  it("pasar un pago una semana: sale de su semana y entra en la siguiente; más allá del horizonte, sale del cálculo", () => {
    const w = proyectar(CHICA, con({ moverPago: { id: "compras:a", semanas: 1 } }));
    expect(w.map((x) => x.sale)).toEqual([3_000, 7_500]);
    const fuera = proyectar(CHICA, con({ moverPago: { id: "compras:a", semanas: 3 } }));
    expect(fuera.map((x) => x.sale)).toEqual([3_000, 3_500]);
  });

  it("adelantar un pago no lo lleva antes de mañana", () => {
    const s = salidasConPalancas(CHICA, con({ moverPago: { id: "f2:2026-10", semanas: -2 } }), null);
    expect(s.find((x) => x.id === "f2:2026-10")!.fecha).toBe("2026-09-25");
  });

  it("el alquiler de una tienda: escala sus fijos de alquiler, no los de otra", () => {
    expect(alquilerDeFijos(CHICA.salidas, "t1")).toBe(3_000);
    const w = proyectar(CHICA, con({ tienda: "t1", alquilerTienda: 2_400 }), 3_000);
    expect(w.map((x) => x.sale)).toEqual([6_400, 3_500]);
  });

  it("un gasto nuevo: una vez en su semana, o cada mes mientras dure el horizonte", () => {
    expect(proyectar(CHICA, con({ gastoNuevo: { monto: 800, mensual: false, semana: 1 } })).map((x) => x.sale)).toEqual([7_000, 4_300]);
    const largo: Proyeccion = { ...CHICA, hasta: "2026-11-05", semanas: [...CHICA.semanas, { desde: "2026-10-30", hasta: "2026-11-05", entra: 0, sale: 0, saldo: 0, bajoMinimo: false }] };
    const mensual = salidasConPalancas(largo, con({ gastoNuevo: { monto: 800, mensual: true, semana: 0 } }), null).filter((s) => s.tipo === "nuevo");
    expect(mensual.map((s) => s.fecha)).toEqual(["2026-09-25", "2026-10-25"]);
  });

  it("¿hay algo movido?", () => {
    expect(hayCambios(PALANCAS_INICIALES, 3_000)).toBe(false);
    expect(hayCambios(con({ tienda: "t1", alquilerTienda: 3_000 }), 3_000)).toBe(false);
    expect(hayCambios(con({ tienda: "t1", alquilerTienda: 2_500 }), 3_000)).toBe(true);
    expect(hayCambios(con({ moverPago: { id: "x", semanas: 0 } }), null)).toBe(false);
    expect(hayCambios(con({ ventasTodas: -5 }), null)).toBe(true);
  });

  it("sobre la proyección de la base: +10 % de ventas sube lo que entra justo 10 %", () => {
    const w = proyectar(PROY, con({ ventasTodas: 10 }));
    w.forEach((x, i) => expect(x.entra).toBeCloseTo(PROY.semanas[i]!.entra * 1.1, 2));
    const sinLima = proyectar(PROY, con({ tienda: LIM, cerrarTienda: true }));
    const soloTru = PROY.cobros.filter((c) => c.ubicacionId === TRU && c.fecha <= PROY.semanas[0]!.hasta).reduce((a, c) => a + c.monto, 0);
    expect(sinLima[0]!.entra).toBeCloseTo(soloTru, 2);
  });

  it("sumar meses recorta el día al del mes (31 ene + 1 = 28 feb)", () => {
    expect(sumarMesesIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMesesIso("2026-09-25", 1)).toBe("2026-10-25");
    expect(sumarMesesIso("2026-12-10", 1)).toBe("2027-01-10");
  });
});

// El estado de resultados de agosto del spike (RESULTADOS_AGO), con la forma que devuelve `fn_estado_resultados` (F5).
const fila = (u: string | null, unidad: string, nombre: string, v: number, c: number, fl: number, m: number, gastos: number, dep: number, alquiler: number): FilaER =>
  leerFilaER({
    ubicacion_id: u,
    unidad,
    nombre,
    ventas_netas: String(v),
    costo_ventas: String(c),
    fletes: String(fl),
    mermas: String(m),
    margen_bruto: String(v - c - fl - m),
    gastos_operacion: String(gastos),
    depreciacion: String(dep),
    resultado: String(v - c - fl - m - gastos),
    detalle_gastos: alquiler ? [{ cuenta: "635", nombre: "Alquileres", monto: String(alquiler) }] : [],
  });
const ER: FilaER[] = [
  fila("t1", "tienda", "Tienda TRU", 44_100, 19_850, 420, 160, 13_507, 87, 4_500),
  fila("t2", "tienda", "Tienda LIM", 19_800, 9_300, 380, 210, 12_394, 154, 6_200),
  fila(null, "empresa", "De la empresa", 0, 0, 0, 0, 9_650, 0, 0),
  fila(null, "consolidado", "CAYLA", 63_900, 29_150, 800, 370, 35_551, 241, 10_700),
];

describe("Escenarios: la utilidad (sobre el estado de resultados de F5)", () => {
  it("sin palancas, cada unidad da su resultado y CAYLA la suma (no la fila consolidada)", () => {
    const u = utilidadConCambios(ER, PALANCAS_INICIALES);
    expect(u.unidades.map((x) => x.antes)).toEqual([10_163, -2_484, -9_650]);
    expect(u.cayla).toEqual({ antes: -1_971, despues: -1_971 });
    expect(alquilerDe(ER[1]!)).toBe(6_200);
  });

  it("LIM con alquiler de S/ 5,000 y 15 % más de ventas (el ejemplo del spike)", () => {
    const u = utilidadConCambios(ER, con({ tienda: "t2", alquilerTienda: 5_000, ventasTienda: 15 }));
    const lim = u.unidades.find((x) => x.ubicacionId === "t2")!;
    // Margen 9,910 × 1,15 = 11,396.50; gastos 12,394 − 1,200 = 11,194 → deja S/ 202.50.
    expect(lim.despues).toBe(202.5);
    expect(u.cayla.despues - u.cayla.antes).toBe(202.5 - -2_484);
    expect(lim.equilibrio).toBeCloseTo(11_194 / (11_396.5 / 22_770), 1);
  });

  it("cerrar una tienda: sin ventas ni costos, pero su depreciación sigue", () => {
    const u = utilidadConCambios(ER, con({ tienda: "t2", cerrarTienda: true }));
    expect(u.unidades.find((x) => x.ubicacionId === "t2")!.despues).toBe(-154);
  });

  it("ventas de todas las tiendas +10 %: solo mueve las tiendas; un gasto nuevo cada mes cae en «De la empresa»", () => {
    const u = utilidadConCambios(ER, con({ ventasTodas: 10, gastoNuevo: { monto: 1_000, mensual: true, semana: 0 } }));
    expect(u.unidades.find((x) => x.ubicacionId === "t1")!.despues).toBe(Math.round((10_163 + 0.1 * (44_100 - 19_850 - 420 - 160)) * 100) / 100);
    expect(u.unidades.find((x) => x.unidad === "empresa")!.despues).toBe(-10_650);
    expect(utilidadConCambios(ER, con({ gastoNuevo: { monto: 1_000, mensual: false, semana: 0 } })).cayla.despues).toBe(-1_971);
  });

  it("arranca en la tienda a la que peor le fue", () => {
    expect(tiendaInicial(ER, [{ id: "t1" }, { id: "t2" }])).toBe("t2");
    expect(tiendaInicial([], [{ id: "t1" }])).toBe("t1");
  });

  it("qué pasaría: la utilidad, la tienda, la caja contra el mínimo y el pago movido", () => {
    const palancas = con({ tienda: "t2", alquilerTienda: 5_000, ventasTienda: 15, moverPago: { id: "compras:a", semanas: 1 } });
    const texto = conclusiones({
      utilidad: utilidadConCambios(ER, palancas),
      palancas,
      nombreTienda: "Tienda LIM",
      cajaBase: cajaDiaria(CHICA),
      cajaNueva: cajaDiaria(CHICA, palancas, 6_200),
      semanas: CHICA.semanas.length,
      minimo: CHICA.minimoCaja,
      pagoMovido: { titulo: "Distribuidora Norte", monto: 4_000, de: "2026-09-28", a: "2026-10-05" },
    }).map((l) => l.map((p) => (typeof p === "string" ? p : p.b)).join(""));
    expect(texto[0]).toBe("CAYLA pasaría de −S/\u00a01,971 a S/\u00a0716 al mes (+S/\u00a02,687).");
    expect(texto[1]).toContain("Tienda LIM dejaría S/\u00a0203 al mes; necesitaría vender");
    expect(texto[1]).toContain("sin IGV para no perder.");
    expect(texto[2]).toContain("La caja seguiría bajando del mínimo");
    expect(texto[3]).toBe("Pasar S/\u00a04,000 de Distribuidora Norte del 28 sep al 5 oct: hay que hablarlo con el proveedor.");
  });

  it("sin estado de resultados (F5 no disponible), solo habla de la caja", () => {
    const texto = conclusiones({ utilidad: null, palancas: PALANCAS_INICIALES, nombreTienda: null, cajaBase: cajaDiaria(PROY), cajaNueva: cajaDiaria(PROY), semanas: PROY.semanas.length, minimo: PROY.minimoCaja, pagoMovido: null });
    expect(texto).toHaveLength(1);
    const dias = cajaDiaria(PROY).puntos;
    const bajo = dias.reduce((a, x) => (x.saldo < a.saldo ? x : a), dias[0]!);
    expect(bajo.saldo).toBeLessThanOrEqual(12_500);
    expect(texto[0]!.map((p) => (typeof p === "string" ? p : p.b)).join("")).toContain(`seguiría bajando del mínimo: lo más bajo sería ${soles(bajo.saldo)} el `);
  });
});

describe("La URL y la descarga", () => {
  it("semanas: 4, 6 u 8; por defecto 6", () => {
    expect(["4", "8", "5", undefined].map((x) => leerSemanas(x))).toEqual([4, 8, 6, 6]);
  });

  it("el mes en curso se mira hasta hoy; uno que terminó, entero", () => {
    expect(rangoDelMes("2026-09", "2026-09-24")).toEqual({ desde: "2026-09-01", hasta: "2026-09-24" });
    expect(rangoDelMes("2026-08", "2026-09-24")).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
  });

  it("el CSV del escenario va separado por «;» y con los montos exactos", () => {
    const e = csvEscenario(proyectar(CHICA), proyectar(CHICA, con({ ventasTodas: 10 })), null, "2026-08");
    expect(e.split("\r\n")[1]).toBe("25 sep – 1 oct;4500.00;4650.00;150.00");
  });
});

// Tareas 46 y 73: una sola cuenta del saldo día por día, con hoy incluido, en todo el horizonte y respetando las palancas.
describe("cajaDiaria", () => {
  const CUADRA: Proyeccion = { ...CHICA, semanas: [{ ...CHICA.semanas[0]!, saldo: 4_500, bajoMinimo: true }, { ...CHICA.semanas[1]!, saldo: 2_300, bajoMinimo: true }] };
  const texto = (l: Parameters<typeof pintar>[0]) => pintar(l);

  it("arranca hoy, sigue día por día hasta el final y cierra cada bloque con el saldo de la base", () => {
    const c = cajaDiaria(CUADRA);
    expect(c.porSemana).toBe(false);
    expect(c.puntos[0]).toEqual({ fecha: "2026-09-24", saldo: 10_000 });
    expect(c.puntos.at(-1)).toEqual({ fecha: "2026-10-08", saldo: 2_300 });
    expect(c.puntos).toHaveLength(15);
    expect(c.puntos.find((x) => x.fecha === "2026-09-26")!.saldo).toBe(11_500);
    expect(c.puntos.find((x) => x.fecha === "2026-10-01")!.saldo).toBe(4_500);
  });
  it("con palancas da lo mismo que `proyectar` al cierre de cada bloque, y mueve el día", () => {
    const palancas = con({ ventasTodas: 10, moverPago: { id: "compras:a", semanas: 1 } });
    const c = cajaDiaria(CUADRA, palancas);
    for (const w of proyectar(CUADRA, palancas)) expect(c.puntos.find((x) => x.fecha === w.hasta)!.saldo).toBe(w.saldo);
    // El pago de S/ 4,000 ya no sale el 28 sino el 5 de octubre.
    expect(c.puntos.find((x) => x.fecha === "2026-09-28")!.saldo).toBe(11_650);
  });
  it("si no cuadra con los bloques (una base más vieja), hoy más los cierres que dijo la base, y las palancas suman su diferencia", () => {
    const c = cajaDiaria(CHICA);
    expect(c.porSemana).toBe(true);
    expect(c.puntos.map((x) => x.saldo)).toEqual([10_000, 0, 0]);
    expect(c.puntos[1]!.semana).toEqual({ desde: "2026-09-25", hasta: "2026-10-01" });
    expect(cajaDiaria(CHICA, con({ ventasTodas: 10 })).puntos.map((x) => x.saldo)).toEqual([10_000, 150, 280]);
  });

  describe("«Qué pasaría» habla del día, no del cierre de la semana", () => {
    const frase = (p: Proyeccion, palancas: Palancas = PALANCAS_INICIALES) => {
      const [l] = conclusiones({ utilidad: null, palancas, nombreTienda: null, cajaBase: cajaDiaria(p), cajaNueva: cajaDiaria(p, palancas), semanas: p.semanas.length, minimo: p.minimoCaja, pagoMovido: null });
      return texto(l!);
    };
    const salida = (fecha: string, monto: number): Proyeccion["salidas"][number] => ({ tipo: "planilla", id: `p:${fecha}`, fecha, vence: fecha, titulo: "Planilla", detalle: "", clase: "planilla", ubicacionId: null, unidad: null, monto, atrasada: false });
    const cobro = (fecha: string, monto: number): Proyeccion["cobros"][number] => ({ fecha, ubicacionId: "t1", tienda: "Uno", monto, origen: "meta", metaPct: 0, campanas: [] });
    const semanas = [
      { desde: "2026-11-09", hasta: "2026-11-15", entra: 0, sale: 0, saldo: 42_000, bajoMinimo: false },
      { desde: "2026-11-16", hasta: "2026-11-22", entra: 0, sale: 0, saldo: 42_000, bajoMinimo: false },
    ];
    const COMO_HOY: Proyeccion = { ...CHICA, hoy: "2026-11-08", desde: "2026-11-09", hasta: "2026-11-22", saldoHoy: 14_000, minimoCaja: 15_000, semanas, salidas: [], cobros: [cobro("2026-11-09", 3_000), cobro("2026-11-12", 25_000)] };

    it("con hoy bajo el mínimo lo dice y nombra lo que tienes; lo que viene, por día", () => {
      expect(frase(COMO_HOY)).toBe(`Hoy ya estás bajo tu mínimo: tienes ${soles(14_000)}, te faltan ${soles(1_000)}. En las próximas 2 semanas no volverías a bajar de él (lo más bajo: ${soles(17_000)}, el 9 de noviembre).`);
    });
    it("con hoy bajo y otra caída más adelante, dice cuánto y cuándo", () => {
      const p: Proyeccion = { ...COMO_HOY, salidas: [salida("2026-11-20", 40_000)], cobros: [...COMO_HOY.cobros, cobro("2026-11-21", 40_000)] };
      expect(frase(p)).toBe(`Hoy ya estás bajo tu mínimo: tienes ${soles(14_000)}, te faltan ${soles(1_000)}. Más adelante también quedarías bajo él: lo más bajo sería ${soles(2_000)} el 20 de noviembre.`);
    });
    it("una caída dentro de una semana que cierra bien sí cuenta, y «bajaría» se compara por día", () => {
      const sano: Proyeccion = { ...COMO_HOY, saldoHoy: 42_000, cobros: [cobro("2026-11-21", 40_000)], salidas: [salida("2026-11-20", 40_000)] };
      expect(frase(sano)).toBe(`La caja seguiría bajando del mínimo: lo más bajo sería ${soles(2_000)} el 20 de noviembre.`);
      const movida = con({ moverPago: { id: "p:2026-11-20", semanas: 1 } });
      expect(frase(sano, movida)).toBe(`La caja no bajaría de tu mínimo en 2 semanas (lo más bajo: ${soles(42_000)}, hoy; hoy bajaría a ${soles(2_000)}).`);
    });
    it("si no cuadra con los bloques, sigue hablando de la semana", () => {
      expect(frase(CHICA)).toBe(`La caja seguiría bajando del mínimo: lo más bajo sería ${soles(0)} la semana del 25 sep – 1 oct.`);
    });
  });
});

// Tarea 176: la utilidad «de antes» es la del último mes completo, no la de hoy.
describe("La columna del mes base", () => {
  it("dice el nombre del mes, en minúscula, y sale del mes base", () => {
    expect(etiquetaMesBase("2026-10")).toBe("En octubre");
    expect(etiquetaMesBase("2026-11")).toBe("En noviembre");
  });
  it("el CSV titula la utilidad con el mes base; la caja sigue siendo de hoy", () => {
    const u = utilidadConCambios(ER, PALANCAS_INICIALES);
    const filas = csvEscenario(proyectar(CHICA), proyectar(CHICA), u, "2026-10").split("\r\n");
    expect(filas[0]).toBe("\ufeffTu caja;Hoy;Con el cambio;Diferencia");
    expect(filas).toContain("Utilidad al mes;En octubre;Con el cambio;Diferencia");
  });
});

describe("La proyección dice con qué se apoya (ADR-0433, actividad 4)", () => {
  const base = {
    hoy: "2026-10-16", desde: "2026-10-17", hasta: "2026-11-27", saldo_hoy: 57000, minimo_caja: 15000, salidas_diarias: 600, dias_de_caja: 95,
    semanas: [], cobros: [], salidas: [],
  };
  it("lee lo que la base dice de su propia base: días de historia, saldos, facturas, impuestos y el veredicto", () => {
    const p = leerProyeccion({
      ...base, historia_dias: 16, saldo_inicial_declarado: false, hay_facturas_de_proveedor: false, incluye_impuestos: true, dias_de_caja_confiable: false,
    });
    expect(p).toMatchObject({ historiaDias: 16, saldoInicialDeclarado: false, hayFacturasDeProveedor: false, incluyeImpuestos: true, diasDeCajaConfiable: false });
  });
  it("lee lo que se le debe a Claudia y ya se restó del saldo (ADR-0560, actividad 16); una base más vieja no lo trae y no se inventa", () => {
    expect(leerProyeccion({ ...base, de_claudia: "291.69" }).deClaudia).toBe(291.69);
    expect(leerProyeccion({ ...base, de_claudia: 0 }).deClaudia).toBe(0);
    expect(leerProyeccion(base).deClaudia).toBeNull();
  });
  it("una base más vieja que la web (sin esos campos) no dice nada: ni provisional ni lista, no inventa", () => {
    const p = leerProyeccion(base);
    expect(p.diasDeCajaConfiable).toBeNull();
    expect(queFaltaEnLaProyeccion(p)).toEqual({ provisional: false, faltan: [] });
  });
  it("provisional: dice qué falta, en este orden, y a dónde ir a cargarlo", () => {
    const q = queFaltaEnLaProyeccion(
      leerProyeccion({ ...base, historia_dias: 16, saldo_inicial_declarado: false, hay_facturas_de_proveedor: false, incluye_impuestos: false, dias_de_caja_confiable: false }),
    );
    expect(q.provisional).toBe(true);
    expect(q.faltan.map((f) => f.clave)).toEqual(["saldos", "historia", "facturas", "impuestos"]);
    expect(q.faltan[1]!.texto).toContain("Faltan 12 días de ventas");
    expect(q.faltan[0]!.href).toBe("/finanzas/dinero");
    expect(q.faltan[2]!.href).toBe("/finanzas/dinero/por-pagar");
  });
  it("con 27 días falta uno solo, y lo dice en singular", () => {
    const q = queFaltaEnLaProyeccion(leerProyeccion({ ...base, historia_dias: 27, saldo_inicial_declarado: true, hay_facturas_de_proveedor: true, incluye_impuestos: true, dias_de_caja_confiable: false }));
    expect(q.faltan.map((f) => f.texto)).toEqual(["Falta 1 día de ventas: con menos de 4 semanas el promedio de cada día se apoya en pocos datos."]);
  });
  it("confiable: ya no es provisional (y lo que aún mejoraría igual se lista)", () => {
    const q = queFaltaEnLaProyeccion(leerProyeccion({ ...base, historia_dias: 40, saldo_inicial_declarado: true, hay_facturas_de_proveedor: false, incluye_impuestos: true, dias_de_caja_confiable: true }));
    expect(q.provisional).toBe(false);
    expect(q.faltan.map((f) => f.clave)).toEqual(["facturas"]);
  });
  it("ADR-0433, actividad 4b: sin el saldo a favor de IGV declarado lo lista (si el IGV entra a la proyección), con ruta a Configuración ▸ Impuestos", () => {
    const completo = { ...base, historia_dias: 40, saldo_inicial_declarado: true, hay_facturas_de_proveedor: true, incluye_impuestos: true, dias_de_caja_confiable: true };
    const sin = queFaltaEnLaProyeccion(leerProyeccion({ ...completo, saldo_favor_igv_declarado: false }));
    expect(sin.provisional).toBe(false);
    expect(sin.faltan.map((f) => f.clave)).toEqual(["saldo_igv"]);
    expect(sin.faltan[0]!.href).toBe("/configuracion?tab=impuestos");
    expect(sin.faltan[0]!.texto).toMatch(/contador/);
    expect(queFaltaEnLaProyeccion(leerProyeccion({ ...completo, saldo_favor_igv_declarado: true })).faltan).toEqual([]);
  });
  it("y no lo pide si la proyección ni incluye el IGV (la cuenta no ve Impuestos) ni si la base es más vieja que la web (no dice nada)", () => {
    const sinImpuestos = { ...base, historia_dias: 40, saldo_inicial_declarado: true, hay_facturas_de_proveedor: true, incluye_impuestos: false, dias_de_caja_confiable: true, saldo_favor_igv_declarado: false };
    expect(queFaltaEnLaProyeccion(leerProyeccion(sinImpuestos)).faltan.map((f) => f.clave)).toEqual(["impuestos"]);
    const vieja = { ...base, historia_dias: 40, saldo_inicial_declarado: true, hay_facturas_de_proveedor: true, incluye_impuestos: true, dias_de_caja_confiable: true };
    expect(leerProyeccion(vieja).saldoFavorIgvDeclarado).toBeNull();
    expect(queFaltaEnLaProyeccion(leerProyeccion(vieja)).faltan).toEqual([]);
  });
  it("lee el IGV y la renta como salidas «impuesto», los cobros de pocos días como «promedio_corto», y los nombra en «qué vence»", () => {
    const p = leerProyeccion({
      ...base,
      cobros: [{ fecha: "2026-10-17", ubicacion_id: "lim", tienda: "Tienda Lima", monto: 342.86, origen: "promedio_corto", meta_pct: 0, campanas: [] }],
      salidas: [{ tipo: "impuesto", id: "igv:2026-10", fecha: "2026-11-15", vence: "2026-11-15", titulo: "IGV de octubre (hasta hoy)", detalle: "", clase: "impuestos", ubicacion_id: null, unidad: null, monto: 3200, atrasada: false }],
    });
    expect(p.cobros[0]!.origen).toBe("promedio_corto");
    expect(p.salidas[0]!.tipo).toBe("impuesto");
    expect(queVence(p.salidas, "2026-11-10", "2026-11-16")).toBe("IGV de octubre (hasta hoy) S/\u00a03,200");
    expect(tiendasDeLaProyeccion(p)).toEqual([{ id: "lim", nombre: "Tienda Lima", origen: "promedio", corto: true }]);
  });
  it("los pagos de la planilla y de SUNAT tienen su rótulo en lo que salió", () => {
    expect(textoCategoria("planilla")).toBe("Pago de la planilla");
    expect(textoCategoria("impuestos")).toBe("Pago a SUNAT (IGV)");
  });
});

describe("solesCentimos (ADR-0609)", () => {
  it("siempre con dos decimales y el signo delante", () => {
    expect(solesCentimos(1752)).toBe("S/\u00a01,752.00");
    expect(solesCentimos(-25.34)).toBe("−S/\u00a025.34");
    expect(solesCentimos(0)).toBe("S/\u00a00.00");
    expect(solesCentimos(0.1 + 0.2)).toBe("S/\u00a00.30");
  });
});

// ADR-0621: lo por volver de compras viene de la base; una base más vieja no lo manda y no se inventa.
describe("lo por volver de compras", () => {
  it("se lee de la proyección y del flujo real", () => {
    expect(leerProyeccion({ ...fixture.proyeccion, por_volver_compras: 285 }).porVolverCompras).toBe(285);
    expect(leerFlujoReal({ ...fixture.real, por_volver_compras: "285.50" }).porVolverCompras).toBe(285.5);
  });
  it("sin el dato queda null", () => {
    expect(leerProyeccion(fixture.proyeccion).porVolverCompras).toBeNull();
    expect(leerFlujoReal(fixture.real).porVolverCompras).toBeNull();
  });
});

// Tarea 11: una tienda cuyo mes base no trae su alquiler (sin cuenta 635), pero sí lo tiene en sus gastos fijos. Cifras inventadas.
describe("Escenarios: el alquiler parte del mismo monto en la tabla y en la caja", () => {
  const SIN_635: FilaER[] = [
    fila("t1", "tienda", "Tienda Uno", 20_000, 10_000, 0, 0, 8_000, 0, 3_000),
    fila("t2", "tienda", "Tienda Dos", 10_000, 5_000, 0, 0, 5_000, 0, 0),
    fila(null, "empresa", "De la empresa", 0, 0, 0, 0, 1_000, 0, 0),
  ];
  const t2 = (u: ReturnType<typeof utilidadConCambios>) => u.unidades.find((x) => x.ubicacionId === "t2")!;

  it("la tienda sin cuenta de alquiler parte de sus gastos fijos y lo dice", () => {
    expect(alquilerDePartida(SIN_635[1], CHICA.salidas, "t2")).toEqual({ monto: 2_000, sinEnResultado: true });
    expect(alquilerDePartida(SIN_635[0], CHICA.salidas, "t1")).toEqual({ monto: 3_000, sinEnResultado: false });
    // Sin estado de resultados no hay «parte sin él»: no hay resultado que se vea mejor.
    expect(alquilerDePartida(undefined, CHICA.salidas, "t2")).toEqual({ monto: 2_000, sinEnResultado: false });
    expect(alquilerDePartida(SIN_635[1], [], "t2")).toEqual({ monto: null, sinEnResultado: false });
    const texto = textoSinAlquiler("2026-10", "Tienda Dos", 2_000);
    expect(texto).toContain("no trae el alquiler de Tienda Dos");
    expect(texto).toContain(soles(2_000));
  });

  it("bajarle el alquiler de 2,000 a 1,900 la hace GANAR 100, en la tabla y en la caja (control: contra el mes base perdía 1,900)", () => {
    const p = con({ tienda: "t2", alquilerTienda: 1_900 });
    const partida = alquilerDePartida(SIN_635[1], CHICA.salidas, "t2").monto;
    const u = utilidadConCambios(SIN_635, p, partida);
    expect(t2(u).despues - t2(u).antes).toBe(100);
    expect(u.cayla.despues - u.cayla.antes).toBe(100);
    // Control: sin pasarle la partida resta contra el alquiler del mes base (0), el error de antes.
    expect(t2(utilidadConCambios(SIN_635, p)).despues - t2(utilidadConCambios(SIN_635, p)).antes).toBe(-1_900);
    const caja = proyectar(CHICA, p, partida);
    expect(caja.at(-1)!.saldo - proyectar(CHICA).at(-1)!.saldo).toBe(100);
  });

  it("volver al alquiler de partida no cambia nada", () => {
    const p = con({ tienda: "t2", alquilerTienda: 2_000 });
    const u = utilidadConCambios(SIN_635, p, 2_000);
    expect(t2(u).despues).toBe(t2(u).antes);
    expect(hayCambios(p, 2_000)).toBe(false);
  });

  it("si el resultado y los fijos difieren, la caja cambia en los mismos soles que la tabla (no en proporción)", () => {
    // El mes base dice 2,500 de alquiler para t2; sus fijos, 2,000. Bajar a 2,000 resta 500 en los dos lados.
    const conER = [SIN_635[0]!, fila("t2", "tienda", "Tienda Dos", 10_000, 5_000, 0, 0, 5_000, 0, 2_500), SIN_635[2]!];
    const partida = alquilerDePartida(conER[1], CHICA.salidas, "t2").monto;
    expect(partida).toBe(2_500);
    const p = con({ tienda: "t2", alquilerTienda: 2_000 });
    const u = utilidadConCambios(conER, p, partida);
    expect(t2(u).despues - t2(u).antes).toBe(500);
    // Control: escalar por 2,000 / 2,500 habría restado solo 400 de los 2,000 de los fijos.
    expect(proyectar(CHICA, p, partida).at(-1)!.saldo - proyectar(CHICA).at(-1)!.saldo).toBe(500);
  });

  it("la caja dice que no trae la compra planeada de campaña", () => {
    expect(SIN_COMPRA_DE_CAMPANA).toMatch(/no incluye la compra planeada de campaña/);
  });
});
