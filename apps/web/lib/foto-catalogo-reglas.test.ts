import { describe, expect, it } from "vitest";
import { contarPedido, LADO_MAXIMO_IA, MAX_BYTES_POR_FOTO_IA, medidasParaIA, TOPE_POR_MINUTO } from "./foto-catalogo-reglas";

describe("medidasParaIA", () => {
  it("achica el lado mayor al máximo y conserva la proporción", () => {
    expect(medidasParaIA(3000, 4000, 1600)).toEqual({ ancho: 1200, alto: 1600 });
    expect(medidasParaIA(4000, 3000, 1600)).toEqual({ ancho: 1600, alto: 1200 });
  });

  it("nunca agranda una foto chica", () => {
    expect(medidasParaIA(800, 1000, 1600)).toEqual({ ancho: 800, alto: 1000 });
  });

  it("cuatro fotos al tope entran bajo los 4,5 MB que acepta Vercel", () => {
    expect(4 * MAX_BYTES_POR_FOTO_IA).toBeLessThan(4.5 * 1024 * 1024);
    expect(LADO_MAXIMO_IA).toBeGreaterThanOrEqual(1280);
  });
});

describe("contarPedido", () => {
  it("la primera vez abre la ventana", () => {
    expect(contarPedido(undefined, 1000)).toEqual({ ventana: { desde: 1000, usos: 1 }, excede: false });
  });

  it("frena al pasar el tope dentro del mismo minuto", () => {
    let v: { desde: number; usos: number } | undefined;
    let excede = false;
    for (let i = 0; i < TOPE_POR_MINUTO + 1; i++) ({ ventana: v, excede } = contarPedido(v, 1000 + i));
    expect(excede).toBe(true);
  });

  it("pasado el minuto, vuelve a contar desde cero", () => {
    expect(contarPedido({ desde: 0, usos: 99 }, 60_001)).toEqual({ ventana: { desde: 60_001, usos: 1 }, excede: false });
  });
});
