import { describe, expect, it } from "vitest";
import {
  cierresDesdeFilas, estadoDeAtencion, etiquetaDeCierre, fechaIsoValida, etiquetaDeHora, filasDeSemana, mismaSemana, momentoEnLima, resumenDeHorario, semanaDesdeFilas, semanaDeSerializada,
  semanaTieneHoras, semanaVacia, serializarSemana, sumarDias, tramoValido, type SemanaDeTienda,
} from "@cayla-retail/shared/horario-de-tienda";

const h = (horas: number) => horas * 60;
const semana = (lunSab: [number, number] | null, dom: [number, number] | null): SemanaDeTienda =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => { const r = d < 6 ? lunSab : dom; return r ? { abre: h(r[0]), cierra: h(r[1]) } : null; });
const TRU = semana([10, 21], [11, 19]);
// Lima es UTC−5: 2026-10-26 (lunes) a las 17:00 en Lima son las 22:00 UTC.
const lima = (iso: string) => momentoEnLima(new Date(iso));

describe("las horas se leen como en una tienda", () => {
  it.each([[0, "12 a. m."], [h(8) + 15, "8:15 a. m."], [h(9) + 30, "9:30 a. m."], [h(21) + 45, "9:45 p. m."], [h(10), "10 a. m."], [h(12), "12 p. m."], [h(13), "1 p. m."], [h(21), "9 p. m."], [h(23) + 30, "11:30 p. m."], [1440, "12 a. m."]])("%i minutos → %s", (min, texto) => {
    expect(etiquetaDeHora(min)).toBe(texto);
  });
});

describe("un tramo", () => {
  it("vale con enteros, de a 15 minutos y apertura antes del cierre dentro del día", () => {
    expect(tramoValido({ abre: 600, cierra: 1260 })).toBe(true);
    expect(tramoValido({ abre: 495, cierra: 1275 })).toBe(true); // 8:15 a. m. a 9:15 p. m.
    expect(tramoValido({ abre: 525, cierra: 1305 })).toBe(true); // 8:45 a. m. a 9:45 p. m.
    expect(tramoValido({ abre: 0, cierra: 1440 })).toBe(true);
    for (const malo of [{ abre: 1260, cierra: 600 }, { abre: 600, cierra: 600 }, { abre: 610, cierra: 1260 }, { abre: 600, cierra: 1265 }, { abre: -15, cierra: 600 }, { abre: 600, cierra: 1470 }, { abre: 6.5, cierra: 21 }, { abre: "600", cierra: 1260 }, null, "x", {}]) {
      expect(tramoValido(malo)).toBe(false);
    }
  });
});

describe("la semana que manda la base", () => {
  it("las filas se acomodan en los siete días y las malas no tumban nada", () => {
    const s = semanaDesdeFilas([
      { dia: 0, abre: 600, cierra: 1260 }, { dia: 0, abre: 700, cierra: 800 }, // el lunes repetido: manda la primera
      { dia: 6, abre: 660, cierra: 1140 }, { dia: 7, abre: 600, cierra: 1260 }, { dia: 2, abre: 1260, cierra: 600 }, { dia: "x" }, null, 5,
    ]);
    expect(s[0]).toEqual({ abre: 600, cierra: 1260 });
    expect(s[6]).toEqual({ abre: 660, cierra: 1140 });
    expect(s.filter(Boolean)).toHaveLength(2);
    expect(semanaDesdeFilas(null)).toEqual(semanaVacia());
    expect(semanaDesdeFilas("x")).toEqual(semanaVacia());
  });
  it("ida y vuelta: las filas de una semana la reconstruyen", () => {
    expect(semanaDesdeFilas(filasDeSemana(TRU))).toEqual(TRU);
    expect(filasDeSemana(semanaVacia())).toEqual([]);
  });
  it("se guarda en un borrador como texto y vuelve igual; un texto raro es una semana cerrada", () => {
    expect(semanaDeSerializada(serializarSemana(TRU))).toEqual(TRU);
    expect(semanaDeSerializada("")).toEqual(semanaVacia());
    expect(semanaDeSerializada("600-1260|x")).toEqual(semanaVacia());
    expect(serializarSemana(semanaVacia())).toBe("x|x|x|x|x|x|x");
  });
  it("compara semanas por lo que dicen", () => {
    expect(mismaSemana(TRU, semana([10, 21], [11, 19]))).toBe(true);
    expect(mismaSemana(TRU, semana([10, 20], [11, 19]))).toBe(false);
    expect(mismaSemana(semanaVacia(), TRU)).toBe(false);
    expect(semanaTieneHoras(TRU)).toBe(true);
    expect(semanaTieneHoras(semanaVacia())).toBe(false);
  });
});

