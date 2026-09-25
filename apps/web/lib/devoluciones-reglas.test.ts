import { describe, it, expect } from "vitest";
import { primerBloqueo } from "./cambios-reglas";
import {
  condicionDeItem,
  esDevolucionTotal,
  estadoPlazoDevolucion,
  estadoPrendaDevolucion,
  etiquetaCondicion,
  impactoDevolucion,
  revisarAprobacion,
  textoMotivo,
  validarDevolucion,
  valorPagado,
  type PrendaParaValidar,
} from "./devoluciones-reglas";

function lima(anio: number, mes: number, dia: number, hora = 12): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 5));
}

describe("textoMotivo", () => {
  it("compone la etiqueta con el detalle; sin motivo elegido no hay texto", () => {
    expect(textoMotivo("defecto", "costura abierta")).toBe("Tiene un defecto — costura abierta");
    expect(textoMotivo("talla", "  ")).toBe("No era su talla");
    expect(textoMotivo(null, "lo que sea")).toBe("");
  });
});

describe("condicionDeItem / etiquetaCondicion", () => {
  it("impecable es vendible; dañada exige el destino y sin él no hay condición", () => {
    expect(condicionDeItem({ cantidad: 1, grupo: "vendible", destino: null })).toBe("vendible");
    expect(condicionDeItem({ cantidad: 1, grupo: "danada", destino: "danada_donar" })).toBe("danada_donar");
    expect(condicionDeItem({ cantidad: 1, grupo: "danada", destino: null })).toBeNull();
  });

  it("una condición desconocida se muestra tal cual, no se pierde", () => {
    expect(etiquetaCondicion("danada_reparacion")).toBe("Dañada · reparar");
    expect(etiquetaCondicion("otra_cosa")).toBe("otra_cosa");
  });
});

describe("estadoPrendaDevolucion", () => {
  const ahora = lima(2026, 9, 18);
  const base = {
    cantidad: 1,
    yaCambiado: 0,
    yaDevuelto: 0,
    devolucionesHechas: [] as { cantidad: number; estado: "pendiente" | "aprobada" }[],
    anulada: false,
    creadoEn: lima(2026, 9, 18).toISOString(),
  };

  it("recién vendida: dentro del plazo y se puede devolver", () => {
    expect(estadoPrendaDevolucion(base, ahora)).toMatchObject({ clave: "dentro_del_plazo", devolvible: true, tono: "verde" });
  });

  it("FUERA DE PLAZO NO BLOQUEA: se puede registrar (el líder decide), pero se ve en ROJO", () => {
    expect(estadoPrendaDevolucion({ ...base, creadoEn: lima(2026, 8, 1).toISOString() }, ahora)).toMatchObject({
      clave: "fuera_de_plazo",
      devolvible: true,
      tono: "rojo",
      icono: "alerta",
    });
  });

  it("a punto de vencer: sigue VERDE (está dentro) y dice los días que quedan", () => {
    expect(estadoPrendaDevolucion({ ...base, creadoEn: lima(2026, 9, 5).toISOString() }, ahora)).toMatchObject({ texto: "Vence en 2 días", tono: "verde" });
    expect(estadoPrendaDevolucion({ ...base, creadoEn: lima(2026, 9, 3).toISOString() }, ahora).texto).toBe("Último día del plazo");
  });

  it("con una devolución pendiente que la agota: 'pendiente', no se vuelve a devolver", () => {
    const pendiente = { ...base, yaDevuelto: 1, devolucionesHechas: [{ cantidad: 1, estado: "pendiente" as const }] };
    expect(estadoPrendaDevolucion(pendiente, ahora)).toMatchObject({ clave: "pendiente", devolvible: false, tono: "ambar" });
  });

  it("devuelta y aprobada: 'ya devuelta'; cambiada entera: 'ya cambiada' — ninguna se puede devolver", () => {
    const aprobada = { ...base, yaDevuelto: 1, devolucionesHechas: [{ cantidad: 1, estado: "aprobada" as const }] };
    expect(estadoPrendaDevolucion(aprobada, ahora)).toMatchObject({ clave: "devuelta", devolvible: false, tono: "verde" });
    expect(estadoPrendaDevolucion({ ...base, yaCambiado: 1 }, ahora)).toMatchObject({ clave: "cambiada", devolvible: false });
  });

  it("2 unidades, 1 cambiada: todavía queda 1 por devolver (el hueco de la base, cubierto en pantalla)", () => {
    expect(estadoPrendaDevolucion({ ...base, cantidad: 2, yaCambiado: 1 }, ahora).devolvible).toBe(true);
    expect(estadoPrendaDevolucion({ ...base, cantidad: 2, yaCambiado: 1, yaDevuelto: 1 }, ahora).devolvible).toBe(false);
  });

  it("una venta anulada no se devuelve", () => {
    expect(estadoPrendaDevolucion({ ...base, anulada: true }, ahora)).toMatchObject({ clave: "anulada", devolvible: false });
  });
});

