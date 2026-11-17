import { describe, expect, it } from "vitest";
import type { Comprobante } from "./comprobantes-reglas";
import {
  armarExtras,
  documentosDeLosCambios,
  originalDeLaVenta,
  puedeIrAPosventa,
  textoDelCambio,
  ventaParaVer,
  vinculosDeFila,
  type CandidatoOriginal,
  type ExtraComprobante,
  type LecturasDeExtras,
} from "./comprobantes-cambio-reglas";

// ADR-0671: un cambio con diferencia deja su nota de crédito sobre la boleta original y un comprobante nuevo sin venta. El caso de
// la crítica: boleta B004-31 por 59.90, cambio +30 → nota BC04-12 por 59.90 y boleta B004-900 por 89.90.

function c(extra: Partial<Comprobante>): Comprobante {
  return {
    id: "c",
    tipo: "boleta",
    serie: "B004",
    numero: 31,
    cliente_tipo_doc: "sin_documento",
    cliente_num_doc: null,
    cliente_nombre: null,
    total: 59.9,
    estado: "aceptado",
    entorno_transmision: "produccion",
    motivo_rechazo: null,
    motivo_anulacion: null,
    motivo_no_emitido: null,
    anulacion_solicitada_at: null,
    created_at: "2026-11-16T15:00:00Z",
    ubicacion_id: "u",
    pdfUrl: null,
    xmlUrl: null,
    cdrUrl: null,
    venta_id: null,
    comprobante_original_id: null,
    cambio_id: null,
    ...extra,
  } as Comprobante;
}

const ORIGINAL = c({ id: "o", venta_id: "v1" });
const NOTA = c({ id: "n", tipo: "nota_credito", serie: "BC04", numero: 12, comprobante_original_id: "o", cambio_id: "cb1" });
const NUEVA = c({ id: "b", numero: 900, total: 89.9, cambio_id: "cb1" });

const vacias: LecturasDeExtras = { telefonos: new Map(), notas: [], originales: [], devolucionDeNota: new Map(), cambios: new Map() };

describe("originalDeLaVenta — la misma regla de retail.fn_original_del_cambio", () => {
  const base = { serie: "B004", numero: 1, venta_id: "v1" };

  it("elige la boleta, factura o nota de venta viva; nunca un anticipo de apartado ni una nota de crédito", () => {
    const candidatos: CandidatoOriginal[] = [
      { ...base, id: "anticipo", tipo: "boleta", estado: "aceptado", created_at: "2026-11-16T16:00:00Z", es_anticipo: true },
      { ...base, id: "nc", tipo: "nota_credito", estado: "aceptado", created_at: "2026-11-16T17:00:00Z" },
      { ...base, id: "viva", tipo: "boleta", estado: "aceptado", created_at: "2026-11-16T15:00:00Z", es_anticipo: false },
    ];
    expect(originalDeLaVenta(candidatos)?.id).toBe("viva");
  });

  it("la viva gana a una anulada o liberada más nueva; entre vivas, la más reciente", () => {
    const candidatos: CandidatoOriginal[] = [
      { ...base, id: "liberada", tipo: "boleta", estado: "no_emitido", created_at: "2026-11-16T18:00:00Z" },
      { ...base, id: "vieja", tipo: "boleta", estado: "aceptado", created_at: "2026-11-16T10:00:00Z" },
      { ...base, id: "nueva", tipo: "factura", estado: "pendiente", created_at: "2026-11-16T12:00:00Z" },
    ];
    expect(originalDeLaVenta(candidatos)?.id).toBe("nueva");
  });

  it("sin documento vivo, el muerto más reciente; sin ninguno, null", () => {
    expect(originalDeLaVenta([{ ...base, id: "anulada", tipo: "boleta", estado: "anulado", created_at: "2026-11-16T10:00:00Z" }])?.id).toBe("anulada");
    expect(originalDeLaVenta([])).toBeNull();
  });
});

