import { describe, expect, it } from "vitest";
import { leerPedidoEnCamino, RPC_PEDIDO_EN_CAMINO } from "./analisis-pedido-en-camino-lectura";

// Datos inventados para la prueba: partes como las devuelve `retail.fn_analisis_pedido_en_camino` (claves en snake_case).
const parte = (parcial: Record<string, unknown> = {}): Record<string, unknown> => ({
  de: "orden",
  categoria: "Polos",
  prefijo: "POL",
  marca: "Marca Uno",
  cantidad: 40,
  fecha: "2026-11-12",
  numeros: [12],
  ...parcial,
});

describe("la función que se llama", () => {
  it("es la de la migración 20261017043000", () => {
    expect(RPC_PEDIDO_EN_CAMINO).toBe("fn_analisis_pedido_en_camino");
  });
});

describe("partes completas", () => {
  it("entiende cada parte con su origen, tipo, marca, cantidad, fecha y números", () => {
    expect(leerPedidoEnCamino([parte()])).toEqual([
      { de: "orden", categoria: "Polos", prefijo: "POL", marca: "Marca Uno", cantidad: 40, fecha: "2026-11-12", numeros: [12] },
    ]);
  });

  it("los cinco orígenes se entienden y salen en el orden de la pantalla: envío, orden, reposición, por repartir, Taller", () => {
    const r = leerPedidoEnCamino(["taller", "por_repartir", "reposicion", "orden", "envio"].map((de) => parte({ de })));
    expect(r?.map((p) => p.de)).toEqual(["envio", "orden", "reposicion", "por_repartir", "taller"]);
  });

  it("dentro de un origen: por tipo, por marca y por fecha, y lo que no tiene fecha al final", () => {
    const r = leerPedidoEnCamino([
      parte({ fecha: null, numeros: [3] }),
      parte({ fecha: "2026-12-01", numeros: [4] }),
      parte({ fecha: "2026-11-12", numeros: [5] }),
      parte({ categoria: "Blusas", prefijo: "BLU", marca: "Marca Dos", fecha: "2026-11-30", numeros: [6] }),
    ]);
    expect(r?.map((p) => `${p.categoria}:${p.fecha ?? "-"}`)).toEqual(["Blusas:2026-11-30", "Polos:2026-11-12", "Polos:2026-12-01", "Polos:-"]);
  });

  it("el Taller no trae marca", () => {
    expect(leerPedidoEnCamino([parte({ de: "taller", marca: null, numeros: [7] })])?.[0]).toMatchObject({ de: "taller", marca: null });
  });
});

describe("no confía en la forma (principio 9)", () => {
  it("una respuesta que no es un arreglo (NULL: sin permiso para analizar) vuelve null: nunca «no hay nada pedido»", () => {
    expect(leerPedidoEnCamino(null)).toBeNull();
    expect(leerPedidoEnCamino(undefined)).toBeNull();
    expect(leerPedidoEnCamino({ de: "orden" })).toBeNull();
    expect(leerPedidoEnCamino("[]")).toBeNull();
  });

  it("un arreglo vacío SÍ es un dato: no hay nada pedido", () => {
    expect(leerPedidoEnCamino([])).toEqual([]);
  });

  it("descarta lo que no se puede prometer: origen desconocido, sin tipo, sin unidades, negativas, no numéricas", () => {
    expect(
      leerPedidoEnCamino([
        parte({ de: "otro" }),
        parte({ de: undefined }),
        parte({ categoria: null }),
        parte({ categoria: "   " }),
        parte({ cantidad: 0 }),
        parte({ cantidad: -5 }),
        parte({ cantidad: "abc" }),
        parte({ cantidad: null }),
        "texto suelto",
        null,
      ]),
    ).toEqual([]);
  });

  it("una cantidad que llega como texto numérico o con decimales se entiende como entera", () => {
    expect(leerPedidoEnCamino([parte({ cantidad: "25" })])?.[0]?.cantidad).toBe(25);
    expect(leerPedidoEnCamino([parte({ cantidad: 7.6 })])?.[0]?.cantidad).toBe(8);
  });

  it("una fecha que no es de calendario queda «sin fecha»: no se inventa una", () => {
    for (const fecha of ["mañana", "2026-13-40", "2026-02-30", 20261112, "", null, undefined]) {
      expect(leerPedidoEnCamino([parte({ fecha })])?.[0]?.fecha).toBeNull();
    }
  });

  it("los números de orden: solo enteros positivos, sin repetir y de menor a mayor", () => {
    expect(leerPedidoEnCamino([parte({ numeros: [12, 3, 12, 0, -1, 2.5, "7", null] })])?.[0]?.numeros).toEqual([3, 12]);
    expect(leerPedidoEnCamino([parte({ numeros: "12" })])?.[0]?.numeros).toEqual([]);
    expect(leerPedidoEnCamino([parte({ numeros: undefined })])?.[0]?.numeros).toEqual([]);
  });

  it("el prefijo y la marca vacíos son null", () => {
    expect(leerPedidoEnCamino([parte({ prefijo: "  ", marca: "" })])?.[0]).toMatchObject({ prefijo: null, marca: null });
  });
});

describe("juntar partes", () => {
  it("dos partes del mismo origen, tipo, marca y fecha se suman en una y juntan sus números", () => {
    const r = leerPedidoEnCamino([parte({ cantidad: 10, numeros: [12] }), parte({ cantidad: 5, numeros: [9, 12] })]);
    expect(r).toEqual([{ de: "orden", categoria: "Polos", prefijo: "POL", marca: "Marca Uno", cantidad: 15, fecha: "2026-11-12", numeros: [9, 12] }]);
  });

  it("no junta lo que cambia en el origen, la marca o la fecha", () => {
    const r = leerPedidoEnCamino([
      parte(),
      parte({ de: "envio" }),
      parte({ marca: "Marca Dos" }),
      parte({ fecha: "2026-11-13" }),
    ]);
    expect(r).toHaveLength(4);
  });
});