describe("estadoPlazoDevolucion (el chip de plazo de la VENTA, sin mirar cada línea)", () => {
  const ahora = lima(2026, 9, 18);

  it("mismo resultado que el tramo de plazo de estadoPrendaDevolucion — es la misma cuenta, extraída", () => {
    expect(estadoPlazoDevolucion(lima(2026, 9, 18).toISOString(), ahora)).toMatchObject({ clave: "dentro_del_plazo", tono: "verde" });
    expect(estadoPlazoDevolucion(lima(2026, 8, 1).toISOString(), ahora)).toMatchObject({ clave: "fuera_de_plazo", tono: "rojo", icono: "alerta" });
    expect(estadoPlazoDevolucion(lima(2026, 9, 3).toISOString(), ahora).texto).toBe("Último día del plazo");
  });
});

describe("valorPagado / esDevolucionTotal", () => {
  it("descuenta lo que se le rebajó a la clienta y redondea a centavos", () => {
    expect(valorPagado({ precioUnitario: 79.9, descuentoUnitario: 7.99 }, 2)).toBe(143.82);
    expect(valorPagado({ precioUnitario: 99.9, descuentoUnitario: 0 }, 1)).toBe(99.9);
  });

  it("es total solo si cubre cada línea completa, como decide aprobar_devolucion (06 vs 07)", () => {
    const lineas = [
      { ventaItemId: "a", cantidad: 1 },
      { ventaItemId: "b", cantidad: 2 },
    ];
    expect(esDevolucionTotal(lineas, { a: 1, b: 2 })).toBe(true);
    expect(esDevolucionTotal(lineas, { a: 1, b: 1 })).toBe(false);
    expect(esDevolucionTotal(lineas, { a: 1 })).toBe(false);
  });
});

describe("validarDevolucion / primerBloqueo", () => {
  const ahora = lima(2026, 9, 18);
  const prenda = (over: Partial<PrendaParaValidar> = {}): PrendaParaValidar => ({
    referencia: "Blusa Emma",
    disponible: 1,
    item: { cantidad: 1, grupo: "vendible", destino: null },
    ...over,
  });
  const listo = {
    venta: { comprobante: "Boleta B001-000010", creadoEn: lima(2026, 9, 18, 11).toISOString(), anulada: false },
    ahora,
    elegidas: [prenda()],
    motivo: "talla" as const,
    detalle: "",
  };

  it("todo en orden: nada frena", () => {
    const validaciones = validarDevolucion(listo);
    expect(validaciones.map((v) => v.clave)).toEqual(["compra", "plazo", "prendas", "motivo", "estado"]);
    expect(primerBloqueo(validaciones)).toBeNull();
  });

  it("sin prendas o sin motivo frena, en ese orden", () => {
    expect(primerBloqueo(validarDevolucion({ ...listo, elegidas: [], motivo: null }))).toMatchObject({ clave: "prendas", estado: "pendiente" });
    expect(primerBloqueo(validarDevolucion({ ...listo, motivo: null }))).toMatchObject({ clave: "motivo" });
  });

  it("'otro motivo' sin contar cuál frena; con detalle pasa", () => {
    expect(primerBloqueo(validarDevolucion({ ...listo, motivo: "otro" }))).toMatchObject({ clave: "motivo", titulo: "Cuenta cuál es el otro motivo" });
    expect(primerBloqueo(validarDevolucion({ ...listo, motivo: "otro", detalle: "regalo repetido" }))).toBeNull();
  });

  it("FUERA DE PLAZO es un aviso: se ve, dice hace cuántos días, y no frena", () => {
    const vieja = { ...listo, venta: { ...listo.venta, creadoEn: lima(2026, 8, 28).toISOString() } };
    const validaciones = validarDevolucion(vieja);
    expect(validaciones.find((v) => v.clave === "plazo")).toMatchObject({ estado: "aviso", titulo: "Fuera del plazo" });
    expect(validaciones.find((v) => v.clave === "plazo")?.detalle).toContain("hace 21 días");
    expect(primerBloqueo(validaciones)).toBeNull();
  });

  it("una prenda dañada sin decir qué se hará con ella frena", () => {
    const sinDestino = { ...listo, elegidas: [prenda({ item: { cantidad: 1, grupo: "danada", destino: null } })] };
    expect(primerBloqueo(validarDevolucion(sinDestino))).toMatchObject({ clave: "estado", titulo: "Falta decir qué se hará con Blusa Emma" });
  });

  it("una cantidad mayor a lo que queda frena", () => {
    const demasiadas = { ...listo, elegidas: [prenda({ disponible: 1, item: { cantidad: 2, grupo: "vendible", destino: null } })] };
    expect(primerBloqueo(validarDevolucion(demasiadas))).toMatchObject({ clave: "prendas", estado: "alerta" });
  });

  it("'defecto' con una prenda que vuelve al piso avisa, pero no frena", () => {
    const validaciones = validarDevolucion({ ...listo, motivo: "defecto" });
    expect(validaciones.find((v) => v.clave === "coherencia")).toMatchObject({ estado: "aviso" });
    expect(primerBloqueo(validaciones)).toBeNull();
  });

  it("una venta anulada frena", () => {
    expect(primerBloqueo(validarDevolucion({ ...listo, venta: { ...listo.venta, anulada: true } }))).toMatchObject({ clave: "compra", estado: "alerta" });
  });
});

