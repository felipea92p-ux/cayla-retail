import { describe, expect, it } from "vitest";
import type { CotizacionMaquila } from "./cotizaciones-maquila";
import {
  DIAS_COTIZACION_POR_VENCER,
  chipDeCotizacion,
  detalleDeCotizacion,
  estadoDeCotizacion,
  masRecientePorCategoria,
  ordenarCotizaciones,
  textoDeVigencia,
} from "./cotizaciones-maquila-reglas";

const HOY = "2026-09-22";

function cotizacion(extra: Partial<CotizacionMaquila> = {}): CotizacionMaquila {
  return {
    id: "c1",
    categoriaId: "cat-blusas",
    categoriaNombre: "Blusas",
    precioMaquila: 22.5,
    fechaCotizacion: "2026-07-22",
    vigenteHasta: "2027-01-22",
    proveedorReferencia: "Taller Confecciones del Norte",
    createdAt: "2026-07-22T12:00:00Z",
    ...extra,
  };
}

describe("estadoDeCotizacion", () => {
  it("con vigencia lejos, está vigente", () => {
    expect(estadoDeCotizacion(cotizacion({ vigenteHasta: "2027-01-22" }), HOY)).toBe("vigente");
  });

  it(`por vencer con ${DIAS_COTIZACION_POR_VENCER} días o menos, contando hoy`, () => {
    expect(estadoDeCotizacion(cotizacion({ vigenteHasta: HOY }), HOY)).toBe("porVencer");
    expect(estadoDeCotizacion(cotizacion({ vigenteHasta: "2026-10-22" }), HOY)).toBe("porVencer"); // 30 días
    expect(estadoDeCotizacion(cotizacion({ vigenteHasta: "2026-10-23" }), HOY)).toBe("vigente"); // 31 días
  });

  it("el día que vence todavía cuenta como vigente (por vencer), no vencida — igual que el RPC (>=)", () => {
    expect(estadoDeCotizacion(cotizacion({ vigenteHasta: HOY }), HOY)).not.toBe("vencida");
  });

  it("un día después de vencer, vencida", () => {
    expect(estadoDeCotizacion(cotizacion({ vigenteHasta: "2026-09-21" }), HOY)).toBe("vencida");
  });
});

describe("masRecientePorCategoria", () => {
  it("de varias cotizaciones de la misma categoría, se queda con la primera de la lista (el servidor ya la entrega ordenada por fecha desc)", () => {
    const vieja = cotizacion({ id: "vieja", fechaCotizacion: "2026-01-01", vigenteHasta: "2026-07-01" });
    const nueva = cotizacion({ id: "nueva", fechaCotizacion: "2026-08-01", vigenteHasta: "2027-02-01" });
    expect(masRecientePorCategoria([nueva, vieja]).map((c) => c.id)).toEqual(["nueva"]);
  });

  it("categorías distintas quedan cada una con la suya", () => {
    const blusas = cotizacion({ id: "b", categoriaId: "cat-blusas" });
    const vestidos = cotizacion({ id: "v", categoriaId: "cat-vestidos" });
    expect(masRecientePorCategoria([blusas, vestidos]).map((c) => c.id).sort()).toEqual(["b", "v"]);
  });

  it("no modifica el arreglo que recibe", () => {
    const original = [cotizacion({ id: "a" }), cotizacion({ id: "b", categoriaId: "otra" })];
    const copia = [...original];
    masRecientePorCategoria(original);
    expect(original).toEqual(copia);
  });
});

describe("chipDeCotizacion", () => {
  it("vencida es la única de esta pantalla con rojo — es una falla activa para D-31, no un descuento que dejó de aplicar", () => {
    expect(chipDeCotizacion(cotizacion({ vigenteHasta: "2026-01-01" }), HOY).tono).toBe("rojo");
  });
  it("por vencer va en ámbar, vigente en verde", () => {
    expect(chipDeCotizacion(cotizacion({ vigenteHasta: HOY }), HOY).tono).toBe("ambar");
    expect(chipDeCotizacion(cotizacion({ vigenteHasta: "2027-01-01" }), HOY).tono).toBe("verde");
  });
});

describe("detalleDeCotizacion", () => {
  it("dice cuánto falta o hace cuánto venció, en el idioma de todos los días", () => {
    expect(detalleDeCotizacion(cotizacion({ vigenteHasta: HOY }), HOY)).toBe("Vence hoy");
    expect(detalleDeCotizacion(cotizacion({ vigenteHasta: "2026-09-23" }), HOY)).toBe("Vence mañana");
    expect(detalleDeCotizacion(cotizacion({ vigenteHasta: "2026-09-21" }), HOY)).toBe("Venció ayer");
    expect(detalleDeCotizacion(cotizacion({ vigenteHasta: "2026-09-10" }), HOY)).toBe("Venció hace 12 d");
  });
});

describe("ordenarCotizaciones", () => {
  it("vencida primero, luego por vencer, luego vigente; dentro de cada grupo, alfabético", () => {
    const vencida = cotizacion({ id: "v", categoriaNombre: "Vestidos", vigenteHasta: "2026-01-01" });
    const porVencer = cotizacion({ id: "p", categoriaNombre: "Pantalones", vigenteHasta: HOY });
    const blusasVigente = cotizacion({ id: "b1", categoriaNombre: "Blusas", vigenteHasta: "2027-01-01" });
    const faldasVigente = cotizacion({ id: "b2", categoriaNombre: "Faldas", vigenteHasta: "2027-01-01" });
    const orden = ordenarCotizaciones([faldasVigente, blusasVigente, porVencer, vencida], HOY);
    expect(orden.map((c) => c.id)).toEqual(["v", "p", "b1", "b2"]);
  });

  it("no modifica el arreglo que recibe", () => {
    const original = [cotizacion({ id: "a" }), cotizacion({ id: "b", categoriaNombre: "Zapatos" })];
    const copia = [...original];
    ordenarCotizaciones(original, HOY);
    expect(original).toEqual(copia);
  });
});

describe("textoDeVigencia", () => {
  it("las dos fechas, cortas y separadas por guion largo", () => {
    expect(textoDeVigencia(cotizacion({ fechaCotizacion: "2026-03-01", vigenteHasta: "2026-09-01" }))).toBe("01/03/2026 — 01/09/2026");
  });
});
