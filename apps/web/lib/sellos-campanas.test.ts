import { describe, expect, it } from "vitest";
import { ORDEN_GRUPOS_ETIQUETA } from "./etiqueta-grupos";
import { campanasPorTramo, esDelModo, ESTILO_AL_CREAR, tramoDeCampana } from "./sellos-campanas";

describe("cada fila es de una sola pantalla", () => {
  it("todo estilo cae en exactamente una de las dos (nada se pierde ni se ve dos veces)", () => {
    for (const estilo of ORDEN_GRUPOS_ETIQUETA) {
      expect([esDelModo(estilo, "sellos"), esDelModo(estilo, "campanas")].filter(Boolean)).toHaveLength(1);
    }
  });

  it("solo el estilo `campana` es una campaña", () => {
    expect(ORDEN_GRUPOS_ETIQUETA.filter((e) => esDelModo(e, "campanas"))).toEqual(["campana"]);
  });

  it("lo que se crea en cada pantalla vuelve a esa pantalla", () => {
    expect(esDelModo(ESTILO_AL_CREAR.sellos, "sellos")).toBe(true);
    expect(esDelModo(ESTILO_AL_CREAR.campanas, "campanas")).toBe(true);
  });
});

describe("las campañas en tramos por su fecha", () => {
  const hoy = "2026-10-22";
  const c = (nombre: string, vigenteDesde: string | null, vigenteHasta: string | null) => ({ nombre, vigenteDesde, vigenteHasta });

  it("cada caso en su tramo", () => {
    expect(tramoDeCampana("2026-10-01", "2026-10-25", hoy)).toBe("ahora");
    expect(tramoDeCampana("2026-10-22", "2026-10-22", hoy)).toBe("ahora");
    expect(tramoDeCampana("2026-11-09", "2026-11-30", hoy)).toBe("proximas");
    expect(tramoDeCampana("2026-02-06", "2026-02-13", hoy)).toBe("pasaron");
    expect(tramoDeCampana(null, null, hoy)).toBe("sin_fechas");
  });

  it("se leen en orden: hoy, próximas, sin fechas, ya pasaron; sin tramos vacíos", () => {
    const tramos = campanasPorTramo(
      [c("San Valentín", "2026-01-31", "2026-02-14"), c("CyberWow", null, null), c("Navidad", "2026-12-11", "2026-12-25"), c("Black Friday", "2026-11-09", "2026-11-30"), c("Aniversario", "2026-10-01", "2026-10-25")],
      hoy,
    );
    expect(tramos.map((t) => t.tramo)).toEqual(["ahora", "proximas", "sin_fechas", "pasaron"]);
    // Dentro de «Próximas», la que empieza antes va primero.
    expect(tramos[1]!.campanas.map((x) => x.nombre)).toEqual(["Black Friday", "Navidad"]);
    expect(campanasPorTramo([c("Aniversario", "2026-10-01", "2026-10-25")], hoy).map((t) => t.tramo)).toEqual(["ahora"]);
  });
});