describe("impactoDevolucion", () => {
  const base = {
    prendas: [
      { prenda: "Blusa Emma · Negro · Talla M", cantidad: 1, condicion: "vendible" as const },
      { prenda: "Falda Renata · Beige · Talla M", cantidad: 2, condicion: "danada_donar" as const },
    ],
    sede: "Tienda Lima",
    valorPagado: 250,
    comprobanteAceptado: false,
    esTotal: false,
  };

  it("promete solo lo que pasa AL APROBAR: al piso o a cuarentena, según cada prenda", () => {
    const { inventario } = impactoDevolucion(base);
    expect(inventario).toEqual([
      { signo: "+", cantidad: 1, prenda: "Blusa Emma · Negro · Talla M", donde: "volverá al piso de Tienda Lima al aprobarla" },
      { signo: "+", cantidad: 2, prenda: "Falda Renata · Beige · Talla M", donde: "entrará a cuarentena en Tienda Lima al aprobarla" },
    ]);
  });

  it("registrar no mueve la caja, y dice cuánto pagó la clienta", () => {
    expect(impactoDevolucion(base).caja.titulo).toBe("Al registrarla, la caja no se mueve");
    expect(impactoDevolucion(base).caja.detalle).toContain("S/ 250.00");
  });

  it("solo con un comprobante aceptado por SUNAT anuncia la nota de crédito, total o parcial", () => {
    expect(impactoDevolucion(base).documento).toBeUndefined();
    expect(impactoDevolucion({ ...base, comprobanteAceptado: true }).documento?.titulo).toBe("Nota de crédito por devolución parcial");
    expect(impactoDevolucion({ ...base, comprobanteAceptado: true, esTotal: true }).documento?.titulo).toBe("Nota de crédito por devolución total");
  });
});

describe("revisarAprobacion", () => {
  const base = { monto: 50, metodo: "efectivo", cajaAbierta: true, valorPagado: 79.9 };

  it("sin reembolso, o con reembolso dentro de lo pagado: sin nada que decir", () => {
    expect(revisarAprobacion({ ...base, monto: null })).toEqual({ bloqueo: null, aviso: null });
    expect(revisarAprobacion(base)).toEqual({ bloqueo: null, aviso: null });
  });

  it("efectivo con la caja cerrada frena (aprobar_devolucion lo rechazaría); con otro método no", () => {
    expect(revisarAprobacion({ ...base, cajaAbierta: false }).bloqueo).toContain("La caja está cerrada");
    expect(revisarAprobacion({ ...base, cajaAbierta: false, metodo: "yape" }).bloqueo).toBeNull();
    expect(revisarAprobacion({ ...base, cajaAbierta: false, monto: 0 }).bloqueo).toBeNull();
  });

  it("reembolsar más de lo que pagó avisa pero no frena; un monto negativo sí frena", () => {
    expect(revisarAprobacion({ ...base, monto: 100 })).toEqual({ bloqueo: null, aviso: "Es más de lo que pagó la clienta (S/ 79.90)." });
    expect(revisarAprobacion({ ...base, monto: -5 }).bloqueo).toBe("El monto del reembolso no puede ser negativo.");
  });
});