describe("el texto corto del horario", () => {
  it("junta los días seguidos con las mismas horas", () => {
    expect(resumenDeHorario(TRU)).toBe("Lun–Sáb 10 a. m.–9 p. m. · Dom 11 a. m.–7 p. m.");
    expect(resumenDeHorario(semana([10, 21], null))).toBe("Lun–Sáb 10 a. m.–9 p. m.");
  });
  it("un día suelto va solo y un hueco parte el grupo", () => {
    const s = semanaVacia(); s[0] = { abre: h(9) + 30, cierra: h(18) }; s[2] = { abre: h(9) + 30, cierra: h(18) };
    expect(resumenDeHorario(s)).toBe("Lun 9:30 a. m.–6 p. m. · Mié 9:30 a. m.–6 p. m.");
  });
  it("sin días abiertos no hay texto", () => {
    expect(resumenDeHorario(semanaVacia())).toBeNull();
  });
  it("siete días todos distintos no caben en el tope: lo dice en vez de cortarse a media palabra", () => {
    const s: SemanaDeTienda = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ abre: h(7) + 30 * d, cierra: h(18) + 30 * d }));
    expect(resumenDeHorario(s)).toBe("Horario según el día");
  });
  it("lo que se guarda nunca pasa el tope de la base", () => {
    for (let t = 0; t < 40; t++) {
      const s: SemanaDeTienda = [0, 1, 2, 3, 4, 5, 6].map((d) => (d % 3 === t % 3 ? null : { abre: h(7) + 30 * ((d + t) % 6), cierra: h(14) + 30 * ((d * t) % 12) }));
      expect((resumenDeHorario(s) ?? "").length).toBeLessThanOrEqual(120);
    }
  });
});

