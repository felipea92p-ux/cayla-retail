import { describe, expect, it } from "vitest";
import type { RecepcionReciente } from "./compras-reglas";
import {
  agruparPorEnvio,
  COLOR_OTRAS_MARCAS,
  COLOR_SIN_MARCA,
  colorDeMarca,
  deQuienLlego,
  marcasDelEnvio,
  marcasEnLaFila,
  mismoDia,
  nombreSinEnvio,
  prendasDelEnvio,
  prendasDistintas,
} from "./recibido-por-envio-reglas";

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

describe("marcasDelEnvio (las marcas al frente)", () => {
  const linea = (referencia: string, marca: string | null, cantidad: number) => ({ referencia, sku: null, talla: "M", color: "Negro", marca, cantidad });
  const envio = () =>
    agruparPorEnvio([
      lote({ loteId: "a", despachoId: "d", proveedorNombre: "Julio Ramos", detalle: [linea("Top Lunares", "Bella Moda", 3), linea("Top Peplum", "Bella Moda", 5)] }),
      lote({ loteId: "b", despachoId: "d", proveedorNombre: "Carmen López", detalle: [linea("Falda Mesh", null, 5), linea("Vestido Diva", null, 5)] }),
      lote({ loteId: "c", despachoId: "d", proveedorNombre: "Víctor Paz", detalle: [linea("Straple", "Nativa", 9), linea("Blusa Encaje", "Bella Moda", 1)] }),
    ])[0];

  it("ordena de la que más unidades trajo a la que menos, con lo sin marca al final aunque traiga más", () => {
    const m = marcasDelEnvio(envio());
    expect(m.map((x) => [x.marca, x.unidades])).toEqual([["Bella Moda", 9], ["Nativa", 9], [null, 10]]);
  });
  it("a igual cantidad, por nombre; y junta a los proveedores que trajeron la misma marca", () => {
    const m = marcasDelEnvio(envio());
    expect(m[0]).toMatchObject({ marca: "Bella Moda", proveedores: ["Julio Ramos", "Víctor Paz"] });
    expect(m[0].prendas.map((p) => p.modelo)).toEqual(["Top Lunares", "Top Peplum", "Blusa Encaje"]);
  });
  it("una línea sin el dato de marca (otra lectura) cuenta como sin marca, no se cae", () => {
    const [e] = agruparPorEnvio([lote({ despachoId: "d" })]);
    expect(marcasDelEnvio(e).map((x) => x.marca)).toEqual([null]);
  });
  it("la fila nombra hasta 3 marcas, cuenta las demás y avisa lo sin marca aparte", () => {
    const muchas = ["A", "B", "C", "D", "E"].map((marca, i) => ({ marca, unidades: 10 - i, proveedores: [], prendas: [] }));
    const r = marcasEnLaFila([...muchas, { marca: null, unidades: 1, proveedores: [], prendas: [] }]);
    expect(r.visibles.map((x) => x.marca)).toEqual(["A", "B", "C"]);
    expect(r.mas).toBe(2);
    expect(r.sinMarca?.unidades).toBe(1);
    expect(marcasEnLaFila(muchas.slice(0, 2)).mas).toBe(0);
  });
  it("cada marca tiene su color de token; desde la quinta comparten uno y lo sin marca es ámbar", () => {
    const muchas = ["A", "B", "C", "D", "E"].map((marca) => ({ marca, unidades: 1, proveedores: [], prendas: [] }));
    expect(muchas.map((m) => colorDeMarca(muchas, m.marca))).toEqual(["bg-tinta", "bg-taupe", "bg-pizarra", "bg-borde-control", COLOR_OTRAS_MARCAS]);
    expect(colorDeMarca(muchas, null)).toBe(COLOR_SIN_MARCA);
  });
});

describe("lo que dice la fila", () => {
  it("de quién llegó: uno, dos o «N proveedores»", () => {
    expect(deQuienLlego(["CAYLA SAC"])).toBe("de CAYLA SAC");
    expect(deQuienLlego(["A", "B"])).toBe("de A y B");
    expect(deQuienLlego(["A", "B", "C"])).toBe("de 3 proveedores");
  });
  it("cuenta prendas distintas, no líneas de color y talla", () => {
    const [e] = agruparPorEnvio([
      lote({ despachoId: "d", detalle: [{ referencia: "Blusa", sku: null, talla: "M", color: "Rosado", cantidad: 1 }, { referencia: "Blusa", sku: null, talla: "L", color: "Negro", cantidad: 2 }, { referencia: "Short", sku: null, talla: "M", color: "Negro", cantidad: 1 }] }),
    ]);
    expect(prendasDistintas(e)).toBe(2);
  });
  it("una llegada sin envío dice «Llegó con el alta» solo si vino al crear la prenda", () => {
    const [alta] = agruparPorEnvio([lote({ nota: "Llegó con el alta del producto" })]);
    const [otra] = agruparPorEnvio([lote({ nota: "Traído por la encargada" })]);
    expect(nombreSinEnvio(alta)).toBe("Llegó con el alta");
    expect(nombreSinEnvio(otra)).toBe("Sin envío");
  });
  it("mismo día se lee en Lima: las 22:00 de Lima ya son el día siguiente en UTC", () => {
    expect(mismoDia("2026-11-09T15:00:00Z", "2026-11-10T03:00:00Z")).toBe(true);
    expect(mismoDia("2026-11-09T15:00:00Z", "2026-11-10T15:00:00Z")).toBe(false);
  });
});
