import { describe, expect, it } from "vitest";
import type { RecepcionReciente } from "./compras-reglas";
import { agruparPorEnvio, prendasDelEnvio } from "./recibido-por-envio-reglas";

const lote = (o: Partial<RecepcionReciente>): RecepcionReciente => ({
  loteId: "l1", despachoId: null, envioNumero: null, fecha: "2026-10-28T10:00:00Z", ubicacion: "Tienda Lima", proveedorId: "p", proveedorNombre: "Textiles Andina SAC",
  numeroGuia: null, nota: null, recibidoPor: "Felipe", unidades: 3, lineas: 1, conFactura: false, compraId: null, documento: null,
  detalle: [{ referencia: "Blusa", sku: "CMS-0002-ROS-M", talla: "M", color: "Rosado", cantidad: 3 }], ...o,
});

describe("agruparPorEnvio", () => {
  it("junta los lotes de un mismo envío en una fila, con sus proveedores y unidades", () => {
    const r = agruparPorEnvio([lote({ loteId: "a", despachoId: "d1", envioNumero: "ENV-000254" }), lote({ loteId: "b", despachoId: "d1", envioNumero: "ENV-000254", proveedorNombre: "Sur EIRL", unidades: 1 })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ numero: "ENV-000254", unidades: 4, proveedores: ["Textiles Andina SAC", "Sur EIRL"] });
    expect(r[0].lotes).toHaveLength(2);
  });
  it("una llegada sin envío queda como fila propia", () => {
    const r = agruparPorEnvio([lote({ loteId: "a" }), lote({ loteId: "b" })]);
    expect(r.map((x) => [x.clave, x.numero])).toEqual([["a", null], ["b", null]]);
  });
  it("no repite al proveedor y conserva el orden", () => {
    const r = agruparPorEnvio([lote({ loteId: "a", despachoId: "d" }), lote({ loteId: "b", despachoId: "d" }), lote({ loteId: "c" })]);
    expect(r.map((x) => x.clave)).toEqual(["d", "c"]);
    expect(r[0].proveedores).toEqual(["Textiles Andina SAC"]);
  });
});

describe("prendasDelEnvio", () => {
  it("una prenda por modelo y por proveedor, con su matriz", () => {
    const [e] = agruparPorEnvio([lote({ despachoId: "d", detalle: [{ referencia: "Blusa", sku: "X-1-R-M", talla: "M", color: "Rosado", cantidad: 3 }] })]);
    const p = prendasDelEnvio(e);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ modelo: "Blusa", unidades: 3, proveedor: "Textiles Andina SAC" });
    expect(p[0].matriz.colores[0].color).toBe("Rosado");
  });
});
