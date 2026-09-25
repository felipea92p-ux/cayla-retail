import { describe, it, expect } from "vitest";
import {
  actividadPreviaVenta,
  agruparPorCompra,
  agruparPorDia,
  clasificarBusqueda,
  condicionForzada,
  descripcionEntregada,
  DIAS_PLAZO_CAMBIO,
  estadoPlazoCambio,
  estadoPlazoVenta,
  estadoPrendaVendida,
  etiquetaDia,
  fechaLimiteCambio,
  impactoCambio,
  primerBloqueo,
  tallasQueNoCalzan,
  totalesVenta,
  unidadesDisponibles,
  validarCambio,
  type CambioParaTallas,
} from "./cambios-reglas";

function lima(anio: number, mes: number, dia: number, hora = 12): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 5));
}

describe("estadoPlazoCambio — R-38, 15 días", () => {
  const ahora = lima(2026, 9, 18);

  it("recién vendida: vigente con los 15 días completos", () => {
    expect(estadoPlazoCambio(lima(2026, 9, 18).toISOString(), ahora)).toEqual({ estado: "vigente", diasRestantes: DIAS_PLAZO_CAMBIO });
  });

  it("a 3 días de vencer, pasa a 'por vencer'", () => {
    // vendida hace 12 días → quedan 3
    expect(estadoPlazoCambio(lima(2026, 9, 6).toISOString(), ahora)).toEqual({ estado: "por_vencer", diasRestantes: 3 });
  });

  it("a 4 días de vencer, todavía vigente", () => {
    // vendida hace 11 días → quedan 4
    expect(estadoPlazoCambio(lima(2026, 9, 7).toISOString(), ahora)).toEqual({ estado: "vigente", diasRestantes: 4 });
  });

  it("el día 16 ya está fuera de plazo", () => {
    expect(estadoPlazoCambio(lima(2026, 9, 2).toISOString(), ahora)).toEqual({ estado: "fuera_de_plazo", diasRestantes: -1 });
  });
});

describe("fechaLimiteCambio", () => {
  it("es el día de la venta más 15, en hora de Lima", () => {
    expect(fechaLimiteCambio(lima(2026, 9, 18, 11).toISOString())).toBe("3 de octubre");
  });

  it("una venta de las 11pm de Lima cuenta desde ESE día, no desde el día UTC siguiente", () => {
    // 23:30 de Lima del 17 = 04:30 UTC del 18.
    expect(fechaLimiteCambio(lima(2026, 9, 17, 23).toISOString())).toBe("2 de octubre");
  });

  it("coincide con el último día que estadoPlazoCambio todavía acepta", () => {
    const vendida = lima(2026, 9, 18).toISOString();
    expect(estadoPlazoCambio(vendida, lima(2026, 10, 3)).estado).not.toBe("fuera_de_plazo");
    expect(estadoPlazoCambio(vendida, lima(2026, 10, 4)).estado).toBe("fuera_de_plazo");
  });
});

describe("etiquetaDia / agruparPorDia / agruparPorCompra", () => {
  const ahora = lima(2026, 9, 18, 20);

  it("hoy y ayer se leen como texto, el resto como fecha", () => {
    expect(etiquetaDia(lima(2026, 9, 18, 9).toISOString(), ahora)).toBe("Hoy");
    expect(etiquetaDia(lima(2026, 9, 17, 23).toISOString(), ahora)).toBe("Ayer");
    // Intl es-PE usa la forma peruana "setiembre", no "septiembre" — es el es-PE real,
    // no un error de tipeo.
    expect(etiquetaDia(lima(2026, 9, 15, 9).toISOString(), ahora)).toBe("15 de setiembre");
  });

  it("agrupa por día conservando el orden de llegada (hoy antes que ayer)", () => {
    const lineas = [
      { id: "a", creadoEn: lima(2026, 9, 18, 10).toISOString() },
      { id: "b", creadoEn: lima(2026, 9, 17, 10).toISOString() },
      { id: "c", creadoEn: lima(2026, 9, 18, 8).toISOString() },
    ];
    const grupos = agruparPorDia(lineas, ahora);
    expect(grupos.map((g) => g.etiqueta)).toEqual(["Hoy", "Ayer"]);
    expect(grupos[0]!.lineas.map((l) => l.id)).toEqual(["a", "c"]);
    expect(grupos[1]!.lineas.map((l) => l.id)).toEqual(["b"]);
  });

  it("las prendas de una misma boleta quedan juntas, en el orden en que llegaron", () => {
    const lineas = [
      { id: "blusa", ventaId: "v1" },
      { id: "vestido", ventaId: "v1" },
      { id: "falda", ventaId: "v2" },
      { id: "pantalon", ventaId: "v1" },
    ];
    expect(agruparPorCompra(lineas).map((c) => [c.ventaId, c.lineas.map((l) => l.id)])).toEqual([
      ["v1", ["blusa", "vestido", "pantalon"]],
      ["v2", ["falda"]],
    ]);
  });
});

