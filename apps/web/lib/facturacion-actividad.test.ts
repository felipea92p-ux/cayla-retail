import { describe, expect, it } from "vitest";
import type { Comprobante, VentaDelDia } from "./comprobantes-reglas";
import { accionDeLaFila, camposDeBusquedaDeLaFila, chipDeLaFila, chipDelComprobante, detalleDeLaFila, enlazarVentasConComprobantes, estadoDeLaFila, etapasDelHilo, textoDelNumero } from "./facturacion-actividad";

const AHORA = new Date("2026-09-18T20:00:00Z");

function venta(extra: Partial<VentaDelDia> = {}): VentaDelDia {
  return {
    venta_id: "v1",
    hora: "13:09",
    ubicacion_nombre: "Tienda TRU",
    vendedor: "Felipe Alvarez",
    cliente_nombre: "Cliente varios",
    items: [],
    total: 537,
    metodos_pago: "yape",
    comprobante_tipo: "boleta",
    comprobante_texto: "B004-000011",
    comprobante_estado: "pendiente",
    ...extra,
  } as VentaDelDia;
}

function comprobante(extra: Partial<Comprobante> = {}): Comprobante {
  return {
    id: "c1",
    tipo: "boleta",
    serie: "B004",
    numero: 11,
    cliente_tipo_doc: "sin_documento",
    cliente_num_doc: null,
    cliente_nombre: null,
    total: 537,
    estado: "pendiente",
    entorno_transmision: null,
    motivo_rechazo: null,
    motivo_anulacion: null,
    motivo_no_emitido: null,
    anulacion_solicitada_at: null,
    created_at: "2026-09-18T13:19:00Z",
    ubicacion_id: "u1",
    pdfUrl: null,
    xmlUrl: null,
    cdrUrl: null,
    ...extra,
  } as Comprobante;
}

describe("textoDelNumero", () => {
  it("serie, guion y correlativo de 6 dígitos: la misma fórmula de fn_ventas_del_dia", () => {
    expect(textoDelNumero({ serie: "B004", numero: 11 })).toBe("B004-000011");
    expect(textoDelNumero({ serie: "F001", numero: 123456 })).toBe("F001-123456");
  });
});

describe("enlazarVentasConComprobantes", () => {
  it("cruza cada venta con su comprobante completo por el texto del número", () => {
    const filas = enlazarVentasConComprobantes([venta()], [comprobante({ id: "otro", numero: 10 }), comprobante()]);
    expect(filas[0].comprobante?.id).toBe("c1");
  });

  it("una venta sin comprobante queda con null", () => {
    const filas = enlazarVentasConComprobantes([venta({ comprobante_texto: null, comprobante_tipo: null, comprobante_estado: null })], [comprobante()]);
    expect(filas[0].comprobante).toBeNull();
  });

  it("un comprobante manual sin venta no aparece: la actividad es de las ventas", () => {
    const filas = enlazarVentasConComprobantes([venta()], [comprobante(), comprobante({ id: "manual", numero: 99 })]);
    expect(filas).toHaveLength(1);
  });

  it("si el comprobante no está entre los de hoy (emitido después de medianoche), la fila queda sin él pero conserva lo que trae la venta", () => {
    const filas = enlazarVentasConComprobantes([venta()], []);
    expect(filas[0].comprobante).toBeNull();
    expect(estadoDeLaFila(filas[0])).toBe("pendiente");
  });

  it("conserva el orden de las ventas", () => {
    const filas = enlazarVentasConComprobantes([venta({ venta_id: "a" }), venta({ venta_id: "b" })], []);
    expect(filas.map((f) => f.venta.venta_id)).toEqual(["a", "b"]);
  });
});

describe("estadoDeLaFila", () => {
  it("el del comprobante manda sobre el de la venta (es el más fresco)", () => {
    expect(estadoDeLaFila({ venta: venta({ comprobante_estado: "pendiente" }), comprobante: comprobante({ estado: "aceptado" }) })).toBe("aceptado");
  });

  it("sin comprobante en ningún lado: sin_comprobante", () => {
    expect(estadoDeLaFila({ venta: venta({ comprobante_texto: null, comprobante_tipo: null, comprobante_estado: null }), comprobante: null })).toBe("sin_comprobante");
  });
});

