import { describe, expect, it } from "vitest";
import type { CuentaDinero } from "./cuentas-dinero-reglas";
import type { Proyeccion } from "./flujo-caja-reglas";
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
  it("la primera semana bajo el mínimo, y qué pasa si depositas lo guardado", () => {
    const a = alcanzaPulso(PROY, 10100);
    expect(a.estado).toBe("baja");
    if (a.estado !== "baja") return;
    expect(a.frase).toMatch(/^La semana .* bajas a S\/ 11,280, bajo tu mínimo de S\/ 15,000\.$/);
    expect(a.siDepositas).toMatchObject({ monto: 10100, saldo: 21380, alcanza: true });
    expect(a.siDepositas!.frase).toContain("por encima de tu mínimo");
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