describe("la hora de Lima", () => {
  it("se saca de la zona de Lima, no de la del aparato", () => {
    expect(lima("2026-10-26T22:00:00Z")).toEqual({ dia: 0, minutos: h(17), fecha: "2026-10-26" }); // lunes 5 p. m.
    expect(lima("2026-10-27T03:30:00Z")).toEqual({ dia: 0, minutos: h(22) + 30, fecha: "2026-10-26" }); // sigue siendo lunes en Lima
    expect(lima("2026-10-27T05:00:00Z")).toEqual({ dia: 1, minutos: 0, fecha: "2026-10-27" }); // martes 12 a. m.
    expect(lima("2026-11-01T15:00:00Z").dia).toBe(6); // domingo
  });
  it("suma días a una fecha, también al cruzar el mes y el año", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("¿abierta ahora?", () => {
  it("dentro del horario, abierta y a qué hora cierra", () => {
    expect(estadoDeAtencion(TRU, [], lima("2026-10-26T22:00:00Z"))).toEqual({ abierta: true, texto: "Abierta · cierra 9 p. m.", cierreHoy: false });
  });
  it("antes de abrir, cerrada y a qué hora abre hoy", () => {
    expect(estadoDeAtencion(TRU, [], lima("2026-10-26T13:00:00Z"))?.texto).toBe("Cerrada · abre 10 a. m."); // 8 a. m.
  });
  it("justo a la hora de abrir ya está abierta y justo a la de cerrar ya no", () => {
    expect(estadoDeAtencion(TRU, [], lima("2026-10-26T15:00:00Z"))?.abierta).toBe(true); // 10:00
    expect(estadoDeAtencion(TRU, [], lima("2026-10-27T02:00:00Z"))?.abierta).toBe(false); // 9:00 p. m.
  });
  it("pasada la hora de cierre, dice cuándo vuelve: mañana, o el día que sea", () => {
    expect(estadoDeAtencion(TRU, [], lima("2026-10-27T03:00:00Z"))?.texto).toBe("Cerrada · abre mañana 10 a. m."); // lunes 10 p. m.
    expect(estadoDeAtencion(TRU, [], lima("2026-10-25T03:00:00Z"))?.texto).toBe("Cerrada · abre mañana 11 a. m."); // sábado 10 p. m. → domingo
    expect(estadoDeAtencion(semana([10, 21], null), [], lima("2026-10-25T03:00:00Z"))?.texto).toBe("Cerrada · abre el lunes 10 a. m."); // sábado 10 p. m., domingo cerrado
  });
  it("un día cerrado de la semana se salta al decir cuándo abre", () => {
    const sinMartes = [...TRU]; sinMartes[1] = null;
    expect(estadoDeAtencion(sinMartes, [], lima("2026-10-27T03:00:00Z"))?.texto).toBe("Cerrada · abre el miércoles 10 a. m.");
  });
  it("un cierre por fecha manda sobre el horario: «Cerrada hoy», y no se ofrece abrir ese día", () => {
    expect(estadoDeAtencion(TRU, [{ fecha: "2026-10-26" }], lima("2026-10-26T22:00:00Z"))).toEqual({ abierta: false, texto: "Cerrada hoy", cierreHoy: true });
    expect(estadoDeAtencion(TRU, [{ fecha: "2026-10-27" }], lima("2026-10-27T03:00:00Z"))?.texto).toBe("Cerrada · abre el miércoles 10 a. m.");
  });
  it("sin horario por días no se dice nada: la tienda no se declara cerrada por falta de datos", () => {
    expect(estadoDeAtencion(semanaVacia(), [], lima("2026-10-26T22:00:00Z"))).toBeNull();
  });
});

describe("los cierres por fecha", () => {
  it("una fecha es real o no es", () => {
    expect(fechaIsoValida("2026-10-28")).toBe(true);
    expect(fechaIsoValida("2028-02-29")).toBe(true);
    for (const mala of ["2026-02-30", "2026-13-01", "26-10-28", "2026-10-28T10:00", "hoy", "", null, 3, "2026-1-5"]) expect(fechaIsoValida(mala)).toBe(false);
  });
  it("las filas de la base salen sin repetir y en orden; lo mal formado se ignora", () => {
    expect(cierresDesdeFilas([{ fecha: "2026-11-02" }, { fecha: "2026-10-28" }, { fecha: "2026-10-28" }, { fecha: "2026-02-30" }, { fecha: 3 }, null, "x", {}])).toEqual([{ fecha: "2026-10-28" }, { fecha: "2026-11-02" }]);
    expect(cierresDesdeFilas(null)).toEqual([]);
    expect(cierresDesdeFilas("2026-10-28")).toEqual([]);
  });
  it("se dicen como se hablan: Hoy, Mañana o el día", () => {
    expect(etiquetaDeCierre("2026-10-26", "2026-10-26")).toBe("Hoy");
    expect(etiquetaDeCierre("2026-10-27", "2026-10-26")).toBe("Mañana");
    expect(etiquetaDeCierre("2026-10-28", "2026-10-26")).toBe("Mié 28 oct");
    expect(etiquetaDeCierre("2026-12-25", "2026-10-26")).toBe("Vie 25 dic");
    expect(etiquetaDeCierre("2026-10-31", "2026-10-31")).toBe("Hoy");
    expect(etiquetaDeCierre("2026-11-01", "2026-10-31")).toBe("Mañana");
  });
});
