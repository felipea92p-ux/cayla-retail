import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anchoDePlantilla, CORTE_MAXIMO, CORTE_MINIMO, corteDePlantilla, ESCALON_CORTE } from "./tabla-corte-reglas";

describe("el corte de una tabla", () => {
  it("suma las columnas, los huecos y el relleno", () => {
    // 8 + 7 rem = 240 px, 1fr = 100, dos huecos de 16 y 40 de relleno.
    expect(anchoDePlantilla("sm:grid-cols-[8rem_1fr_7rem]")).toBe(412);
    expect(anchoDePlantilla("sm:grid-cols-[minmax(0,2fr)_100px]")).toBe(200 + 100 + 16 + 40);
    expect(anchoDePlantilla("sm:grid-cols-[minmax(9rem,1fr)_auto]")).toBe(144 + 64 + 16 + 40);
    expect(anchoDePlantilla("sm:grid-cols-[minmax(0,14rem)_1fr]")).toBe(112 + 100 + 16 + 40);
  });

  it("no se corta una pista dentro de un paréntesis", () => {
    expect(anchoDePlantilla("md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")).toBe(200 + 16 + 40);
  });

  it("una pista repetida cuenta por cada columna que dibuja", () => {
    expect(anchoDePlantilla("sm:grid-cols-[10rem_repeat(3,minmax(0,1fr))]")).toBe(160 + 300 + 3 * 16 + 40);
  });

  it("redondea hacia abajo: unos píxeles no le quitan las columnas", () => {
    expect(corteDePlantilla("sm:grid-cols-[8rem_1fr_7.5rem_10rem_9.5rem_6.5rem_1rem]")).toBe("tabla-corte-880");
  });

  it("una tabla que cabe en cualquier lado no lleva corte", () => {
    expect(corteDePlantilla("sm:grid-cols-[1fr_6rem]")).toBe("");
  });

  it("lo que ya mira su contenedor o nunca cambia de forma no lleva corte", () => {
    expect(corteDePlantilla("@min-[920px]:grid-cols-[20rem_20rem_20rem_20rem]")).toBe("");
    expect(corteDePlantilla("grid-cols-[20rem_20rem_20rem_20rem]")).toBe("");
    expect(corteDePlantilla("")).toBe("");
  });

  it("una forma propia en el celular no se pisa, y `grid-cols-1` es la de siempre", () => {
    expect(corteDePlantilla("grid-cols-2 sm:grid-cols-[20rem_20rem_20rem]")).toBe("");
    expect(corteDePlantilla("grid-cols-1 sm:grid-cols-[20rem_20rem_20rem]")).toBe("tabla-corte-960");
  });

  it("no pasa del último escalón, que existe", () => {
    expect(corteDePlantilla("sm:grid-cols-[40rem_40rem_40rem]")).toBe(`tabla-corte-${CORTE_MAXIMO}`);
  });

  it("cada corte posible tiene su regla en el CSS", () => {
    const css = readFileSync(join(__dirname, "../app/estilos/tabla-corte.css"), "utf8");
    for (let c = CORTE_MINIMO; c <= CORTE_MAXIMO; c += ESCALON_CORTE) {
      expect(css).toContain(`@container tabla (max-width: ${c - 0.02}px)`);
      expect(css).toContain(`.tabla-corte-${c}.encabezado-tabla-cayla`);
    }
  });
});
