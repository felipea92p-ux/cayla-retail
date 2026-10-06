import { describe, expect, it } from "vitest";
import { leerPorLlegar, RPC_POR_LLEGAR } from "./analisis-por-llegar-lectura";

// Datos inventados para la prueba: partes como las devuelve `retail.fn_analisis_por_llegar` (claves en snake_case).
const parte = (parcial: Record<string, unknown> = {}): Record<string, unknown> => ({
  variante_id: "var-1",
  de: "compra",
  cantidad: 10,
  fecha: "2026-10-15",
  ...parcial,
});

describe("la función que se llama", () => {
  it("es la de la migración 20261006215000", () => {
    expect(RPC_POR_LLEGAR).toBe("fn_analisis_por_llegar");
  });
});

describe("partes completas", () => {
  it("agrupa por prenda, con su origen, cantidad y fecha", () => {
    expect(
      leerPorLlegar([
        parte(),
        parte({ de: "taller", cantidad: 1, fecha: "2026-10-10" }),
        parte({ variante_id: "var-2", de: "tienda", cantidad: 2, fecha: "2026-10-08" }),
      ]),
    ).toEqual({
      "var-1": [
        { de: "taller", cantidad: 1, fecha: "2026-10-10" },
        { de: "compra", cantidad: 10, fecha: "2026-10-15" },
      ],
      "var-2": [{ de: "tienda", cantidad: 2, fecha: "2026-10-08" }],
    });
  });

  it("los cuatro orígenes se entienden", () => {
    const r = leerPorLlegar(["compra", "almacen", "taller", "tienda"].map((de) => parte({ de, fecha: "2026-10-09" })));
    expect(r?.["var-1"]?.map((p) => p.de)).toEqual(["compra", "almacen", "taller", "tienda"]);
  });

  it("la misma prenda, origen y fecha se suman en una parte", () => {
    expect(leerPorLlegar([parte({ de: "tienda", cantidad: 1 }), parte({ de: "tienda", cantidad: 3 })])).toEqual({
      "var-1": [{ de: "tienda", cantidad: 4, fecha: "2026-10-15" }],
    });
  });

  it("entiende una cantidad que llega como texto", () => {
    expect(leerPorLlegar([parte({ cantidad: "6" })])?.["var-1"]?.[0]?.cantidad).toBe(6);
  });
});

describe("campos nulos", () => {
  it("sin fecha: la parte cuenta y va al final de su prenda", () => {
    expect(leerPorLlegar([parte({ fecha: null }), parte({ de: "almacen", cantidad: 2, fecha: "2026-10-20" })])).toEqual({
      "var-1": [
        { de: "almacen", cantidad: 2, fecha: "2026-10-20" },
        { de: "compra", cantidad: 10, fecha: null },
      ],
    });
  });

  it("una fecha que no se entiende (o que no existe) queda «sin fecha»", () => {
    expect(leerPorLlegar([parte({ fecha: "15 oct" })])?.["var-1"]?.[0]?.fecha).toBeNull();
    expect(leerPorLlegar([parte({ fecha: "2026-02-30" })])?.["var-1"]?.[0]?.fecha).toBeNull();
  });
});

describe("una parte rota se descarta", () => {
  it("sin prenda, con un origen que no se conoce o que no es una parte", () => {
    expect(leerPorLlegar([parte({ variante_id: null }), parte({ variante_id: "" }), parte({ de: "produccion" }), parte({ de: null }), null, "var-1", [parte()]])).toEqual({});
  });

  it("sin unidades, o con una cantidad negativa (vale 0): no se promete nada", () => {
    expect(leerPorLlegar([parte({ cantidad: 0 }), parte({ cantidad: -4 }), parte({ cantidad: null }), parte({ cantidad: "x" })])).toEqual({});
  });

  it("las rotas salen y las buenas quedan", () => {
    expect(leerPorLlegar([parte({ de: "barco" }), parte({ variante_id: "var-3", cantidad: 1 })])).toEqual({
      "var-3": [{ de: "compra", cantidad: 1, fecha: "2026-10-15" }],
    });
  });
});

describe("la respuesta entera", () => {
  it("un arreglo vacío es «no viene nada»", () => {
    expect(leerPorLlegar([])).toEqual({});
  });

  it("NULL (la cuenta no puede analizar) o una forma que no se entiende es «no se pudo leer»", () => {
    expect(leerPorLlegar(null)).toBeNull();
    expect(leerPorLlegar(undefined)).toBeNull();
    expect(leerPorLlegar({ "var-1": [] })).toBeNull();
  });
});
