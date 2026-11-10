import { describe, expect, it } from "vitest";
import { comprasQueAvisar, dondeEsta, leerComprasPagadas, lineaDeLaCompra, porEnvio, tituloDelAviso } from "./compras-pagadas-reglas";

const fila = (x: Record<string, unknown> = {}) => ({ papel_id: "p1", proveedor_id: "pr1", proveedor: "Textiles Sol", fecha: "2026-11-06", prendas: 46, por_mandar: 0, envios: [{ id: "e16", numero: "ENV-0016", estado: "en_camino" }], ...x });

describe("las compras pagadas que vienen a una tienda (ADR-0636)", () => {
  it("lee lo que manda la base y descarta lo que no sirve para avisar", () => {
    const c = leerComprasPagadas([fila(), fila({ papel_id: "", prendas: 3 }), fila({ papel_id: "p3", prendas: 0 }), fila({ papel_id: "p4", proveedor: " ", proveedor_id: null, envios: [{ id: "x", estado: "cerrado" }, { id: null, estado: "abierto" }] })]);
    expect(c.map((x) => x.papelId)).toEqual(["p1", "p4"]);
    expect(c[0]).toMatchObject({ proveedor: "Textiles Sol", prendas: 46, porMandar: 0, envios: [{ id: "e16", numero: "ENV-0016", estado: "en_camino" }] });
    expect(c[1]).toMatchObject({ proveedor: "Proveedor por confirmar", proveedorId: null, envios: [] });
    expect(leerComprasPagadas(null)).toEqual([]);
    expect(leerComprasPagadas({})).toEqual([]);
  });
  it("con un proveedor elegido avisa solo de sus compras; sin elegir, de todas", () => {
    const c = leerComprasPagadas([fila(), fila({ papel_id: "p2", proveedor_id: "pr2", proveedor: "Otro" })]);
    expect(comprasQueAvisar(c, "pr2").map((x) => x.papelId)).toEqual(["p2"]);
    expect(comprasQueAvisar(c, "nadie")).toEqual([]);
    expect(comprasQueAvisar(c, null)).toHaveLength(2);
  });
  it("dice dónde está cada compra", () => {
    const [enCamino, sinMandar, aMedias, dos] = leerComprasPagadas([
      fila(),
      fila({ papel_id: "p2", envios: [], por_mandar: 8, prendas: 8 }),
      fila({ papel_id: "p3", por_mandar: 1 }),
      fila({ papel_id: "p4", envios: [{ id: "a", numero: "ENV-0016", estado: "en_camino" }, { id: "b", numero: "ENV-0017", estado: "abierto" }] }),
    ]);
    expect(dondeEsta(enCamino!)).toBe("viene en ENV-0016");
    expect(dondeEsta(sinMandar!)).toBe("quien la compró todavía no la manda");
    expect(dondeEsta(aMedias!)).toBe("viene en ENV-0016 (faltan mandar 1 prenda)");
    expect(dondeEsta(dos!)).toBe("viene en ENV-0016 y ENV-0017");
    expect(lineaDeLaCompra(enCamino!, true)).toBe("Textiles Sol · 46 prendas · viene en ENV-0016");
    expect(lineaDeLaCompra(sinMandar!, false)).toBe("8 prendas · quien la compró todavía no la manda");
  });
  it("sin proveedor elegido se dicen por envío, y lo sin mandar al final", () => {
    const c = leerComprasPagadas([
      fila({ papel_id: "a", envios: [], por_mandar: 5, prendas: 5 }),
      fila({ papel_id: "b", prendas: 10 }),
      fila({ papel_id: "c", prendas: 2 }),
      fila({ papel_id: "d", prendas: 1, envios: [{ id: "e02", numero: "ENV-0002", estado: "abierto" }] }),
    ]);
    expect(porEnvio(c)).toEqual([
      { clave: "e02", envioId: "e02", texto: "ENV-0002 · 1 compra · 1 prenda" },
      { clave: "e16", envioId: "e16", texto: "ENV-0016 · 2 compras · 12 prendas" },
      { clave: "por-mandar", envioId: null, texto: "Todavía sin mandar · 1 compra · 5 prendas" },
    ]);
    expect(porEnvio([])).toEqual([]);
  });
  it("el título nombra al proveedor si es una sola", () => {
    const c = leerComprasPagadas([fila(), fila({ papel_id: "p2" })]);
    expect(tituloDelAviso(c.slice(0, 1), "Tienda TRU")).toBe("Textiles Sol tiene una compra pagada que viene a Tienda TRU");
    expect(tituloDelAviso(c, "Tienda TRU")).toBe("Hay 2 compras pagadas que vienen a Tienda TRU");
  });
});
