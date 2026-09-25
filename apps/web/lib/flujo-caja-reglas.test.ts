import { describe, expect, it } from "vitest";
import fixture from "./flujo-caja.fixture.json";
import { leerFilaER, type FilaER } from "./resultados-reglas";
import {
  PALANCAS_INICIALES,
  alquilerDe,
  alquilerDeFijos,
  campanasDeSemana,
  conclusiones,
  etiquetaSemana,
  etiquetasEje,
  fraseDelFlujo,
  hayCambios,
  leerFlujoReal,
  leerProyeccion,
  leerSemanas,
  csvEscenario,
  csvFlujo,
  rangoDelMes,
  textoPeriodo,
  listasDelFlujo,
  proyectar,
  puntoMasBajo,
  queVence,
  salidasConPalancas,
  soles,
  solesConSigno,
  sumarMesesIso,
  textoSinCuenta,
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

  it("las listas del spike: lo que entró en el orden de los medios, lo que salió de mayor a menor, los ajustes aparte y sin ceros", () => {
    const l = listasDelFlujo({
      categorias: [
        { clave: "plin", lado: "entra", monto: 10 },
        { clave: "efectivo", lado: "entra", monto: 5 },
        { clave: "dueno_pone", lado: "entra", monto: 99 },
        { clave: "yape", lado: "entra", monto: 0.001 },
        { clave: "gastos", lado: "sale", monto: 30 },
        { clave: "mercaderia", lado: "sale", monto: 80 },
        { clave: "faltantes_caja", lado: "ajuste", monto: -12 },
      ],
    });
    expect(l.entradas.map((c) => c.clave)).toEqual(["efectivo", "plin", "dueno_pone"]);
    expect(l.salidas.map((c) => c.clave)).toEqual(["mercaderia", "gastos"]);
    expect(l.ajustes.map((c) => c.clave)).toEqual(["faltantes_caja"]);
  });

  it("la frase dice por qué: salió más que entró por pagar mercadería, o entró más y el saldo subió", () => {
    const baja = fraseDelFlujo({ ...REAL, entro: 100, salio: 180, saldoInicial: 500, saldoFinal: 420, categorias: [{ clave: "mercaderia", lado: "sale", monto: 150 }] });
    expect(baja.tono).toBe("aviso");
    expect(baja.partes).toContainEqual({ b: "S/ 80 más de lo que entró" });
    expect(String(baja.partes.at(-1))).toContain("mercadería antes de venderla");
    const sube = fraseDelFlujo({ ...REAL, entro: 300, salio: 100, saldoInicial: 500, saldoFinal: 700 });
    expect(sube.tono).toBe("neutro");
    expect(String(sube.partes.at(-1))).toContain("de S/ 500 a S/ 700");
  });

  it("lo «sin cuenta» se dice aparte, de mayor a menor, sin ceros", () => {
    expect(textoSinCuenta([{ origen: "cobros", n: 3, monto: 384.6 }, { origen: "pago", n: 22, monto: -29596.08 }, { origen: "gasto", n: 1, monto: 0.2 }])).toBe(
      "S/ 29,596 en 22 movimientos de pagos a proveedores (en efectivo o de la empresa) · S/ 385 en 3 movimientos de cobros de un medio que su tienda no dice a qué cuenta entra",
    );
    expect(textoSinCuenta([])).toBeNull();
  });
});

