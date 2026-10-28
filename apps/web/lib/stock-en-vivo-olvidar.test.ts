import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del bug de Felipe (2026-10-28): vendió las 3 de una prenda (la caja la dejó en 0), bajaron 3 del almacén al piso y Vender
// siguió diciendo «sin stock» hasta recargar. El sondeo de `useStockEnVivo` se calla si la huella de la sede y el último stock que
// avisó no cambiaron; pero Vender cambia el stock en pantalla por su cuenta (descuenta lo vendido) y el sondeo seguía recordando «3».
// Al volver el piso a 3, «nada cambió» y la pantalla se quedaba en 0. Vender le avisa al sondeo con `olvidarLoLeido` cada vez que
// toca el stock por su cuenta. El hook no se prueba con Vitest (importa el cliente de Supabase): este candado lee los fuentes.

const APP = join(__dirname, "..");
const fuente = (ruta: string) =>
  readFileSync(join(APP, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** El cuerpo de una función declarada en el fuente, hasta la siguiente declaración al mismo nivel. */
function cuerpoDe(src: string, firma: RegExp): string {
  const i = src.search(firma);
  expect(i, `no se encontró ${firma}`).toBeGreaterThanOrEqual(0);
  return src.slice(i, i + 900);
}

describe("el sondeo de stock olvida lo que Vender cambió por su cuenta", () => {
  const hook = fuente("lib/useStockEnVivo.ts");
  const vender = fuente("components/PuntoDeVenta.tsx");

  it("el hook devuelve olvidarLoLeido y reinicia la huella y el último avisado", () => {
    expect(hook).toMatch(/const olvidarLoLeido = useCallback\(\(\) => \{\s*ultimoRef\.current = null;\s*huellaRef\.current = null;/);
    expect(hook).toMatch(/return olvidarLoLeido;/);
  });

  it("Vender se lo avisa al vender, al bajar al piso desde la caja y al releer por su cuenta", () => {
    expect(vender).toMatch(/const olvidarDelSondeo = useStockEnVivo\(/);
    expect(cuerpoDe(vender, /function trasVender\(/)).toContain("olvidarDelSondeo()");
    expect(cuerpoDe(vender, /async function releerStock\(/)).toContain("olvidarDelSondeo()");
    expect(vender).toMatch(/olvidarDelSondeo\(\);\s*setAjustesStock\(\(prev\) => new Map\(prev\)\.set\(varianteId, r\.piso\)\)/);
  });
});