describe("documentosDeLosCambios — de qué comprobante sale cada cambio", () => {
  const original: CandidatoOriginal = { id: "o", serie: "B004", numero: 31, venta_id: "v1", ubicacion_id: "lim" };

  it("con su nota emitida, la original es la que corrige la nota (con certeza), y la venta y su sede son las de la original", () => {
    const r = documentosDeLosCambios(["cb1"], [{ cambio_id: "cb1", comprobante_original_id: "o" }], new Map([["cb1", "v1"]]), [original]);
    expect(r.get("cb1")).toEqual({ original: { id: "o", numero: "B004-000031" }, ventaId: "v1", ubicacionId: "lim" });
  });

  it("con la nota por emitir (la original todavía no está aceptada), se busca por la venta del cambio", () => {
    const deLaVenta: CandidatoOriginal = { id: "o", serie: "B004", numero: 31, venta_id: "v1", tipo: "boleta", estado: "pendiente_reintento", created_at: "2026-11-16T15:00:00Z" };
    const r = documentosDeLosCambios(["cb1"], [], new Map([["cb1", "v1"]]), [deLaVenta]);
    expect(r.get("cb1")?.original?.numero).toBe("B004-000031");
  });

  it("si no se pudo leer la venta del cambio, «Ver la venta» va a la venta de la original", () => {
    const r = documentosDeLosCambios(["cb1"], [{ cambio_id: "cb1", comprobante_original_id: "o" }], new Map(), [original]);
    expect(r.get("cb1")?.ventaId).toBe("v1");
  });

  it("sin nada leído: el cambio sigue en la lista, sin original ni venta (la fila dice «De un cambio»)", () => {
    expect(documentosDeLosCambios(["cb1"], [], new Map(), []).get("cb1")).toEqual({ original: null, ventaId: null, ubicacionId: null });
  });

  it("una venta con otra boleta no se confunde: cada cambio con la suya", () => {
    const otra: CandidatoOriginal = { id: "o2", serie: "B004", numero: 40, venta_id: "v2", tipo: "boleta", estado: "aceptado", created_at: "2026-11-16T15:00:00Z" };
    const deV1: CandidatoOriginal = { ...original, tipo: "boleta", estado: "aceptado", created_at: "2026-11-16T15:00:00Z" };
    const r = documentosDeLosCambios(["cb1", "cb2"], [], new Map([["cb1", "v1"], ["cb2", "v2"]]), [deV1, otra]);
    expect(r.get("cb1")?.original?.id).toBe("o");
    expect(r.get("cb2")?.original?.id).toBe("o2");
  });
});

