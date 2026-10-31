import { describe, expect, it } from "vitest";
import {
  ARCHIVOS_CONTADOR,
  csvDiarioContador,
  csvFlujoContador,
  csvPatrimonioContador,
  csvSaldosContador,
  leerArchivoContador,
  leerSaldoCuenta,
  motivoArchivoContador,
  nombreArchivoContador,
  balanzaCuadra,
  leerVerCuentas,
  opcionesVer,
  vistaActiva,
  filtrarDiario,
  gruposDeSaldos,
  sedesDelDiario,
} from "./contador-reglas";
import type { FlujoReal } from "./flujo-caja-reglas";
import type { FilaER, LineaDiario } from "./resultados-reglas";
import type { PatrimonioCambios } from "./estados-financieros-reglas";

const filas = (csv: string) => csv.replace(/^﻿/, "").trim().split("\r\n").map((l) => l.split(";"));

describe("el menú de archivos", () => {
  it("los cuatro estados en el orden de sus pestañas, y después los saldos y el diario", () => {
    expect(ARCHIVOS_CONTADOR.map((a) => a.clave)).toEqual(["resultados", "flujo", "balance", "patrimonio", "saldos", "diario"]);
  });
  it("lee solo lo que existe y nombra cada archivo con su mes", () => {
    expect(leerArchivoContador("saldos")).toBe("saldos");
    expect(leerArchivoContador("todo")).toBeNull();
    expect(leerArchivoContador(null)).toBeNull();
    expect(nombreArchivoContador("diario", "2026-10")).toBe("libro-diario-2026-10.csv");
  });
  it("una terminal solo baja el estado de resultados de su tienda; lo demás es de CAYLA entera", () => {
    expect(motivoArchivoContador("resultados", false)).toBeNull();
    for (const a of ARCHIVOS_CONTADOR.filter((x) => x.clave !== "resultados")) expect(motivoArchivoContador(a.clave, false)).toMatch(/CAYLA entera/);
    for (const a of ARCHIVOS_CONTADOR) expect(motivoArchivoContador(a.clave, true)).toBeNull();
  });
});

describe("el flujo de efectivo", () => {
  const real = {
    desde: "2026-10-01",
    hasta: "2026-10-31",
    saldoInicial: 1000,
    saldoFinal: 1500,
    semanas: [{ desde: "2026-10-01", hasta: "2026-10-04", entro: 2200, salio: 1700, ajustes: 0, saldo: 1500 }],
    categorias: [
      { clave: "efectivo", lado: "entra", monto: 2000 },
      { clave: "mercaderia", lado: "sale", monto: 800 },
      { clave: "activos", lado: "sale", monto: 400 },
      { clave: "dueno_pone", lado: "entra", monto: 200 },
      { clave: "dueno_saca", lado: "sale", monto: 500 },
    ],
  } as unknown as FlujoReal;
  it("cada partida bajo su actividad, sus totales y el efectivo al inicio y al final", () => {
    const f = filas(csvFlujoContador(real, "2026-10"));
    expect(f[3]).toEqual(["Actividad", "Partida", "S/"]);
    const total = (act: string) => f.find((x) => x[0] === act && x[1] === "Total")?.[2];
    expect(total("Efectivo de actividades de operación")).toBe("1200.00");
    expect(total("Efectivo de actividades de inversión")).toBe("-400.00");
    expect(total("Efectivo de actividades de financiamiento")).toBe("-300.00");
    expect(f.find((x) => x[1] === "Aumento (o disminución) del efectivo")?.[2]).toBe("500.00");
    expect(f.find((x) => x[1] === "Efectivo al final")?.[2]).toBe("1500.00");
    // Debajo, semana a semana.
    expect(f.at(-1)).toEqual([expect.any(String), "2200.00", "1700.00", "0.00", "1500.00"]);
  });
});

