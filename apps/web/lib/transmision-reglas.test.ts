import { describe, expect, it } from "vitest";
import { cronNoTransmite, diasParaElPlazo, queHacerConElError, errorDeColaLegible, itemsParaLucode, motivoParaNoTransmitir, vaALaColaDeReintento, variantesPorNombrar, type ComprobanteParaTransmitir } from "./transmision-reglas";

function comprobante(extra: Partial<ComprobanteParaTransmitir> = {}): ComprobanteParaTransmitir {
  return { estado: "pendiente", venta_id: "v1", venta: { estado: "completada" }, ...extra };
}

describe("motivoParaNoTransmitir", () => {
  it("un pendiente de una venta completada se transmite", () => {
    expect(motivoParaNoTransmitir(comprobante())).toBeNull();
  });

  it("un rechazado de una venta completada se puede reintentar (ADR-0093)", () => {
    expect(motivoParaNoTransmitir(comprobante({ estado: "rechazado" }))).toBeNull();
  });

  it("uno que espera en la cola de reintento (D-60) se vuelve a transmitir", () => {
    expect(motivoParaNoTransmitir(comprobante({ estado: "pendiente_reintento" }))).toBeNull();
  });

  it("enviado, aceptado, anulado y no emitido no se vuelven a transmitir, y lo dicen con su estado", () => {
    for (const estado of ["enviado", "aceptado", "anulado", "no_emitido"]) {
      expect(motivoParaNoTransmitir(comprobante({ estado }))).toEqual({ error: `Este comprobante ya está en estado "${estado}" — no se vuelve a transmitir.`, status: 409 });
    }
  });

  it("nunca el comprobante de una venta ANULADA: sea pendiente o rechazado", () => {
    for (const estado of ["pendiente", "rechazado"]) {
      const r = motivoParaNoTransmitir(comprobante({ estado, venta: { estado: "anulada" } }));
      expect(r?.status).toBe(409);
      expect(r?.error).toMatch(/venta de este comprobante está anulada/);
    }
  });

  it("si la venta existe pero no se pudo leer, se niega y pide reintentar: ante la duda no se declara nada", () => {
    expect(motivoParaNoTransmitir(comprobante({ venta: null }))).toEqual({ error: "No se pudo comprobar si la venta de este comprobante sigue vigente. Reintenta.", status: 503 });
  });

  it("si la venta llega en otra forma (sin el embebido, un arreglo, sin estado) se niega igual: el fallo es cerrado, no abierto", () => {
    for (const venta of [undefined, [], [{ estado: "completada" }], {}]) {
      expect(motivoParaNoTransmitir(comprobante({ venta: venta as never }))?.status).toBe(503);
    }
  });

  it("un comprobante que no nació de una venta (manual) se transmite sin mirar ninguna venta", () => {
    expect(motivoParaNoTransmitir(comprobante({ venta_id: null, venta: null }))).toBeNull();
  });

  it("el estado del comprobante manda sobre la venta: uno ya aceptado dice eso, no que la venta está anulada", () => {
    expect(motivoParaNoTransmitir(comprobante({ estado: "aceptado", venta: { estado: "anulada" } }))?.error).toMatch(/ya está en estado "aceptado"/);
  });
});

describe("vaALaColaDeReintento", () => {
  it("solo lo que todavía no salió a SUNAT entra a la cola", () => {
    expect(vaALaColaDeReintento("pendiente")).toBe(true);
    expect(vaALaColaDeReintento("pendiente_reintento")).toBe(true);
    for (const estado of ["rechazado", "enviado", "aceptado", "anulado", "no_emitido"]) expect(vaALaColaDeReintento(estado)).toBe(false);
  });
});

