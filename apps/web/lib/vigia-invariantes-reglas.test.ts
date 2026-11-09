import { describe, expect, it } from "vitest";
import { contextoParaSentry, hayQueAvisar, leerEstadoVigia } from "./vigia-invariantes-reglas";

// La forma que devuelve `retail.fn_invariantes_estado()` (migración 20261109152000), con una invariante nueva y otra con error.
const RESPUESTA = {
  ultima_corrida_en: "2026-11-09T08:30:02.114-05:00",
  invariantes: 28,
  limpias: 23,
  violadas: 1,
  nuevas_graves: 1,
  nuevas_leves: 0,
  conocidas: 4,
  errores: 1,
  omitidas: 3,
  detalle: [
    { id: "INV-02", nombre: "venta_cuadra_con_sus_pagos", gravedad: 1, estado: "viola", total: 5, nuevas: 1, mensaje: null },
    { id: "INV-23", nombre: "stock_por_dueno_cuadra", gravedad: 1, estado: "error", total: 0, nuevas: 0, mensaje: "division by zero" },
  ],
};

describe("leerEstadoVigia", () => {
  it("lee la respuesta de la base en un tipo cerrado", () => {
    const e = leerEstadoVigia(RESPUESTA);
    expect(e).toMatchObject({ corrio: true, nuevasGraves: 1, errores: 1, conocidas: 4 });
    expect(e?.corrio && e.detalle.map((d) => d.id)).toEqual(["INV-02", "INV-23"]);
  });

  it("sin ninguna corrida dice que no corrió, que no es lo mismo que «al día»", () => {
    expect(leerEstadoVigia({ ultima_corrida_en: null })).toEqual({ corrio: false });
  });

  it("una forma que no es la esperada se lee como null, nunca como un «todo bien» inventado", () => {
    expect(leerEstadoVigia(null)).toBeNull();
    expect(leerEstadoVigia([])).toBeNull();
    expect(leerEstadoVigia({})).toBeNull();
    expect(leerEstadoVigia({ ...RESPUESTA, nuevas_graves: "1" })).toBeNull();
    expect(leerEstadoVigia({ ...RESPUESTA, errores: -1 })).toBeNull();
    expect(leerEstadoVigia({ ...RESPUESTA, ultima_corrida_en: "ayer" })).toBeNull();
    expect(leerEstadoVigia({ ...RESPUESTA, detalle: [{ ...RESPUESTA.detalle[0], estado: "limpia" }] })).toBeNull();
    expect(leerEstadoVigia({ ...RESPUESTA, detalle: undefined })).toBeNull();
  });
});

describe("hayQueAvisar", () => {
  const base = leerEstadoVigia(RESPUESTA)!;

  it("avisa si hay algo nuevo roto o algo que no se pudo mirar", () => {
    expect(hayQueAvisar(base)).toBe(true);
    expect(hayQueAvisar({ ...base, nuevasGraves: 0, errores: 1 } as typeof base)).toBe(true);
    expect(hayQueAvisar({ ...base, nuevasGraves: 0, nuevasLeves: 2, errores: 0 } as typeof base)).toBe(true);
  });

  it("lo que ya se sabía (heredado o aceptado) no despierta a nadie cada mañana", () => {
    expect(hayQueAvisar({ ...base, nuevasGraves: 0, nuevasLeves: 0, errores: 0, conocidas: 9 } as typeof base)).toBe(false);
  });

  it("si nunca corrió no avisa aquí: eso lo dice el Observatorio a las 26 horas", () => {
    expect(hayQueAvisar({ corrio: false })).toBe(false);
  });
});

describe("contextoParaSentry", () => {
  it("manda conteos e ids de invariante, nunca el mensaje de la base ni una fila", () => {
    const c = contextoParaSentry(leerEstadoVigia(RESPUESTA)!);
    expect(c).toEqual({ nuevas_graves: 1, nuevas_leves: 0, errores: 1, invariantes: ["INV-02:viola:1", "INV-23:error:0"] });
    expect(JSON.stringify(c)).not.toMatch(/division|venta_cuadra/);
  });
});
