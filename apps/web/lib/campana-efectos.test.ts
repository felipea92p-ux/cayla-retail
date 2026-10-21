import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EFECTOS_CAMPANA, ENTRADAS_CAMPANA, PARTICULAS_POR_INTENSIDAD, particulasDeEfecto } from "@cayla-retail/shared";

// Los efectos y la entrada de una campaña se dibujan igual en el ERP (vista previa) y en la tienda: la misma lista de partículas y la misma
// hoja de estilos. La hoja vive en `packages/shared/src/campana-efectos.css` y cada app tiene su copia (importar CSS de un paquete del
// repo no está probado en las dos compilaciones): esta prueba las mantiene idénticas.
const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");
const FUENTE = leer("../../../packages/shared/src/campana-efectos.css");

describe("la hoja de efectos de las campañas", () => {
  it("la copia del ERP y la de la tienda son idénticas a la fuente", () => {
    expect(leer("../app/estilos/campana-efectos.css")).toBe(FUENTE);
    expect(leer("../../tienda/app/estilos/campana-efectos.css")).toBe(FUENTE);
  });

  it("tiene una regla para cada efecto del catálogo (menos «ninguno») y una para cada entrada que se anima", () => {
    for (const e of EFECTOS_CAMPANA.filter((x) => x !== "ninguno")) expect(FUENTE, e).toContain(`.cmp-fx-${e} i`);
    for (const e of ENTRADAS_CAMPANA.filter((x) => x === "telon" || x === "caen" || x === "ninguna")) expect(FUENTE, e).toContain(`[data-entrada="${e}"]`);
  });

  it("con «reducir movimiento» no se mueve nada", () => {
    expect(FUENTE).toContain("@media (prefers-reduced-motion: reduce)");
    expect(FUENTE).toContain(".cmp-quieto");
  });
});

describe("particulasDeEfecto", () => {
  it("sin efecto no hay partículas; con efecto, 18 con poca intensidad y 36 con media", () => {
    expect(particulasDeEfecto("ninguno", "media", "continuo")).toEqual([]);
    for (const e of EFECTOS_CAMPANA.filter((x) => x !== "ninguno")) {
      expect(particulasDeEfecto(e, "poca", "una")).toHaveLength(PARTICULAS_POR_INTENSIDAD.poca);
      expect(particulasDeEfecto(e, "media", "una")).toHaveLength(PARTICULAS_POR_INTENSIDAD.media);
    }
  });

  it("es determinista: la vista previa del ERP y la tienda dibujan las mismas", () => {
    expect(particulasDeEfecto("copos", "media", "una")).toEqual(particulasDeEfecto("copos", "media", "una"));
  });

  it("todo cae dentro del cuadro y con valores sensatos", () => {
    for (const e of EFECTOS_CAMPANA.filter((x) => x !== "ninguno")) {
      for (const p of particulasDeEfecto(e, "media", "continuo")) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
        expect(p.tam).toBeGreaterThan(0);
        expect(p.dura).toBeGreaterThanOrEqual(3.6);
        expect(p.retraso).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("«una vez» empieza todo en los primeros 2,4 s; «continuo» reparte las pasadas hasta 5 s", () => {
    expect(Math.max(...particulasDeEfecto("confeti", "media", "una").map((p) => p.retraso))).toBeLessThanOrEqual(2.4);
    expect(Math.max(...particulasDeEfecto("confeti", "media", "continuo").map((p) => p.retraso))).toBeGreaterThan(2.4);
  });

  it("los colores salen del diseño (acento, texto) o son neutros fijos (blanco, hielo)", () => {
    const usados = new Set(particulasDeEfecto("confeti", "media", "una").map((p) => p.color));
    expect([...usados].sort()).toEqual(["acento", "blanco", "texto"]);
    expect(new Set(particulasDeEfecto("copos", "poca", "una").map((p) => p.color))).toEqual(new Set(["blanco", "hielo"]));
  });
});
