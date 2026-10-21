import { describe, expect, it } from "vitest";
import { MAX_RESPUESTA } from "./recomendaciones-reglas";
import type { DatosCatalogo, Tema, TemaId } from "./recomendaciones-temas";
import { ayudaDeLaCaja, iniciosDe } from "./sugerencias-recomendaciones";

// Todos los temas (el `satisfies` hace fallar la compilación si nace un tema sin su caso aquí).
const TODOS = { tallas: true, colores: true, envio: true, precio: true, horario: true, calidad: true, atencion: true, elogio: true } satisfies Record<TemaId, true>;
const TEMAS: Tema[] = (Object.keys(TODOS) as TemaId[]).map((id) =>
  id === "tallas" ? { id, nombre: "Tallas grandes · XXXL", talla: "XXXL", rango: "grandes" } : { id, nombre: id },
);
const CATALOGO: DatosCatalogo = { modelosPorTalla: { XL: 31, XXL: 9 }, colores: { total: 18, masUsados: [] } };
const CTX = { nombre: "Lucía", tienda: "Tienda Trujillo", datos: CATALOGO };

describe("formas de empezar la respuesta: siguen lo que escribió el cliente (ADR-0290)", () => {
  it("totalidad: cada tema tiene sus comienzos y su ayuda de caja, y el neutro existe sin tema", () => {
    for (const tema of TEMAS) {
      expect(iniciosDe(tema, CTX).length, tema.id).toBeGreaterThanOrEqual(2);
      expect(ayudaDeLaCaja(tema, "Lucía"), tema.id).toMatch(/^Escribe tu respuesta para Lucía: .+\.$/);
    }
    expect(iniciosDe(null, CTX).map((i) => i.etiqueta)).toEqual(["Agradecer"]);
    expect(ayudaDeLaCaja(null, null)).toBe("Escribe tu respuesta: agradece y dile qué harás con lo que contó.");
  });

  it("cada comienzo cabe en una respuesta, saluda por su nombre y NO pregunta (el cliente no puede contestar en la misma conversación)", () => {
    for (const tema of [...TEMAS, null]) {
      for (const datos of [CATALOGO, null]) {
        for (const i of iniciosDe(tema, { ...CTX, datos })) {
          expect([...i.texto].length, i.texto).toBeLessThanOrEqual(MAX_RESPUESTA);
          expect(i.texto, i.texto).toContain("Lucía");
          expect(i.texto, i.texto).not.toMatch(/[¿?]/);
          expect(i.etiqueta.length, i.etiqueta).toBeLessThanOrEqual(32);
        }
      }
    }
  });

  it("sin nombre (ficha anonimizada) no inventa uno", () => {
    for (const tema of [...TEMAS, null]) for (const i of iniciosDe(tema, { ...CTX, nombre: null })) expect(i.texto).not.toMatch(/undefined|null|, \./);
  });

  it("la talla sigue al dato: «no tenemos» solo si el catálogo dice cero; con modelos, cuántos; sin catálogo, no afirma nada", () => {
    const tallas = (talla: string, datos: DatosCatalogo | null) =>
      iniciosDe({ id: "tallas", nombre: `Talla ${talla}`, talla, rango: null }, { ...CTX, datos })[0]!.texto;
    expect(tallas("XXXL", CATALOGO)).toContain("Hoy no tenemos XXXL");
    expect(tallas("XL", CATALOGO)).toContain("Hoy tenemos XL en 31 modelos");
    expect(tallas("XL", CATALOGO)).not.toContain("no tenemos");
    expect(tallas("XXXL", null)).not.toMatch(/no tenemos|tenemos XXXL/);
  });

  it("los colores siguen al dato: con catálogo, cuántos; sin catálogo, no da un número", () => {
    const colores = (datos: DatosCatalogo | null) => iniciosDe({ id: "colores", nombre: "Más colores" }, { ...CTX, datos })[1]!.texto;
    expect(colores(CATALOGO)).toContain("18 colores");
    expect(colores(null)).not.toMatch(/\d/);
  });

  it("el envío no promete lo que la tienda no hace", () => {
    for (const i of iniciosDe({ id: "envio", nombre: "Envío a provincia" }, CTX)) expect(i.texto).not.toMatch(/te lo enviamos|te llega a tu casa|envío gratis/i);
  });

  it("sigue al control y es estable: A → B → A da lo mismo, sin azar", () => {
    const [a, b] = [TEMAS[0]!, TEMAS[2]!];
    const primero = iniciosDe(a, CTX);
    expect(iniciosDe(b, CTX)).not.toEqual(primero);
    expect(iniciosDe(a, CTX)).toEqual(primero);
    expect(ayudaDeLaCaja(a, "Lucía")).toBe(ayudaDeLaCaja(a, "Lucía"));
  });

  it("la tienda que nombra es la de la recomendación; sin tienda, una frase que vale para cualquiera", () => {
    const elogio: Tema = { id: "elogio", nombre: "Elogio a la atención" };
    expect(iniciosDe(elogio, CTX)[0]!.texto).toContain("equipo de Tienda Trujillo");
    expect(iniciosDe(elogio, { ...CTX, tienda: null })[0]!.texto).toContain("equipo de la tienda");
  });
});
