import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PerdidasVista } from "../components/perdidas/PerdidasVista";
import { leerResumenPerdidas, perdidasQueSeRepiten, type ResumenPerdidas } from "./perdidas-reglas";
import FIXTURE from "./perdidas.fixture.json";

// La pestaña «Pérdidas» dibujada con lo que devolvió de verdad `retail.fn_perdidas_resumen` (la escena de marzo de 2031 de
// `scripts/pruebas/perdidas.mjs`, guardada tal cual en `perdidas.fixture.json`): como líder y como integrante de Trujillo.
// Lo que se vigila es lo que Felipe decidió: lo que apareció va aparte, el costo por prenda solo para el líder, «Más
// faltan» por categoría · talla · color, y que un dato que no se pudo leer se dice (nunca un 0).

const LIDER = leerResumenPerdidas(FIXTURE.lider)!;
const INTEGRANTE = leerResumenPerdidas(FIXTURE.integrante)!;
type Filtro = { varianteId: string | null; sububicacionId: string | null };
const SIN_FILTRO: Filtro = { varianteId: null, sububicacionId: null };

function dibujar(resumen: ResumenPerdidas | null, o: { filtro?: Filtro; repeticiones?: ReturnType<typeof perdidasQueSeRepiten> | null } = {}) {
  return renderToStaticMarkup(
    createElement(PerdidasVista, {
      resumen,
      repeticiones: o.repeticiones === undefined ? (resumen ? perdidasQueSeRepiten(resumen.hechos, "2031-03-31") : null) : o.repeticiones,
      sede: "Tienda Pérdidas T",
      periodo: "mes",
      periodoTexto: "este mes (marzo)",
      filtro: o.filtro ?? SIN_FILTRO,
    })
  );
}
/** El texto visible, sin etiquetas ni espacios dobles. */
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

describe("PerdidasVista con datos reales de la base", () => {
  it("la fixture es la escena de la prueba SQL: 9 perdidas (S/ 250) y 4 que aparecieron (S/ 120)", () => {
    expect(LIDER.perdido).toEqual({ unidades: 9, soles: 250, sinCosto: 1, hechos: 6 });
    expect(LIDER.aparecio).toEqual({ unidades: 4, soles: 120, hechos: 3 });
  });

  it("dice lo perdido y lo que apareció por separado, nunca el neto", () => {
    const t = texto(dibujar(LIDER));
    expect(t).toContain("−9");
    expect(t).toContain("+4");
    expect(t).not.toContain("−5");
    expect(t).toContain("S/ 250.00 al costo de cada día");
    expect(t).toContain("1 prenda sin costo cargado");
    expect(t).toContain("no se resta de lo perdido");
  });

  it("«Más faltan» por categoría · talla · color, y el desglose por razón con su explicación", () => {
    const t = texto(dibujar(LIDER));
    const primero = LIDER.masFaltan[0]!;
    expect(t).toContain("Más faltan");
    expect(t).toContain(`${primero.categoria} · ${primero.talla} · ${primero.color}`);
    expect(t).toContain("Faltó en un traslado");
    expect(t).toContain("Se cuenta en la sede que lo envió");
    expect(t).toContain("Lo que apareció · por explicar");
  });

  it("el líder ve el costo por prenda; la integrante no ve ni la columna", () => {
    expect(texto(dibujar(LIDER))).toContain("Costo c/u");
    const t = texto(dibujar(INTEGRANTE));
    expect(t).not.toContain("Costo c/u");
    // Pero sí el total en soles (Felipe: los totales son de todos).
    expect(t).toContain("S/ 40.00 al costo de cada día");
  });

  it("la resta «otro» que dejó la talla en 0 sin nota sale en «Se repite» con su enlace a esa prenda", () => {
    const html = dibujar(LIDER);
    expect(texto(html)).toContain("sin nota y la talla quedó en 0");
    expect(html).toContain('href="/inventario/movimientos?vista=perdidas&amp;p=30&amp;variante=');
  });

  it("cada documento lleva a su pantalla y la nota de quien ajustó se lee", () => {
    const html = dibujar(LIDER);
    expect(html).toMatch(/href="\/inventario\/traslados\/[0-9a-f-]{36}"/);
    expect(texto(html)).toContain("«se manchó»");
    expect(texto(html)).toContain("Venta anulada");
  });

  it("filtrada a una prenda: lo dice, ofrece volver a toda la sede y no mide «se repite»", () => {
    const t = texto(dibujar(LIDER, { filtro: { varianteId: LIDER.hechos[0]!.varianteId, sububicacionId: null }, repeticiones: null }));
    expect(t).toContain("Solo");
    expect(t).toContain("Ver toda la sede");
    expect(t).toContain("no se mide");
  });

  it("filtrada a una prenda, la integrante ve solo prendas: ni un S/ (sus soles serían el costo de esa prenda)", () => {
    const filtrada = leerResumenPerdidas(FIXTURE.integrante_prenda)!;
    expect(filtrada.veCosto).toBe(false);
    expect(filtrada.perdido).toEqual({ unidades: 1, soles: null, sinCosto: 0, hechos: 1 });
    expect([...filtrada.porRazon, ...filtrada.porCategoria, ...filtrada.porTalla].every((x) => x.soles === null)).toBe(true);
    const t = texto(dibujar(filtrada, { filtro: { varianteId: filtrada.hechos[0]!.varianteId, sububicacionId: null }, repeticiones: null }));
    expect(t).toContain("−1");
    expect(t).toContain("El valor en soles de una sola prenda lo ve el líder.");
    expect(t).not.toContain("S/");
    expect(t).not.toContain("Costo c/u");
  });

  it("si la base no respondió, lo dice: nunca un 0", () => {
    const t = texto(dibujar(null, { repeticiones: null }));
    expect(t).toContain("no se pudieron leer");
    expect(t).not.toContain("−0");
  });
});