describe("armarExtras — la nota de un cambio no es una devolución", () => {
  const lecturas: LecturasDeExtras = {
    ...vacias,
    notas: [
      { id: "n", serie: "BC04", numero: 12, comprobante_original_id: "o", cambio_id: "cb1" },
      { id: "d", serie: "BC04", numero: 10, comprobante_original_id: "o2", cambio_id: null },
    ],
    originales: [{ id: "o", serie: "B004", numero: 31 }],
    devolucionDeNota: new Map([["d", "dev1"]]),
    cambios: new Map([["cb1", { original: { id: "o", numero: "B004-000031" }, ventaId: "v1", ubicacionId: "u" }]]),
  };
  const DEVUELTA = c({ id: "o2", numero: 32, venta_id: "v2" });
  const extras = armarExtras([ORIGINAL, NOTA, NUEVA, DEVUELTA], lecturas);

  it("la boleta original lleva la nota del cambio aparte y sin «nota de crédito» que la dé por devuelta", () => {
    expect(extras.o.notaDeCredito).toBeNull();
    expect(extras.o.notasDeCambio).toEqual([{ id: "n", numero: "BC04-000012" }]);
    expect(extras.o.devolucionId).toBeNull();
    expect(extras.o.cambio).toBeNull();
  });

  it("una devolución sigue siendo una devolución: su nota y su enlace, como antes", () => {
    expect(extras.o2.notaDeCredito).toEqual({ id: "d", numero: "BC04-000010" });
    expect(extras.o2.notasDeCambio).toEqual([]);
    expect(extras.o2.devolucionId).toBe("dev1");
  });

  it("la nota y la boleta nueva del cambio saben de qué comprobante salen y a qué venta llevan", () => {
    expect(extras.n.cambio).toEqual({ original: { id: "o", numero: "B004-000031" }, ventaId: "v1", ubicacionId: "u" });
    expect(extras.n.corrige).toEqual({ id: "o", numero: "B004-000031" });
    expect(extras.b.cambio).toEqual({ original: { id: "o", numero: "B004-000031" }, ventaId: "v1", ubicacionId: "u" });
    expect(extras.b.corrige).toBeNull();
  });

  it("si la lectura del cambio no trajo la original, la nota usa la que ella misma corrige, y su propia sede (nace en la de la original)", () => {
    const sinCambio = armarExtras([NOTA, NUEVA], { ...lecturas, cambios: new Map() });
    expect(sinCambio.n.cambio).toEqual({ original: { id: "o", numero: "B004-000031" }, ventaId: null, ubicacionId: "u" });
    // El comprobante nuevo nace en la sede del cambio, que puede ser otra: sin la original leída, no se adivina la de la venta.
    expect(sinCambio.b.cambio).toEqual({ original: null, ventaId: null, ubicacionId: null });
  });

  it("antes de la migración (sin cambio_id), todo se lee como siempre", () => {
    const antes = armarExtras([ORIGINAL], { ...vacias, notas: [{ id: "n", serie: "BC04", numero: 12, comprobante_original_id: "o", cambio_id: null }] });
    expect(antes.o.notaDeCredito).toEqual({ id: "n", numero: "BC04-000012" });
    expect(antes.o.notasDeCambio).toEqual([]);
  });

  it("el WhatsApp del cliente sale de su DNI, como antes", () => {
    const conDni = c({ id: "x", cliente_tipo_doc: "dni", cliente_num_doc: "12345678" });
    expect(armarExtras([conDni], { ...vacias, telefonos: new Map([["12345678", "987654321"]]) }).x.telefono).toBe("987654321");
  });
});

describe("vinculosDeFila — lo que dice la fila bajo su número", () => {
  const extra = (e: Partial<ExtraComprobante>): ExtraComprobante => ({
    telefono: null,
    notaDeCredito: null,
    notasDeCambio: [],
    corrige: null,
    devolucionId: null,
    cambio: null,
    ...e,
  });

  it("un documento de un cambio dice «Cambio de …», nunca «Corrige» ni nada que lo haga ver suelto", () => {
    const deCambio = { original: { id: "o", numero: "B004-000031" }, ventaId: "v1", ubicacionId: "u" };
    expect(vinculosDeFila(extra({ cambio: deCambio, corrige: { id: "o", numero: "B004-000031" } }))).toEqual([{ tipo: "cambio", texto: "Cambio de B004-000031" }]);
    expect(vinculosDeFila(extra({ cambio: deCambio }))).toEqual([{ tipo: "cambio", texto: "Cambio de B004-000031" }]);
  });

  it("sin la original leída, igual se ve que sale de un cambio", () => {
    expect(vinculosDeFila(extra({ cambio: { original: null, ventaId: null, ubicacionId: null } }))).toEqual([{ tipo: "cambio", texto: "De un cambio" }]);
  });

  it("la fila y la hoja dicen lo mismo: `textoDelCambio` es la única forma de nombrarlo", () => {
    expect(textoDelCambio({ original: { id: "o", numero: "B004-000031" }, ventaId: null, ubicacionId: null })).toBe("Cambio de B004-000031");
    expect(textoDelCambio({ original: null, ventaId: null, ubicacionId: null })).toBe("De un cambio");
  });

  it("la boleta original con la nota de su cambio; con varias, la primera y cuántas más", () => {
    expect(vinculosDeFila(extra({ notasDeCambio: [{ id: "n", numero: "BC04-000012" }] }))).toEqual([{ tipo: "cambio", texto: "Nota del cambio BC04-000012" }]);
    expect(
      vinculosDeFila(
        extra({
          notasDeCambio: [
            { id: "n", numero: "BC04-000012" },
            { id: "m", numero: "BC04-000015" },
          ],
        }),
      ),
    ).toEqual([{ tipo: "cambio", texto: "Nota del cambio BC04-000012 y 1 más" }]);
  });

  it("devolución y nota corregida, como antes; una boleta con devolución y cambio dice las dos", () => {
    expect(vinculosDeFila(extra({ corrige: { id: "o", numero: "B004-000031" } }))).toEqual([{ tipo: "nota", texto: "Corrige B004-000031" }]);
    expect(vinculosDeFila(extra({ notaDeCredito: { id: "d", numero: "BC04-000010" }, notasDeCambio: [{ id: "n", numero: "BC04-000012" }] }))).toEqual([
      { tipo: "nota", texto: "Tiene BC04-000010" },
      { tipo: "cambio", texto: "Nota del cambio BC04-000012" },
    ]);
    expect(vinculosDeFila(undefined)).toEqual([]);
  });
});

