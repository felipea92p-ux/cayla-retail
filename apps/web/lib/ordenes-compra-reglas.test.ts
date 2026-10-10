import { describe, expect, it } from "vitest";
import { ESTADO_ORDEN, fraseDestino, leerFilaOrden, leerFilasOrdenes, numeroOrdenCompra, textoDestino } from "./ordenes-compra-reglas";

// Una fila tal como la devuelve `fn_ordenes_compra` (PostgREST manda los numeric como texto).
const FILA = {
  id: "0b6f1c2e-0000-4000-8000-000000000001",
  numero: 12,
  estado: "generada",
  proveedor_id: "0b6f1c2e-0000-4000-8000-0000000000a1",
  proveedor_nombre: "Confecciones Peña",
  ubicacion_destino_id: "0b6f1c2e-0000-4000-8000-0000000000b1",
  destino_nombre: "Tienda Trujillo",
  fecha_emision: "2026-10-10",
  fecha_entrega_estimada: null,
  lineas: 2,
  unidades: 14,
  total: "615.00",
  creada_por_nombre: "Felipe Pereyra",
  creada_en: "2026-10-10T21:50:00+00:00",
};

describe("numeroOrdenCompra", () => {
  it("escribe el número con su prefijo y seis cifras", () => {
    expect(numeroOrdenCompra(1)).toBe("OC-000001");
    expect(numeroOrdenCompra(12)).toBe("OC-000012");
    expect(numeroOrdenCompra(1234567)).toBe("OC-1234567");
  });
});

describe("textoDestino y fraseDestino", () => {
  it("en una columna «Llega a» dice la tienda o «Por repartir»", () => {
    expect(textoDestino("Tienda Trujillo")).toBe("Tienda Trujillo");
    expect(textoDestino(null)).toBe("Por repartir");
  });
  it("como frase suelta nunca dice «Llega a Por repartir»", () => {
    expect(fraseDestino("Tienda Trujillo")).toBe("Llega a Tienda Trujillo");
    expect(fraseDestino(null)).toBe("Por repartir desde Lima");
  });
});

describe("ESTADO_ORDEN", () => {
  it("tiene texto y tono para cada estado de la fase 1", () => {
    expect(ESTADO_ORDEN.generada).toEqual({ texto: "Generada", tono: "pizarra" });
    expect(ESTADO_ORDEN.anulada).toEqual({ texto: "Anulada", tono: "apagado" });
  });
});

describe("leerFilaOrden", () => {
  it("lee la fila y convierte el total que llega como texto", () => {
    expect(leerFilaOrden(FILA)).toEqual({
      id: FILA.id,
      numero: 12,
      estado: "generada",
      proveedorId: FILA.proveedor_id,
      proveedorNombre: "Confecciones Peña",
      destinoId: FILA.ubicacion_destino_id,
      destinoNombre: "Tienda Trujillo",
      fechaEmision: "2026-10-10",
      fechaEntregaEstimada: null,
      lineas: 2,
      unidades: 14,
      total: 615,
      creadaPorNombre: "Felipe Pereyra",
      creadaEn: FILA.creada_en,
    });
  });

  it("una orden por repartir llega sin destino", () => {
    expect(leerFilaOrden({ ...FILA, ubicacion_destino_id: null, destino_nombre: null })).toMatchObject({ destinoId: null, destinoNombre: null });
  });

  it("descarta lo que no se puede mostrar sin inventar: sin id, sin número, estado desconocido o sin proveedor", () => {
    expect(leerFilaOrden({ ...FILA, id: null })).toBeNull();
    expect(leerFilaOrden({ ...FILA, numero: "doce" })).toBeNull();
    expect(leerFilaOrden({ ...FILA, estado: "perdida" })).toBeNull();
    expect(leerFilaOrden({ ...FILA, proveedor_nombre: "  " })).toBeNull();
    expect(leerFilaOrden(null)).toBeNull();
    expect(leerFilaOrden("fila")).toBeNull();
  });
});

describe("leerFilasOrdenes", () => {
  it("devuelve solo las filas que se pueden mostrar, y nada si la respuesta no es una lista", () => {
    expect(leerFilasOrdenes([FILA, { ...FILA, id: "" }, 7])).toHaveLength(1);
    expect(leerFilasOrdenes(null)).toEqual([]);
    expect(leerFilasOrdenes({ filas: [FILA] })).toEqual([]);
  });
});