describe("condicionForzada — espejo de cambios_defecto_no_vuelve_al_piso", () => {
  it("una prenda con defecto nunca vuelve al piso", () => {
    expect(condicionForzada("defecto")).toBe("no_vendible");
  });

  it("con cualquier otro motivo (o sin motivo todavía) no hay nada forzado", () => {
    expect(condicionForzada("talla_chica")).toBeNull();
    expect(condicionForzada(null)).toBeNull();
  });
});

describe("descripcionEntregada", () => {
  const entregada = { productoId: "p-blusa", referencia: "Blusa Emma", talla: "L", color: "Negro" };

  it("misma prenda: solo color y talla", () => {
    expect(descripcionEntregada(entregada, "p-blusa")).toBe("Negro · Talla L");
  });

  it("otra prenda: con su nombre", () => {
    expect(descripcionEntregada(entregada, "p-vestido")).toBe("Blusa Emma · Negro · Talla L");
  });
});

describe("clasificarBusqueda", () => {
  it("una boleta con serie", () => {
    expect(clasificarBusqueda(" b001-10 ")).toEqual({ tipo: "comprobante", serie: "B001", numero: 10 });
  });

  it("solo dígitos: número de boleta Y documento, sin adivinar", () => {
    expect(clasificarBusqueda("45879632")).toEqual({ tipo: "numero", texto: "45879632", numero: 45879632 });
  });

  it("un RUC no se compara contra comprobantes.numero (integer): revienta la consulta", () => {
    expect(clasificarBusqueda("20601234567")).toEqual({ tipo: "numero", texto: "20601234567", numero: null });
  });

  it("una etiqueta o un nombre van como texto", () => {
    expect(clasificarBusqueda("CMS-0001-NEG-M")).toEqual({ tipo: "texto", texto: "CMS-0001-NEG-M" });
    expect(clasificarBusqueda("Ana Pérez")).toEqual({ tipo: "texto", texto: "Ana Pérez" });
  });

  it("vacío no es una búsqueda", () => {
    expect(clasificarBusqueda("   ")).toBeNull();
  });
});

describe("estadoPrendaVendida", () => {
  const ahora = lima(2026, 9, 18);
  const base = { cantidad: 1, yaCambiado: 0, yaDevuelto: 0, anulada: false, creadoEn: lima(2026, 9, 18).toISOString() };

  it("recién vendida: dentro del plazo y se puede cambiar", () => {
    expect(estadoPrendaVendida(base, ahora)).toMatchObject({ clave: "dentro_del_plazo", cambiable: true, tono: "verde" });
  });

  it("con devolución registrada (aunque solo esté pendiente de aprobar): no se cambia — volvería al stock dos veces", () => {
    expect(estadoPrendaVendida({ ...base, yaDevuelto: 1 }, ahora)).toMatchObject({ clave: "devuelta", cambiable: false, texto: "Devolución registrada" });
  });

  it("2 unidades, 1 cambiada y 1 devuelta: no queda nada por cambiar", () => {
    expect(estadoPrendaVendida({ ...base, cantidad: 2, yaCambiado: 1, yaDevuelto: 1 }, ahora).cambiable).toBe(false);
  });

  it("ya cambiada entera: completado, aunque además esté fuera de plazo", () => {
    const vieja = { ...base, yaCambiado: 1, creadoEn: lima(2026, 8, 1).toISOString() };
    expect(estadoPrendaVendida(vieja, ahora)).toMatchObject({ clave: "completado", cambiable: false, texto: "Cambio completado" });
  });

  it("cambiada a medias: todavía se puede cambiar lo que queda", () => {
    expect(estadoPrendaVendida({ ...base, cantidad: 2, yaCambiado: 1 }, ahora).cambiable).toBe(true);
  });

  it("a punto de vencer: sigue VERDE (está dentro) y dice los días que quedan", () => {
    expect(estadoPrendaVendida({ ...base, creadoEn: lima(2026, 9, 5).toISOString() }, ahora)).toMatchObject({
      clave: "por_vencer",
      texto: "Vence en 2 días",
      tono: "verde",
    });
    expect(estadoPrendaVendida({ ...base, creadoEn: lima(2026, 9, 3).toISOString() }, ahora).texto).toBe("Último día para cambiar");
  });

  it("fuera de plazo o de una venta anulada: no se puede iniciar el cambio; el plazo vencido va en ROJO", () => {
    expect(estadoPrendaVendida({ ...base, creadoEn: lima(2026, 9, 1).toISOString() }, ahora)).toMatchObject({
      clave: "fuera_de_plazo",
      cambiable: false,
      tono: "rojo",
      icono: "alerta",
    });
    expect(estadoPrendaVendida({ ...base, anulada: true }, ahora)).toMatchObject({ clave: "anulada", cambiable: false });
  });
});

