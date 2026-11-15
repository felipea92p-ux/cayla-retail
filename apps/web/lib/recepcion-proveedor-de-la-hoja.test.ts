import { describe, expect, it } from "vitest";
import { proveedorDeLaHoja, proveedoresDeLasLineas } from "./recepcion-conteo-reglas";
import type { LineaEnvio } from "./recepcion-envio-reglas";

// Auditoría 2026-11-15: «Crear ahora» de Para después mandaba siempre `null` y la base no tenía de dónde sacar el proveedor. Con varios
// proveedores respondía «elige de cuál es esta prenda» en una hoja que no deja elegirlo; sin aviso, la prenda nacía sin proveedor.
// (En su propio archivo, y no en `recepcion-conteo-reglas.test.ts`, para no chocar con el PR #1874, que agrega casos al final de aquel.)
describe("el proveedor que la hoja de la prenda le manda a la base", () => {
  const A = { id: "prov-a", nombre: "A" };
  const B = { id: "prov-b", nombre: "B" };
  const deLaGuia = { linea: { id: "item-1" } as unknown as LineaEnvio, proveedor: A };
  const fueraDeGuia = { linea: null, proveedor: B };

  it("lo de fuera de la guía lleva el de su línea cuando el envío trae dos o más", () => {
    expect(proveedorDeLaHoja(fueraDeGuia, 2, false)).toBe("prov-b");
  });
  it("sin aviso lo lleva aunque sea el único: cada línea es de su proveedor", () => {
    expect(proveedorDeLaHoja(fueraDeGuia, 1, true)).toBe("prov-b");
  });
  it("con un solo proveedor y con guía no se manda: la base ya sabe cuál es", () => {
    expect(proveedorDeLaHoja(fueraDeGuia, 1, false)).toBeNull();
  });
  it("una línea de la guía nunca lo manda: el proveedor sale de su orden", () => {
    expect(proveedorDeLaHoja(deLaGuia, 3, true)).toBeNull();
  });
  it("una línea sin proveedor no inventa uno", () => {
    expect(proveedorDeLaHoja({ linea: null, proveedor: null }, 2, true)).toBeNull();
  });
  it("cuenta los proveedores distintos de las líneas, sin los vacíos", () => {
    expect(proveedoresDeLasLineas([{ proveedor: A }, { proveedor: A }, { proveedor: B }, { proveedor: null }])).toBe(2);
    expect(proveedoresDeLasLineas([])).toBe(0);
  });
});
