import { describe, expect, it } from "vitest";
import type { Comprobante } from "./comprobantes-reglas";
import { montosDelMes, motivoDelComprobante, nombreCorto, seriesFaltantes, textoDeSeriesFaltantes } from "./facturacion-comprobantes-reglas";

const TRU = { id: "u-tru", nombre: "Tienda Trujillo", tipo: "tienda" as const };
const AQP = { id: "u-aqp", nombre: "Tienda Arequipa", tipo: "tienda" as const };
const LIM = { id: "u-lim", nombre: "Tienda Lima", tipo: "tienda" as const };
const TALLER = { id: "u-tal", nombre: "Taller", tipo: "taller" as const };
const ALMACEN = { id: "u-alm", nombre: "Almacén", tipo: "almacen" as const };

function c(extra: Partial<Comprobante>): Comprobante {
  return {
    id: "c",
    tipo: "boleta",
    serie: "B001",
    numero: 1,
    cliente_tipo_doc: "sin_documento",
    cliente_num_doc: null,
    cliente_nombre: null,
    total: 100,
    estado: "aceptado",
    entorno_transmision: "produccion",
    motivo_rechazo: null,
    motivo_anulacion: null,
    motivo_no_emitido: null,
    anulacion_solicitada_at: null,
    created_at: "2026-09-18T15:00:00Z",
    ubicacion_id: "u",
    pdfUrl: null,
    xmlUrl: null,
    cdrUrl: null,
    ...extra,
  } as Comprobante;
}

describe("nombreCorto", () => {
  it("quita el «Tienda » del nombre: «Tienda Lima» es «Lima»", () => {
    expect(nombreCorto("Tienda Lima")).toBe("Lima");
    expect(nombreCorto("Taller")).toBe("Taller");
  });
});

describe("seriesFaltantes (spec §9: tiendas × boleta, factura y nota de crédito)", () => {
  const todas = (ub: { id: string }, tipos: ("boleta" | "factura" | "nota_credito")[]) => tipos.map((tipo) => ({ ubicacion_id: ub.id, tipo }));

  it("hoy: boleta y factura en dos tiendas y ninguna nota de crédito → falta en las dos, y la tienda sin series falta en todo", () => {
    const series = [...todas(TRU, ["boleta", "factura"]), ...todas(LIM, ["boleta", "factura"])];
    expect(seriesFaltantes(series, [TRU, AQP, LIM])).toEqual([
      { tipo: "boleta", tiendas: [{ id: "u-aqp", nombre: "Tienda Arequipa" }] },
      { tipo: "factura", tiendas: [{ id: "u-aqp", nombre: "Tienda Arequipa" }] },
      {
        tipo: "nota_credito",
        tiendas: [
          { id: "u-tru", nombre: "Tienda Trujillo" },
          { id: "u-aqp", nombre: "Tienda Arequipa" },
          { id: "u-lim", nombre: "Tienda Lima" },
        ],
      },
    ]);
  });

  it("el Taller y los almacenes no emiten comprobantes: nunca les falta una serie", () => {
    const series = [...todas(TRU, ["boleta", "factura", "nota_credito"])];
    expect(seriesFaltantes(series, [TRU, TALLER, ALMACEN])).toEqual([]);
  });

  it("todo registrado: no falta nada", () => {
    const series = [TRU, AQP].flatMap((u) => todas(u, ["boleta", "factura", "nota_credito"]));
    expect(seriesFaltantes(series, [TRU, AQP])).toEqual([]);
  });

  it("una serie de otro tipo no cuenta: tener boleta no cubre la nota de crédito", () => {
    expect(seriesFaltantes(todas(TRU, ["boleta"]), [TRU])).toEqual([
      { tipo: "factura", tiendas: [{ id: "u-tru", nombre: "Tienda Trujillo" }] },
      { tipo: "nota_credito", tiendas: [{ id: "u-tru", nombre: "Tienda Trujillo" }] },
    ]);
  });

  it("sin tiendas no hay nada que pedir", () => {
    expect(seriesFaltantes([], [TALLER])).toEqual([]);
  });
});

describe("textoDeSeriesFaltantes", () => {
  it("una nota de crédito que falta en tres tiendas: «Faltan 3 series: nota de crédito en Trujillo, Arequipa y Lima.»", () => {
    const grupos = seriesFaltantes([], [TRU, AQP, LIM]).filter((g) => g.tipo === "nota_credito");
    expect(textoDeSeriesFaltantes(grupos)).toBe("Faltan 3 series: nota de crédito en Trujillo, Arequipa y Lima.");
  });

  it("en singular cuando es una sola", () => {
    expect(textoDeSeriesFaltantes([{ tipo: "nota_credito", tiendas: [{ id: "u-lim", nombre: "Tienda Lima" }] }])).toBe("Falta 1 serie: nota de crédito en Lima.");
  });

  it("dos tipos distintos se separan con «;» y cada uno junta sus tiendas con «y»", () => {
    const grupos = [
      { tipo: "factura" as const, tiendas: [{ id: "a", nombre: "Tienda Lima" }] },
      { tipo: "nota_credito" as const, tiendas: [{ id: "b", nombre: "Tienda Trujillo" }, { id: "c", nombre: "Tienda Lima" }] },
    ];
    expect(textoDeSeriesFaltantes(grupos)).toBe("Faltan 3 series: factura en Lima; nota de crédito en Trujillo y Lima.");
  });

  it("sin faltantes no escribe nada", () => {
    expect(textoDeSeriesFaltantes([])).toBe("");
  });
});

