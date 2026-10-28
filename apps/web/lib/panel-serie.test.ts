import { describe, it, expect } from "vitest";
import { diaLima, inicioDeDiaLima, inicioDeMesLima } from "./panel-serie";

// El corte de día en hora de Lima es lo que más se puede romper en silencio del
// Inicio: si se corre una hora, una venta de la noche de Trujillo aparece en el
// día equivocado y NADA falla — solo la cifra queda mal. Estas pruebas fijan el
// comportamiento en los bordes donde UTC y Lima no coinciden.
//
// Todas las fechas se escriben en UTC (Date.UTC) con su equivalente en Lima al
// lado, porque es justo la traducción que se está probando. Lima = UTC-5.

/** Ayuda de lectura: una hora de Lima expresada como instante UTC. */
function lima(anio: number, mes: number, dia: number, hora = 0, min = 0): number {
  return Date.UTC(anio, mes - 1, dia, hora + 5, min);
}

describe("diaLima — el día del negocio, no el de UTC", () => {
  it("las 11pm de Trujillo siguen siendo hoy, aunque en UTC ya sea mañana", () => {
    // Lima 9-sep 23:00 == UTC 10-sep 04:00
    const ventaDeLaNoche = lima(2026, 9, 9, 23, 0);
    expect(new Date(ventaDeLaNoche).toISOString()).toBe("2026-09-10T04:00:00.000Z");
    expect(diaLima(ventaDeLaNoche)).toBe(diaLima(lima(2026, 9, 9, 10, 0)));
  });

  it("la medianoche de Lima sí abre un día nuevo", () => {
    expect(diaLima(lima(2026, 9, 10, 0, 0))).toBe(diaLima(lima(2026, 9, 9, 23, 59)) + 1);
  });

  it("inicioDeDiaLima es el inverso exacto de diaLima", () => {
    const n = diaLima(lima(2026, 9, 9, 17, 42));
    expect(diaLima(inicioDeDiaLima(n).getTime())).toBe(n);
    expect(inicioDeDiaLima(n).toISOString()).toBe("2026-09-09T05:00:00.000Z"); // medianoche en Lima
  });
});

describe("inicioDeMesLima", () => {
  it("el día 18 cae dentro del mes que empezó el día 1, en hora de Lima", () => {
    const inicio = inicioDeMesLima(lima(2026, 9, 18, 10, 30));
    expect(inicio.toISOString()).toBe("2026-09-01T05:00:00.000Z"); // medianoche del 1-sep en Lima
  });

  it("la primera hora de un mes (aún de madrugada en Lima) no se cuela al mes anterior", () => {
    const inicio = inicioDeMesLima(lima(2026, 10, 1, 0, 30));
    expect(inicio.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
});
