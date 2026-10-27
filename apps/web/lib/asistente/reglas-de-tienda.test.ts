import { describe, expect, it } from "vitest";
import { TOPE_DIAS_APARTADO } from "../apartado-detalle-reglas";
import { DIAS_PLAZO_CAMBIO } from "../cambios-reglas";
import { frasesDeErrores } from "../error-escritura";
import { erroresParecidos, reglasParecidas } from "./conocimiento";
import { REGLAS_DE_TIENDA, reglasAprobadas, type ReglaDeTienda } from "./reglas-de-tienda";

const regla = (id: string) => REGLAS_DE_TIENDA.find((r) => r.id === id)!;

describe("las reglas de tienda (ADR-0529, actividad 7)", () => {
  it("cada id es único y cada regla tiene su fuente", () => {
    expect(new Set(REGLAS_DE_TIENDA.map((r) => r.id)).size).toBe(REGLAS_DE_TIENDA.length);
    for (const r of REGLAS_DE_TIENDA) expect(r.fuente.length, r.id).toBeGreaterThan(5);
  });

  it("una respuesta es corta (dos frases como máximo) y habla como la tienda", () => {
    for (const r of REGLAS_DE_TIENDA) {
      expect(r.respuesta.length, r.id).toBeLessThanOrEqual(240);
      expect(r.respuesta.split(/[.!?](\s|$)/).filter((f) => f.trim().length > 1).length, r.id).toBeLessThanOrEqual(2);
      expect(r.respuesta, r.id).not.toMatch(/\b(clienta|socia|jefe|empleado|sucursal)\b/i);
    }
  });

  it("las cifras dicen lo mismo que el código que las aplica", () => {
    expect(regla("cambio-plazo").respuesta).toContain(`${DIAS_PLAZO_CAMBIO} días`);
    expect(regla("apartado-plazo").respuesta).toContain(`${TOPE_DIAS_APARTADO} días`);
  });

  it("solo las aprobadas llegan a la IA", () => {
    const lista: ReglaDeTienda[] = [
      { ...regla("cambio-plazo"), estado: "aprobada" },
      { ...regla("apartado-plazo"), estado: "borrador" },
    ];
    expect(reglasAprobadas(lista).map((r) => r.id)).toEqual(["cambio-plazo"]);
    expect(reglasParecidas("cuántos días se guarda un apartado", lista).map((r) => r.id)).not.toContain("apartado-plazo");
    expect(reglasParecidas("cuántos días se guarda un apartado")).toEqual(reglasParecidas("cuántos días se guarda un apartado", REGLAS_DE_TIENDA.filter((r) => r.estado === "aprobada")));
    expect(reglasParecidas("cuántos días para cambiar una prenda", lista).map((r) => r.id)).toEqual(["cambio-plazo"]);
  });
});

describe("el catálogo de errores es el de la pantalla", () => {
  it("trae frases fijas con su marca, y encuentra la que se parece a la pregunta", () => {
    const errores = frasesDeErrores();
    expect(errores.length).toBeGreaterThan(20);
    for (const e of errores) expect(typeof e.frase).toBe("string");
    expect(erroresParecidos("por qué no me deja crear la marca, dice que ya existe", errores).map((e) => e.marca)).toContain("marcas_nombre_unico");
  });

  it("sin palabras en común, ninguno", () => {
    expect(erroresParecidos("hola", frasesDeErrores())).toEqual([]);
  });
});
