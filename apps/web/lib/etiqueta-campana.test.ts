import { describe, it, expect } from "vitest";
import { nombreBajoCosto, objecionVigencia, parsearDescuento, parsearFecha, prendasBajoCosto, type PrendaConCosto } from "./etiqueta-campana";
import { descuentoDeCampana } from "./vender-reglas";

describe("parsearDescuento", () => {
  it.each([
    ["20", 20],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["20 %", 20],
    [" 100 ", 100],
    ["0,5", 0.5],
  ])("%j → %d", (entrada, esperado) => {
    expect(parsearDescuento(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it("vacío = sin descuento (etiqueta informativa)", () => {
    expect(parsearDescuento("")).toEqual({ ok: true, valor: null });
    expect(parsearDescuento("  %  ")).toEqual({ ok: true, valor: null });
  });

  it.each(["0", "0,00", "101", "100,01", "-5", "veinte", "12,555", "1e2"])("rechaza %j", (entrada) => {
    expect(parsearDescuento(entrada).ok).toBe(false);
  });
});

describe("parsearFecha", () => {
  it("acepta una fecha real y el vacío", () => {
    expect(parsearFecha("2026-11-09")).toEqual({ ok: true, valor: "2026-11-09" });
    expect(parsearFecha("")).toEqual({ ok: true, valor: null });
  });
  it.each(["2026-02-31", "09/11/2026", "2026-13-01", "mañana"])("rechaza %j", (entrada) => {
    expect(parsearFecha(entrada).ok).toBe(false);
  });
});

describe("objecionVigencia", () => {
  it("solo objeta cuando el inicio es posterior al fin", () => {
    expect(objecionVigencia("2026-12-01", "2026-11-01")).not.toBeNull();
    expect(objecionVigencia("2026-11-01", "2026-11-01")).toBeNull();
    expect(objecionVigencia(null, "2026-11-01")).toBeNull();
    expect(objecionVigencia("2026-11-01", null)).toBeNull();
  });
});

describe("prendasBajoCosto — el aviso al configurar una campaña", () => {
  const prenda = (id: string, categoriaId: string | null, precio: number, costo: number): PrendaConCosto => ({ id, categoriaId, precio, costo, nombre: id });
  const prendas = [prenda("jean", "c-jeans", 100, 40), prenda("polo", "c-polos", 50, 45), prenda("collar", "c-collares", 30, 10)];

  it("sin descuento no hay nada que avisar", () => {
    expect(prendasBajoCosto(null, prendas, new Set(["c-jeans", "c-polos"]), new Set())).toEqual([]);
  });
  it("un 20 % en jeans y polos deja el polo (50 → 39.90) por debajo de su costo (45)", () => {
    expect(prendasBajoCosto(20, prendas, new Set(["c-jeans", "c-polos"]), new Set()).map((p) => p.id)).toEqual(["polo"]);
  });
  it("solo cuenta lo que la campaña alcanza: el collar no está en las categorías", () => {
    expect(prendasBajoCosto(90, prendas, new Set(["c-polos"]), new Set()).map((p) => p.id)).toEqual(["polo"]);
  });
  it("las prendas etiquetadas a mano cuentan aunque su categoría no esté elegida", () => {
    expect(prendasBajoCosto(90, prendas, new Set(), new Set(["collar"])).map((p) => p.id)).toEqual(["collar"]);
  });
  it("quedar EXACTO en el costo no es estar por debajo", () => {
    // 100 con 10 % = se cobra 90.00, igual al costo.
    expect(prendasBajoCosto(10, [prenda("x", "c", 100, 90)], new Set(["c"]), new Set())).toEqual([]);
  });
  it("en céntimos: 19.90 con 20 % se cobra 15.90 (la cuenta exacta da 15.92, ADR-0403), igual a un costo de 15.90, y no avisa", () => {
    expect(prendasBajoCosto(20, [prenda("x", "c", 19.9, 15.9)], new Set(["c"]), new Set())).toEqual([]);
  });
  it("el precio sin céntimos de la campaña cuenta: con costo 15.91 ya avisa, aunque la cuenta exacta (15.92) no", () => {
    expect(prendasBajoCosto(20, [prenda("x", "c", 19.9, 15.91)], new Set(["c"]), new Set()).map((p) => p.id)).toEqual(["x"]);
  });
  it("cuenta el precio que se cobra (ADR-0403): un céntimo bajo el costo ya avisa", () => {
    // 100 con 10 % = 90.00: queda 1 céntimo bajo un costo de 90.01.
    expect(prendasBajoCosto(10, [prenda("x", "c", 100, 90.01)], new Set(["c"]), new Set()).map((p) => p.id)).toEqual(["x"]);
  });
  it("sin categorías ni prendas a mano, el alcance es vacío", () => {
    expect(prendasBajoCosto(99, prendas, new Set(), new Set())).toEqual([]);
  });
});

describe("el aviso mide el peor caso entre las tiendas (precio propio, Felipe 2026-10-10)", () => {
  // Prenda a 79.90 con costo 60 y TRU con precio propio 69.90, campaña de 20 %: la caja de TRU cobra 69.90 − 13.98 = 55.92 (bajo el costo)
  // y la de las demás 79.90 − 15.98 = 63.92 (no). El aviso con el precio de la prenda no lo veía.
  const base = { id: "falda", categoriaId: "c-faldas", costo: 60, nombre: "Falda Emma (FAL-0008)" };
  it("con el precio de la prenda (79.90) no avisa; con el peor caso (TRU 69.90) sí", () => {
    expect(prendasBajoCosto(20, [{ ...base, precio: 79.9 }], new Set(["c-faldas"]), new Set())).toEqual([]);
    const r = prendasBajoCosto(20, [{ ...base, precio: 69.9, enSede: "Trujillo" }], new Set(["c-faldas"]), new Set());
    expect(r.map((p) => p.id)).toEqual(["falda"]);
  });
  it("quedar justo en el costo no avisa", () => {
    // 75 − 15 = 60: igual al costo, no por debajo.
    expect(prendasBajoCosto(20, [{ ...base, precio: 75, enSede: "Trujillo" }], new Set(["c-faldas"]), new Set())).toEqual([]);
  });
  it("dice el precio más bajo y dónde cuando es el propio de una tienda; si es el de la prenda, solo el nombre", () => {
    expect(nombreBajoCosto({ nombre: "Falda Emma (FAL-0008)", precio: 69.9, enSede: "Trujillo" })).toBe("Falda Emma (FAL-0008) · precio más bajo: S/\u00a069.90 en Trujillo");
    expect(nombreBajoCosto({ nombre: "Falda Emma (FAL-0008)", precio: 79.9, enSede: null })).toBe("Falda Emma (FAL-0008)");
    expect(nombreBajoCosto({ nombre: "Falda Emma (FAL-0008)", precio: 79.9 })).toBe("Falda Emma (FAL-0008)");
  });
  it("no culpa a una tienda: dice un hecho aunque la prenda a su precio ya quede bajo el costo (79.90, costo 65, 25 %)", () => {
    // Con la prenda sola ya se cobra 59.92 < 65: el texto no dice «el problema es Trujillo», dice cuál es el precio más bajo.
    const texto = nombreBajoCosto({ nombre: "Falda Emma (FAL-0008)", precio: 69.9, enSede: "Trujillo" });
    expect(texto).not.toMatch(/propio de/);
    expect(texto).toContain("precio más bajo");
  });
  it("el precio más bajo da el cobrado más bajo: P − descuento no decrece con P (en céntimos, todos los % usuales)", () => {
    // Es el único supuesto de «peor caso»: si el más bajo no queda bajo el costo, ninguno otro lo hace.
    for (const pct of [5, 10, 12.5, 15, 20, 25, 33.33, 50, 99, 100]) {
      let anterior = -Infinity;
      for (let c = 1; c <= 30000; c++) {
        const precio = c / 100;
        const cobrado = Math.round((precio - descuentoDeCampana(precio, pct)) * 100);
        if (cobrado < anterior) throw new Error(`pct ${pct}: ${precio} cobra menos que el precio anterior`);
        anterior = cobrado;
      }
    }
  });
});
