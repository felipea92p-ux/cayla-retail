import { describe, expect, it } from "vitest";
import { hoyDeTalla, TEXTO_HOY, textoHoyDePrenda, TIPOS_HOY, TONO_HOY } from "./existencias-hoy";

// «Hoy» (Felipe, 2026-10-03): cada talla cae en UNO de cuatro casos, y el filtro, la tarjeta, la tabla y el cajón dicen la misma palabra.
const REPONER = { tipo: "bajar_al_piso" as const };
const SIN_ACCION = { tipo: "sin_accion" as const };

describe("hoyDeTalla", () => {
  it("los cuatro casos", () => {
    expect(hoyDeTalla({ pisoDisponible: 0, almacenDisponible: 3, accionHoy: REPONER })).toBe("por_colgar");
    expect(hoyDeTalla({ pisoDisponible: 1, almacenDisponible: 3, accionHoy: REPONER })).toBe("por_reponer");
    expect(hoyDeTalla({ pisoDisponible: 1, almacenDisponible: 0, accionHoy: REPONER })).toBe("sin_stock_atras");
    expect(hoyDeTalla({ pisoDisponible: 0, almacenDisponible: 0, accionHoy: REPONER })).toBe("sin_stock_atras");
    expect(hoyDeTalla({ pisoDisponible: 6, almacenDisponible: 3, accionHoy: SIN_ACCION })).toBe("mantener");
  });

  it("«Por colgar» gana aunque el motor no pida reponer (lo apartado en el piso no se vende)", () => {
    expect(hoyDeTalla({ pisoDisponible: 0, almacenDisponible: 2, accionHoy: SIN_ACCION })).toBe("por_colgar");
  });

  it("sin piso y almacén separados (Taller) no hay «Hoy»", () => {
    expect(hoyDeTalla({ pisoDisponible: null, almacenDisponible: null, accionHoy: null })).toBeNull();
  });

  it("toda combinación cae en uno solo de los cuatro casos (nunca dos, nunca ninguno)", () => {
    for (const piso of [0, 1, 2, 5]) {
      for (const almacen of [0, 1, 4]) {
        for (const accionHoy of [REPONER, SIN_ACCION, null]) {
          const caso = hoyDeTalla({ pisoDisponible: piso, almacenDisponible: almacen, accionHoy });
          expect(TIPOS_HOY).toContain(caso);
        }
      }
    }
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