describe("etapasDelHilo (spec §9: cuatro nodos — venta, número, SUNAT, aceptado)", () => {
  it("sin comprobante: la venta hecha y el número punteado en ámbar", () => {
    const h = etapasDelHilo("sin_comprobante", null);
    expect(h.nodos).toEqual(["hecho", "ambar-punteado", "vacio", "vacio"]);
    expect(h.tramos).toEqual(["vacio", "vacio", "vacio"]);
  });

  it("pendiente: venta y número hechos, SUNAT punteado en ámbar, aceptado vacío", () => {
    const h = etapasDelHilo("pendiente", null);
    expect(h.nodos).toEqual(["hecho", "hecho", "ambar-punteado", "vacio"]);
    expect(h.tramos).toEqual(["lleno", "vacio", "vacio"]);
  });

  it("enviado: SUNAT en ámbar con el anillo que pulsa (esperando respuesta)", () => {
    const h = etapasDelHilo("enviado", "produccion");
    expect(h.nodos).toEqual(["hecho", "hecho", "ambar-pulso", "vacio"]);
    expect(h.tramos).toEqual(["lleno", "lleno", "vacio"]);
  });

  it("aceptado en producción: los cuatro nodos hechos", () => {
    const h = etapasDelHilo("aceptado", "produccion");
    expect(h.nodos).toEqual(["hecho", "hecho", "hecho", "hecho"]);
    expect(h.tramos).toEqual(["lleno", "lleno", "lleno"]);
  });

  it("aceptado en PRUEBA: los dos últimos nodos nunca en verde — SUNAT no lo vio (ADR-0015)", () => {
    const h = etapasDelHilo("aceptado", "sandbox");
    // «hecho» es el verde: los dos últimos nodos y sus tramos no pueden serlo.
    expect(h.nodos).toEqual(["hecho", "hecho", "prueba", "prueba"]);
    expect(h.tramos).toEqual(["lleno", "prueba", "prueba"]);
  });

  it("rechazado: SUNAT con la equis roja y sin llegar a aceptado", () => {
    const h = etapasDelHilo("rechazado", "produccion");
    expect(h.nodos).toEqual(["hecho", "hecho", "rechazado", "vacio"]);
  });

  it("anulado y no emitido: todo apagado", () => {
    for (const estado of ["anulado", "no_emitido"] as const) {
      const h = etapasDelHilo(estado, null);
      expect(h.nodos).toEqual(["apagado", "apagado", "apagado", "apagado"]);
      expect(h.tramos).toEqual(["apagado", "apagado", "apagado"]);
    }
  });

  it("cada estado tiene una descripción con palabras (el hilo lleva role=img y aria-label), y la de prueba lo dice", () => {
    const estados = ["sin_comprobante", "pendiente", "enviado", "aceptado", "rechazado", "anulado", "no_emitido"] as const;
    const descripciones = estados.map((e) => etapasDelHilo(e, "produccion").descripcion);
    expect(new Set(descripciones).size).toBe(estados.length);
    expect(etapasDelHilo("aceptado", "sandbox").descripcion).toMatch(/prueba/i);
  });
});

describe("chipDeLaFila", () => {
  it("cada estado con su etiqueta y su tono", () => {
    expect(chipDeLaFila(venta({ comprobante_texto: null, comprobante_tipo: null, comprobante_estado: null }), null)).toEqual({ tono: "ambar", texto: "Sin comprobante", punteado: false });
    expect(chipDeLaFila(venta(), comprobante({ estado: "pendiente" }))).toEqual({ tono: "ambar", texto: "Pendiente de enviar", punteado: false });
    expect(chipDeLaFila(venta(), comprobante({ estado: "enviado" }))).toEqual({ tono: "ambar", texto: "Enviado a SUNAT", punteado: false });
    expect(chipDeLaFila(venta(), comprobante({ estado: "aceptado", entorno_transmision: "produccion" }))).toEqual({ tono: "verde", texto: "Aceptado", punteado: false });
    expect(chipDeLaFila(venta(), comprobante({ estado: "rechazado" }))).toEqual({ tono: "rojo", texto: "Rechazado", punteado: false });
    expect(chipDeLaFila(venta(), comprobante({ estado: "anulado" }))).toEqual({ tono: "apagado", texto: "Anulado", punteado: false });
    expect(chipDeLaFila(venta(), comprobante({ estado: "no_emitido" }))).toEqual({ tono: "apagado", texto: "No emitido", punteado: false });
  });

  it("aceptado en prueba: «Aceptado · prueba», neutro y con borde punteado (el color solo no distingue)", () => {
    expect(chipDeLaFila(venta(), comprobante({ estado: "aceptado", entorno_transmision: "sandbox" }))).toEqual({ tono: "neutro", texto: "Aceptado · prueba", punteado: true });
  });

  it("aceptado con la baja pedida pero sin confirmar: «Anulación en trámite» en ámbar", () => {
    expect(chipDeLaFila(venta(), comprobante({ estado: "aceptado", entorno_transmision: "produccion", anulacion_solicitada_at: "2026-09-18T18:00:00Z" }))).toEqual({ tono: "ambar", texto: "Anulación en trámite", punteado: false });
  });

  it("sin el comprobante completo se usa lo que trae la venta", () => {
    expect(chipDeLaFila(venta({ comprobante_estado: "aceptado" }), null)).toEqual({ tono: "verde", texto: "Aceptado", punteado: false });
  });
});

