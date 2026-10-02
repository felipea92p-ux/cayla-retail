import { describe, it, expect } from "vitest";
import { agruparPorOperacion, ETIQUETA_PROCESO, type Movimiento, type OperacionMovimiento } from "./movimientos-reglas";
import { construirDetalleBajadas, construirDetalleCajon, formaDeOperacion, fraseDeAjuste, fraseDeMovimiento, vistaDeOperacion, type ContextoCajon } from "./movimientos-cajon";

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
  prendas: { v1: { productoId: "p1", fotoUrl: "https://cdn/foto.jpg" }, v2: { productoId: "p2", fotoUrl: null }, v3: { productoId: "p1", fotoUrl: null } },
  saldos: { m1: 5 },
  apartados: {},
  enlaceVentas: true,
  enlaceCompras: true,
  modulosVisibles: ["apartados"],
  hoyLima: "2026-09-28",
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

describe("fraseDeMovimiento — la frase grande de cada movimiento, en palabras de tienda", () => {
  const fila = (parcial: Partial<Movimiento>) => movimiento(parcial);

  it("una venta, una devolución y una anulación dicen qué le pasó a la prenda", () => {
    expect(fraseDeMovimiento(fila({ motivo: "venta", delta: -1 }), 1)).toBe("prenda vendida");
    expect(fraseDeMovimiento(fila({ motivo: "venta", delta: -3 }), 3)).toBe("prendas vendidas");
    expect(fraseDeMovimiento(fila({ motivo: "devolucion", delta: 1 }), 1)).toBe("prenda devuelta por un cliente");
    expect(fraseDeMovimiento(fila({ motivo: "anulacion_venta", delta: 1 }), 2)).toBe("prendas volvieron a la tienda: se anuló la venta");
  });

  it("un traslado dice de dónde llegó o hacia dónde salió, con el nombre de la otra tienda", () => {
    const recibido = fila({ categoria: "transferencia", motivo: "traslado_entrada", delta: 6, ubicacion: "Tienda Lima", ubicacionDestino: "Tienda Trujillo" });
    expect(fraseDeMovimiento(recibido, 6)).toBe("prendas llegaron desde Tienda Lima");
    expect(fraseDeMovimiento(recibido, 1)).toBe("prenda llegó desde Tienda Lima");
    const enviado = fila({ categoria: "transferencia", motivo: "traslado_salida", delta: -2, ubicacion: "Tienda Trujillo", ubicacionDestino: "Tienda Lima" });
    expect(fraseDeMovimiento(enviado, 2)).toBe("prendas salieron hacia Tienda Lima");
    expect(fraseDeMovimiento(fila({ categoria: "transferencia", motivo: "traslado_anulado", delta: 2 }), 2)).toBe("prendas volvieron a la tienda: se anuló el envío");
  });

  it("una recepción dice el proveedor si lo hay, y «un proveedor» si no", () => {
    const lote = (proveedor: string | null) => fila({ motivo: "recepcion", delta: 4, lote: { id: "l1", guia: null, nota: null, proveedor } });
    expect(fraseDeMovimiento(lote("Textiles Andinos"), 4)).toBe("prendas llegaron de Textiles Andinos");
    expect(fraseDeMovimiento(lote(null), 4)).toBe("prendas llegaron de un proveedor");
  });

  it("apartar no suma ni resta: dice que la prenda quedó apartada o libre", () => {
    expect(fraseDeMovimiento(fila({ categoria: "apartado", motivo: "apartado", delta: 0, cantidad: 1 }), 1)).toBe("prenda apartada para un cliente");
    expect(fraseDeMovimiento(fila({ categoria: "liberacion_apartado", motivo: "liberacion_apartado", delta: 0, cantidad: 2 }), 2)).toBe("prendas liberadas: vuelven a estar a la venta");
  });

  it("TODO proceso que existe tiene una frase, entre sumar y restar, en singular y en plural", () => {
    for (const motivo of Object.keys(ETIQUETA_PROCESO)) {
      for (const delta of [1, -1]) {
        for (const n of [1, 3]) {
          const frase = fraseDeMovimiento(fila({ motivo, delta: delta * n, cantidad: delta * n }), n);
          expect(frase, `${motivo} ${delta} ${n}`).toMatch(/^prendas? /);
          expect(frase).not.toMatch(/undefined|null|\{|_/);
        }
      }
    }
  });

  it("un motivo que no conocemos no rompe: dice al menos hacia dónde fue el stock", () => {
    expect(fraseDeMovimiento(fila({ motivo: "algo_nuevo", delta: 2 }), 2)).toBe("prendas entraron a la tienda");
    expect(fraseDeMovimiento(fila({ motivo: null, delta: -1 }), 1)).toBe("prenda salió de la tienda");
  });
});

describe("fraseDeAjuste", () => {
  it("dice más o menos y DÓNDE (el piso o el almacén), sin signos; sin lugar, «en la tienda»", () => {
    expect(fraseDeAjuste(1, "el almacén")).toBe("prenda más en el almacén");
    expect(fraseDeAjuste(-5, "el piso")).toBe("prendas menos en el piso");
    expect(fraseDeAjuste(-1)).toBe("prenda menos en la tienda");
  });
});

describe("construirDetalleCajon — Venta (individual)", () => {
  const venta = { id: "v1", nota: null, comprobante: { tipo: "boleta" as const, numero: "B001-000001", estado: "aceptado" as const } };
  const op = operacion([movimiento({ id: "m1", categoria: "salida", motivo: "venta", delta: -1, cantidad: -1, venta })]);
  const d = construirDetalleCajon(op, CTX_BASE);

  it("se llama como el movimiento, dice cuándo, y muestra la prenda con su foto real", () => {
    expect(d.forma).toBe("individual");
    expect(d.titulo).toBe("Venta");
    expect(d.cuando).toBe("Hoy, a las 10:59");
    expect(d.prenda).toEqual({ referencia: "Blusa Emma", variante: "M · Negro", fotoUrl: "https://cdn/foto.jpg" });
  });

  it("la frase lleva el número grande y dice qué pasó; abajo dice quién", () => {
    expect([d.cifra, d.frase]).toEqual(["1", "prenda vendida"]);
    expect(d.quien).toBe("Felipe Alvarez");
  });

  it("dice lo que había y lo que hay en la tienda, derivado del saldo real — nunca inventa un número", () => {
    // quedan 5 tras esta venta de −1: antes tenía que haber 6.
    expect(d.enTienda).toEqual({ antes: 6, despues: 5 });
    expect(construirDetalleCajon(op, { ...CTX_BASE, saldos: null }).enTienda).toBeNull();
  });

  it("el documento es la boleta y, si quien mira ve Historial de ventas, la abre en el modal existente", () => {
    expect(d.consultar[0]).toEqual({ clave: "documento", texto: "Boleta B001-000001", detalle: null, onClick: "abrir_venta" });
    // Sin el módulo, la línea dice cuál es la boleta pero no se abre.
    const sinPermiso = construirDetalleCajon(op, { ...CTX_BASE, enlaceVentas: false });
    expect(sinPermiso.consultar[0]).toEqual({ clave: "documento", texto: "Boleta B001-000001", detalle: null });
  });

  it("ofrece el historial de la prenda; una carga de sistema no inventa quién la hizo", () => {
    expect(d.consultar.find((c) => c.clave === "historial")).toEqual({ clave: "historial", texto: "Historial de esta prenda", href: "/productos/p1/historial" });
    expect(construirDetalleCajon(operacion([movimiento({ esSistema: true, usuario: null })]), CTX_BASE).quien).toBeNull();
  });

  it("una venta de otro día dice «Ayer» o la fecha, no solo la hora", () => {
    expect(construirDetalleCajon(op, { ...CTX_BASE, hoyLima: "2026-09-29" }).cuando).toBe("Ayer, a las 10:59");
    expect(construirDetalleCajon(op, { ...CTX_BASE, hoyLima: "2026-10-05" }).cuando).toMatch(/^Lunes,? 28 de (septiembre|setiembre), a las 10:59$/);
  });
});

describe("construirDetalleCajon — Traslado recibido (grupo)", () => {
  const traslado = { id: "t1", estado: "completado", nota: null, numero: 1 };
  const fila = (id: string, varianteId: string, referencia: string) =>
    movimiento({ id, varianteId, referencia, categoria: "transferencia", motivo: "traslado_entrada", delta: 6, cantidad: 6, ubicacion: "Tienda Lima", ubicacionDestino: "Tienda Trujillo", transferencia: traslado });
  const d = construirDetalleCajon(operacion([fila("a", "v1", "Vestido Sofía"), fila("b", "v2", "Falda Renata")]), CTX_BASE);

  it("se llama «Traslado recibido» y dice en una frase cuántas llegaron y de dónde", () => {
    expect(d.forma).toBe("grupo");
    expect(d.titulo).toBe("Traslado recibido");
    expect([d.cifra, d.frase]).toEqual(["12", "prendas llegaron desde Tienda Lima"]);
  });

  it("lista cada prenda con cuántas, y no dice «antes/después» (no hay un número honesto para varias)", () => {
    expect(d.items).toEqual([
      expect.objectContaining({ referencia: "Vestido Sofía", cantidad: "6 prendas" }),
      expect.objectContaining({ referencia: "Falda Renata", cantidad: "6 prendas" }),
    ]);
    expect(d.enTienda).toBeNull();
  });

  it("el documento lleva al traslado real; con productos distintos no hay historial (llevaría al de uno solo)", () => {
    expect(d.consultar).toEqual([{ clave: "documento", texto: "Traslado 1", detalle: null, href: "/inventario/traslados/t1" }]);
  });

  it("si todas son del mismo producto, el historial es de ese producto", () => {
    const mismo = construirDetalleCajon(operacion([fila("a", "v1", "Vestido Sofía"), fila("b", "v3", "Vestido Sofía")]), CTX_BASE);
    expect(mismo.consultar.find((c) => c.clave === "historial")).toEqual(expect.objectContaining({ texto: "Historial de estas prendas", href: "/productos/p1/historial" }));
  });
});

describe("construirDetalleCajon — Ajuste", () => {
  const conteo = { id: "c1", sistema: 6, contado: 5, numero: 24 };
  const op = operacion([movimiento({ id: "m1", categoria: "ajuste", motivo: "conteo", delta: -1, cantidad: -1, conteo })]);
  const d = construirDetalleCajon(op, CTX_BASE);

  it("un ajuste por conteo dice cuántas prendas menos hay en el stock, con la prenda y el motivo", () => {
    expect(d.titulo).toBe("Ajuste por conteo");
    expect([d.cifra, d.frase]).toEqual(["1", "prenda menos en la tienda"]);
    expect(d.prenda).toEqual(expect.objectContaining({ referencia: "Blusa Emma" }));
    expect(d.motivo).toBe("Diferencia detectada en conteo físico");
    expect(d.enTienda).toEqual({ antes: 6, despues: 5 });
    expect(d.consultar[0]).toEqual(expect.objectContaining({ texto: "Conteo 24", href: "/inventario/conteo/c1" }));
  });

  it("un ajuste manual (sin conteo) usa su propia nota, no inventa «conteo físico»", () => {
    const manual = construirDetalleCajon(operacion([movimiento({ categoria: "ajuste", motivo: "merma", delta: -1, cantidad: -1, nota: "Prenda con mancha irreversible" })]), CTX_BASE);
    expect(manual.titulo).not.toBe("Ajuste por conteo");
    expect(manual.motivo).toBe("Prenda con mancha irreversible");
    expect(manual.consultar.some((c) => c.clave === "documento")).toBe(false);
  });

  it("un conteo de varias prendas las lista TODAS, cada una con cuánto más o menos (antes solo se veía la primera)", () => {
    const filas = [
      movimiento({ id: "a", varianteId: "v1", referencia: "Casaca Luciana", categoria: "ajuste", motivo: "conteo", delta: 1, cantidad: 1, conteo }),
      movimiento({ id: "b", varianteId: "v2", referencia: "Blusa Emma", categoria: "ajuste", motivo: "conteo", delta: -5, cantidad: -5, conteo }),
    ];
    const multi = construirDetalleCajon(operacion(filas), CTX_BASE);
    expect([multi.cifra, multi.frase]).toEqual(["2", "prendas se corrigieron"]);
    expect(multi.prenda).toBeNull();
    expect(multi.enTienda).toBeNull();
    expect(multi.items).toEqual([
      expect.objectContaining({ referencia: "Casaca Luciana", cantidad: "1 más", tono: "verde" }),
      expect.objectContaining({ referencia: "Blusa Emma", cantidad: "5 menos", tono: "rojo" }),
    ]);
  });
});

describe("construirDetalleCajon — Dónde pasó (piso o almacén)", () => {
  const piso = { id: "sp", nombre: "Piso de venta", tipo: "piso_venta" };
  const almacen = { id: "sa", nombre: "Almacén", tipo: "almacen_tienda" };

  it("un ajuste dice en qué parte se hizo, en la frase y en la línea «Dónde» (el «había/ahora hay» es de toda la tienda)", () => {
    const enAlmacen = construirDetalleCajon(operacion([movimiento({ id: "m1", categoria: "ajuste", motivo: "conteo_fisico", delta: 1, cantidad: 1, sububicacion: almacen })]), CTX_BASE);
    expect(enAlmacen.frase).toBe("prenda más en el almacén");
    expect(enAlmacen.donde).toBe("Almacén");
    const enPiso = construirDetalleCajon(operacion([movimiento({ id: "m1", categoria: "ajuste", motivo: "merma", delta: -2, cantidad: 2, sububicacion: piso })]), CTX_BASE);
    expect(enPiso.frase).toBe("prendas menos en el piso");
    expect(enPiso.donde).toBe("Piso de venta");
  });

  it("una venta dice de dónde salió y un traslado recibido, dónde llegó", () => {
    expect(construirDetalleCajon(operacion([movimiento({ categoria: "salida", motivo: "venta", delta: -1, cantidad: -1, sububicacion: piso })]), CTX_BASE).donde).toBe("Piso de venta");
    expect(construirDetalleCajon(operacion([movimiento({ categoria: "transferencia", motivo: "traslado_entrada", delta: 3, cantidad: 3, sububicacion: almacen })]), CTX_BASE).donde).toBe("Almacén");
  });

  it("otra sububicación va con su nombre, varias lugares los dice todos, y sin lugar la línea se omite", () => {
    expect(construirDetalleCajon(operacion([movimiento({ sububicacion: { id: "sc", nombre: "Cuarentena", tipo: "cuarentena" } })]), CTX_BASE).donde).toBe("Cuarentena");
    const dos = construirDetalleCajon(operacion([movimiento({ id: "a", varianteId: "v1", sububicacion: piso }), movimiento({ id: "b", varianteId: "v2", sububicacion: almacen })]), CTX_BASE);
    expect(dos.donde).toBe("Piso de venta y Almacén");
    expect(construirDetalleCajon(operacion([movimiento({ sububicacion: null })]), CTX_BASE).donde).toBeNull();
  });
});

describe("construirDetalleCajon — Cambio", () => {
  const op = operacion([
    movimiento({ id: "a", varianteId: "v1", referencia: "Blusa Emma", talla: "M", color: "Negro", motivo: "cambio", categoria: "salida", delta: -1, cantidad: -1 }),
    movimiento({ id: "b", varianteId: "v2", referencia: "Blusa Emma", talla: "M", color: "Beige", motivo: "cambio", categoria: "entrada", delta: 1, cantidad: 1 }),
  ]);
  const d = construirDetalleCajon(op, CTX_BASE);

  it("dice lo que la clienta devolvió y lo que se llevó, sin «sale/entra» (que suena a stock)", () => {
    expect(d.devolvio).toEqual([expect.objectContaining({ varianteId: "v2", variante: "M · Beige", cantidad: "1 prenda" })]);
    expect(d.llevo).toEqual([expect.objectContaining({ varianteId: "v1", variante: "M · Negro", cantidad: "1 prenda" })]);
  });

  it("la frase dice que una prenda se cambió por otra; con cantidades distintas lo dice con números", () => {
    expect([d.cifra, d.frase]).toEqual(["1", "prenda cambiada por otra"]);
    const dos = operacion([
      movimiento({ id: "a", varianteId: "v1", motivo: "cambio", categoria: "salida", delta: -1, cantidad: -1 }),
      movimiento({ id: "b", varianteId: "v2", motivo: "cambio", categoria: "entrada", delta: 2, cantidad: 2 }),
    ]);
    expect([construirDetalleCajon(dos, CTX_BASE).cifra, construirDetalleCajon(dos, CTX_BASE).frase]).toEqual(["2", "prendas devueltas por 1 prenda"]);
  });
});

describe("construirDetalleCajon — Apartado (individual que no cambia el stock)", () => {
  const apartada = movimiento({ id: "m1", categoria: "apartado", motivo: "apartado", delta: 0, cantidad: 1 });
  const ctx: ContextoCajon = { ...CTX_BASE, apartados: { m1: { codigo: "AP-0001", clienta: "María Pérez", separacionId: "s1" } as ContextoCajon["apartados"][string] } };

  it("dice que quedó apartada, sin «había/ahora hay» (apartar no cambia el total), y el apartado abre si el rol lo ve", () => {
    const d = construirDetalleCajon(operacion([apartada]), ctx);
    expect([d.cifra, d.frase]).toEqual(["1", "prenda apartada para un cliente"]);
    expect(d.enTienda).toBeNull();
    expect(d.consultar[0]).toEqual({ clave: "documento", texto: "Apartado AP-0001", detalle: "María Pérez", href: "/vender/apartados?abrir=s1" });
    expect(construirDetalleCajon(operacion([apartada]), { ...ctx, modulosVisibles: [] }).consultar[0].href).toBeUndefined();
  });
});

describe("vistaDeOperacion — un movimiento interno se lee con el cajón de las bajadas", () => {
  const interna = (parcial: Partial<Movimiento> = {}) =>
    movimiento({
      categoria: "interno",
      motivo: "movimiento_interno",
      tipo: "traslado",
      delta: 0,
      cantidad: 3,
      sububicacion: { id: "sa", nombre: "Almacén", tipo: "almacen_tienda" },
      sububicacionDestino: { id: "sp", nombre: "Piso de venta", tipo: "piso_venta" },
      ...parcial,
    });

  it("una bajada suelta se llama «Bajada al piso» (en singular), dice cuántas pasaron, y no repite la hora en cada fila", () => {
    const v = vistaDeOperacion(operacion([interna()]), CTX_BASE);
    expect(v.tipo).toBe("bajadas");
    if (v.tipo !== "bajadas") return;
    expect(v.detalle).toMatchObject({ titulo: "Bajada al piso", cuando: "Hoy, a las 10:59", cifra: "3", frase: "prendas pasaron del almacén al piso de venta", mostrarHora: false });
  });

  it("el mismo par al revés es «Retiro del piso» y dice que volvieron al almacén", () => {
    const v = vistaDeOperacion(operacion([interna({ sububicacion: { id: "sp", nombre: "Piso de venta", tipo: "piso_venta" }, sububicacionDestino: { id: "sa", nombre: "Almacén", tipo: "almacen_tienda" } })]), CTX_BASE);
    if (v.tipo !== "bajadas") throw new Error("esperaba bajadas");
    expect(v.detalle).toMatchObject({ titulo: "Retiro del piso", frase: "prendas volvieron del piso al almacén" });
    expect(v.detalle.filas[0].sentido).toBeNull();
  });

  it("cualquier otra operación se lee con el cajón de una operación", () => {
    expect(vistaDeOperacion(operacion([movimiento({})]), CTX_BASE).tipo).toBe("operacion");
  });
});

describe("construirDetalleBajadas (el cajón de las bajadas del día)", () => {
  const bajada = (id: string, hora: string, varianteId: string, parcial: Partial<Movimiento> = {}) =>
    movimiento({
      id,
      hora,
      creadoEn: `2026-09-28T${hora}:00+00:00`,
      varianteId,
      tipo: "traslado",
      categoria: "interno",
      motivo: "movimiento_interno",
      cantidad: 1,
      delta: 0,
      sububicacion: { id: "sa", nombre: "Almacén", tipo: "almacen_tienda" },
      sububicacionDestino: { id: "sp", nombre: "Piso de venta", tipo: "piso_venta" },
      ...parcial,
    });
  const ops = (filas: Movimiento[]) => agruparPorOperacion(filas);

  it("dice en una frase qué pasó, cuándo y cuántas, con la más reciente primero", () => {
    const d = construirDetalleBajadas("bajadas-2026-09-28", ops([bajada("b1", "10:41", "v1"), bajada("b2", "10:30", "v2", { cantidad: 2 }), bajada("b3", "10:04", "v1")]), CTX_BASE);
    expect(d.titulo).toBe("Bajadas al piso");
    expect(d.cuando).toBe("Hoy, de 10:04 a 10:41");
    expect(d.cifra).toBe("4");
    expect(d.frase).toBe("prendas pasaron del almacén al piso de venta");
    expect(d.mostrarHora).toBe(true);
    expect(d.filas.map((f) => [f.hora, f.cantidad])).toEqual([["10:41", "1 prenda"], ["10:30", "2 prendas"], ["10:04", "1 prenda"]]);
  });

  it("una fila por prenda, con su variante y su foto; sin dirección porque todas son bajadas", () => {
    const d = construirDetalleBajadas("b", ops([bajada("b1", "10:41", "v1"), bajada("b2", "10:30", "v2")]), CTX_BASE);
    expect(d.filas[0]).toMatchObject({ id: "b1", referencia: "Blusa Emma", variante: "M · Negro", fotoUrl: "https://cdn/foto.jpg", sentido: null });
    expect(d.filas[1]).toMatchObject({ fotoUrl: null, sentido: null });
  });

  it("una operación de varias prendas guardadas juntas da una fila por prenda, todas con su hora", () => {
    const d = construirDetalleBajadas("b", ops([bajada("b1", "10:41", "v1"), bajada("b2", "10:41", "v2"), bajada("b3", "10:04", "v1")]), CTX_BASE);
    expect(d.filas.map((f) => f.hora)).toEqual(["10:41", "10:41", "10:04"]);
    expect(d.cifra).toBe("3");
  });

  it("con todas a la misma hora, dice «a las»; de otro día, dice «Ayer»; con una sola prenda, en singular", () => {
    const d = construirDetalleBajadas("b", ops([bajada("b1", "10:41", "v1")]), { ...CTX_BASE, hoyLima: "2026-09-29" });
    expect(d.cuando).toBe("Ayer, a las 10:41");
    expect(d.cifra).toBe("1");
    expect(d.frase).toBe("prenda pasó del almacén al piso de venta");
  });

  it("si alguna no fue una bajada al piso, la frase y cada fila dicen hacia dónde fue", () => {
    const retiro = bajada("b2", "10:30", "v2", { sububicacion: { id: "sp", nombre: "Piso de venta", tipo: "piso_venta" }, sububicacionDestino: { id: "sa", nombre: "Almacén", tipo: "almacen_tienda" } });
    const d = construirDetalleBajadas("b", ops([bajada("b1", "10:41", "v1"), retiro]), CTX_BASE);
    expect(d.titulo).toBe("Movido dentro de la sede");
    expect(d.frase).toBe("prendas cambiaron de lugar dentro de la tienda");
    expect(d.filas.map((f) => f.sentido)).toEqual(["Almacén → Piso", "Piso → Almacén"]);
  });

  it("quién las hizo: los nombres distintos juntos con «y», y nada si todas son carga de sistema", () => {
    const dos = ops([bajada("b1", "10:41", "v1", { usuario: "Carla" }), bajada("b2", "10:30", "v2", { usuario: "Luis" }), bajada("b3", "10:04", "v1", { usuario: "Carla" })]);
    expect(construirDetalleBajadas("b", dos, CTX_BASE).quien).toBe("Carla y Luis");
    const tres = ops([bajada("b1", "10:41", "v1", { usuario: "Carla" }), bajada("b2", "10:30", "v2", { usuario: "Luis" }), bajada("b3", "10:04", "v1", { usuario: "Ana" })]);
    expect(construirDetalleBajadas("b", tres, CTX_BASE).quien).toBe("Carla, Luis y Ana");
    const sistema = ops([bajada("b1", "10:41", "v1", { esSistema: true, usuario: null }), bajada("b2", "10:30", "v2", { esSistema: true, usuario: null })]);
    expect(construirDetalleBajadas("b", sistema, CTX_BASE).quien).toBeNull();
  });
});
