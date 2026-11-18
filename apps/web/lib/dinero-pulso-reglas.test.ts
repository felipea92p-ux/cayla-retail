import { describe, expect, it } from "vitest";
import type { CuentaDinero } from "./cuentas-dinero-reglas";
import { soles, type Proyeccion } from "./flujo-caja-reglas";
import type { FilaPorPagar } from "./por-pagar-consolidado-reglas";
import { alcanzaPulso, debesPulso, tienesPulso } from "./dinero-pulso-reglas";

const cuenta = (p: Partial<CuentaDinero> & Pick<CuentaDinero, "id" | "nombre" | "tipo">): CuentaDinero => ({
  cuentaContable: "104", ubicacionId: null, ubicacionNombre: null, numero: null, saldo: 0, archivada: false, soloDestino: false,
  cajaId: null, cajaAbierta: false, saldoDesde: null, ultimaConciliacion: null, ultimoAbono: null, orden: 0, ...p,
});
const CUENTAS: CuentaDinero[] = [
  cuenta({ id: "bcp", nombre: "BCP", tipo: "banco", saldo: 18450 }),
  cuenta({ id: "ibk", nombre: "Interbank", tipo: "banco", saldo: 9830 }),
  cuenta({ id: "izi", nombre: "Por depositar Izipay", tipo: "por_abonar", cuentaContable: "105", saldo: 2140 }),
  cuenta({ id: "cTRU", nombre: "Cajón · TRU", tipo: "cajon", cuentaContable: "101", ubicacionId: "tru", saldo: 500 }),
  cuenta({ id: "fTRU", nombre: "Caja fuerte · TRU", tipo: "caja_fuerte", cuentaContable: "101", ubicacionId: "tru", saldo: 6200 }),
  cuenta({ id: "cAQP", nombre: "Cajón · AQP", tipo: "cajon", cuentaContable: "101", ubicacionId: "aqp", saldo: null }),
  cuenta({ id: "fAQP", nombre: "Caja fuerte · AQP", tipo: "caja_fuerte", cuentaContable: "101", ubicacionId: "aqp", saldo: 3900 }),
  cuenta({ id: "visa", nombre: "Visa BCP", tipo: "tarjeta_credito", cuentaContable: "451", saldo: -2300 }),
];

describe("tienesPulso", () => {
  it("suma bancos, lo en camino y el efectivo; la tarjeta va aparte y lo guardado es lo depositable", () => {
    const t = tienesPulso(CUENTAS, null);
    expect(t.total).toBe(18450 + 9830 + 2140 + 500 + 6200 + 3900);
    expect(t.partes.map((p) => [p.clave, p.monto])).toEqual([["bancos", 28280], ["camino", 2140], ["efectivo", 10600]]);
    expect(t.tarjeta).toBe(2300);
    expect(t.guardado).toBe(10100);
    expect(t.ocultas).toBe(true);
    expect(t.frase).toContain("Aparte, debes S/ 2,300 en la tarjeta de crédito");
    expect(t.frase).toContain("El cajón abierto lo ve quien cierra la caja");
  });
  it("mirando una tienda, su cajón y su caja fuerte más los bancos (que son de CAYLA entera)", () => {
    const t = tienesPulso(CUENTAS, "tru");
    expect(t.partes.find((p) => p.clave === "efectivo")!.monto).toBe(6700);
    expect(t.guardado).toBe(6200);
  });
  it("sin cuentas, lo dice", () => {
    expect(tienesPulso([], null).frase).toBe("Todavía no hay cuentas con saldo.");
  });
});

const PROY: Proyeccion = {
  hoy: "2026-10-15", desde: "2026-10-16", hasta: "2026-11-26", saldoHoy: 28280, minimoCaja: 15000, salidasDiarias: 1800, diasDeCaja: 16,
  salidas30: { conCuenta: 50000, sinCuenta: 0, planilla: 25400 }, planillaVisible: true, cobros: [], salidas: [],
  historiaDias: null, saldoInicialDeclarado: null, hayFacturasDeProveedor: null, incluyeImpuestos: null, saldoFavorIgvDeclarado: null, diasDeCajaConfiable: null,
  semanas: [
    { desde: "2026-10-19", hasta: "2026-10-25", entra: 24000, sale: 18000, saldo: 34280, bajoMinimo: false },
    { desde: "2026-10-26", hasta: "2026-11-01", entra: 24000, sale: 47000, saldo: 11280, bajoMinimo: true },
    { desde: "2026-11-02", hasta: "2026-11-08", entra: 24000, sale: 12000, saldo: 23280, bajoMinimo: false },
  ],
};