describe("chipDelComprobante (el mismo chip en el Resumen y en la vista Comprobantes)", () => {
  it("cualquier comprobante transmitido al sandbox lleva «prueba» y borde punteado, no solo el aceptado", () => {
    expect(chipDelComprobante(comprobante({ estado: "enviado", entorno_transmision: "sandbox" }))).toEqual({ tono: "neutro", texto: "Enviado a SUNAT · prueba", punteado: true });
    expect(chipDelComprobante(comprobante({ estado: "rechazado", entorno_transmision: "sandbox" }))).toEqual({ tono: "neutro", texto: "Rechazado · prueba", punteado: true });
  });

  it("una baja en trámite de un comprobante de prueba también lo dice", () => {
    expect(chipDelComprobante(comprobante({ estado: "aceptado", entorno_transmision: "sandbox", anulacion_solicitada_at: "2026-09-18T18:00:00Z" }))).toEqual({ tono: "neutro", texto: "Anulación en trámite · prueba", punteado: true });
  });

  it("uno pendiente (nunca se transmitió) no es de prueba", () => {
    expect(chipDelComprobante(comprobante({ estado: "pendiente", entorno_transmision: null }))).toEqual({ tono: "ambar", texto: "Pendiente de enviar", punteado: false });
  });
});

describe("detalleDeLaFila", () => {
  it("pendiente: hace cuánto se reservó", () => {
    expect(detalleDeLaFila(comprobante({ estado: "pendiente", created_at: "2026-09-18T13:19:00Z" }), AHORA)).toBe("hace 6 h 41 min");
  });

  it("enviado: esperando respuesta", () => {
    expect(detalleDeLaFila(comprobante({ estado: "enviado" }), AHORA)).toBe("Esperando respuesta");
  });

  it("rechazado: el motivo que dio SUNAT", () => {
    expect(detalleDeLaFila(comprobante({ estado: "rechazado", motivo_rechazo: "RUC no habido" }), AHORA)).toBe("RUC no habido");
  });

  it("rechazado sin motivo: no inventa uno", () => {
    expect(detalleDeLaFila(comprobante({ estado: "rechazado", motivo_rechazo: null }), AHORA)).toBeNull();
  });

  it("aceptado, anulado y sin comprobante: nada que agregar", () => {
    expect(detalleDeLaFila(comprobante({ estado: "aceptado" }), AHORA)).toBeNull();
    expect(detalleDeLaFila(comprobante({ estado: "anulado" }), AHORA)).toBeNull();
    expect(detalleDeLaFila(null, AHORA)).toBeNull();
  });
});

describe("accionDeLaFila", () => {
  it("pendiente: Transmitir; rechazado: Reintentar (los dos por el mismo camino)", () => {
    expect(accionDeLaFila(comprobante({ estado: "pendiente" }))).toEqual({ tipo: "transmitir", etiqueta: "Transmitir", alerta: false });
    expect(accionDeLaFila(comprobante({ estado: "rechazado" }))).toEqual({ tipo: "transmitir", etiqueta: "Reintentar", alerta: true });
  });

  it("aceptado con PDF: Ver PDF; sin PDF, nada", () => {
    expect(accionDeLaFila(comprobante({ estado: "aceptado", pdfUrl: "https://x/y.pdf" }))).toEqual({ tipo: "pdf", etiqueta: "Ver PDF", href: "https://x/y.pdf" });
    expect(accionDeLaFila(comprobante({ estado: "aceptado", pdfUrl: null }))).toBeNull();
  });

  it("enviado, anulado, no emitido y sin comprobante: ninguna acción", () => {
    expect(accionDeLaFila(comprobante({ estado: "enviado" }))).toBeNull();
    expect(accionDeLaFila(comprobante({ estado: "anulado" }))).toBeNull();
    expect(accionDeLaFila(comprobante({ estado: "no_emitido" }))).toBeNull();
    expect(accionDeLaFila(null)).toBeNull();
  });
});

describe("camposDeBusquedaDeLaFila", () => {
  it("junta lo que una persona escribiría para encontrar la venta: hora, tienda, vendedor, clienta, prendas, pago, número y estado", () => {
    const fila = {
      venta: venta({ items: [{ referencia: "Blusa Emma", talla: "M", color: "Beige", cantidad: 1, precio_unitario: 79.9 }] }),
      comprobante: comprobante({ estado: "pendiente" }),
    };
    const texto = camposDeBusquedaDeLaFila(fila).join(" ");
    for (const esperado of ["13:09", "Tienda TRU", "Felipe Alvarez", "Cliente varios", "Blusa Emma", "Beige", "yape", "Boleta", "B004-000011", "Pendiente de enviar", "537.00"]) {
      expect(texto).toContain(esperado);
    }
  });

  it("una venta sin comprobante se encuentra escribiendo «sin comprobante»", () => {
    const fila = { venta: venta({ comprobante_texto: null, comprobante_tipo: null, comprobante_estado: null }), comprobante: null };
    expect(camposDeBusquedaDeLaFila(fila).join(" ")).toContain("Sin comprobante");
  });
});
