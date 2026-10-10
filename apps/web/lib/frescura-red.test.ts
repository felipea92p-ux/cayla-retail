import { describe, expect, it } from "vitest";
import { conteoVacio, type ConteoPiso, type FamiliaPiso } from "./frescura-piso";
import { cuadricula, resumenCayla, type ResumenTienda } from "./frescura-red";

// CAYLA Global ▸ Frescura del piso (ADR-0208, act. 2026-10-10 (b)): la suma de las tiendas, la frase de CAYLA y la cuadrícula categoría × tienda.

const familia = (u: Partial<ConteoPiso>): FamiliaPiso => {
  const unidades = { ...conteoVacio(), ...u };
  return { codigo: "indumentaria", nombre: "Indumentaria", unidades, total: unidades.fresca + unidades.vigente + unidades.envejeciendo + unidades.sin_saber, prendas: 1, soles: null };
};
const LISTA = { puedeHablar: true, aviso: "" };
const tienda = (nombre: string, o: Partial<ResumenTienda> = {}): ResumenTienda => ({ id: nombre, nombre, principal: null, antes: null, puerta: LISTA, porCategoria: [], fallo: null, ...o });

describe("resumenCayla", () => {
  it("suma las tiendas y afirma si todas registran lo que venden", () => {
    const r = resumenCayla([tienda("TRU", { principal: familia({ fresca: 30, vigente: 10, envejeciendo: 10 }) }), tienda("AQP", { principal: familia({ fresca: 20, vigente: 20, envejeciendo: 10 }) })]);
    expect(r.principal?.unidades).toMatchObject({ fresca: 50, vigente: 30, envejeciendo: 20 });
    expect(r.respuesta).toMatchObject({ pregunta: "¿Está fresco el piso de CAYLA?", respuesta: "50 de cada 100 prendas colgadas están frescas.", afirma: true });
  });

  it("si una tienda no registra lo que vende, CAYLA no afirma y dice cuál", () => {
    const r = resumenCayla([tienda("TRU", { principal: familia({ fresca: 30 }) }), tienda("AQP", { principal: familia({ fresca: 10 }), puerta: { puedeHablar: false, aviso: "" } })]);
    expect(r.respuesta).toMatchObject({ afirma: false, respuesta: "Todavía no se puede saber: AQP aún no registra lo que vende." });
    expect(r.faltan).toEqual(["AQP"]);
  });

  it("si una tienda no se pudo leer, CAYLA no afirma: una cifra con una tienda menos miente", () => {
    const r = resumenCayla([tienda("TRU", { principal: familia({ fresca: 30 }) }), tienda("LIM", { fallo: "No se pudo cargar la frescura de LIM." })]);
    expect(r.respuesta).toMatchObject({ afirma: false, respuesta: "Todavía no se puede saber: no se pudo leer LIM." });
  });

  it("una tienda sin nada colgado no cuenta (ni para la suma ni para la puerta)", () => {
    const r = resumenCayla([tienda("TRU", { principal: familia({ fresca: 30, vigente: 10 }) }), tienda("LIM", { puerta: null })]);
    expect(r.respuesta.afirma).toBe(true);
  });

  it("compara con hace 4 semanas solo si todas las tiendas con piso lo tienen", () => {
    const hoy = familia({ fresca: 40, vigente: 30, envejeciendo: 30 });
    const antes = { ...conteoVacio(), fresca: 60, vigente: 30, envejeciendo: 10 };
    expect(resumenCayla([tienda("TRU", { principal: hoy, antes })]).respuesta.tendencia).toBe("mas_viejo");
    expect(resumenCayla([tienda("TRU", { principal: hoy, antes }), tienda("AQP", { principal: hoy })]).respuesta.tendencia).toBeNull();
  });
});

describe("cuadricula", () => {
  it("una fila por categoría, ordenada por lo que más envejece; el % sale de lo que se sabe y lo que no se sabe se dice", () => {
    const jeans = (env: number, sinSaber = 0) => ({ categoriaId: "jea", nombre: "Jeans", unidades: { ...conteoVacio(), fresca: 10 - env, envejeciendo: env, sin_saber: sinSaber } });
    const polos = { categoriaId: "pol", nombre: "Polos", unidades: { ...conteoVacio(), fresca: 8, vigente: 2 } };
    const filas = cuadricula([tienda("TRU", { porCategoria: [jeans(4), polos] }), tienda("AQP", { porCategoria: [jeans(1, 5)] })]);
    expect(filas.map((f) => f.nombre)).toEqual(["Jeans", "Polos"]);
    expect(filas[0].celdas).toEqual([
      { unidades: 10, envejeciendo: 40, sinSaber: 0 },
      { unidades: 15, envejeciendo: 10, sinSaber: 5 },
    ]);
    expect(filas[1].celdas).toEqual([{ unidades: 10, envejeciendo: 0, sinSaber: 0 }, null]);
  });
});
