import { describe, expect, it } from "vitest";
import { chequeoSire, estadoDeRegistro, lineasSireImpuestos, type EstadoSire } from "./sire-estado-reglas";
import { conChequeoSire, textoChequeo, enlaceChequeo, type PanelCierre } from "./cierre-reglas";
import type { CruceResuelto } from "./sire-cruce-reglas";

const cruce = (soloErp: number, soloSunat: number, montos: number, resueltas = 0): CruceResuelto => ({
  lineas: [],
  resueltas,
  resumen: {
    solo_erp: { n: soloErp, igv: soloErp * 18 },
    solo_sunat: { n: soloSunat, igv: soloSunat * 18 },
    montos: { n: montos, igv: montos * 9 },
    papel: { n: 0, igv: 0 },
    coincide: { n: 5, igv: 90 },
  },
});
const subida = { id: "p" } as never;
const estado = (compras: EstadoSire["compras"], ventas: EstadoSire["ventas"] = null, mes = "2026-10"): EstadoSire => ({ mes, compras, ventas });

describe("estadoDeRegistro", () => {
  it("sin propuesta: no se subió; con falla: no se sabe", () => {
    expect(estadoDeRegistro({ propuesta: null, cruce: null, falla: null })).toEqual({ subida: false, porMirar: 0, igv: 0, resueltas: 0 });
    expect(estadoDeRegistro({ propuesta: null, cruce: null, falla: "sin permiso" })).toBeNull();
  });
  it("cuenta lo que no cuadra con su IGV, y lo resuelto aparte", () => {
    expect(estadoDeRegistro({ propuesta: subida, cruce: cruce(1, 2, 1, 3), falla: null })).toEqual({ subida: true, porMirar: 4, igv: 63, resueltas: 3 });
  });
});

describe("lineasSireImpuestos", () => {
  it("el mes en curso no avisa: su propuesta todavía cambia", () => {
    expect(lineasSireImpuestos(estado({ subida: false, porMirar: 0, igv: 0, resueltas: 0 }, null, "2026-11"), "2026-11")).toEqual([]);
  });
  it("compras y ventas sin subir avisan en gris, cada una con su pestaña", () => {
    const l = lineasSireImpuestos(estado({ subida: false, porMirar: 0, igv: 0, resueltas: 0 }, { subida: false, porMirar: 0, igv: 0, resueltas: 0 }), "2026-11");
    expect(l.map((x) => [x.id, x.tono, x.texto, x.href])).toEqual([
      ["sire_compras_sin_subir", "gris", "Compras sin comparar con SUNAT", "/finanzas/impuestos/sire?mes=2026-10"],
      ["sire_ventas_sin_subir", "gris", "Ventas sin comparar con SUNAT", "/finanzas/impuestos/sire?mes=2026-10&registro=ventas"],
    ]);
  });
  it("al subir la de ventas, su línea desaparece; si no se pudo leer, se calla", () => {
    const compras = { subida: true, porMirar: 0, igv: 0, resueltas: 0 };
    expect(lineasSireImpuestos(estado(compras, { subida: true, porMirar: 0, igv: 0, resueltas: 0 }), "2026-11")).toEqual([]);
    expect(lineasSireImpuestos(estado(compras, null), "2026-11")).toEqual([]);
  });
  it("lo que no cuadra avisa en ámbar con su IGV y lleva a su pestaña", () => {
    const l = lineasSireImpuestos(estado({ subida: true, porMirar: 2, igv: 36, resueltas: 0 }, { subida: true, porMirar: 1, igv: 18, resueltas: 0 }), "2026-11");
    expect(l.map((x) => [x.texto, x.monto, x.href])).toEqual([
      ["2 diferencias con SUNAT en compras", 36, "/finanzas/impuestos/sire?mes=2026-10"],
      ["1 diferencia con SUNAT en ventas", 18, "/finanzas/impuestos/sire?mes=2026-10&registro=ventas"],
    ]);
  });
  it("todo cuadra o no se sabe: nada", () => {
    expect(lineasSireImpuestos(estado({ subida: true, porMirar: 0, igv: 0, resueltas: 2 }), "2026-11")).toEqual([]);
    expect(lineasSireImpuestos(null, "2026-11")).toEqual([]);
  });
});

