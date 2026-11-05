import { describe, expect, it } from "vitest";
import { ORDEN_GRUPOS_ETIQUETA } from "./etiqueta-grupos";
import { esDelModo, tramoDeCampana } from "./sellos-campanas";

describe("cada fila es de una sola pantalla", () => {
  it("todo estilo cae en exactamente una de las dos (nada se pierde ni se ve dos veces)", () => {
    for (const estilo of ORDEN_GRUPOS_ETIQUETA) {
      expect([esDelModo(estilo, "sellos"), esDelModo(estilo, "campanas")].filter(Boolean)).toHaveLength(1);
    }
  });

  it("solo el estilo `campana` es una campaña", () => {
    expect(ORDEN_GRUPOS_ETIQUETA.filter((e) => esDelModo(e, "campanas"))).toEqual(["campana"]);
  });
});

// El orden de las pilas (rigen hoy, lo que viene, guardadas) y con qué estilo nace cada fila: `sellos-pases.test.ts`.
describe("las campañas en tramos por su fecha", () => {
  const hoy = "2026-10-22";

  it("cada caso en su tramo", () => {
    expect(tramoDeCampana("2026-10-01", "2026-10-25", hoy)).toBe("ahora");
    expect(tramoDeCampana("2026-10-22", "2026-10-22", hoy)).toBe("ahora");
    expect(tramoDeCampana("2026-11-09", "2026-11-30", hoy)).toBe("proximas");
    expect(tramoDeCampana("2026-02-06", "2026-02-13", hoy)).toBe("pasaron");
    expect(tramoDeCampana(null, null, hoy)).toBe("sin_fechas");
  });
});