describe("itemsParaLucode", () => {
  const nombres = new Map([["v1", "Blusa Emma · CMS-0001-BEI-M"], ["v2", "Falda Lía · FAL-0002-NEG-S"]]);

  it("un comprobante manual pasa tal cual (su precio ya viene sin IGV)", () => {
    const raw = [{ descripcion: "Venta de mercadería", cantidad: 1, precio_unitario: 67.71 }];
    expect(itemsParaLucode(raw, new Map())).toEqual(raw);
  });

  it("una línea de venta toma el nombre de la variante y su precio sin IGV, con el descuento restado", () => {
    const raw = [{ variante_id: "v1", cantidad: 1, precio_unitario: 79.9, descuento_unitario: 10 }];
    expect(itemsParaLucode(raw, nombres)).toEqual([{ descripcion: "Blusa Emma · CMS-0001-BEI-M", cantidad: 1, precio_unitario: 59.237288 }]);
  });

  it("la suma con IGV vuelve al total cobrado, al céntimo", () => {
    const raw = [
      { variante_id: "v1", cantidad: 3, precio_unitario: 79.9, descuento_unitario: 0 },
      { variante_id: "v2", cantidad: 2, precio_unitario: 129.9, descuento_unitario: 13 },
    ];
    const total = 79.9 * 3 + (129.9 - 13) * 2;
    const items = itemsParaLucode(raw, nombres)!;
    const declarado = items.reduce((s, it) => s + it.precio_unitario * 1.18 * it.cantidad, 0);
    expect(Math.round(declarado * 100) / 100).toBe(Math.round(total * 100) / 100);
  });

  it("una prenda sin registrar se declara con lo que anotó caja, y su precio igual se trata CON IGV", () => {
    const raw = [{ variante_id: "centinela", cantidad: 1, precio_unitario: 59, descuento_unitario: 0, descripcion_libre: "Blusa lino beige" }];
    expect(itemsParaLucode(raw, new Map())).toEqual([{ descripcion: "Blusa lino beige", cantidad: 1, precio_unitario: 50 }]);
    // No hace falta buscar el nombre de la centinela en la base.
    expect(variantesPorNombrar(raw)).toEqual([]);
  });

  it("sin nombre para una variante, o con datos rotos, no se transmite", () => {
    expect(itemsParaLucode([{ variante_id: "otra", cantidad: 1, precio_unitario: 10 }], nombres)).toBeNull();
    expect(itemsParaLucode([{ variante_id: "v1", cantidad: "1", precio_unitario: 10 }], nombres)).toBeNull();
    expect(itemsParaLucode([], nombres)).toBeNull();
    expect(itemsParaLucode(null, nombres)).toBeNull();
  });

  it("variantesPorNombrar lista solo las líneas sin descripción", () => {
    expect(variantesPorNombrar([{ variante_id: "v1" }, { descripcion: "x", variante_id: "v9" }, { variante_id: "v2" }])).toEqual(["v1", "v2"]);
  });
});

describe("errorDeColaLegible", () => {
  it("traduce el motivo a palabras de tienda y deja el detalle solo cuando Lucode dijo algo útil", () => {
    expect(errorDeColaLegible("sin_credenciales: Falta LUCODE_TOKEN en el entorno")).toBe("Falta configurar la conexión con Lucode en el servidor.");
    expect(errorDeColaLegible("sin_respuesta: The operation was aborted")).toBe("Lucode no respondió (sin internet o el servicio está caído).");
    expect(errorDeColaLegible("rechazado_por_lucode: serie inválida")).toBe("Lucode no aceptó el envío: serie inválida");
  });

  it("un motivo desconocido se muestra tal cual; sin error, nada", () => {
    expect(errorDeColaLegible("otra cosa")).toBe("otra cosa");
    expect(errorDeColaLegible(null)).toBeNull();
  });
});

