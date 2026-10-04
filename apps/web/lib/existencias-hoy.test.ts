import { describe, expect, it } from "vitest";
import { hoyDeTalla, resumirPorColgar, TEXTO_HOY, textoHoyDePrenda, TIPOS_HOY } from "./existencias-hoy";
import { ACCIONES_PISO, type AccionPiso } from "./piso-plan";

// «Hoy» (Felipe, 2026-10-03): cada talla cae en UNO de cuatro casos, y el filtro, la tarjeta, la tabla y el cajón dicen la misma
// palabra. Desde ADR-0328 act. 7 el caso no se calcula aquí: es la acción del motor del piso (`planPiso`) dicha en palabras.
const plan = (accion: AccionPiso) => ({ accion });

describe("hoyDeTalla", () => {
  it("cada acción del motor tiene su palabra de ADR-0326", () => {
    expect(hoyDeTalla({ pisoDisponible: 0, almacenDisponible: 3, planPiso: plan("por_colgar") })).toBe("por_colgar");
    expect(hoyDeTalla({ pisoDisponible: 1, almacenDisponible: 3, planPiso: plan("por_reponer") })).toBe("por_reponer");
    expect(hoyDeTalla({ pisoDisponible: 1, almacenDisponible: 0, planPiso: plan("sin_atras") })).toBe("sin_stock_atras");
    expect(hoyDeTalla({ pisoDisponible: 6, almacenDisponible: 3, planPiso: plan("mantener") })).toBe("mantener");
  });

  it("sin piso y almacén separados (Taller) no hay «Hoy»", () => {
    expect(hoyDeTalla({ pisoDisponible: null, almacenDisponible: null, planPiso: null })).toBeNull();
    expect(hoyDeTalla({ pisoDisponible: null, almacenDisponible: null, planPiso: plan("por_colgar") })).toBeNull();
  });

  it("sin decisión del motor (su lectura no respondió) no se afirma nada: ni «Mantener» ni «Por colgar»", () => {
    expect(hoyDeTalla({ pisoDisponible: 0, almacenDisponible: 3, planPiso: null })).toBeNull();
    expect(hoyDeTalla({ pisoDisponible: 0, almacenDisponible: 3 })).toBeNull();
  });

  it("con el piso sin cuadrar tampoco: la pausa no tiene palabra en «Hoy» (lo dice la portada)", () => {
    expect(hoyDeTalla({ pisoDisponible: 0, almacenDisponible: 3, planPiso: plan("pausa_sin_cuadre") })).toBeNull();
  });

  it("toda acción cae en uno solo de los cuatro casos, o en ninguno si es la pausa", () => {
    for (const accion of ACCIONES_PISO) {
      const caso = hoyDeTalla({ pisoDisponible: 1, almacenDisponible: 1, planPiso: plan(accion) });
      if (accion === "pausa_sin_cuadre") expect(caso).toBeNull();
      else expect(TIPOS_HOY).toContain(caso);
    }
  });
});

describe("resumirPorColgar — el contador del filtro «Por colgar»", () => {
  it("cuenta las tallas por colgar y lo que se puede bajar de ellas; nada más", () => {
    expect(
      resumirPorColgar([
        { pisoDisponible: 0, almacenDisponible: 3, planPiso: plan("por_colgar") },
        { pisoDisponible: 0, almacenDisponible: 1, planPiso: plan("por_colgar") },
        { pisoDisponible: 1, almacenDisponible: 4, planPiso: plan("por_reponer") },
        { pisoDisponible: 0, almacenDisponible: 4, planPiso: plan("pausa_sin_cuadre") },
        { pisoDisponible: 0, almacenDisponible: 4, planPiso: plan("mantener") },
        { pisoDisponible: null, almacenDisponible: null, planPiso: null },
      ])
    ).toEqual({ tallas: 2, unidades: 4 });
  });
});

describe("textoHoyDePrenda", () => {
  it("usa la misma palabra del filtro, con cuántas tallas", () => {
    expect(textoHoyDePrenda("por_colgar", 1)).toBe("1 talla por colgar");
    expect(textoHoyDePrenda("sin_stock_atras", 3)).toBe("3 tallas sin stock atrás");
    expect(textoHoyDePrenda("mantener", 0)).toBe(TEXTO_HOY.mantener);
    for (const tipo of TIPOS_HOY.filter((t) => t !== "mantener")) expect(textoHoyDePrenda(tipo, 2).endsWith(TEXTO_HOY[tipo].toLocaleLowerCase("es"))).toBe(true);
  });
});