describe("estadoPlazoVenta (el chip de plazo de la VENTA, sin mirar cada línea)", () => {
  const ahora = lima(2026, 9, 18);

  it("mismo resultado que el tramo de plazo de estadoPrendaVendida — es la misma cuenta, extraída", () => {
    expect(estadoPlazoVenta(lima(2026, 9, 18).toISOString(), ahora)).toMatchObject({ clave: "dentro_del_plazo", tono: "verde" });
    expect(estadoPlazoVenta(lima(2026, 9, 1).toISOString(), ahora)).toMatchObject({ clave: "fuera_de_plazo", tono: "rojo", icono: "alerta" });
    expect(estadoPlazoVenta(lima(2026, 9, 3).toISOString(), ahora).texto).toBe("Último día para cambiar");
  });
});

describe("totalesVenta (la tarjeta de Actividad reciente resume, no repite precio por prenda; compartida con Devoluciones)", () => {
  it("suma prendas y lo que la clienta pagó de verdad (con descuento), no el precio de lista", () => {
    const lineas = [
      { cantidad: 2, precioUnitario: 79.9, descuentoUnitario: 0 },
      { cantidad: 1, precioUnitario: 149.9, descuentoUnitario: 15 },
    ];
    expect(totalesVenta(lineas)).toEqual({ prendas: 3, importe: 294.7 });
  });

  it("una venta sin líneas no revienta: cero y cero", () => {
    expect(totalesVenta([])).toEqual({ prendas: 0, importe: 0 });
  });
});

describe("actividadPreviaVenta (una sola vez por tarjeta lo que hoy se repite por prenda; compartida con Devoluciones)", () => {
  const sinActividad = { devolucionesHechas: [], cambiosHechos: [] };

  it("venta ordinaria, sin cambios ni devoluciones: nada que decir", () => {
    expect(actividadPreviaVenta([sinActividad, sinActividad])).toBeNull();
  });

  it("una devolución pendiente manda sobre cualquier otra cosa ya resuelta", () => {
    const conPendiente = {
      devolucionesHechas: [{ cantidad: 1, estado: "pendiente" as const }],
      cambiosHechos: [{ cantidad: 1 }],
    };
    expect(actividadPreviaVenta([sinActividad, conPendiente])).toMatchObject({ clave: "con_pendiente", texto: "1 devolución pendiente", tono: "ambar" });
  });

  it("una prenda cambiada y otras dos intactas: la cuenta exacta, no un rótulo genérico de 'parcial'", () => {
    const cambiada = { devolucionesHechas: [], cambiosHechos: [{ cantidad: 1 }] };
    expect(actividadPreviaVenta([cambiada, sinActividad, sinActividad])).toMatchObject({ texto: "1 cambiada", tono: "neutro", icono: "check" });
  });

  it("cambio y devolución aprobada juntos, en la misma venta: los dos se cuentan", () => {
    const cambiada = { devolucionesHechas: [], cambiosHechos: [{ cantidad: 2 }] };
    const devuelta = { devolucionesHechas: [{ cantidad: 1, estado: "aprobada" as const }], cambiosHechos: [] };
    expect(actividadPreviaVenta([cambiada, devuelta])).toMatchObject({ texto: "2 cambiadas · 1 devuelta" });
  });
});