describe("alcanzaPulso", () => {
  it("lo que es de Claudia ya está restado de lo que tienes, y lo dice (ADR-0560, actividad 16)", () => {
    const a = alcanzaPulso({ ...PROY, deClaudia: 291.69 }, 0);
    expect(a.estado === "sin_dato" ? null : a.deClaudia).toMatchObject({ monto: 291.69 });
    expect(a.estado === "sin_dato" ? "" : a.deClaudia!.frase).toContain("S/ 292 que son de Claudia");
    // Sin deuda con ella (o una base más vieja que esta web) no dice nada.
    for (const sin of [null, 0, undefined]) expect(alcanzaPulso({ ...PROY, deClaudia: sin }, 0).estado === "sin_dato" ? null : (alcanzaPulso({ ...PROY, deClaudia: sin }, 0) as { deClaudia: unknown }).deClaudia).toBeNull();
  });
  it("la primera semana bajo el mínimo, y lo guardado ya cuenta en ese saldo (depositar no lo aumenta)", () => {
    const a = alcanzaPulso(PROY, 10100);
    expect(a.estado).toBe("baja");
    if (a.estado !== "baja") return;
    expect(a.frase).toMatch(/^La semana .* bajas a S\/ 11,280, bajo tu mínimo de S\/ 15,000\.$/);
    // El saldo de la proyección (`fn_flujo_disponible`) ya incluye las cajas fuertes y lo del líder: sumarles lo guardado otra vez
    // prometía S/ 21,380 y la semana sigue en S/ 11,280 (2026-10-27, DIN-01 del examen de Finanzas).
    expect(a.guardadoYaCuenta).toMatchObject({ monto: 10100 });
    expect(a.guardadoYaCuenta!.frase).toContain("ya cuenta");
    expect(a.guardadoYaCuenta!.frase).toContain("S/ 10,100");
    expect(a.guardadoYaCuenta!.frase).not.toContain("S/ 21,380");
    expect(a.guardadoYaCuenta!.frase).not.toContain("quedas en");
    expect("siDepositas" in a).toBe(false);
  });
  it("sin nada guardado, o en «bien», no dice nada de depositar", () => {
    const sinGuardado = alcanzaPulso(PROY, 0);
    expect(sinGuardado.estado === "baja" && sinGuardado.guardadoYaCuenta).toBeNull();
    const bien = alcanzaPulso({ ...PROY, semanas: PROY.semanas.map((s) => ({ ...s, saldo: s.saldo + 10000, bajoMinimo: false })) }, 10100);
    expect(bien.estado === "bien" && bien.guardadoYaCuenta).toBeNull();
  });
  it("si nada baja del mínimo, lo dice con la semana más baja", () => {
    const a = alcanzaPulso({ ...PROY, semanas: PROY.semanas.map((s) => ({ ...s, saldo: s.saldo + 10000, bajoMinimo: false })) }, 10100);
    expect(a.estado).toBe("bien");
    expect(a.frase).toContain("no bajas de tu mínimo");
    expect(a.frase).toContain("S/ 21,280");
  });
  it("sin proyección (no es líder), lo dice", () => {
    expect(alcanzaPulso(null, 0).estado).toBe("sin_dato");
  });
  it("provisional (ADR-0433): no se pinta como «dentro del mínimo» en verde y lleva lo que falta", () => {
    const provisional = { ...PROY, historiaDias: 16, saldoInicialDeclarado: false, hayFacturasDeProveedor: false, incluyeImpuestos: true, diasDeCajaConfiable: false };
    const a = alcanzaPulso({ ...provisional, semanas: PROY.semanas.map((s) => ({ ...s, saldo: s.saldo + 10000, bajoMinimo: false })) }, 0);
    expect(a.estado).toBe("bien");
    if (a.estado === "sin_dato") return;
    expect(a.provisional).toBe(true);
    expect(a.faltan.map((f) => f.clave)).toEqual(["saldos", "historia", "facturas"]);
  });
  it("con una base que no dice nada de su base (más vieja que la web), no es provisional", () => {
    const a = alcanzaPulso(PROY, 0);
    if (a.estado === "sin_dato") return;
    expect(a.provisional).toBe(false);
    expect(a.faltan).toEqual([]);
  });
});

