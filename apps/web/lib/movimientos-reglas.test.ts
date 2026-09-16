import { describe, it, expect } from "vitest";
import {
  etiquetaDia,
  etiquetaProceso,
  partesOrigenDestino,
  leerCursorMovimientos,
  serializarCursorMovimientos,
  textoDelta,
  textoOrigenDestino,
  textoReferencia,
  tonoCategoria,
  type Movimiento,
} from "./movimientos-reglas";

// Lo que la pantalla de Movimientos «dice» de cada fila. El bug que motivó
// todo esto: la versión anterior pintaba «−» en TODO traslado, incluidos los
// que ENTRAN a la tienda — una Líder veía salir mercadería que en realidad
// estaba llegando.

function movimiento(parcial: Partial<Movimiento>): Movimiento {
  return {
    id: "m1",
    creadoEn: "2026-09-15T14:03:22.123456+00:00",
    fecha: "2026-09-15",
    hora: "09:03",
    tipo: "entrada",
    categoria: "entrada",
    motivo: "recepcion",
    cantidad: 3,
    delta: 3,
    esSistema: false,
    nota: null,
    varianteId: "v1",
    sku: "BLU-EMMA-NEG-M",
    referencia: "Blusa Emma",
    talla: "M",
    color: "Negro",
    ubicacionId: "u-lima",
    ubicacion: "Tienda Lima",
    ubicacionDestinoId: null,
    ubicacionDestino: null,
    sububicacion: null,
    sububicacionDestino: null,
    usuarioId: "p1",
    usuario: "Felipe Alvarez",
    venta: null,
    lote: null,
    compra: null,
    transferencia: null,
    conteo: null,
    devolucion: null,
    cambio: null,
    ...parcial,
  };
}

describe("textoDelta", () => {
  it("una transferencia que entra suma y una que sale resta", () => {
    expect(textoDelta({ categoria: "transferencia", cantidad: 6, delta: 6 })).toBe("+6");
    expect(textoDelta({ categoria: "transferencia", cantidad: 6, delta: -6 })).toBe("−6");
  });

  it("un movimiento interno muestra las unidades sin signo: no cambia el total de la tienda", () => {
    expect(textoDelta({ categoria: "interno", cantidad: 2, delta: 0 })).toBe("2");
  });

  it("un ajuste conserva su signo", () => {
    expect(textoDelta({ categoria: "ajuste", cantidad: -1, delta: -1 })).toBe("−1");
    expect(textoDelta({ categoria: "ajuste", cantidad: 2, delta: 2 })).toBe("+2");
  });
});

describe("tonoCategoria", () => {
  it("solo un ajuste que resta es rojo; uno que suma no es alarma", () => {
    expect(tonoCategoria("ajuste", -1)).toBe("rojo");
    expect(tonoCategoria("ajuste", 1)).toBe("neutro");
    expect(tonoCategoria("entrada", 3)).toBe("verde");
    expect(tonoCategoria("interno", 0)).toBe("ambar");
  });
});

describe("textoOrigenDestino", () => {
  it("interno: sububicación origen → destino, abreviadas para la lista", () => {
    const m = movimiento({
      categoria: "interno",
      tipo: "traslado",
      motivo: "movimiento_interno",
      ubicacionDestinoId: "u-lima",
      ubicacionDestino: "Tienda Lima",
      sububicacion: { id: "s1", nombre: "Almacén de tienda", tipo: "almacen_tienda" },
      sububicacionDestino: { id: "s2", nombre: "Piso de venta", tipo: "piso_venta" },
    });
    expect(textoOrigenDestino(m)).toBe("Almacén → Piso");
  });

  it("la activación de piso/almacén (sin sububicación de origen) lo dice, no inventa una", () => {
    const m = movimiento({
      categoria: "interno",
      tipo: "traslado",
      motivo: "activacion_piso_almacen",
      esSistema: true,
      sububicacionDestino: { id: "s1", nombre: "Almacén de tienda", tipo: "almacen_tienda" },
    });
    expect(textoOrigenDestino(m)).toBe("Sin sububicación → Almacén");
  });

  it("transferencia: sede origen → sede destino", () => {
    const m = movimiento({ categoria: "transferencia", tipo: "traslado", ubicacion: "Taller", ubicacionDestino: "Tienda Lima" });
    expect(textoOrigenDestino(m)).toBe("Taller → Tienda Lima");
  });
});

describe("textoReferencia", () => {
  it("venta con boleta", () => {
    const m = movimiento({
      motivo: "venta",
      venta: { id: "v1", nota: null, comprobante: { tipo: "boleta", numero: "B001-000012", estado: "aceptado" } },
    });
    expect(textoReferencia(m)).toBe("Boleta B001-000012");
  });

  it("venta sin comprobante lo dice", () => {
    expect(textoReferencia(movimiento({ motivo: "venta", venta: { id: "v1", nota: null, comprobante: null } }))).toBe("Sin comprobante");
  });

  it("recepción: guía, factura y proveedor, los que haya", () => {
    const m = movimiento({
      motivo: "recepcion",
      lote: { id: "l1", guia: "T001-000045", nota: null, proveedor: "Textiles Andina" },
      compra: { id: "c1", documento: "F001-000210" },
    });
    expect(textoReferencia(m)).toBe("Guía T001-000045 · Factura F001-000210 · Textiles Andina");
  });

  it("conteo: sistema → contado", () => {
    expect(textoReferencia(movimiento({ motivo: "conteo", conteo: { id: "c1", sistema: 2, contado: 1 } }))).toBe("Sistema 2 → contado 1");
  });

  it("un proceso de sistema sin nota no tiene referencia", () => {
    expect(textoReferencia(movimiento({ motivo: "carga_inicial", esSistema: true }))).toBeNull();
  });
});