describe("unidadesDisponibles / aviso", () => {
  it("descuenta lo cambiado y lo devuelto, y nunca baja de cero", () => {
    expect(unidadesDisponibles({ cantidad: 3, yaCambiado: 1, yaDevuelto: 1 })).toBe(1);
    expect(unidadesDisponibles({ cantidad: 1, yaCambiado: 1, yaDevuelto: 1 })).toBe(0);
  });

  it("un aviso no frena; una alerta o un pendiente sí, y el primero de ellos manda", () => {
    const aviso = { clave: "plazo", estado: "aviso", titulo: "Fuera del plazo" } as const;
    const pendiente = { clave: "motivo", estado: "pendiente", titulo: "Falta el motivo" } as const;
    expect(primerBloqueo([aviso])).toBeNull();
    expect(primerBloqueo([aviso, pendiente])).toBe(pendiente);
  });
});

describe("validarCambio / primerBloqueo", () => {
  const ahora = lima(2026, 9, 18);
  const listo = {
    venta: { comprobante: "Boleta B001-000010", creadoEn: lima(2026, 9, 18, 11).toISOString(), anulada: false },
    ahora,
    cantidadComprada: 1,
    disponible: 1,
    motivo: "talla_chica" as const,
    eligioPrenda: true,
    nueva: { descripcion: "L / Negro", stockAqui: 3, apartadoAqui: 0, otrasSedes: null },
    sede: "Tienda Lima",
    diferencia: 0,
    metodo: "efectivo" as const,
    cajaAbierta: false,
  };

  it("todo en orden: todas en ✓ y nada frena (sin diferencia no se mira la caja)", () => {
    const validaciones = validarCambio(listo);
    expect(validaciones.map((v) => v.clave)).toEqual(["compra", "plazo", "prenda", "motivo", "stock"]);
    expect(validaciones.every((v) => v.estado === "ok")).toBe(true);
    expect(primerBloqueo(validaciones)).toBeNull();
  });

  it("lo primero que frena es lo primero del recorrido: el motivo antes que la talla", () => {
    const bloqueo = primerBloqueo(validarCambio({ ...listo, motivo: null, eligioPrenda: false, nueva: null }));
    expect(bloqueo).toMatchObject({ clave: "motivo", estado: "pendiente" });
  });

  it("fuera de plazo dice hace cuántos días fue la compra", () => {
    const vieja = { ...listo, venta: { ...listo.venta, creadoEn: lima(2026, 8, 28).toISOString() } };
    expect(primerBloqueo(validarCambio(vieja))).toMatchObject({
      clave: "plazo",
      estado: "alerta",
      detalle: "La compra fue hace 21 días; el plazo es de 15.",
    });
  });

  it("sin stock aquí dice dónde más hay", () => {
    const sinStock = { ...listo, nueva: { descripcion: "L / Negro", stockAqui: 0, apartadoAqui: 0, otrasSedes: "2 en Trujillo" } };
    expect(primerBloqueo(validarCambio(sinStock))).toMatchObject({ titulo: "No queda L / Negro en Tienda Lima", detalle: "Hay 2 en Trujillo." });
  });

  it("lo que queda en el piso es de otra clienta: dice «apartada», no «no queda»", () => {
    const apartada = { ...listo, nueva: { descripcion: "L / Negro", stockAqui: 0, apartadoAqui: 1, otrasSedes: "2 en Trujillo" } };
    expect(primerBloqueo(validarCambio(apartada))).toMatchObject({
      clave: "stock",
      estado: "alerta",
      titulo: "L / Negro está apartada para una clienta en Tienda Lima",
      detalle: "Hay 2 en Trujillo.",
    });
    // Apartada y sin otra sede donde buscar: lo dice sin «tampoco» (no falta la prenda, es de otra clienta).
    const sinOtrasSedes = { ...listo, nueva: { descripcion: "L / Negro", stockAqui: 0, apartadoAqui: 1, otrasSedes: null } };
    expect(primerBloqueo(validarCambio(sinOtrasSedes))).toMatchObject({
      titulo: "L / Negro está apartada para una clienta en Tienda Lima",
      detalle: "No hay en otra sede.",
    });
    // Sin nada apartado sigue diciendo lo de siempre.
    const agotada = { ...listo, nueva: { descripcion: "L / Negro", stockAqui: 0, apartadoAqui: 0, otrasSedes: null } };
    expect(primerBloqueo(validarCambio(agotada))).toMatchObject({ titulo: "No queda L / Negro en Tienda Lima", detalle: "Tampoco hay en otra sede." });
  });

  it("diferencia en efectivo con la caja cerrada frena (registrar_cambio la rechazaría)", () => {
    const conDiferencia = { ...listo, diferencia: 40 };
    expect(primerBloqueo(validarCambio(conDiferencia))).toMatchObject({ clave: "caja", estado: "alerta" });
    expect(primerBloqueo(validarCambio({ ...conDiferencia, cajaAbierta: true }))).toBeNull();
    // Por Yape no pasa por el cajón: la caja ni se menciona.
    expect(validarCambio({ ...conDiferencia, metodo: "yape" }).some((v) => v.clave === "caja")).toBe(false);
  });
});

