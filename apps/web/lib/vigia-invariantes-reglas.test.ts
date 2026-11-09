import { describe, expect, it } from "vitest";
import { avisoDelVigia, contextoParaSentry, hayQueAvisar, HORAS_SIN_CORRER, leerEstadoVigia, reglaEnPalabras } from "./vigia-invariantes-reglas";

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

describe("avisoDelVigia (la lente «Vigía de la base» del Observatorio del Admin)", () => {
  const leida = leerEstadoVigia(RESPUESTA)!;
  const corrida = leida.corrio ? leida : (null as never);
  const limpia = { ...corrida, violadas: 0, nuevasGraves: 0, nuevasLeves: 0, errores: 0, detalle: [] };
  const horasDespues = (h: number) => new Date(Date.parse(corrida.ultimaCorridaEn) + h * 3_600_000);

  it("si no se pudo leer (la migración sin pegar, la base sin responder) dice «?», nunca «al día»", () => {
    const a = avisoDelVigia(null, horasDespues(1));
    expect(a.n).toBeNull();
    expect(a.nivel).not.toBe("ok");
  });

  it("antes de la primera corrida dice que aún no corre, sin alarmar", () => {
    const a = avisoDelVigia({ corrio: false }, horasDespues(1));
    expect(a).toMatchObject({ nivel: "semana", n: 1, titulo: "El vigía aún no corre" });
  });

  it(`pasadas ${HORAS_SIN_CORRER} horas sin correr es urgente: un vigía detenido no avisa de nada`, () => {
    expect(avisoDelVigia(limpia, horasDespues(HORAS_SIN_CORRER - 1)).nivel).toBe("ok");
    const a = avisoDelVigia(limpia, horasDespues(HORAS_SIN_CORRER + 4));
    expect(a).toMatchObject({ nivel: "urg", titulo: "El vigía no corre", edad: 1 });
    expect(a.detalle?.tipo === "lista" && a.detalle.filas[0].titulo).toBe(`Última revisión hace ${HORAS_SIN_CORRER + 4} h`);
  });

  it("algo nuevo roto es urgente si es un estado imposible; si solo es un dato dudoso, esta semana", () => {
    const grave = avisoDelVigia(corrida, horasDespues(2));
    expect(grave).toMatchObject({ nivel: "urg", n: 1, titulo: "Problema nuevo en la base" });
    expect(grave.detalle).toEqual({
      tipo: "lista",
      filas: [
        { titulo: "Venta cuadra con sus pagos", detalle: "INV-02 · 1 nueva de 5", chip: "Nueva" },
        { titulo: "Stock por dueno cuadra", detalle: "INV-23 · no se pudo mirar", chip: "Sin mirar" },
      ],
    });
    const leve = avisoDelVigia({ ...corrida, nuevasGraves: 0, nuevasLeves: 2, errores: 0, detalle: [] }, horasDespues(2));
    expect(leve).toMatchObject({ nivel: "semana", n: 2, titulo: "Problemas nuevos en la base" });
  });

  it("solo reglas que no se pudieron mirar: hoy, con cuántas son", () => {
    const a = avisoDelVigia({ ...corrida, nuevasGraves: 0, detalle: [corrida.detalle[1]] }, horasDespues(2));
    expect(a).toMatchObject({ nivel: "hoy", n: 1, titulo: "Regla que el vigía no pudo mirar" });
  });

  it("sin nada nuevo ni sin mirar, al día, aunque haya lo ya conocido", () => {
    expect(avisoDelVigia({ ...limpia, conocidas: 7 }, horasDespues(3))).toMatchObject({ nivel: "ok", n: 0, titulo: "La base cuadra" });
  });

  it("no tiene pantalla propia: no lleva enlace en ningún caso", () => {
    for (const e of [null, { corrio: false } as const, corrida, limpia]) expect(avisoDelVigia(e, horasDespues(1)).href).toBeNull();
  });

  it("el nombre de la regla se lee en palabras", () => {
    expect(reglaEnPalabras("stock_igual_a_movimientos")).toBe("Stock igual a movimientos");
  });
});