describe("Rótulos", () => {
  it("soles con el signo delante del símbolo, sin céntimos", () => {
    expect(soles(-2484.4)).toBe("−S/ 2,484");
    expect(soles(38200)).toBe("S/ 38,200");
    expect(solesConSigno(8300)).toBe("+S/ 8,300");
    expect(solesConSigno(-41300)).toBe("−S/ 41,300");
  });

  it("semanas: «5 – 11 oct», «28 sep – 4 oct», un día; y el eje con el mes solo al cambiar", () => {
    expect(etiquetaSemana("2026-10-05", "2026-10-11")).toBe("5 – 11 oct");
    expect(etiquetaSemana("2026-09-28", "2026-10-04")).toBe("28 sep – 4 oct");
    expect(etiquetaSemana("2026-09-24", "2026-09-24")).toBe("24 sep");
    expect(etiquetasEje(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-26", "2026-11-02"])).toEqual(["28 sep", "5 oct", "12", "26", "2 nov"]);
  });

  it("qué vence: la planilla junta, los más grandes primero y el primero con su monto", () => {
    expect(queVence(CHICA.salidas, "2026-10-02", "2026-10-08")).toBe("Alquiler Dos S/ 2,000 · Planilla");
    expect(queVence(CHICA.salidas, "2026-09-25", "2026-10-01")).toBe("Distribuidora Norte S/ 4,000 · Alquiler Uno");
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
      { id: "t2", nombre: "Tienda Dos", origen: "promedio" },
      { id: "t1", nombre: "Tienda Uno", origen: "meta" },
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
      semanasBase: proyectar(CHICA),
      semanasNuevas: proyectar(CHICA, palancas, 6_200),
      minimo: CHICA.minimoCaja,
      pagoMovido: { titulo: "Distribuidora Norte", monto: 4_000, de: "2026-09-28", a: "2026-10-05" },
    }).map((l) => l.map((p) => (typeof p === "string" ? p : p.b)).join(""));
    expect(texto[0]).toBe("CAYLA pasaría de −S/ 1,971 a S/ 716 al mes (+S/ 2,687).");
    expect(texto[1]).toContain("Tienda LIM dejaría S/ 203 al mes; necesitaría vender");
    expect(texto[2]).toContain("La caja seguiría bajando del mínimo");
    expect(texto[3]).toBe("Pasar S/ 4,000 de Distribuidora Norte del 28 sep al 5 oct: hay que hablarlo con el proveedor.");
  });

  it("sin estado de resultados (F5 no disponible), solo habla de la caja", () => {
    const texto = conclusiones({ utilidad: null, palancas: PALANCAS_INICIALES, nombreTienda: null, semanasBase: proyectar(PROY), semanasNuevas: proyectar(PROY), minimo: PROY.minimoCaja, pagoMovido: null });
    expect(texto).toHaveLength(1);
    expect(texto[0]!.map((p) => (typeof p === "string" ? p : p.b)).join("")).toContain("seguiría bajando del mínimo: lo más bajo sería S/ 12,405");
  });
});

describe("La URL y la descarga", () => {
  it("semanas: 4, 6 u 8; por defecto 6", () => {
    expect(["4", "8", "5", undefined].map((x) => leerSemanas(x))).toEqual([4, 8, 6, 6]);
  });

  it("el mes en curso se mira hasta hoy; uno que terminó, entero", () => {
    expect(rangoDelMes("2026-09", "2026-09-24")).toEqual({ desde: "2026-09-01", hasta: "2026-09-24" });
    expect(rangoDelMes("2026-08", "2026-09-24")).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(textoPeriodo("2026-09-01", "2026-09-24", "2026-09-24")).toBe("septiembre al 24");
    expect(textoPeriodo("2026-08-01", "2026-08-31", "2026-09-24")).toBe("agosto");
    expect(textoPeriodo("2025-12-01", "2025-12-31", "2026-01-10")).toBe("diciembre 2025");
  });

  it("el CSV lleva las dos partes, separado por «;» y con los montos exactos", () => {
    const t = csvFlujo(REAL, PROY);
    expect(t.startsWith("﻿Lo que ya pasó;2026-09-01;2026-09-24")).toBe(true);
    expect(t).toContain(`Saldo al empezar;;;;${REAL.saldoInicial.toFixed(2)}`);
    expect(t).toContain("Lo que viene;2026-09-25;2026-11-05");
    expect(t.split("\r\n").filter((l) => l.includes(";sí;")).length).toBe(PROY.semanas.filter((w) => w.bajoMinimo).length);
    const e = csvEscenario(proyectar(CHICA), proyectar(CHICA, con({ ventasTodas: 10 })), null);
    expect(e.split("\r\n")[1]).toBe("25 sep – 1 oct;4500.00;4650.00;150.00");
  });
});
