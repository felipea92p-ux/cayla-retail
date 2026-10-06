import { describe, expect, it } from "vitest";
import { MARCADOR_CATALOGO, MARCADOR_NEUTRO, MAX_MARCADOR, marcadorBuscador, type ContextoMarcador } from "./sugerencias-regularizar";

// ADR-0290 (sugerencias coherentes): el texto del buscador sigue lo que la venta trae (lo anotado y la tienda de la venta) y el modo
// que la persona eligió (solo la tienda / todo el catálogo). Se recorren todos los valores del control (los dos modos) y ventas de
// varias tiendas y categorías.

const base: ContextoMarcador = { modo: "sede", categoria: "Pantalones", color: "Chocolate", talla: "28", sede: "Tienda TRU" };

describe("marcadorBuscador — el buscador dice qué está mirando", () => {
  it("por defecto nombra lo que anotó la caja y la tienda DE LA VENTA (el caso de la captura de Felipe)", () => {
    expect(marcadorBuscador(base)).toBe("Pantalones · Chocolate · 28 en Tienda TRU");
  });

  it("en todo el catálogo ya no promete nada de la venta", () => {
    expect(marcadorBuscador({ ...base, modo: "catalogo" })).toBe(MARCADOR_CATALOGO);
  });

  it("sigue al control: sede → catálogo → sede vuelve al mismo texto (estable, sin azar)", () => {
    const a = marcadorBuscador(base);
    const b = marcadorBuscador({ ...base, modo: "catalogo" });
    expect(a).not.toBe(b);
    expect(marcadorBuscador(base)).toBe(a);
  });

  it("sigue a la venta: otra tienda, otra categoría, otro color o talla cambian el texto (ninguna dice lo de otra)", () => {
    const ventas: ContextoMarcador[] = [
      base,
      { ...base, sede: "Tienda AQP" },
      { ...base, categoria: "Jeans" },
      { ...base, color: "Negro" },
      { ...base, talla: "30" },
    ];
    const textos = ventas.map(marcadorBuscador);
    expect(new Set(textos).size).toBe(ventas.length);
    for (const [i, v] of ventas.entries()) {
      for (const pieza of [v.categoria, v.color, v.talla]) expect(textos[i]).toContain(pieza);
    }
  });

  it("con lo escrito distinto de lo anotado, nombra las dos categorías (se buscó en las dos)", () => {
    expect(marcadorBuscador({ ...base, escrita: "Jeans" })).toBe("Jeans o Pantalones · Chocolate · 28");
  });

  it("sin nada anotado, un texto neutro; sin talla (un accesorio) no deja huecos", () => {
    expect(marcadorBuscador({ ...base, categoria: "", color: "", talla: "" })).toBe(MARCADOR_NEUTRO);
    expect(marcadorBuscador({ ...base, categoria: "Collares", color: "Dorado", talla: "" })).toBe("Collares · Dorado en Tienda TRU");
  });

  it("cabe a 375 px: nunca pasa de MAX_MARCADOR; primero se suelta la tienda y nunca se corta a media palabra", () => {
    const largo = { ...base, categoria: "Camisas y Blusas", color: "Azul marino", talla: "XL", sede: "Tienda Trujillo" };
    expect(marcadorBuscador(largo)).toBe("Camisas y Blusas · Azul marino · XL");
    const enorme = { ...largo, categoria: "Conjuntos deportivos de temporada", color: "Verde oliva oscuro" };
    // Con lo escrito distinto, si no cabe, se suelta la categoría anotada (manda la escrita).
    expect(marcadorBuscador({ ...enorme, escrita: "Casacas" })).toBe("Casacas · Verde oliva oscuro · XL");
    // Si ni lo más corto cabe, se corta en una palabra entera y lo dice con «…».
    const t = marcadorBuscador(enorme);
    expect(t.length).toBeLessThanOrEqual(MAX_MARCADOR);
    expect(t).toBe("Conjuntos deportivos de temporada · Verde…");
    for (const modo of ["sede", "catalogo"] as const) expect(marcadorBuscador({ ...enorme, modo }).length).toBeLessThanOrEqual(MAX_MARCADOR);
  });
});
