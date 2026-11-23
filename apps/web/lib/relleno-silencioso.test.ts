import { describe, expect, it } from "vitest";
// El escáner de observabilidad es la ÚNICA definición de «relleno silencioso»: la prueba lo importa en vez de copiarlo, como
// `lib/sugerir.test.ts` con el suyo. Sus casos buenos y malos viven en `scripts/rendimiento/rendimiento.test.mjs`.
import { analizarArchivo, rellenosSinMarca } from "../../../scripts/rendimiento/observabilidad.mjs";
import { PENDIENTES_HOY, RELLENOS_PENDIENTES } from "./relleno-silencioso-archivos";

// REGLA (Felipe, 2026-11-23 — ADR-0693): un relleno (`.catch(() => null)`, `.catch(() => [])`, `catch { return [] }`) pone un valor en
// lugar del error y nadie se entera. El que es a propósito lo dice en su línea con `// relleno-a-proposito: <motivo>`. Esta prueba
// es la parte que no depende de que alguien se acuerde: un relleno NUEVO sin marca falla aquí, y la deuda de antes
// (`lib/relleno-silencioso-archivos.ts`) solo puede bajar. Misma idea que `lib/sugerir.test.ts` y `lib/tema-colores.test.ts`.

const hoy = rellenosSinMarca() as Record<string, number[]>;
const cuenta = (archivo: string) => hoy[archivo]?.length ?? 0;
const QUE_HACER =
  "Si es a propósito (una parte opcional que, si no responde, deja la pantalla como antes), dilo en su línea o en el comentario de arriba: " +
  "«// relleno-a-proposito: <qué pasa si falla, 10 caracteres o más>». Si no lo es, que el error se vea: avísalo (`capturarError`, " +
  "`avisar.error`) o deja que suba. No lo sumes a lib/relleno-silencioso-archivos.ts: esa lista es deuda de antes de la regla.";

describe("relleno silencioso — el que pone un valor en lugar del error dice por qué", () => {
  it("el escáner ve los rellenos (no está mirando una carpeta vacía ni se quedó ciego)", () => {
    expect(Object.keys(hoy).length).toBeGreaterThan(20);
    const malo = analizarArchivo(`export const f = (x: () => Promise<unknown>) => x().catch(() => null);`, "x.ts");
    expect(malo.map((h: { tipo: string }) => h.tipo)).toContain("relleno-silencioso");
    const marcado = analizarArchivo(`export const f = (x: () => Promise<unknown>) => x().catch(() => null); // relleno-a-proposito: una parte opcional de la ficha`, "x.ts");
    expect(marcado.map((h: { tipo: string }) => h.tipo)).not.toContain("relleno-silencioso");
  });

  it("ningún archivo suma un relleno sin marca: uno NUEVO dice su motivo o deja ver el error", () => {
    const subieron = Object.keys(hoy)
      .filter((a) => cuenta(a) > (RELLENOS_PENDIENTES[a] ?? 0))
      .map((a) => `${a} (líneas ${hoy[a].join(", ")}; la deuda permite ${RELLENOS_PENDIENTES[a] ?? 0})`);
    expect(subieron, `Relleno sin marca en: ${subieron.join(" · ")}. ${QUE_HACER}`).toEqual([]);
  });

  it("la deuda no miente: un archivo que ya resolvió alguno baja su número (o sale de la lista)", () => {
    const bajaron = Object.entries(RELLENOS_PENDIENTES)
      .filter(([a, n]) => cuenta(a) < n)
      .map(([a, n]) => `${a}: la lista dice ${n}, hoy hay ${cuenta(a)}`);
    expect(bajaron, `Bajaron: ${bajaron.join(" · ")}. Pon el número de hoy en lib/relleno-silencioso-archivos.ts (o borra la línea si llegó a 0) y baja PENDIENTES_HOY.`).toEqual([]);
  });

  it("la cuenta total es exacta: baja al avanzar, nunca sube", () => {
    const suma = Object.values(RELLENOS_PENDIENTES).reduce((s, n) => s + n, 0);
    expect(suma, `La lista suma ${suma} y PENDIENTES_HOY dice ${PENDIENTES_HOY}.`).toBe(PENDIENTES_HOY);
    expect(Object.values(RELLENOS_PENDIENTES).every((n) => Number.isInteger(n) && n > 0), "un archivo listado con 0 se borra de la lista").toBe(true);
  });
});