describe("los cambios en el patrimonio", () => {
  const p: PatrimonioCambios = {
    mes: "2026-10",
    corte: "2026-10-31",
    arranque: "2026-08-01",
    sinArranque: false,
    inicio: { fecha: "2026-09-30", capital: 100, aportes: 20, utilidades: 30, total: 150 },
    fin: { fecha: "2026-10-31", capital: 100, aportes: 25, utilidades: 34, total: 159 },
    ganancia: 10,
    aportes: 5,
    retiros: 6,
    otros: 0,
    serie: [],
  };
  it("cada columna lleva su cuenta en el encabezado y el cierre", () => {
    const f = filas(csvPatrimonioContador(p, "2026-10"));
    expect(f[2]).toEqual(["Partida", "Capital (50)", "Aportes (52)", "Resultados acumulados (59 y resultado del mes)", "Total"]);
    expect(f.at(-1)).toEqual(["Saldo al cierre del mes", "100.00", "25.00", "34.00", "159.00"]);
  });
  it("sin arranque lo dice en vez de inventar cifras", () => {
    expect(csvPatrimonioContador({ ...p, sinArranque: true }, "2026-10")).toMatch(/Faltan los saldos de arranque/);
  });
});

describe("los saldos por cuenta", () => {
  const saldos = [
    leerSaldoCuenta({ cuenta: "101", nombre: "Caja", tipo: "activo", saldo_inicial: "500", debe: "300", haber: 100, saldo_final: "700" }),
    leerSaldoCuenta({ cuenta: "50", nombre: "Capital", tipo: "patrimonio", saldo_inicial: -500, debe: 0, haber: 0, saldo_final: -500 }),
    leerSaldoCuenta({ cuenta: "70", nombre: "Ventas", tipo: "ingreso", saldo_inicial: 0, debe: 100, haber: 300, saldo_final: -200 }),
  ];
  it("lee los numeric que llegan como texto", () => {
    expect(saldos[0]).toMatchObject({ saldoInicial: 500, debe: 300, saldoFinal: 700 });
  });
  it("cada cuenta con su nombre y su tipo, y el total de saldos en 0 cuando cuadra", () => {
    const f = filas(csvSaldosContador(saldos, "2026-10"));
    expect(f[3]).toEqual(["Cuenta", "Nombre", "Tipo", "Saldo al empezar", "Debe del mes", "Haber del mes", "Saldo al cerrar"]);
    expect(f[4]).toEqual(["101", "Caja", "Activo", "500.00", "300.00", "100.00", "700.00"]);
    expect(f.at(-1)).toEqual(["Total", "", "", "0.00", "400.00", "400.00", "0.00"]);
  });
});

describe("el libro diario", () => {
  const lineas: LineaDiario[] = [
    { fecha: "2026-10-02", ubicacionId: "u-tru", asiento: "V-1", regla: "venta", cuenta: "101", debe: 118, haber: 0, origenTabla: "ventas", origenId: "x", glosa: "Venta B001-1" },
    { fecha: "2026-10-02", ubicacionId: "u-tru", asiento: "V-1", regla: "venta", cuenta: "70", debe: 0, haber: 100, origenTabla: "ventas", origenId: "x", glosa: "Venta B001-1" },
    { fecha: "2026-10-02", ubicacionId: null, asiento: "V-1", regla: "venta", cuenta: "4011", debe: 0, haber: 18, origenTabla: "ventas", origenId: "x", glosa: "Venta; con punto y coma" },
  ];
  const sedes = sedesDelDiario([{ ubicacionId: "u-tru", unidad: "tienda", nombre: "Tienda Trujillo" } as FilaER, { ubicacionId: null, unidad: "consolidado", nombre: "CAYLA" } as FilaER]);
  it("cada línea con el nombre de su cuenta y su sede; al pie, debe y haber iguales", () => {
    const csv = csvDiarioContador(lineas, new Map([["101", "Caja"], ["70", "Ventas"]]), sedes, "2026-10");
    const f = filas(csv);
    expect(f[3]).toEqual(["2026-10-02", "V-1", "101", "Caja", "118.00", "0.00", "Venta B001-1", "Trujillo"]);
    expect(f[4]![3]).toBe("Ventas");
    // Una glosa con «;» va entre comillas: no parte la fila.
    expect(csv).toContain('"Venta; con punto y coma";De la empresa');
    expect(f.at(-1)).toEqual(["Total", "", "", "", "118.00", "118.00", "", ""]);
  });
});

