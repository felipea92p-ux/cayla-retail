import { describe, expect, it } from "vitest";
import { FORMA_DE_FABRICA, type FormaDeOferta, type TipoOferta } from "./campana-reglas";
import { compraDeEjemplo } from "./compra-de-ejemplo";
import { descuentoDeCampana } from "./descuento-por-porcentaje";

const forma = (tipo: TipoOferta, parche: Partial<FormaDeOferta> = {}): FormaDeOferta => ({ ...FORMA_DE_FABRICA[tipo], agrupa: "campana", ...parche });

// Prendas inventadas: tres modelos, uno con dos tallas a precios distintos.
const PRENDAS = [
  { id: "v1", nombre: "Casaca Luciana", precio: 159.9, productoId: "p1" },
  { id: "v2", nombre: "Blusa Emma", precio: 79.9, productoId: "p2" },
  { id: "v3", nombre: "Blusa Emma", precio: 89.9, productoId: "p2" },
  { id: "v4", nombre: "Top Ana", precio: 39, productoId: "p3" },
  { id: "v5", nombre: "Falda Sol", precio: 69.9, productoId: "p4" },
];

describe("«En caja»: la compra de ejemplo (ADR-0677, 8)", () => {
  it("sin elegir qué le das, no hay compra", () => {
    expect(compraDeEjemplo(forma("pct"), false, PRENDAS)).toEqual({ estado: "elige" });
  });

  it("sin prendas alcanzadas, lo dice", () => {
    expect(compraDeEjemplo(forma("pct"), true, [])).toEqual({ estado: "sin-prendas" });
    expect(compraDeEjemplo(forma("nxm"), true, [])).toEqual({ estado: "sin-prendas" });
    expect(compraDeEjemplo(forma("monto"), true, [])).toEqual({ estado: "sin-prendas" });
  });

  it("un %: las tres más caras de modelos distintos, con la rebaja de la caja al céntimo", () => {
    const c = compraDeEjemplo(forma("pct", { porcentaje: 20 }), true, PRENDAS);
    if (c.estado !== "lista") throw new Error(c.estado);
    expect(c.lineas.map((l) => l.id)).toEqual(["v1", "v3", "v5"]);
    for (const l of c.lineas) expect(l.paga).toBeCloseTo(l.precio - descuentoDeCampana(l.precio, 20), 2);
    // S/ 89.90 con 20 % se cobra S/ 71.90 (bajado al múltiplo de S/ 0.10, ADR-0403), no 71.92.
    expect(c.lineas[1].paga).toBe(71.9);
    expect(c.paga).toBeCloseTo(c.lineas.reduce((a, l) => a + l.paga, 0), 2);
    expect(c.ahorro).toBeCloseTo(c.suma - c.paga, 2);
    expect(c.monto).toBeNull();
  });

  it("llevar varias: tantas prendas como pide el grupo, y el ahorro repartido entre ellas, como en la caja", () => {
    const tres = compraDeEjemplo(forma("nxm", { lleva: 3, paga: 2 }), true, PRENDAS);
    const dos = compraDeEjemplo(forma("nxm", { lleva: 2, paga: 1 }), true, PRENDAS);
    if (tres.estado !== "lista" || dos.estado !== "lista") throw new Error("sin compra");
    expect(tres.lineas).toHaveLength(3);
    expect(dos.lineas).toHaveLength(2);
    // Un 3 x 2 ahorra la más barata del grupo, pero la caja reparte ese ahorro entre las tres: ninguna sale en cero.
    expect(tres.ahorro).toBeCloseTo(Math.min(...tres.lineas.map((l) => l.precio)), 2);
    expect(tres.lineas.every((l) => l.paga > 0 && l.paga < l.precio)).toBe(true);
    expect(tres.ahorro).toBeCloseTo(tres.suma - tres.paga, 2);
  });

  it("N por S/ X: el grupo paga el monto", () => {
    const c = compraDeEjemplo(forma("n_por_monto", { lleva: 2, monto: 100 }), true, PRENDAS);
    if (c.estado !== "lista") throw new Error(c.estado);
    expect(c.lineas).toHaveLength(2);
    expect(c.paga).toBe(100);
  });

  it("un monto: llega al primer escalón con prendas a su precio y una línea de ahorro", () => {
    const c = compraDeEjemplo(forma("monto", { escalones: [{ desde: 300, ahorra: 30 }], ahorroEn: "soles" }), true, PRENDAS);
    if (c.estado !== "lista") throw new Error(c.estado);
    expect(c.lineas.every((l) => l.paga === l.precio)).toBe(true);
    expect(c.monto).toEqual({ desde: 300, llega: true, ahorro: 30, falta: 0 });
    expect(c.paga).toBeCloseTo(c.suma - 30, 2);
  });

  it("un monto que el ejemplo no alcanza dice cuánto falta y no ahorra", () => {
    const c = compraDeEjemplo(forma("monto", { escalones: [{ desde: 5000, ahorra: 100 }], ahorroEn: "soles" }), true, [PRENDAS[3]]);
    if (c.estado !== "lista") throw new Error(c.estado);
    expect(c.monto?.llega).toBe(false);
    expect(c.monto?.falta).toBeCloseTo(5000 - c.suma, 2);
    expect(c.ahorro).toBe(0);
  });

  it("números que no valen no cobran nada (no inventa una compra)", () => {
    expect(compraDeEjemplo(forma("nxm", { lleva: 2, paga: 2 }), true, PRENDAS)).toEqual({ estado: "sin-prendas" });
  });

  it("es estable: las mismas prendas en otro orden dan la misma compra", () => {
    const a = compraDeEjemplo(forma("pct", { porcentaje: 30 }), true, PRENDAS);
    const b = compraDeEjemplo(forma("pct", { porcentaje: 30 }), true, [...PRENDAS].reverse());
    expect(b).toEqual(a);
  });
});
