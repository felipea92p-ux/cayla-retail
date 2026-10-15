import { describe, expect, it } from "vitest";
import { aplazamientoTrasCorte, aplazamientosSinFecha, detalleDeFila, hojaDetalle, historialDelApartado, motivoFechaAplazar, opcionesAplazar, textoDiasMas } from "./apartado-detalle-reglas";
import type { Apartado } from "./separaciones-reglas";

const apartado = (extra: Partial<Apartado> = {}): Apartado => ({
  id: "s1", codigo: "APT-TRU-0007", estado: "abierta", nombres: "Ana", apellidos: "Lozano Vera", celular: "987111222", dni: null,
  asesora: null, total: 89.9, adelanto: 60, saldo: 29.9, venceEl: "2026-09-29", extensiones: 0, creadaEn: "2026-09-22T15:00:00Z",
  devolucionMedio: "yape", devolucionNumero: "987111222", devolucionCciFinal: null, liberadaSola: false,
  comprobanteAnticipo: null, comprobanteFinal: null, notaCredito: null, prendas: [], estante: null,
  pagos: [
    { metodo: "yape", monto: 40, fecha: "2026-09-22T15:00:00Z", abono: false },
    { metodo: "efectivo", monto: 20, fecha: "2026-09-25T21:34:00Z", abono: true },
  ],
  ...extra,
});

// Lo que devuelve `fn_detalle_separacion` (20261015151000), tal como llega por PostgREST.
const fila = {
  id: "s1",
  creada_en: "2026-09-22T15:00:00+00:00",
  creada_por: "María Quispe",
  extensiones: 1,
  pagos: [
    { id: "p1", metodo: "yape", monto: 40, recibido: null, fecha: "2026-09-22T15:00:00+00:00", abono: false, dias_espera: 0, vence_despues: null, por: "María Quispe" },
    { id: "p2", metodo: "efectivo", monto: 20, recibido: 50, fecha: "2026-09-25T21:34:00+00:00", abono: true, dias_espera: 3, vence_despues: "2026-10-02", por: "Rosa Díaz" },
  ],
  aplazamientos: [{ vence_antes: "2026-10-02", vence_despues: "2026-10-09", fecha: "2026-10-01T14:00:00+00:00", por: "Felipe Alvarez" }],
  avisos: [{ fecha: "2026-09-28T16:00:00+00:00", por: null }],
  entregada_en: null, entregada_por: null, liberada_en: null, liberada_por: null, liberada_motivo: null,
  devuelta_en: null, devuelta_por: null, devolucion_medio_real: null,
};

describe("detalleDeFila", () => {
  it("lee el detalle de la base con nombres de TypeScript", () => {
    const d = detalleDeFila(fila)!;
    expect(d.creadaPor).toBe("María Quispe");
    expect(d.pagos[1]).toMatchObject({ metodo: "efectivo", monto: 20, recibido: 50, abono: true, diasEspera: 3, venceDespues: "2026-10-02", por: "Rosa Díaz" });
    expect(d.aplazamientos).toEqual([{ venceAntes: "2026-10-02", venceDespues: "2026-10-09", fecha: "2026-10-01T14:00:00+00:00", por: "Felipe Alvarez" }]);
    expect(d.avisos[0].por).toBeNull();
  });
  it("lo que no es un detalle (la base no lo encontró o no respondió) es null, no un detalle vacío", () => {
    expect(detalleDeFila(null)).toBeNull();
    expect(detalleDeFila([])).toBeNull();
    expect(detalleDeFila("x")).toBeNull();
  });
});

describe("historialDelApartado", () => {
  it("cuenta la historia en orden, con quién hizo cada cosa", () => {
    const h = historialDelApartado(apartado({ extensiones: 1 }), detalleDeFila(fila));
    expect(h.map((e) => e.tipo)).toEqual(["aparto", "pago", "pago", "aviso", "aplazo"]);
    expect(h.map((e) => e.por)).toEqual(["María Quispe", "María Quispe", "Rosa Díaz", null, "Felipe Alvarez"]);
  });
  it("el adelanto nace en el mismo instante que el apartado: «apartó» va primero", () => {
    const h = historialDelApartado(apartado(), detalleDeFila(fila));
    expect(h[0].tipo).toBe("aparto");
    expect(h[1]).toMatchObject({ tipo: "pago", pago: { abono: false } });
  });
  it("el adelanto y un abono en el mismo instante: el adelanto primero, aunque la base los mande al revés", () => {
    const d = detalleDeFila({ ...fila, pagos: [{ ...fila.pagos[1], fecha: fila.pagos[0].fecha }, fila.pagos[0]] });
    expect(historialDelApartado(apartado(), d).filter((e) => e.tipo === "pago").map((e) => (e.tipo === "pago" ? e.pago.abono : null))).toEqual([false, true]);
  });
  it("sin el detalle (la base no respondió) se arma con lo que la lista ya trae: cada pago con su hora, sin nombres", () => {
    const h = historialDelApartado(apartado(), null);
    expect(h.map((e) => e.tipo)).toEqual(["aparto", "pago", "pago"]);
    expect(h.every((e) => e.por === null)).toBe(true);
    expect(h[2]).toMatchObject({ fecha: "2026-09-25T21:34:00Z", pago: { metodo: "efectivo", abono: true } });
  });
  it("un apartado liberado y devuelto termina con esos dos pasos", () => {
    const d = detalleDeFila({ ...fila, liberada_en: "2026-10-12T15:00:00Z", liberada_por: null, liberada_motivo: "vencio", devuelta_en: "2026-10-13T15:00:00Z", devuelta_por: "Felipe Alvarez", devolucion_medio_real: "yape" });
    const h = historialDelApartado(apartado({ estado: "devuelta", liberadaSola: true }), d);
    expect(h.slice(-2)).toMatchObject([{ tipo: "libero", solo: true }, { tipo: "devolvio", monto: 60, medio: "yape" }]);
  });
  it("los aplazamientos de antes del historial se cuentan aparte (sin fecha ni quién)", () => {
    expect(aplazamientosSinFecha(apartado({ extensiones: 2 }), detalleDeFila(fila))).toBe(1);
    expect(aplazamientosSinFecha(apartado({ extensiones: 1 }), detalleDeFila(fila))).toBe(0);
    expect(aplazamientosSinFecha(apartado({ extensiones: 1 }), null)).toBe(0);
  });
});