describe("motivoParaNoTransmitir — la nota de venta nunca va a SUNAT (ADR-0164)", () => {
  it("una nota de venta se frena por tipo aunque su estado dijera pendiente", () => {
    const r = motivoParaNoTransmitir({ tipo: "nota_venta", estado: "pendiente", venta_id: null, venta: null });
    expect(r?.status).toBe(409);
    expect(r?.error).toContain("no se transmite a SUNAT");
  });

  it("una boleta pendiente sigue pudiéndose transmitir", () => {
    expect(motivoParaNoTransmitir({ tipo: "boleta", estado: "pendiente", venta_id: null, venta: null })).toBeNull();
  });

  it("separaciones (ADR-0166): ni el anticipo ni el comprobante que lo deduce se transmiten todavía", () => {
    expect(motivoParaNoTransmitir(comprobante({ venta_id: null, venta: null, es_anticipo: true }))?.status).toBe(409);
    expect(motivoParaNoTransmitir(comprobante({ anticipo_deducido: "50.00" }))?.error).toMatch(/apartado/);
    expect(motivoParaNoTransmitir(comprobante({ anticipo_deducido: 50 }))?.status).toBe(409);
  });

  it("sin las columnas de separaciones (web antes que la migración) todo sigue como hoy", () => {
    expect(motivoParaNoTransmitir(comprobante({ es_anticipo: false, anticipo_deducido: "0.00" }))).toBeNull();
    expect(motivoParaNoTransmitir(comprobante({ anticipo_deducido: null }))).toBeNull();
  });
});

describe("queHacerConElError", () => {
  it("da un paso concreto por motivo conocido, aunque traiga detalle", () => {
    expect(queHacerConElError("sin_respuesta")).toMatch(/se reintenta solo/);
    expect(queHacerConElError("rechazado_por_lucode: RUC inválido")).toMatch(/Reintentar no lo arregla/);
  });
  it("sin error o con un motivo desconocido, no inventa consejo", () => {
    expect(queHacerConElError(null)).toBeNull();
    expect(queHacerConElError("algo_nuevo: x")).toBeNull();
  });
});

describe("diasParaElPlazo (3 días calendario de Lima)", () => {
  // Emitido el lunes 21 a las 23:30 de Lima = martes 22, 04:30 UTC: cuenta el lunes, no el martes.
  const emitido = "2026-09-22T04:30:00Z";
  it("el mismo día de Lima quedan 3", () => {
    expect(diasParaElPlazo(emitido, new Date("2026-09-22T04:45:00Z"))).toBe(3);
  });
  it("el jueves 24 de Lima queda 0 (vence hoy) y el viernes 25 ya está fuera de plazo", () => {
    expect(diasParaElPlazo(emitido, new Date("2026-09-25T04:59:00Z"))).toBe(0); // jueves 24, 23:59 Lima
    expect(diasParaElPlazo(emitido, new Date("2026-09-25T05:00:00Z"))).toBe(-1); // viernes 25, 00:00 Lima
  });
});

describe("cronNoTransmite (PL-113: quién puede correr el cron, y solo al sandbox)", () => {
  it("sin CRON_SECRET no pasa nadie, tampoco quien manda «Bearer undefined» o «Bearer »", () => {
    expect(cronNoTransmite("Bearer undefined", undefined, "sandbox")?.status).toBe(401);
    expect(cronNoTransmite("Bearer ", "", "sandbox")?.status).toBe(401);
    expect(cronNoTransmite(null, undefined, "sandbox")?.status).toBe(401);
  });
  it("con otra clave, o sin encabezado, no pasa", () => {
    expect(cronNoTransmite("Bearer otra", "clave", "sandbox")?.status).toBe(401);
    expect(cronNoTransmite(null, "clave", "sandbox")?.status).toBe(401);
    expect(cronNoTransmite("clave", "clave", "sandbox")?.status).toBe(401);
  });
  it("con la clave pero fuera del sandbox no transmite nada (y no cuenta como fallo)", () => {
    expect(cronNoTransmite("Bearer clave", "clave", "produccion")).toEqual({ status: 200, body: { tomados: 0, omitido: "El cron solo transmite al sandbox de Lucode." } });
  });
  it("con la clave y en el sandbox, transmite", () => {
    expect(cronNoTransmite("Bearer clave", "clave", "sandbox")).toBeNull();
  });
});
