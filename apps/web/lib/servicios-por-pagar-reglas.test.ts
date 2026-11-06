import { describe, expect, it } from "vitest";
import { hrefDeLaOrden, servicioDesdeCrudo, totalDeServicios } from "./servicios-por-pagar-reglas";

const crudo = {
  fase_id: "f1",
  numero: 2,
  numero_texto: "OP-000002",
  producto: "Blusa Emma",
  fase: "Costura",
  proveedor_id: null,
  proveedor: null,
  devengado: "100.00",
  documentado: "60.00",
  falta: "40.00",
};

describe("servicios por pagar", () => {
  it("convierte los montos que la base manda como texto, y un servicio sin nombre sigue sin nombre", () => {
    const s = servicioDesdeCrudo(crudo);
    expect([s.devengado, s.documentado, s.falta]).toEqual([100, 60, 40]);
    expect(s.proveedor).toBeNull();
  });
  it("suma lo que falta sin arrastrar decimales", () => {
    expect(totalDeServicios([{ falta: 0.1 }, { falta: 0.2 }])).toBe(0.3);
    expect(totalDeServicios([])).toBe(0);
  });
  it("«Registrar quién» lleva a la orden por su número", () => {
    expect(hrefDeLaOrden(2)).toBe("/produccion/ordenes/2");
  });
});