describe("opcionesAplazar (ADR-0414: +3, +7 o una fecha; 2 veces; 30 días desde que se apartó)", () => {
  it("antes de vencer se cuenta desde el vencimiento; el tope son 30 días desde el día de Lima en que se apartó", () => {
    const o = opcionesAplazar(apartado(), "2026-09-25");
    expect(o).toMatchObject({ desde: "2026-09-29", tope: "2026-10-22", restantes: 2, bloqueo: null });
    expect(o.atajos).toEqual([
      { dias: 3, fecha: "2026-10-02", cabe: true },
      { dias: 7, fecha: "2026-10-06", cabe: true },
    ]);
  });
  it("ya vencido, se cuenta desde hoy (como la base: greatest(vence_el, hoy))", () => {
    expect(opcionesAplazar(apartado(), "2026-09-30").desde).toBe("2026-09-30");
  });
  it("un atajo que pasa el tope no cabe", () => {
    const o = opcionesAplazar(apartado({ venceEl: "2026-10-17", extensiones: 1 }), "2026-10-15");
    expect(o.atajos).toEqual([
      { dias: 3, fecha: "2026-10-20", cabe: true },
      { dias: 7, fecha: "2026-10-24", cabe: false },
    ]);
    expect(o.restantes).toBe(1);
  });
  it("se bloquea con 2 aplazamientos, en el tope o si no está abierto", () => {
    expect(opcionesAplazar(apartado({ extensiones: 2 }), "2026-09-25").bloqueo).toMatch(/2 veces/);
    expect(opcionesAplazar(apartado({ venceEl: "2026-10-22" }), "2026-10-20").bloqueo).toMatch(/tope/);
    expect(opcionesAplazar(apartado({ estado: "entregada" }), "2026-09-25").bloqueo).toMatch(/abierto/);
  });
});

describe("motivoFechaAplazar: las mismas frases que la base", () => {
  const o = opcionesAplazar(apartado(), "2026-09-25");
  it("una fecha posterior al vencimiento y dentro del tope se puede", () => {
    expect(motivoFechaAplazar("2026-10-01", o)).toBeNull();
    expect(motivoFechaAplazar("2026-10-22", o)).toBeNull();
  });
  it("el mismo día o antes, pasado el tope, o vacío, no", () => {
    expect(motivoFechaAplazar("2026-09-29", o)).toBe("La nueva fecha tiene que ser después del 29/09/2026.");
    expect(motivoFechaAplazar("2026-10-23", o)).toBe("Un apartado se guarda como mucho 30 días desde que se apartó: hasta el 22/10/2026.");
    expect(motivoFechaAplazar("", o)).toBe("Elige hasta qué día se aplaza.");
  });
  it("cuántos días más", () => {
    expect(textoDiasMas("2026-09-29", "2026-09-30")).toBe("1 día más");
    expect(textoDiasMas("2026-09-29", "2026-10-06")).toBe("7 días más");
  });
});

describe("hojaDetalle: la hoja nunca queda trabada al volver (chaos 2026-10-15, semilla 1415)", () => {
  it("tras guardar, volver al detalle la destraba aunque el formulario no alcance a avisar que terminó", () => {
    let e = hojaDetalle({ modo: "ver", ocupado: false }, { tipo: "ir", modo: "aplazar" });
    e = hojaDetalle(e, { tipo: "ocupado", valor: true });
    e = hojaDetalle(e, { tipo: "volver" });
    expect(e).toEqual({ modo: "ver", ocupado: false });
  });
  it("cambiar de modo también la destraba; «ocupado» solo cambia ese dato", () => {
    expect(hojaDetalle({ modo: "ver", ocupado: true }, { tipo: "ir", modo: "abonar" })).toEqual({ modo: "abonar", ocupado: false });
    expect(hojaDetalle({ modo: "abonar", ocupado: false }, { tipo: "ocupado", valor: true })).toEqual({ modo: "abonar", ocupado: true });
  });
});

describe("tras un corte al aplazar, releer dice si quedó (chaos RS-03, semilla 1415)", () => {
  it("quedó si el vencimiento releído ya es la fecha que se mandó", () => {
    expect(aplazamientoTrasCorte({ venceEl: "2026-10-25" }, "2026-10-25")).toBe("quedo");
  });
  it("no quedó si sigue la fecha de antes: se puede reintentar la MISMA fecha (la base no la cuenta dos veces)", () => {
    expect(aplazamientoTrasCorte({ venceEl: "2026-10-22" }, "2026-10-25")).toBe("reintentar");
  });
  it("sin nada en duda, no hay nada que comprobar", () => {
    expect(aplazamientoTrasCorte({ venceEl: "2026-10-22" }, null)).toBe("nada");
  });
});
