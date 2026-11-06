import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alcanzaPulso } from "./dinero-pulso-reglas";

// Principio 9, tarea 35 de «Las 36»: en Finanzas, una lectura que falla no puede disfrazarse de «no hay nada». Un `if (error) return []` hace
// justo eso: la pantalla dice 0 o «no tiene nada por depositar». Esta cuenta es la deuda de antes de la regla: cada uno de estos sitios ya se
// revisó y calla a propósito (la función aún no está en producción, o es un adorno que no afirma nada). Solo baja: una lectura nueva devuelve
// `Lectura<T>` con su `falla`, y la pantalla la dice.
const SILENCIOS_HOY: Record<string, number> = {
  "lib/cuentas-dinero.ts": 5,
  "lib/gastos.ts": 7,
  "lib/resultados.ts": 2,
};

const CALLA = /if \(error\) return (\[\]|null);|const \{ data \} = await/g;

describe("las lecturas de Finanzas dicen cuándo fallaron", () => {
  for (const [archivo, permitidos] of Object.entries(SILENCIOS_HOY)) {
    it(`${archivo} no suma lecturas que callan una falla`, () => {
      const texto = readFileSync(archivo, "utf8");
      expect(texto.match(CALLA)?.length ?? 0).toBe(permitidos);
    });
  }
  it("si no se pudo leer lo que viene, no dice que eso lo ve el líder", () => {
    const a = alcanzaPulso(null, 0, true);
    expect(a.estado).toBe("sin_dato");
    expect(a.frase).toContain("No se pudo leer");
    expect(alcanzaPulso(null, 0).frase).not.toContain("No se pudo leer");
  });
});