describe("chequeoSire y el Cierre de mes", () => {
  const panel = {
    unidades: [
      { clave: "empresa", alcance: "empresa", estado: "abierto", chequeos: [], avisos: 0, bloqueantes: 0 },
      { clave: "lima", alcance: "ubicacion", estado: "abierto", chequeos: [], avisos: 0, bloqueantes: 0 },
    ],
  } as unknown as PanelCierre;

  it("solo avisa, nunca bloquea, y va a la unidad de la empresa", () => {
    const c = chequeoSire(estado({ subida: true, porMirar: 2, igv: 36, resueltas: 0 }));
    expect(c).toMatchObject({ clave: "sire", ok: false, bloquea: false });
    const p = conChequeoSire(panel, c);
    expect(p.unidades.map((u) => [u.clave, u.avisos, u.chequeos.length])).toEqual([["empresa", 1, 1], ["lima", 0, 0]]);
  });
  it("sin dato de compras no hay aviso; cuadrado, pasa", () => {
    expect(chequeoSire(estado(null))).toBeNull();
    expect(conChequeoSire(panel, null)).toBe(panel);
    expect(chequeoSire(estado({ subida: true, porMirar: 0, igv: 0, resueltas: 1 }))?.ok).toBe(true);
  });
  describe("la propuesta de ventas también cuenta en el Cierre", () => {
    const compras = { subida: true, porMirar: 0, igv: 0, resueltas: 0 };
    const sinSubir = { subida: false, porMirar: 0, igv: 0, resueltas: 0 };
    const subidaBien = { subida: true, porMirar: 0, igv: 0, resueltas: 0 };
    const ids = { alcance: "empresa", ubicacionId: null } as const;

    it("compras cuadra pero ventas no se subió: no dice «cuadra», avisa sin bloquear y lleva a la pestaña Ventas", () => {
      const c = chequeoSire(estado(compras, sinSubir))!;
      expect(c).toMatchObject({ ok: false, bloquea: false, datos: { ventas_subida: false } });
      expect(textoChequeo(c, "2026-10").detalle).toBe("Todavía no se comparó la propuesta de ventas de octubre. Puedes cerrar igual");
      expect(enlaceChequeo(c, ids, "2026-10")).toBe("/finanzas/impuestos/sire?mes=2026-10&registro=ventas");
    });
    it("ninguna se subió: nombra las dos y parte por compras", () => {
      const c = chequeoSire(estado(sinSubir, sinSubir))!;
      expect(textoChequeo(c, "2026-10").detalle).toBe("Todavía no se compararon las propuestas de compras y ventas de octubre. Puedes cerrar igual");
      expect(enlaceChequeo(c, ids, "2026-10")).toBe("/finanzas/impuestos/sire?mes=2026-10");
    });
    it("hay diferencias y falta ventas: dice las dos cosas y va a resolver las diferencias", () => {
      const c = chequeoSire(estado({ ...compras, porMirar: 2 }, sinSubir))!;
      expect(textoChequeo(c, "2026-10").detalle).toBe("2 diferencias sin resolver, y falta comparar la propuesta de ventas. Puedes cerrar igual, pero el contador aceptaría la propuesta con ellas");
      expect(enlaceChequeo(c, ids, "2026-10")).toBe("/finanzas/impuestos/sire?mes=2026-10");
    });
    it("las dos subidas y sin diferencias: cuadra, y lo dice de las dos", () => {
      const c = chequeoSire(estado(compras, subidaBien))!;
      expect(c.ok).toBe(true);
      expect(textoChequeo(c, "2026-10").detalle).toBe("Las propuestas de compras y ventas de octubre cuadran con lo registrado");
    });
    it("ventas no se pudo leer: se calla, como siempre", () => {
      const c = chequeoSire(estado(compras, null))!;
      expect(c.ok).toBe(true);
      expect(textoChequeo(c, "2026-10").detalle).toBe("La propuesta de compras de octubre cuadra con lo registrado");
    });
  });
  it("dice qué pasa y lleva a Comparar con SUNAT", () => {
    const sinSubir = chequeoSire(estado({ subida: false, porMirar: 0, igv: 0, resueltas: 0 }))!;
    expect(textoChequeo(sinSubir, "2026-10").detalle).toContain("Todavía no se comparó");
    expect(enlaceChequeo(sinSubir, { alcance: "empresa", ubicacionId: null }, "2026-10")).toBe("/finanzas/impuestos/sire?mes=2026-10");
  });
});