// Tarea 46: el mismo punto día por día que «Tu caja», con hoy incluido y sobre TODO el horizonte de las semanas, no solo sus cierres.
describe("alcanzaPulso mira día por día, con hoy incluido", () => {
  const cobro = (fecha: string, monto: number) => ({ fecha, ubicacionId: "t1", tienda: "Trujillo", monto, origen: "meta" as const, metaPct: 0, campanas: [] });
  const salida = (fecha: string, monto: number) => ({ tipo: "planilla" as const, id: `p:${fecha}`, fecha, vence: fecha, titulo: "Planilla", detalle: "", clase: "planilla", ubicacionId: null, unidad: null, monto, atrasada: false });
  const semana = (desde: string, hasta: string, saldo: number) => ({ desde, hasta, entra: 0, sale: 0, saldo, bajoMinimo: saldo < 15000 });
  const BASE = {
    ...PROY, hoy: "2026-11-08", desde: "2026-11-09", hasta: "2026-12-20", minimoCaja: 15000,
    semanas: [
      semana("2026-11-09", "2026-11-15", 43000),
      semana("2026-11-16", "2026-11-22", 43000),
      semana("2026-11-23", "2026-11-29", 43000),
      semana("2026-11-30", "2026-12-06", 43000),
      semana("2026-12-07", "2026-12-13", 43000),
      semana("2026-12-14", "2026-12-20", 43000),
    ],
  };
  const COMO_HOY: Proyeccion = { ...BASE, saldoHoy: 14600, cobros: [cobro("2026-11-09", 3000), cobro("2026-11-12", 25400)], salidas: [] };

  it("con la caja de hoy bajo el mínimo ya no dice que está dentro, aunque ninguna semana cierre bajo él", () => {
    const a = alcanzaPulso(COMO_HOY, 0);
    expect(a.estado).toBe("hoy_bajo");
    expect(a.frase).toBe(`Hoy estás bajo tu mínimo: tienes ${soles(14600)}, te faltan ${soles(400)}.`);
  });
  it("«hoy ya estás bajo» guarda la nota de lo guardado: depositarlo no arregla el mínimo", () => {
    const a = alcanzaPulso(COMO_HOY, 5000);
    expect(a.estado === "hoy_bajo" && a.guardadoYaCuenta).toMatchObject({ monto: 5000 });
  });
  it("con la proyección provisional lo dice como «Tu caja»", () => {
    const a = alcanzaPulso({ ...COMO_HOY, historiaDias: 16, saldoInicialDeclarado: false, hayFacturasDeProveedor: true, incluyeImpuestos: true, diasDeCajaConfiable: false }, 0);
    expect(a.frase.startsWith("Con lo que hay registrado, hoy estás bajo tu mínimo")).toBe(true);
  });
  it("ve una caída dentro de una semana que cierra bien, también después del día 14", () => {
    const p: Proyeccion = { ...BASE, saldoHoy: 43000, cobros: [cobro("2026-12-02", 40000)], salidas: [salida("2026-12-01", 40000)] };
    const a = alcanzaPulso(p, 0);
    expect(a.estado).toBe("baja");
    expect(a.frase).toBe(`Tu caja baja a ${soles(3000)} el 1 de diciembre: ${soles(12000)} bajo tu mínimo.`);
  });
  it("sin caída, nombra el día más bajo y no el cierre de una semana", () => {
    const p: Proyeccion = { ...BASE, saldoHoy: 20000, cobros: [cobro("2026-11-10", 23000)], salidas: [] };
    const a = alcanzaPulso(p, 0);
    expect(a.estado).toBe("bien");
    expect(a.frase).toBe(`En las próximas 6 semanas no bajas de tu mínimo de ${soles(15000)}. El día más bajo es hoy, con ${soles(20000)}.`);
    const conDia: Proyeccion = { ...p, salidas: [salida("2026-11-09", 3000)], cobros: [cobro("2026-11-10", 26000)] };
    expect(alcanzaPulso(conDia, 0).frase).toContain(`El día más bajo es el 9 de noviembre, con ${soles(17000)}.`);
  });
});

