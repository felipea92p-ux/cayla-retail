import { describe, expect, it } from "vitest";
import { categoriasDeLaHoja, pasoDeDescuento, textoDuracion } from "./campana-hoja";
import { parsearDescuento } from "./etiqueta-campana";

describe("pasoDeDescuento (− y + de la hoja de campaña)", () => {
  it("sube y baja de 5 en 5", () => {
    expect(pasoDeDescuento("10", 5)).toBe("15");
    expect(pasoDeDescuento("15", -5)).toBe("10");
  });

  it("un decimal va al múltiplo de 5 más cercano en la dirección del toque", () => {
    expect(pasoDeDescuento("12.5", 5)).toBe("20");
    expect(pasoDeDescuento("12,5", -5)).toBe("10");
    expect(pasoDeDescuento("3", 5)).toBe("10");
  });

  it("vacío (sin descuento) sube a 5 y bajar de 5 vuelve a vacío", () => {
    expect(pasoDeDescuento("", 5)).toBe("5");
    expect(pasoDeDescuento("5", -5)).toBe("");
    expect(pasoDeDescuento("", -5)).toBe("");
  });

  it("no pasa de 100", () => {
    expect(pasoDeDescuento("100", 5)).toBe("100");
    expect(pasoDeDescuento("98", 5)).toBe("100");
  });

  it("lo mal escrito cuenta como cero", () => {
    expect(pasoDeDescuento("abc", 5)).toBe("5");
    expect(pasoDeDescuento("150", -5)).toBe("");
  });

  it("todo lo que devuelve se puede guardar (la misma regla que apaga «Guardar»)", () => {
    for (const texto of ["", "5", "12.5", "33", "97.5", "100", "abc", "-4"]) {
      for (const delta of [5, -5]) expect(parsearDescuento(pasoDeDescuento(texto, delta)).ok).toBe(true);
    }
  });
});

describe("textoDuracion (la temporada en una frase)", () => {
  it("cuenta las dos puntas y dice los días de la semana", () => {
    // El 1 de octubre de 2026 es jueves y el 25, domingo.
    expect(textoDuracion("2026-10-01", "2026-10-25")).toBe("25 días, de jueves a domingo");
  });

  it("un solo día", () => {
    expect(textoDuracion("2026-10-24", "2026-10-24")).toBe("1 día, el sábado");
  });

  it("cruza meses y años", () => {
    expect(textoDuracion("2026-12-26", "2027-01-02")).toBe("8 días, de sábado a sábado");
  });

  it("sin una fecha o con las fechas al revés no dice nada", () => {
    expect(textoDuracion(null, "2026-10-25")).toBeNull();
    expect(textoDuracion("2026-10-01", null)).toBeNull();
    expect(textoDuracion("2026-10-25", "2026-10-01")).toBeNull();
  });
});

describe("categoriasDeLaHoja (la grilla de casillas)", () => {
  const cat = (id: string, nombre: string, familia: string) => ({ id, nombre, familia });
  const categorias = [
    cat("vest", "Vestidos", "Indumentaria"),
    cat("blus", "Camisas y Blusas", "Indumentaria"),
    cat("polo", "Polos", "Indumentaria"),
    cat("falda", "Faldas", "Indumentaria"),
    cat("abri", "Abrigos", "Indumentaria"),
    cat("bols", "Bolsos y Carteras", "Accesorios y Complementos"),
    cat("ani", "Anillos", "Bisutería"),
    cat("are", "Aretes", "Bisutería"),
    cat("bolsa", "Bolsas", "Empaque"),
    cat("zap", "Zapatillas", "Calzado"),
  ];
  const prendas = new Map([
    ["vest", 169],
    ["blus", 430],
    ["polo", 339],
    ["falda", 143],
    ["abri", 6],
    ["bols", 38],
    ["ani", 6],
    ["are", 4],
    ["bolsa", 5],
  ]);

  it("familias de la que más trae a la que menos, y sus categorías igual", () => {
    const r = categoriasDeLaHoja(categorias, prendas);
    expect(r.grandes.map((g) => g.familia)).toEqual(["Indumentaria"]);
    expect(r.grandes[0].categorias.map((c) => c.nombre)).toEqual(["Camisas y Blusas", "Polos", "Vestidos", "Faldas", "Abrigos"]);
    expect(r.grandes[0].total).toBe(1087);
  });

  it("las familias chicas comparten fila, y las categorías sin prendas van aparte", () => {
    const r = categoriasDeLaHoja(categorias, prendas);
    expect(r.chicas.map((g) => g.familia)).toEqual(["Accesorios y Complementos", "Bisutería", "Empaque"]);
    expect(r.sinPrendas.map((c) => c.nombre)).toEqual(["Zapatillas"]);
    expect(r.coinciden).toBe(10);
  });

  it("la barra se mide contra la categoría más grande de todas, aunque se busque", () => {
    expect(categoriasDeLaHoja(categorias, prendas).mayor).toBe(430);
    expect(categoriasDeLaHoja(categorias, prendas, "bol").mayor).toBe(430);
  });

  it("busca sin tildes ni mayúsculas, por la categoría o por su familia", () => {
    const bol = categoriasDeLaHoja(categorias, prendas, "BOL");
    expect([...bol.chicas, ...bol.grandes].flatMap((g) => g.categorias.map((c) => c.nombre))).toEqual(["Bolsos y Carteras", "Bolsas"]);
    expect(bol.coinciden).toBe(2);
    const bisu = categoriasDeLaHoja(categorias, prendas, "bisuteria");
    expect(bisu.chicas.map((g) => g.familia)).toEqual(["Bisutería"]);
    expect(bisu.chicas[0].categorias).toHaveLength(2);
  });

  it("sin coincidencias no deja nada", () => {
    const r = categoriasDeLaHoja(categorias, prendas, "zzz");
    expect(r.coinciden).toBe(0);
    expect([...r.grandes, ...r.chicas, ...r.sinPrendas]).toHaveLength(0);
  });
});
