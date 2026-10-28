import { describe, expect, it } from "vitest";
import { esquemaNivel, hayAlgo, hayEnTienda, notaDeStock, textoNivel, tonoNivel, type StockModelo } from "./stock";

const TRU = { id: "f775651f-62c8-4ff4-a414-b5614026d0cd", nombre: "Trujillo" };
const LIM = { id: "2d97d322-8a0a-4cd5-99c4-70e52b9c01db", nombre: "Lima" };
const TIENDAS = [LIM, TRU];
const stock = (total: StockModelo["total"], tru: StockModelo["total"], lim: StockModelo["total"]): StockModelo => ({
  total,
  sedes: { [TRU.id]: tru, [LIM.id]: lim },
});

describe("el nivel", () => {
  it("se lee «Hay», el número, «Última» o «—»", () => {
    expect(["hay", 3, 2, 1, 0].map((n) => textoNivel(n as never))).toEqual(["Hay", "3", "2", "Última", "—"]);
    expect(["hay", 3, 1, 0].map((n) => tonoNivel(n as never))).toEqual(["hay", "poco", "poco", "cero"]);
    expect([hayAlgo("hay"), hayAlgo(1), hayAlgo(0), hayAlgo(undefined)]).toEqual([true, true, false, false]);
  });

  it("la cifra de 4 o más no se acepta aunque llegara: solo «hay» o 0 a 3", () => {
    for (const ok of ["hay", 0, 1, 2, 3]) expect(esquemaNivel.safeParse(ok).success).toBe(true);
    for (const malo of [4, 7, 37, -1, 1.5, "3", "Hay", null]) expect(esquemaNivel.safeParse(malo).success).toBe(false);
  });
});

describe("la nota de la tarjeta", () => {
  it("con una tienda elegida: hay, quedan, última o no hay, en esa tienda", () => {
    expect(notaDeStock(stock("hay", "hay", 0), TRU, TIENDAS)).toEqual({ texto: "Hay en Trujillo", tono: "ok" });
    expect(notaDeStock(stock("hay", "hay", 2), LIM, TIENDAS)).toEqual({ texto: "Quedan 2 en Lima", tono: "poco" });
    expect(notaDeStock(stock(1, 0, 1), LIM, TIENDAS)).toEqual({ texto: "Última en Lima", tono: "poco" });
    expect(notaDeStock(stock("hay", "hay", 0), LIM, TIENDAS)).toEqual({ texto: "No hay en Lima", tono: "no" });
  });

  it("con «Todas»: solo en una, quedan pocas, no hay, o nada si hay de sobra", () => {
    expect(notaDeStock(stock("hay", "hay", 0), null, TIENDAS)).toEqual({ texto: "Solo en Trujillo", tono: "poco" });
    expect(notaDeStock(stock(3, 1, 2), null, TIENDAS)).toEqual({ texto: "Quedan pocas", tono: "poco" });
    expect(notaDeStock(stock(0, 0, 0), null, TIENDAS)).toEqual({ texto: "No hay por ahora", tono: "no" });
    expect(notaDeStock(stock("hay", "hay", 2), null, TIENDAS)).toBeNull();
    // Con una sola tienda en la web, «Solo en …» no dice nada: se mira si quedan pocas.
    expect(notaDeStock(stock(2, 2, 0), null, [TRU])).toEqual({ texto: "Quedan pocas", tono: "poco" });
    expect(notaDeStock(stock("hay", "hay", 0), null, [TRU])).toBeNull();
  });

  it("sin dato del stock o sin tiendas en la web, no dice nada", () => {
    expect(notaDeStock(null, TRU, TIENDAS)).toBeNull();
    expect(notaDeStock(stock(0, 0, 0), null, [])).toBeNull();
  });
});

describe("¿hay en la tienda elegida?", () => {
  it("filtra por la tienda; con «Todas» o sin dato, se muestra", () => {
    expect(hayEnTienda(stock("hay", "hay", 0), TRU.id)).toBe(true);
    expect(hayEnTienda(stock("hay", "hay", 0), LIM.id)).toBe(false);
    expect(hayEnTienda(stock(0, 0, 0), null)).toBe(true);
    expect(hayEnTienda(null, LIM.id)).toBe(true);
    expect(hayEnTienda(stock("hay", "hay", 0), "otra")).toBe(false);
  });
});