const fila = (p: Partial<FilaPorPagar> & Pick<FilaPorPagar, "id" | "proveedor" | "vence" | "saldo">): FilaPorPagar => ({
  origen: "compras", naturaleza: "mercaderia", proveedorId: "p", documento: "F001-1", tipo: "factura", concepto: null,
  fechaEmision: "2026-10-01", condicion: "credito", fechaVencimiento: p.vence, ubicacionId: null, unidades: null, total: p.saldo, pagado: 0, ...p,
});

describe("debesPulso", () => {
  const hoy = "2026-10-15";
  it("lo vencido primero, después lo próximo", () => {
    const d = debesPulso([
      fila({ id: "a", proveedor: "Textiles del Norte", vence: "2026-10-19", saldo: 6800 }),
      fila({ id: "b", proveedor: "Hilandería", vence: "2026-10-28", saldo: 4600 }),
      fila({ id: "c", proveedor: "Botones SAC", vence: "2026-10-10", saldo: 3200 }),
      fila({ id: "d", proveedor: "Pagada", vence: "2026-10-10", saldo: 0 }),
    ], hoy);
    expect(d.total).toBe(14600);
    expect(d.n).toBe(3);
    expect(d.vencidas).toBe(1);
    expect(d.proxima).toMatchObject({ proveedor: "Textiles del Norte", dias: 4 });
    expect(d.tono).toBe("rojo");
    expect(d.frase).toBe("1 factura vencida por S/ 3,200. Lo próximo: Textiles del Norte, S/ 6,800, vence en 4 días.");
  });
  it("nada vencido y lo próximo en 3 días o menos: ámbar", () => {
    const d = debesPulso([fila({ id: "a", proveedor: "Textiles del Norte", vence: "2026-10-17", saldo: 6800 })], hoy);
    expect(d.tono).toBe("ambar");
    expect(d.frase).toBe("Nada vencido. Lo próximo: Textiles del Norte, S/ 6,800, vence en 2 días.");
  });
  it("sin deudas, lo dice sin prometer que no hay facturas", () => {
    const d = debesPulso([], hoy);
    expect(d.tono).toBe("verde");
    expect(d.frase).toContain("Si hay facturas sin anotar, no están aquí");
  });
});

// ADR-0621: el fondo de compras ya viene sin lo gastado; lo que queda es tuyo, pero no paga cuentas.
describe("lo por volver de compras", () => {
  const FONDO = cuenta({ id: "fondo", nombre: "Fondo · Micaela", tipo: "fondo", cuentaContable: "1413", saldo: 285 });
  it("«Tienes» lo cuenta, aparte, como «Por volver de compras»", () => {
    const sin = tienesPulso(CUENTAS, null);
    const con = tienesPulso([...CUENTAS, FONDO], null);
    expect(con.total).toBe(sin.total + 285);
    expect(con.partes.at(-1)).toEqual({ clave: "compras", titulo: "Por volver de compras", monto: 285 });
    expect(con.frase).toContain("por volver de compras S/");
  });
  it("si una compradora gastó de más, «por volver» no baja de 0 y lo que se le debe va aparte, dentro del total", () => {
    const debe = cuenta({ id: "fondo2", nombre: "Fondo · Sandra", tipo: "fondo", cuentaContable: "1413", saldo: -40 });
    const t = tienesPulso([...CUENTAS, FONDO, debe], null);
    expect(t.total).toBe(tienesPulso(CUENTAS, null).total + 285 - 40);
    expect(t.partes.slice(-2)).toEqual([
      { clave: "compras", titulo: "Por volver de compras", monto: 285 },
      { clave: "debes_compras", titulo: "Le debes a las compradoras", monto: -40 },
    ]);
  });
  it("sin fondo no aparece la parte", () => {
    expect(tienesPulso(CUENTAS, null).partes.some((p) => p.clave === "compras")).toBe(false);
  });
  it("«¿Me alcanza?» dice que la proyección ya no lo cuenta, solo si hay algo", () => {
    const a = alcanzaPulso({ ...PROY, porVolverCompras: 285 }, 0);
    expect(a.estado === "sin_dato" ? null : a.porVolver?.monto).toBe(285);
    for (const sin of [null, 0, undefined]) {
      const b = alcanzaPulso({ ...PROY, porVolverCompras: sin }, 0);
      expect(b.estado === "sin_dato" ? null : b.porVolver).toBeNull();
    }
  });
});