describe("ver en pantalla: los saldos por cuenta y el libro diario", () => {
  const s = (cuenta: string, tipo: string, saldoInicial: number, debe: number, haber: number) => ({ cuenta, nombre: `Cuenta ${cuenta}`, tipo, saldoInicial, debe, haber, saldoFinal: saldoInicial + debe - haber });
  const saldos = [s("70", "ingreso", 0, 0, 300), s("101", "activo", 500, 300, 100), s("50", "patrimonio", -500, 0, 0), s("63", "gasto", 0, 100, 0)];
  it("agrupa por tipo en el orden del plan de cuentas, con el total de cada grupo", () => {
    const g = gruposDeSaldos(saldos);
    expect(g.map((x) => x.tipo)).toEqual(["activo", "patrimonio", "ingreso", "gasto"]);
    expect(g[0]).toMatchObject({ nombre: "Lo que tiene (activo)", saldoFinal: 700, debe: 300, haber: 100 });
  });
  it("cuadra si los saldos suman 0 y el debe es igual al haber", () => {
    expect(balanzaCuadra(saldos)).toBe(true);
    expect(balanzaCuadra([...saldos, s("42", "pasivo", 0, 0, 1)])).toBe(false);
  });
  it("el buscador encuentra por número o nombre de cuenta, asiento o glosa, sin tildes", () => {
    const base = { fecha: "2026-10-02", ubicacionId: null, regla: "venta", origenTabla: "ventas", origenId: "x", debe: 0, haber: 0 };
    const lineas: LineaDiario[] = [
      { ...base, asiento: "V-1", cuenta: "101", glosa: "Venta B001-1" },
      { ...base, asiento: "G-7", cuenta: "63", glosa: "Alquiler de octubre" },
    ];
    const cuentas = new Map([["101", "Caja"], ["63", "Servicios"]]);
    expect(filtrarDiario(lineas, "", cuentas)).toHaveLength(2);
    expect(filtrarDiario(lineas, "caja", cuentas).map((l) => l.asiento)).toEqual(["V-1"]);
    expect(filtrarDiario(lineas, "ALQUÍLER", cuentas).map((l) => l.asiento)).toEqual(["G-7"]);
    expect(filtrarDiario(lineas, "63", cuentas).map((l) => l.asiento)).toEqual(["G-7"]);
  });
});

describe("la barra de las siete vistas", () => {
  const hrefEstado = (c: string, f: string) => `/${c}${f === "formal" ? "?forma=formal" : ""}`;
  const hrefCuentas = (v: string) => `/cuentas?ver=${v}`;
  it("siete opciones: las respuestas y los seis cuadros, cada uno a su lugar", () => {
    const o = opcionesVer({ pantalla: "plata", hrefEstado, hrefCuentas, veTodo: true });
    expect(o.map((x) => [x.clave, x.href])).toEqual([
      ["respuestas", "/plata"],
      ["resultados", "/ganamos?forma=formal"],
      ["flujo", "/plata?forma=formal"],
      ["balance", "/vale?forma=formal"],
      ["patrimonio", "/tuyo?forma=formal"],
      ["saldos", "/cuentas?ver=saldos"],
      ["diario", "/cuentas?ver=diario"],
    ]);
    expect(o.every((x) => !x.motivo)).toBe(true);
    expect(o.map((x) => x.corto)).toEqual(["Respuestas", "Resultados", "Flujo de efectivo", "Balance", "Patrimonio", "Saldos por cuenta", "Libro diario"]);
  });
  it("desde las cuentas, «Las respuestas» vuelve a ¿Ganamos?; una terminal ve lo de CAYLA entera con su motivo", () => {
    const o = opcionesVer({ pantalla: "diario", hrefEstado, hrefCuentas, veTodo: false });
    expect(o[0]!.href).toBe("/ganamos");
    expect(o.filter((x) => x.motivo).map((x) => x.clave)).toEqual(["flujo", "balance", "patrimonio", "saldos", "diario"]);
  });
  it("lo que se está viendo", () => {
    expect(vistaActiva("ganamos", "respuesta")).toBe("respuestas");
    expect(vistaActiva("vale", "formal")).toBe("balance");
    expect(vistaActiva("tuyo", "formal")).toBe("patrimonio");
    expect(vistaActiva("diario", "respuesta")).toBe("diario");
    expect(leerVerCuentas("diario")).toBe("diario");
    expect(leerVerCuentas(undefined)).toBe("saldos");
  });
});
