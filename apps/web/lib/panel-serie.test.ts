import { describe, it, expect } from "vitest";
import {
  DIAS_TENDENCIA,
  INDICE_HOY,
  INDICE_SEMANA_PASADA,
  diaLima,
  hastaEstaHora,
  indiceEnSerie,
  inicioDeDiaLima,
  inicioDeLaVentana,
} from "./panel-serie";

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

describe("indiceEnSerie — dónde cae cada venta en la mini-línea", () => {
  const ahora = lima(2026, 9, 9, 23, 30); // un miércoles a las 11:30pm de Lima

  it("lo de hoy va al último punto", () => {
    expect(indiceEnSerie(lima(2026, 9, 9, 23, 0), ahora)).toBe(INDICE_HOY);
    expect(indiceEnSerie(lima(2026, 9, 9, 0, 1), ahora)).toBe(INDICE_HOY);
  });

  it("hace 7 días cae exactamente en el punto del comparativo", () => {
    expect(indiceEnSerie(lima(2026, 9, 2, 10, 0), ahora)).toBe(INDICE_SEMANA_PASADA);
  });

  it("el día más viejo que entra es el primer punto", () => {
    expect(indiceEnSerie(lima(2026, 8, 27, 12, 0), ahora)).toBe(0);
  });

  it("un día antes de la ventana ya no entra", () => {
    expect(indiceEnSerie(lima(2026, 8, 26, 23, 59), ahora)).toBeNull();
  });

  it("algo del futuro no entra", () => {
    expect(indiceEnSerie(lima(2026, 9, 10, 0, 30), ahora)).toBeNull();
  });

  it("la ventana que se le pide a Supabase cubre justo los DIAS_TENDENCIA puntos", () => {
    const desde = inicioDeLaVentana(ahora).getTime();
    expect(indiceEnSerie(desde, ahora)).toBe(0);
    expect(indiceEnSerie(desde - 1, ahora)).toBeNull();
    expect(diaLima(ahora) - diaLima(desde)).toBe(DIAS_TENDENCIA - 1);
  });
});

describe("hastaEstaHora — el comparativo no compara peras con días completos", () => {
  const ahora = lima(2026, 9, 9, 10, 0); // son las 10am en Lima

  it("cuenta lo que la semana pasada ya se había vendido a esta hora", () => {
    expect(hastaEstaHora(lima(2026, 9, 2, 9, 30), ahora)).toBe(true);
  });

  it("no cuenta lo que la semana pasada se vendió más tarde", () => {
    expect(hastaEstaHora(lima(2026, 9, 2, 18, 0), ahora)).toBe(false);
  });

  it("a las 11:59pm ya cuenta el día entero", () => {
    const casiMedianoche = lima(2026, 9, 9, 23, 59);
    expect(hastaEstaHora(lima(2026, 9, 2, 20, 0), casiMedianoche)).toBe(true);
  });
});
