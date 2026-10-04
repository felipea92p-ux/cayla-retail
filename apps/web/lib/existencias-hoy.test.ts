import { describe, expect, it } from "vitest";
import {
  AYUDA_HOY,
  avisoPausaDelPiso,
  contarEnPausa,
  estadoHoyDeTalla,
  hoyDeTalla,
  resumirPorColgar,
  TEXTO_HOY,
  textoHoyDePrenda,
  textoTarjetaEnPausa,
  TIPOS_HOY,
  TONO_HOY,
} from "./existencias-hoy";
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

  it("con el piso sin cuadrar la talla no cae en ningún caso del FILTRO «Hoy» (la pausa no es algo que hacer con la talla)", () => {
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

// El rojo es de lo que falló (una dañada, un plazo vencido), no del trabajo del día (rediseño 2026-10-04, tope de 2 rojos por pantalla).
describe("TONO_HOY", () => {
  it("ningún caso de «Hoy» es rojo: «por colgar» es ámbar y lo que se pide afuera, pizarra", () => {
    for (const t of TIPOS_HOY) expect(TONO_HOY[t]).not.toBe("rojo");
    expect(TONO_HOY.por_colgar).toBe("ambar");
    expect(TONO_HOY.sin_stock_atras).toBe("pizarra");
  });
});

describe("el piso sin cuadrar se VE (revisión adversarial: antes era «N/D» y «Nada pendiente», un vacío que se leía «al día»)", () => {
  it("la talla en pausa se pinta «En pausa», en pizarra (informativo, no semáforo); las demás, su caso; sin motor, nada", () => {
    expect(estadoHoyDeTalla({ pisoDisponible: 0, almacenDisponible: 3, planPiso: plan("pausa_sin_cuadre") })).toBe("en_pausa");
    expect(estadoHoyDeTalla({ pisoDisponible: 6, almacenDisponible: 3, planPiso: plan("mantener") })).toBe("mantener");
    expect(estadoHoyDeTalla({ pisoDisponible: 0, almacenDisponible: 3, planPiso: null })).toBeNull();
    expect(estadoHoyDeTalla({ pisoDisponible: null, almacenDisponible: null, planPiso: plan("pausa_sin_cuadre") })).toBeNull();
    expect(TEXTO_HOY.en_pausa).toBe("En pausa");
    expect(TONO_HOY.en_pausa).toBe("pizarra");
    expect(TIPOS_HOY).not.toContain("en_pausa");
  });
  it("cuenta las tallas que esperan y lo dice: el aviso de la pantalla y la tarjeta", () => {
    const filas = [
      { pisoDisponible: 0, almacenDisponible: 3, planPiso: plan("pausa_sin_cuadre") },
      { pisoDisponible: 1, almacenDisponible: 2, planPiso: plan("pausa_sin_cuadre") },
      { pisoDisponible: 0, almacenDisponible: 0, planPiso: plan("sin_atras") },
    ];
    expect(contarEnPausa(filas)).toBe(2);
    expect(avisoPausaDelPiso("Tienda TRU", 2)).toBe(
      "El piso de Tienda TRU todavía no se cuadró: 2 tallas esperan para colgarse. Hasta cuadrarlo, «Hoy» no manda a bajar nada (podría pedir colgar lo que ya cuelga); «Mantener» y «Sin stock atrás» sí valen."
    );
    expect(avisoPausaDelPiso("Tienda TRU", 0)).toBeNull();
    expect(textoTarjetaEnPausa(1)).toBe("Cuadra el piso antes de colgar: 1 talla espera");
    expect(textoHoyDePrenda("en_pausa", 2)).toBe("2 tallas en pausa");
  });
});

describe("las leyendas de «Hoy» dicen la regla del motor del piso (revisión adversarial)", () => {
  // Una persona sin contexto ve «Mantener» en una XL con 0 colgadas y 3 guardadas: la leyenda le tiene que decir por qué.
  it("cada caso, en palabras de tienda", () => {
    expect(AYUDA_HOY).toEqual({
      por_colgar:
        "No queda ninguna colgada y esta talla necesita una (es del centro de su curva —S, M, L; 28, 30, 32— o se vendió ayer u hoy); en el almacén hay: se cuelga hoy",
      por_reponer: "Ayer u hoy se vendió más de lo que queda colgado, y en el almacén hay para bajar",
      sin_stock_atras:
        "Falta en el piso y el almacén está vacío: trasládala de otra sede. Si se repite, es señal para el Taller (el modelo no se vuelve a pedir)",
      mantener:
        "Ya cuelga lo que pide: 1 por color en las tallas del centro (S, M, L; 28, 30, 32) y lo que se vendió. Una talla extrema (XS, XL…) puede quedar guardada",
      en_pausa:
        "El piso de esta sede todavía no se cuadró: hasta cuadrarlo no se sabe si falta colgarla (podría estar colgada y el sistema creerla guardada)",
    });
  });
  it("ninguna manda a pedir el modelo: el mínimo nunca genera «pedir este modelo» (ADR-0329 act. 9)", () => {
    for (const texto of Object.values(AYUDA_HOY)) expect(texto).not.toMatch(/hay que pedir|pedirla|pídela/i);
  });
});