describe("montosDelMes (spec §9: «Monto facturado» solo suma aceptados de producción)", () => {
  it("factura lo aceptado por SUNAT en producción, sin la baja en trámite", () => {
    const m = montosDelMes([
      c({ total: 100, estado: "aceptado", entorno_transmision: "produccion" }),
      c({ total: 50, estado: "aceptado", entorno_transmision: "produccion", anulacion_solicitada_at: "2026-09-18T16:00:00Z" }),
    ]);
    expect(m.facturado).toBe(100);
  });

  it("lo de prueba y lo que falta enviar se cuentan aparte, nunca como facturado", () => {
    const m = montosDelMes([
      c({ total: 100, estado: "aceptado", entorno_transmision: "sandbox" }),
      c({ total: 30, estado: "pendiente", entorno_transmision: null }),
      c({ total: 20, estado: "rechazado", entorno_transmision: "produccion" }),
      c({ total: 999, estado: "anulado", entorno_transmision: "produccion" }),
      c({ total: 999, estado: "no_emitido", entorno_transmision: null }),
      c({ total: 40, estado: "enviado", entorno_transmision: "produccion" }),
    ]);
    expect(m.facturado).toBe(0);
    expect(m.deprueba).toBe(100);
    expect(m.sinEnviar).toBe(50);
  });

  it("cuenta cuántos comprobantes son de prueba, en el estado que estén", () => {
    const m = montosDelMes([c({ estado: "aceptado", entorno_transmision: "sandbox" }), c({ estado: "rechazado", entorno_transmision: "sandbox" }), c({ estado: "aceptado", entorno_transmision: "produccion" })]);
    expect(m.cuantosDePrueba).toBe(2);
  });

  it("no arrastra el error de coma flotante (0.1 + 0.2)", () => {
    const m = montosDelMes([c({ total: 0.1 }), c({ total: 0.2 })]);
    expect(m.facturado).toBe(0.3);
  });

  it("una nota de crédito aceptada RESTA de lo facturado (su total viene en positivo) y se cuenta aparte", () => {
    const m = montosDelMes([
      c({ total: 500, tipo: "boleta", estado: "aceptado", entorno_transmision: "produccion" }),
      c({ total: 120, tipo: "nota_credito", estado: "aceptado", entorno_transmision: "produccion" }),
    ]);
    expect(m.facturado).toBe(380);
    expect(m.notasDeCredito).toBe(120);
  });

  it("una nota de crédito de prueba o pendiente no toca lo facturado", () => {
    const m = montosDelMes([
      c({ total: 500, tipo: "boleta", estado: "aceptado", entorno_transmision: "produccion" }),
      c({ total: 120, tipo: "nota_credito", estado: "aceptado", entorno_transmision: "sandbox" }),
      c({ total: 80, tipo: "nota_credito", estado: "pendiente", entorno_transmision: null }),
    ]);
    expect(m.facturado).toBe(500);
    expect(m.notasDeCredito).toBe(0);
  });

  it("«emitidos» no cuenta lo que se liberó antes de transmitirse", () => {
    const m = montosDelMes([c({ estado: "aceptado" }), c({ estado: "pendiente", entorno_transmision: null }), c({ estado: "no_emitido", entorno_transmision: null }), c({ estado: "anulado" })]);
    expect(m.emitidos).toBe(3);
  });

  it("sin comprobantes todo es cero", () => {
    expect(montosDelMes([])).toEqual({ emitidos: 0, facturado: 0, notasDeCredito: 0, deprueba: 0, sinEnviar: 0, cuantosDePrueba: 0 });
  });
});

describe("motivoDelComprobante", () => {
  it("rechazado con motivo: es el motivo de SUNAT y se marca como rechazo", () => {
    expect(motivoDelComprobante(c({ estado: "rechazado", motivo_rechazo: "RUC no habido" }))).toEqual({ motivo: "RUC no habido", esRechazo: true });
  });

  it("rechazado sin motivo: no inventa uno", () => {
    expect(motivoDelComprobante(c({ estado: "rechazado", motivo_rechazo: null }))).toEqual({ motivo: null, esRechazo: false });
  });

  it("no emitido: por qué se liberó; anulado: el motivo de la baja", () => {
    expect(motivoDelComprobante(c({ estado: "no_emitido", motivo_no_emitido: "se equivocó de tienda" }))).toEqual({ motivo: "se equivocó de tienda", esRechazo: false });
    expect(motivoDelComprobante(c({ estado: "anulado", motivo_anulacion: "devolución" }))).toEqual({ motivo: "devolución", esRechazo: false });
  });

  it("aceptado, pendiente y enviado: sin motivo", () => {
    expect(motivoDelComprobante(c({ estado: "aceptado" }))).toEqual({ motivo: null, esRechazo: false });
    expect(motivoDelComprobante(c({ estado: "pendiente" }))).toEqual({ motivo: null, esRechazo: false });
  });
});