describe("etiquetaProceso", () => {
  it("conoce los procesos de operación y los de sistema", () => {
    expect(etiquetaProceso("movimiento_interno")).toBe("Reposición interna");
    expect(etiquetaProceso("carga_inicial")).toBe("Carga inicial");
    expect(etiquetaProceso("activacion_piso_almacen")).toBe("Activación piso/almacén");
  });

  it("un motivo desconocido se muestra legible, nunca rompe", () => {
    expect(etiquetaProceso("ajuste_manual_2027")).toBe("ajuste manual 2027");
    expect(etiquetaProceso(null)).toBe("Sin proceso");
  });
});

describe("cursor", () => {
  it("va y vuelve intacto (el timestamp con microsegundos se reenvía sin tocar)", () => {
    const c = { creadoEn: "2026-09-15T14:03:22.123456+00:00", id: "6d27c17d-13b7-4c2b-84c8-a944f38431e7" };
    expect(leerCursorMovimientos(serializarCursorMovimientos(c))).toEqual(c);
  });

  it("rechaza basura", () => {
    expect(leerCursorMovimientos("ayer~123")).toBeNull();
    expect(leerCursorMovimientos(undefined)).toBeNull();
  });
});

describe("etiquetaDia", () => {
  it("hoy, ayer, y el resto con día de la semana", () => {
    expect(etiquetaDia("2026-09-15", "2026-09-15")).toBe("Hoy");
    expect(etiquetaDia("2026-09-14", "2026-09-15")).toBe("Ayer");
    // `es-PE` escribe «setiembre», como se escribe en Perú.
    expect(etiquetaDia("2026-09-07", "2026-09-15")).toMatch(/^Lunes,? 7 de set?iembre$/);
  });

  it("otro año lo dice", () => {
    expect(etiquetaDia("2025-12-24", "2026-09-15")).toMatch(/2025/);
  });
});

describe("partesOrigenDestino", () => {
  // La columna «Origen → Destino» (diseño de Felipe, 2026-09-16) nombra las
  // dos puntas en vocabulario de tienda: la clienta, el proveedor, el Taller,
  // el piso o el almacén — nunca «entrada»/«salida».
  const piso = { id: "s1", nombre: "Piso de venta", tipo: "piso_venta" };
  const almacen = { id: "s2", nombre: "Almacén de tienda", tipo: "almacen_tienda" };

  it("una venta sale del piso hacia la clienta; una devolución vuelve", () => {
    expect(partesOrigenDestino(movimiento({ tipo: "salida", categoria: "salida", motivo: "venta", delta: -1, sububicacion: piso })))
      .toEqual({ origen: "Piso", destino: "Clienta" });
    expect(partesOrigenDestino(movimiento({ motivo: "devolucion", delta: 1, sububicacion: piso })))
      .toEqual({ origen: "Clienta", destino: "Piso" });
  });

  it("una recepción llega del proveedor al almacén", () => {
    expect(
      partesOrigenDestino(movimiento({ motivo: "recepcion", sububicacion: almacen, lote: { id: "l1", guia: "G-1", nota: null, proveedor: "Textiles Sur" } }))
    ).toEqual({ origen: "Textiles Sur", destino: "Almacén" });
  });

  it("un cambio mira el signo: entra de la clienta o sale hacia ella", () => {
    expect(partesOrigenDestino(movimiento({ motivo: "cambio", delta: 1, sububicacion: piso }))).toEqual({ origen: "Clienta", destino: "Piso" });
    expect(partesOrigenDestino(movimiento({ tipo: "salida", categoria: "salida", motivo: "cambio", delta: -1, sububicacion: piso })))
      .toEqual({ origen: "Piso", destino: "Clienta" });
  });

  it("interno y transferencia usan sus dos puntas reales; un ajuste no tiene destino", () => {
    expect(
      partesOrigenDestino(movimiento({ tipo: "traslado", categoria: "interno", motivo: "movimiento_interno", delta: 0, sububicacion: almacen, sububicacionDestino: piso }))
    ).toEqual({ origen: "Almacén", destino: "Piso" });
    expect(
      partesOrigenDestino(movimiento({ tipo: "salida", categoria: "transferencia", motivo: "traslado_salida", delta: -4, ubicacionDestino: "Tienda Trujillo" }))
    ).toEqual({ origen: "Tienda Lima", destino: "Tienda Trujillo" });
    expect(partesOrigenDestino(movimiento({ tipo: "ajuste", categoria: "ajuste", motivo: "merma", delta: -1, sububicacion: piso })))
      .toEqual({ origen: "Piso", destino: null });
  });

  it("sin sububicación (Taller) el origen es la ubicación misma", () => {
    expect(partesOrigenDestino(movimiento({ motivo: "produccion", ubicacion: "Taller" }))).toEqual({ origen: "Producción", destino: "Taller" });
  });
});
