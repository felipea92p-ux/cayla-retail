import { describe, it, expect } from "vitest";
import { agruparPorOperacion, type Movimiento, type OperacionMovimiento } from "./movimientos-reglas";
import { construirDetalleCajon, formaDeOperacion, type ContextoCajon } from "./movimientos-cajon";

function movimiento(parcial: Partial<Movimiento>): Movimiento {
  return {
    id: "m1",
    creadoEn: "2026-09-28T10:59:00.000000+00:00",
    fecha: "2026-09-28",
    hora: "10:59",
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

const CTX_BASE: ContextoCajon = {
  prendas: { v1: { productoId: "p1", fotoUrl: "https://cdn/foto.jpg" }, v2: { productoId: "p2", fotoUrl: null } },
  saldos: { m1: 5 },
  apartados: {},
  enlaceVentas: true,
  enlaceCompras: true,
  modulosVisibles: ["apartados"],
  volverA: "/inventario/movimientos",
};

function operacion(filas: Movimiento[]): OperacionMovimiento {
  return agruparPorOperacion(filas)[0];
}

describe("formaDeOperacion", () => {
  it("un cambio (entra + sale en la misma operación) es «cambio», sin importar cuántas filas", () => {
    const op = operacion([
      movimiento({ id: "a", motivo: "cambio", categoria: "entrada", delta: 1, cantidad: 1, varianteId: "v2" }),
      movimiento({ id: "b", motivo: "cambio", categoria: "salida", delta: -1, cantidad: -1, varianteId: "v1" }),
    ]);
    expect(formaDeOperacion(op)).toBe("cambio");
  });

  it("una operación interna (piso ↔ almacén) es «interno» aunque tenga una sola fila", () => {
    const op = operacion([movimiento({ categoria: "interno", motivo: "movimiento_interno", delta: 0, cantidad: 3 })]);
    expect(formaDeOperacion(op)).toBe("interno");
  });

  it("un ajuste es «ajuste» aunque tenga una sola fila", () => {
    const op = operacion([movimiento({ categoria: "ajuste", motivo: "conteo", delta: -1, cantidad: -1 })]);
    expect(formaDeOperacion(op)).toBe("ajuste");
  });

  it("una operación de más de una fila que no es cambio/interno/ajuste es «grupo»", () => {
    const op = operacion([
      movimiento({ id: "a", varianteId: "v1" }),
      movimiento({ id: "b", varianteId: "v2", creadoEn: movimiento({}).creadoEn }),
    ]);
    expect(formaDeOperacion(op)).toBe("grupo");
  });

  it("una operación de una sola fila que no es interno/ajuste/cambio es «individual»", () => {
    const op = operacion([movimiento({ categoria: "salida", motivo: "venta", delta: -1, cantidad: -1 })]);
    expect(formaDeOperacion(op)).toBe("individual");
  });
});

describe("construirDetalleCajon — Venta (individual)", () => {
  const op = operacion([movimiento({ id: "m1", categoria: "salida", motivo: "venta", delta: -1, cantidad: -1, venta: { id: "v1", nota: null, comprobante: { tipo: "boleta", numero: "B001-000001", estado: "aceptado" } } })]);
  const d = construirDetalleCajon(op, CTX_BASE);

  it("usa la forma individual, con la foto real de la prenda", () => {
    expect(d.forma).toBe("individual");
    expect(d.fotoUrl).toBe("https://cdn/foto.jpg");
    expect(d.titulo).toBe("Blusa Emma");
    expect(d.subtitulo).toBe("M · Negro");
  });

  it("deriva el stock antes/después del saldo real y del delta — nunca inventa un número", () => {
    // quedan 5 tras esta venta de −1: antes tenía que haber 6.
    expect(d.stock).toEqual({ antes: 6, despues: 5 });
  });

  it("sin saldo (la base no lo trajo), la sección de stock se omite en vez de inventar un antes", () => {
    const sinSaldo = construirDetalleCajon(op, { ...CTX_BASE, saldos: null });
    expect(sinSaldo.stock).toBeNull();
  });

  it("la referencia es la boleta, y Ver boleta abre el modal existente (no un href nuevo)", () => {
    expect(d.referencia?.texto).toBe("Boleta B001-000001");
    expect(d.consultar.find((c) => c.clave === "boleta")).toEqual({ clave: "boleta", texto: "Ver boleta", onClick: "abrir_venta", iconoFinal: "cursor" });
  });

  it("Realizado por sale del usuario real; una carga de sistema no inventa un rol", () => {
    expect(d.realizadoPor).toBe("Felipe Alvarez");
    const sistema = construirDetalleCajon(operacion([movimiento({ esSistema: true, usuario: null })]), CTX_BASE);
    expect(sistema.realizadoPor).toBeNull();
  });
});

describe("construirDetalleCajon — Traslado recibido (grupo)", () => {
  const filas = [
    movimiento({ id: "a", varianteId: "v1", referencia: "Vestido Sofía", categoria: "transferencia", delta: 6, cantidad: 6, transferencia: { id: "t1", estado: "completado", nota: null, numero: 1 } }),
    movimiento({ id: "b", varianteId: "v2", referencia: "Falda Renata", categoria: "transferencia", delta: 6, cantidad: 6, transferencia: { id: "t1", estado: "completado", nota: null, numero: 1 } }),
  ];
  const op = operacion(filas);
  const d = construirDetalleCajon(op, CTX_BASE);

  it("agrupa en «grupo», con la lista completa de prendas y el resumen de productos en el subtítulo", () => {
    expect(d.forma).toBe("grupo");
    expect(d.items).toHaveLength(2);
    expect(d.subtitulo).toBe("Vestido Sofía, Falda Renata");
  });

  it("la referencia lleva al traslado real (mismo href que ya usa la fila de la lista)", () => {
    expect(d.referencia).toEqual(expect.objectContaining({ texto: "Traslado 1", href: "/inventario/traslados/t1" }));
    expect(d.consultar.find((c) => c.clave === "traslado")).toEqual(expect.objectContaining({ href: "/inventario/traslados/t1" }));
  });

  it("una entrada simple no lleva nota de impacto en texto libre (el resumen ya lo dice en cifras)", () => {
    expect(d.notaImpacto).toBeNull();
  });
});

describe("construirDetalleCajon — Bajada al piso (interno)", () => {
  const op = operacion([
    movimiento({ id: "a", categoria: "interno", motivo: "movimiento_interno", delta: 0, cantidad: 3, sububicacion: { id: "s1", nombre: "Almacén", tipo: "almacen_tienda" }, sububicacionDestino: { id: "s2", nombre: "Piso", tipo: "piso_venta" } }),
  ]);
  const d = construirDetalleCajon(op, CTX_BASE);

  it("el título usa el par (Almacén→Piso = «Bajada al piso»), y no cambia el stock total", () => {
    expect(d.titulo).toBe("Bajada al piso");
    expect(d.notaDetalle).toBe("Movimiento interno, no cambia el total de stock de la sede.");
    expect(d.notaImpacto).toBe("Stock total de sede: sin cambios.");
    expect(d.stock).toBeNull();
  });

  it("el mismo par al revés dice «Retiro del piso»", () => {
    const vuelta = operacion([
      movimiento({ categoria: "interno", motivo: "movimiento_interno", delta: 0, cantidad: 1, sububicacion: { id: "s2", nombre: "Piso", tipo: "piso_venta" }, sububicacionDestino: { id: "s1", nombre: "Almacén", tipo: "almacen_tienda" } }),
    ]);
    expect(construirDetalleCajon(vuelta, CTX_BASE).titulo).toBe("Retiro del piso");
  });
});

describe("construirDetalleCajon — Ajuste por conteo", () => {
  const op = operacion([movimiento({ id: "m1", categoria: "ajuste", motivo: "conteo", delta: -1, cantidad: -1, conteo: { id: "c1", sistema: 6, contado: 5, numero: 24 } })]);
  const d = construirDetalleCajon(op, CTX_BASE);

  it("distingue un ajuste POR CONTEO de uno manual, y arma el motivo correcto", () => {
    expect(d.titulo).toBe("Ajuste por conteo");
    expect(d.motivo).toBe("Diferencia detectada en conteo físico");
    expect(d.referencia).toEqual(expect.objectContaining({ texto: "Conteo 24", href: "/inventario/conteo/c1" }));
  });

  it("un ajuste manual (sin conteo) usa su propia nota, no inventa «conteo físico»", () => {
    const manual = construirDetalleCajon(operacion([movimiento({ categoria: "ajuste", motivo: "merma", delta: -1, cantidad: -1, nota: "Prenda con mancha irreversible" })]), CTX_BASE);
    expect(manual.titulo).not.toBe("Ajuste por conteo");
    expect(manual.motivo).toBe("Prenda con mancha irreversible");
    expect(manual.referencia).toBeNull();
  });
});

describe("construirDetalleCajon — Cambio", () => {
  const op = operacion([
    movimiento({ id: "a", varianteId: "v1", referencia: "Blusa Emma", talla: "M", color: "Negro", motivo: "cambio", categoria: "salida", delta: -1, cantidad: -1 }),
    movimiento({ id: "b", varianteId: "v2", referencia: "Blusa Emma", talla: "M", color: "Beige", motivo: "cambio", categoria: "entrada", delta: 1, cantidad: 1 }),
  ]);
  const d = construirDetalleCajon(op, CTX_BASE);

  it("separa lo que sale de lo que entra, cada una coloreada (rojo sale, verde entra)", () => {
    expect(d.sale).toEqual([expect.objectContaining({ varianteId: "v1", cifra: "−1", tono: "rojo" })]);
    expect(d.entra).toEqual([expect.objectContaining({ varianteId: "v2", cifra: "+1", tono: "verde" })]);
  });

  it("nunca dice que se perdió stock: siempre el mensaje de intercambio en la misma sede", () => {
    expect(d.notaImpacto).toBe("Intercambio registrado en la misma sede.");
  });

  it("el resumen «Movimiento» combina entra y sale en una sola cifra neutra", () => {
    expect(d.resumen[0]).toEqual({ valor: "+1 / −1", etiqueta: "Movimiento" });
  });
});