describe("puedeIrAPosventa y ventaParaVer — lo que ofrece la hoja de opciones", () => {
  const sinNada: ExtraComprobante = { telefono: null, notaDeCredito: null, notasDeCambio: [], corrige: null, devolucionId: null, cambio: null };

  it("la nota de un cambio NO le apaga Posventa a la boleta original: el resto de las prendas se cambia o se devuelve", () => {
    expect(puedeIrAPosventa(ORIGINAL, { ...sinNada, notasDeCambio: [{ id: "n", numero: "BC04-000012" }] })).toBe(true);
  });

  it("una nota de devolución sí: ya se devolvió", () => {
    expect(puedeIrAPosventa(ORIGINAL, { ...sinNada, notaDeCredito: { id: "d", numero: "BC04-000010" } })).toBe(false);
  });

  it("los documentos del cambio no abren Posventa (volver a cambiar lo recibido es obra aparte, decisión 10)", () => {
    expect(puedeIrAPosventa(NUEVA, sinNada)).toBe(false);
    expect(puedeIrAPosventa({ ...NUEVA, venta_id: "v1" }, sinNada)).toBe(false);
    expect(puedeIrAPosventa(NOTA, sinNada)).toBe(false);
  });

  it("sin aceptar o sin venta, como antes, no", () => {
    expect(puedeIrAPosventa({ ...ORIGINAL, estado: "pendiente" }, sinNada)).toBe(false);
    expect(puedeIrAPosventa({ ...ORIGINAL, venta_id: null }, sinNada)).toBe(false);
  });

  it("«Ver la venta» de un documento de un cambio abre la venta original; sin venta leída, no se ofrece", () => {
    expect(ventaParaVer(NUEVA, { ...sinNada, cambio: { original: null, ventaId: "v1", ubicacionId: "u" } })?.id).toBe("v1");
    expect(ventaParaVer(NOTA, { ...sinNada, cambio: { original: null, ventaId: "v1", ubicacionId: "u" } })?.id).toBe("v1");
    expect(ventaParaVer(NUEVA, { ...sinNada, cambio: { original: null, ventaId: null, ubicacionId: null } })).toBeNull();
    expect(ventaParaVer(ORIGINAL, undefined)).toEqual({ id: "v1", ubicacionId: "u" });
  });

  it("un cambio hecho en otra sede: «Ver la venta» lleva la sede de la VENTA, no la del comprobante nuevo (que nace en la del cambio)", () => {
    const enTrujillo = { ...NUEVA, ubicacion_id: "tru" };
    const deLima = { ...sinNada, cambio: { original: { id: "o", numero: "B001-000050" }, ventaId: "v1", ubicacionId: "lim" } };
    expect(ventaParaVer(enTrujillo, deLima)).toEqual({ id: "v1", ubicacionId: "lim" });
    // Sin la sede de la venta leída, ninguna: mejor un ticket sin tienda que con la del cambio.
    expect(ventaParaVer(enTrujillo, { ...sinNada, cambio: { original: null, ventaId: "v1", ubicacionId: null } })).toEqual({ id: "v1", ubicacionId: null });
  });
});
