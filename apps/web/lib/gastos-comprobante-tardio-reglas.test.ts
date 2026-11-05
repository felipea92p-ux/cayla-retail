import { describe, expect, it } from "vitest";
import {
  borradorInicial,
  camposDelComprobante,
  igvDelPapel,
  loQuePasaAlGuardar,
  payloadDelComprobante,
  problemaDelComprobante,
  puedeRecibirComprobante,
  type BorradorComprobante,
} from "./gastos-comprobante-tardio-reglas";

const HOY = "2026-10-31";
const GASTO = { estado: "vigente" as const, compraId: null, comprobanteTipo: "sin_comprobante" as const, categoria: "mantenimiento", fecha: "2026-10-29" };
const LLENO: BorradorComprobante = { tipo: "factura", ruc: "20100070970", razonSocial: "Remalladoras SAC", serieNumero: "F001-288", fecha: "2026-10-30", igv: null };

describe("puedeRecibirComprobante", () => {
  it("un gasto vigente sin comprobante, sí", () => expect(puedeRecibirComprobante(GASTO)).toBe(true));
  it("uno que ya tiene comprobante, no", () => expect(puedeRecibirComprobante({ ...GASTO, compraId: "c1", comprobanteTipo: "factura" })).toBe(false));
  it("uno anulado, no", () => expect(puedeRecibirComprobante({ ...GASTO, estado: "anulado" })).toBe(false));
  it("una planilla de movilidad, no (su papel es la planilla)", () => expect(puedeRecibirComprobante({ ...GASTO, comprobanteTipo: "planilla_movilidad" })).toBe(false));
  it("uno del viaje de compra, no", () => expect(puedeRecibirComprobante({ ...GASTO, categoria: "viaje_compra" })).toBe(false));
});

describe("problemaDelComprobante y la guía de foco", () => {
  const ctx = { proveedorListo: true, hoy: HOY, monto: 472 };
  it("lleno, sin problemas", () => expect(problemaDelComprobante(LLENO, ctx)).toBeNull());
  it("arranca con la fecha del gasto y sin tipo", () => {
    const b = borradorInicial(GASTO);
    expect(b.fecha).toBe("2026-10-29");
    expect(problemaDelComprobante(b, { ...ctx, proveedorListo: false })).toBe("Elige qué comprobante llegó.");
  });
  it.each<[string, Partial<BorradorComprobante>, Partial<typeof ctx>, string]>([
    ["sin proveedor y RUC malo", { ruc: "123" }, { proveedorListo: false }, "Escribe el RUC del comprobante."],
    ["RUC bueno pero sin razón social", {}, { proveedorListo: false }, "Escribe la razón social."],
    ["serie ilegible", { serieNumero: "288" }, {}, "Escribe la serie y el número, como F001-2231."],
    ["sin fecha", { fecha: "" }, {}, "Di la fecha del comprobante."],
    ["fecha futura", { fecha: "2026-11-02" }, {}, "La fecha del comprobante no puede ser futura."],
    ["IGV igual al total", { igv: 472 }, {}, "El IGV tiene que estar entre cero y el total."],
  ])("%s", (_n, cambio, c, problema) => {
    expect(problemaDelComprobante({ ...LLENO, ...cambio }, { ...ctx, ...c })).toBe(problema);
  });
  it.each<[Partial<BorradorComprobante>, boolean]>([
    [{}, true],
    [{ tipo: "" }, false],
    [{ serieNumero: "x" }, false],
    [{ fecha: "2026-11-05" }, false],
    [{ fecha: "" }, false],
  ])("faltan requeridos ⇔ hay un problema (%o)", (cambio, listo) => {
    const b = { ...LLENO, ...cambio };
    const faltan = camposDelComprobante(b, { proveedorListo: true, hoy: HOY }, { listo: true, motivo: null }).filter((c) => c.requerido && !c.hecho);
    expect(faltan.length === 0).toBe(listo);
    expect(problemaDelComprobante(b, ctx) === null).toBe(listo);
  });
});

describe("igvDelPapel y payloadDelComprobante", () => {
  it("una factura lleva el IGV de la tasa si el papel no dice otro", () => expect(igvDelPapel(LLENO, 472)).toBe(72));
  it("o el que dice el papel", () => expect(igvDelPapel({ ...LLENO, igv: 70.5 }, 472)).toBe(70.5));
  it("una boleta no lleva IGV", () => expect(igvDelPapel({ ...LLENO, tipo: "boleta", igv: 10 }, 472)).toBe(0));
  it("manda la serie partida, la fecha del papel y, sin IGV del papel, deja que la base use la tasa", () => {
    expect(payloadDelComprobante("g1", { ...LLENO, serieNumero: "f001 288" }, "p1")).toEqual({
      p_gasto_id: "g1",
      p_comprobante: { tipo: "factura", proveedor_id: "p1", serie: "F001", numero: "288", fecha_emision: "2026-10-30" },
    });
  });
  it("con el IGV del papel lo manda; a una boleta nunca", () => {
    expect(payloadDelComprobante("g1", { ...LLENO, igv: 70.5 }, "p1").p_comprobante.igv).toBe(70.5);
    expect(payloadDelComprobante("g1", { ...LLENO, tipo: "boleta", igv: 70.5 }, "p1").p_comprobante.igv).toBeUndefined();
  });
});

describe("loQuePasaAlGuardar", () => {
  const g = { montoTotal: 472, medioPago: "transferencia" as const, cajaMovimientoId: null };
  it("dice que no se paga otra vez y en qué mes cuenta el IGV", () => {
    const l = loQuePasaAlGuardar(g, LLENO);
    expect(l[0]).toMatch(/su factura/);
    expect(l[1]).toMatch(/no se mueve ninguna cuenta/);
    expect(l[2]).toMatch(/IGV, S\/ 72\.00, cuenta en Impuestos de octubre 2026/);
  });
  it("del cajón dice que la caja no se mueve", () => expect(loQuePasaAlGuardar({ ...g, cajaMovimientoId: "m1" }, LLENO)[1]).toMatch(/cajón/));
  it("una factura grande en efectivo avisa que su IGV se pierde", () => {
    const l = loQuePasaAlGuardar({ montoTotal: 2360, medioPago: "efectivo", cajaMovimientoId: "m1" }, LLENO);
    expect(l.at(-1)).toMatch(/su IGV se pierde/);
  });
  it("una boleta dice que no trae IGV", () => expect(loQuePasaAlGuardar(g, { ...LLENO, tipo: "boleta" }).at(-1)).toMatch(/no trae IGV/));
});