describe("impactoCambio", () => {
  const base = {
    devuelta: "Pantalón Carla Negro / 30",
    entregada: "Pantalón Carla Negro / 32",
    cantidad: 1,
    condicion: "vendible" as const,
    diferencia: 0,
    metodo: "efectivo" as const,
    sede: "Tienda Lima",
  };

  it("inventario: entra la devuelta al piso y sale la nueva del piso", () => {
    expect(impactoCambio(base).inventario).toEqual([
      { signo: "+", cantidad: 1, prenda: "Pantalón Carla Negro / 30", donde: "vuelve al piso de Tienda Lima" },
      { signo: "−", cantidad: 1, prenda: "Pantalón Carla Negro / 32", donde: "sale del piso de Tienda Lima" },
    ]);
  });

  it("una prenda no vendible entra a cuarentena, no al piso", () => {
    expect(impactoCambio({ ...base, condicion: "no_vendible" }).inventario[0]!.donde).toBe("entra a cuarentena en Tienda Lima");
  });

  it("caja: sin diferencia no se mueve; en efectivo sí; con otro método no pasa por el cajón", () => {
    expect(impactoCambio(base).caja.titulo).toBe("Sin diferencia de precio");
    expect(impactoCambio({ ...base, diferencia: 40 }).caja).toEqual({
      titulo: "+ S/ 40.00 por cobrar",
      detalle: "En efectivo: entra al cajón y se suma al cierre de caja.",
    });
    expect(impactoCambio({ ...base, diferencia: -20, metodo: "yape" }).caja).toEqual({
      titulo: "− S/ 20.00 a devolver",
      detalle: "Por Yape: no pasa por el cajón.",
    });
  });
});

describe("tallasQueNoCalzan", () => {
  const emma = (de: string, a: string, cantidad = 1): CambioParaTallas => ({
    referencia: "Blusa Emma",
    productoVendidoId: "p-emma",
    productoEntregadoId: "p-emma",
    tallaVendida: de,
    tallaEntregada: a,
    cantidad,
  });

  it("suma por dirección y solo muestra lo que llega al mínimo", () => {
    const cambios = [emma("M", "L"), emma("M", "L", 2), emma("L", "M"), emma("S", "M")];
    expect(tallasQueNoCalzan(cambios)).toEqual([{ referencia: "Blusa Emma", de: "M", a: "L", prendas: 3 }]);
  });

  it("un cambio a otra prenda, o a la misma talla (otro color / defecto), no habla de la horma", () => {
    const otraPrenda = { ...emma("M", "L", 5), productoEntregadoId: "p-sofia" };
    const mismaTalla = emma("M", "M", 5);
    expect(tallasQueNoCalzan([otraPrenda, mismaTalla])).toEqual([]);
  });

  it("de más a menos, para leer primero lo más repetido", () => {
    const cambios = [emma("M", "L", 3), { ...emma("28", "30", 4), referencia: "Pantalón Carla", productoVendidoId: "p-carla", productoEntregadoId: "p-carla" }];
    expect(tallasQueNoCalzan(cambios).map((t) => t.referencia)).toEqual(["Pantalón Carla", "Blusa Emma"]);
  });
});
