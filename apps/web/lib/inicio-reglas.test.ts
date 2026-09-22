import { describe, it, expect } from "vitest";
import { primerAviso, sumarUnidades, textoCifra } from "./inicio-reglas";

describe("sumarUnidades", () => {
  it("suma las unidades de la sede", () => {
    expect(sumarUnidades([{ cantidad: 3 }, { cantidad: 4 }, { cantidad: 0 }])).toBe(7);
  });
  it("una sede sin filas tiene 0 unidades (eso sí es un cero de verdad)", () => {
    expect(sumarUnidades([])).toBe(0);
  });
  it("una lectura caída NO es 0: es «no sé»", () => {
    expect(sumarUnidades(null)).toBeNull();
  });
});

describe("textoCifra", () => {
  it("pinta la cifra, incluido un 0 real", () => {
    expect(textoCifra(38)).toBe("38");
    expect(textoCifra(0)).toBe("0");
  });
  it("pinta «—» cuando no se pudo leer, nunca un 0 que parezca normalidad", () => {
    expect(textoCifra(null)).toBe("—");
  });
});

describe("primerAviso", () => {
  it("devuelve el primer aviso que falló", () => {
    expect(primerAviso([null, "falló A", "falló B"])).toBe("falló A");
  });
  it("es null si todo llegó", () => {
    expect(primerAviso([null, null])).toBeNull();
  });
});

import { armarPendientes } from "./inicio-reglas";

describe("armarPendientes (la bandeja «Por atender»)", () => {
  it("sin nada pendiente y todo leído: vacía y completa (la bandeja se esconde)", () => {
    expect(armarPendientes({ traslados: 0, devoluciones: 0 })).toEqual({ items: [], incompleta: false });
  });
  it("lista solo lo que espera, con su enlace y singular/plural", () => {
    const r = armarPendientes({ traslados: 1, devoluciones: 3 });
    expect(r.items.map((i) => i.clave)).toEqual(["traslados", "devoluciones"]);
    expect(r.items[0].texto).toBe("1 traslado espera tu acción");
    expect(r.items[1].texto).toBe("3 devoluciones por aprobar");
    expect(r.items[1].href).toBe("/devoluciones");
  });
  it("una lectura caída NO esconde la bandeja: la marca incompleta", () => {
    expect(armarPendientes({ traslados: null, devoluciones: 0 })).toEqual({ items: [], incompleta: true });
  });
  it("aunque una falle, lo que sí se leyó se muestra", () => {
    const r = armarPendientes({ traslados: null, devoluciones: 2 });
    expect(r.items.map((i) => i.clave)).toEqual(["devoluciones"]);
    expect(r.incompleta).toBe(true);
  });
  it("a quien no aprueba devoluciones (undefined) no se le muestran ni cuentan como falla", () => {
    expect(armarPendientes({ traslados: 2, devoluciones: undefined }).incompleta).toBe(false);
    expect(armarPendientes({ traslados: 2, devoluciones: undefined }).items.map((i) => i.clave)).toEqual(["traslados"]);
  });
});

import { progresoMeta } from "./inicio-reglas";

describe("progresoMeta", () => {
  it("calcula el porcentaje, igual que la barra de Caja", () => {
    expect(progresoMeta(450, 900)).toBe(50);
  });
  it("nunca pasa de 100 aunque se supere la meta", () => {
    expect(progresoMeta(1200, 900)).toBe(100);
  });
  it("sin meta configurada, o venta/meta sin leer: null (no dibuja barra)", () => {
    expect(progresoMeta(450, null)).toBeNull();
    expect(progresoMeta(null, 900)).toBeNull();
    expect(progresoMeta(450, 0)).toBeNull();
  });
});
