import { describe, it, expect } from "vitest";
import {
  CATEGORIAS,
  FILTROS_SUBUBICACION,
  FILTROS_TIPO,
  PERIODOS_RAPIDOS,
  PROCESOS_FILTRO,
  PROCESOS_POR_CATEGORIA,
  categoriaDeProceso,
  desdeDeUltimosDias,
  etiquetaActividad,
  etiquetaDia,
  etiquetaMovimiento,
  etiquetaProceso,
  filtrosDesdeParams,
  partesOrigenDestino,
  leerCursorMovimientos,
  referenciaMovimiento,
  restarDias,
  serializarCursorMovimientos,
  textoDelta,
  textoOrigenDestino,
  textoPeriodo,
  tonoCategoria,
  type Movimiento,
  type ParamsMovimientos,
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

describe("etiquetaMovimiento", () => {
  // La columna «Movimiento» dice el proceso en lenguaje de tienda. En una transferencia lo que
  // importa es hacia dónde va el stock DE LA SEDE QUE SE MIRA, y eso lo dice el signo.
  it("una transferencia dice «llegada» si suma y «salida» si resta", () => {
    expect(etiquetaMovimiento(movimiento({ tipo: "entrada", categoria: "transferencia", motivo: "traslado_entrada", delta: 3 }))).toBe("Transferencia · llegada");
    expect(etiquetaMovimiento(movimiento({ tipo: "salida", categoria: "transferencia", motivo: "traslado_salida", delta: -3 }))).toBe("Transferencia · salida");
  });

  it("una fila del modelo anterior (una sola pierna) también se lee según la sede que se mira", () => {
    const vieja = { tipo: "traslado" as const, categoria: "transferencia" as const, motivo: "transferencia" };
    expect(etiquetaMovimiento(movimiento({ ...vieja, delta: 2 }))).toBe("Transferencia · llegada");
    expect(etiquetaMovimiento(movimiento({ ...vieja, delta: -2 }))).toBe("Transferencia · salida");
  });

  it("el resto usa el nombre del proceso", () => {
    expect(etiquetaMovimiento(movimiento({ motivo: "venta", categoria: "salida", delta: -1 }))).toBe("Venta");
    expect(etiquetaMovimiento(movimiento({ motivo: "recepcion" }))).toBe("Recepción");
    expect(etiquetaMovimiento(movimiento({ motivo: "movimiento_interno", categoria: "interno", tipo: "traslado", delta: 0 }))).toBe("Reposición interna");
    expect(etiquetaMovimiento(movimiento({ motivo: "devolucion" }))).toBe("Devolución");
    expect(etiquetaMovimiento(movimiento({ motivo: "conteo", categoria: "ajuste", tipo: "ajuste" }))).toBe("Conteo");
  });

  it("los ajustes sueltos llevan «Ajuste ·»: «Reposición» a secas se confundía con la reposición interna", () => {
    expect(etiquetaMovimiento(movimiento({ motivo: "reposicion", categoria: "ajuste", tipo: "ajuste" }))).toBe("Ajuste · reposición");
    expect(etiquetaMovimiento(movimiento({ motivo: "merma", categoria: "ajuste", tipo: "ajuste", delta: -1 }))).toBe("Ajuste · merma");
  });
});

describe("referenciaMovimiento", () => {
  // La columna «Referencia»: solo lo que la base ya guarda. Traslados y conteos tienen número
  // corrido; una venta se identifica por su comprobante. No existe «Venta 184»: esa tabla no
  // tiene número propio y la pantalla no lo inventa.
  it("un traslado dice su número y lleva a su detalle, sea salida o llegada", () => {
    const t = { id: "t-uuid", estado: "en_transito", nota: null, numero: 24 };
    for (const motivo of ["traslado_salida", "traslado_entrada"]) {
      expect(referenciaMovimiento(movimiento({ motivo, categoria: "transferencia", transferencia: t }))).toEqual({
        texto: "Traslado 24",
        detalle: null,
        href: "/inventario/traslados/t-uuid",
      });
    }
  });

  it("un traslado del modelo anterior también (estado «completada»)", () => {
    const t = { id: "t1", estado: "completada", nota: null, numero: 1 };
    expect(referenciaMovimiento(movimiento({ motivo: "transferencia", categoria: "transferencia", transferencia: t }))?.texto).toBe("Traslado 1");
  });

  it("si la base todavía no devuelve el número (código antes que migración), dice «Traslado» y sigue enlazando", () => {
    const t = { id: "t1", estado: "en_transito", nota: null, numero: null };
    expect(referenciaMovimiento(movimiento({ motivo: "traslado_entrada", transferencia: t }))).toEqual({
      texto: "Traslado",
      detalle: null,
      href: "/inventario/traslados/t1",
    });
  });

  it("un conteo dice su número y lleva a su detalle", () => {
    const m = movimiento({ motivo: "conteo", conteo: { id: "c-uuid", sistema: 2, contado: 1, numero: 12 } });
    expect(referenciaMovimiento(m)).toEqual({ texto: "Conteo 12", detalle: null, href: "/inventario/conteo/c-uuid" });
  });

  it("una venta, su devolución y su cambio se identifican por el comprobante de la venta", () => {
    const venta = { id: "v1", nota: null, comprobante: { tipo: "boleta" as const, numero: "B001-000184", estado: "aceptado" as const } };
    for (const motivo of ["venta", "devolucion", "cambio", "anulacion_venta"]) {
      expect(referenciaMovimiento(movimiento({ motivo, venta }))).toEqual({ texto: "Boleta B001-000184", detalle: null, href: null });
    }
  });

  it("una venta sin comprobante lo dice; sin venta no hay referencia", () => {
    expect(referenciaMovimiento(movimiento({ motivo: "venta", venta: { id: "v1", nota: null, comprobante: null } }))?.texto).toBe("Sin comprobante");
    expect(referenciaMovimiento(movimiento({ motivo: "venta", venta: null }))).toBeNull();
  });

  it("una recepción se identifica por su factura (con enlace solo para quien puede ver Compras) o por su guía", () => {
    const m = movimiento({
      motivo: "recepcion",
      lote: { id: "l1", guia: "T001-000045", nota: null, proveedor: "Textiles Andina" },
      compra: { id: "c1", documento: "F001-000210" },
    });
    expect(referenciaMovimiento(m)).toEqual({ texto: "Factura F001-000210", detalle: "Guía T001-000045 · Textiles Andina", href: null });
    expect(referenciaMovimiento(m, { enlaceCompras: true })?.href).toBe("/compras/factura/c1");
    // Sin factura (una recepción fuera de comprobante): la guía, y el proveedor debajo.
    expect(referenciaMovimiento(movimiento({ motivo: "recepcion", lote: { id: "l1", guia: "T001-9", nota: null, proveedor: "Textiles Sur" } }))).toEqual({
      texto: "Guía T001-9",
      detalle: "Textiles Sur",
      href: null,
    });
    // Sin factura ni guía: al menos, de quién vino.
    expect(referenciaMovimiento(movimiento({ motivo: "recepcion", lote: { id: "l1", guia: null, nota: null, proveedor: "Textiles Sur" } }))).toEqual({
      texto: "Textiles Sur",
      detalle: null,
      href: null,
    });
  });

  it("un proceso sin referencia deja la celda vacía: carga de sistema, ajuste suelto, producción, reposición interna", () => {
    expect(referenciaMovimiento(movimiento({ motivo: "carga_inicial", esSistema: true }))).toBeNull();
    expect(referenciaMovimiento(movimiento({ motivo: "merma", categoria: "ajuste", tipo: "ajuste", nota: "se rompió" }))).toBeNull();
    expect(referenciaMovimiento(movimiento({ motivo: "produccion" }))).toBeNull();
    expect(referenciaMovimiento(movimiento({ motivo: "movimiento_interno", categoria: "interno", tipo: "traslado" }))).toBeNull();
  });
});

describe("etiquetaProceso", () => {
  it("conoce los procesos de operación y los de sistema", () => {
    expect(etiquetaProceso("movimiento_interno")).toBe("Reposición interna");
    expect(etiquetaProceso("carga_inicial")).toBe("Carga inicial");
    expect(etiquetaProceso("activacion_piso_almacen")).toBe("Activación piso/almacén");
    expect(etiquetaProceso("traslado_salida")).toBe("Transferencia · salida");
    expect(etiquetaProceso("traslado_entrada")).toBe("Transferencia · llegada");
  });

  it("un motivo desconocido se muestra legible, nunca rompe", () => {
    expect(etiquetaProceso("ajuste_manual_2027")).toBe("ajuste manual 2027");
    expect(etiquetaProceso(null)).toBe("Sin proceso");
  });

  it("«Más filtros → Proceso» ofrece cada proceso con el mismo nombre que la columna «Movimiento»", () => {
    const porValor = Object.fromEntries(PROCESOS_FILTRO.map((p) => [p.valor, p.etiqueta]));
    expect(porValor.traslado_salida).toBe("Transferencia · salida");
    expect(porValor.traslado_entrada).toBe("Transferencia · llegada");
    expect(porValor.recepcion).toBe("Recepción");
    expect(porValor.venta).toBe("Venta");
    expect(porValor.movimiento_interno).toBe("Reposición interna");
    expect(PROCESOS_FILTRO.every((p) => p.etiqueta && !p.etiqueta.includes("_"))).toBe(true);
  });
});

describe("filtro de proceso en dos pasos (tipo → proceso)", () => {
  it("todo proceso del filtro tiene al menos un tipo, y todo proceso de un tipo existe en el filtro", () => {
    const filtro = new Set(PROCESOS_FILTRO.map((p) => p.valor));
    const enTipos = new Set(CATEGORIAS.flatMap((c) => PROCESOS_POR_CATEGORIA[c]));
    expect([...filtro].filter((p) => !enTipos.has(p))).toEqual([]);
    expect([...enTipos].filter((p) => !filtro.has(p))).toEqual([]);
  });

  it("«Cambio» vive en Entradas y en Salidas (la prenda devuelta entra, la nueva sale)", () => {
    expect(PROCESOS_POR_CATEGORIA.entrada).toContain("cambio");
    expect(PROCESOS_POR_CATEGORIA.salida).toContain("cambio");
  });

  it("un enlace con solo ?proc= deduce su tipo si es uno solo", () => {
    expect(categoriaDeProceso("conteo")).toBe("ajuste");
    expect(categoriaDeProceso("venta")).toBe("salida");
    expect(categoriaDeProceso("traslado_entrada")).toBe("transferencia");
    expect(categoriaDeProceso("cambio")).toBeNull();
    expect(categoriaDeProceso("inventado")).toBeNull();
    expect(categoriaDeProceso(null)).toBeNull();
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

describe("filtros rápidos por tipo", () => {
  it("hay uno por cada categoría, en el orden en que se leen en la pantalla", () => {
    expect(FILTROS_TIPO.map((f) => f.valor)).toEqual(["entrada", "salida", "interno", "transferencia", "ajuste"]);
    expect([...FILTROS_TIPO.map((f) => f.valor)].sort()).toEqual([...CATEGORIAS].sort());
    expect(FILTROS_TIPO.map((f) => f.etiqueta)).toEqual(["Entradas", "Salidas", "Internos", "Transferencias", "Ajustes"]);
  });
});

describe("restarDias / desdeDeUltimosDias", () => {
  it("cruza fin de mes, de año y año bisiesto sin depender de la zona horaria del servidor", () => {
    expect(restarDias("2026-03-01", 1)).toBe("2026-02-28");
    expect(restarDias("2026-01-01", 1)).toBe("2025-12-31");
    expect(restarDias("2028-03-01", 1)).toBe("2028-02-29");
    expect(restarDias("2026-09-19", 0)).toBe("2026-09-19");
  });

  it("un período de N días TERMINA hoy: 7 días es hoy y los 6 anteriores (misma cuenta que el Resumen)", () => {
    expect(desdeDeUltimosDias(1, "2026-09-19")).toBe("2026-09-19");
    expect(desdeDeUltimosDias(7, "2026-09-19")).toBe("2026-09-13");
    expect(desdeDeUltimosDias(30, "2026-09-19")).toBe("2026-08-21");
    expect(desdeDeUltimosDias(90, "2026-09-19")).toBe("2026-06-22");
  });
});

describe("filtrosDesdeParams", () => {
  const hoy = "2026-09-19";
  const piso = { id: "11111111-1111-4111-8111-111111111111", tipo: "piso_venta" };
  const almacen = { id: "22222222-2222-4222-8222-222222222222", tipo: "almacen_tienda" };
  const cuarentena = { id: "33333333-3333-4333-8333-333333333333", tipo: "cuarentena" };
  const sububicaciones = [piso, almacen, cuarentena];
  const resolver = (p: ParamsMovimientos, subs = sububicaciones) => filtrosDesdeParams(p, { hoy, sububicaciones: subs });

  it("sin nada en la URL: los últimos 30 días, y lo dice (no es un recorte silencioso)", () => {
    const f = resolver({});
    expect(f.periodo).toBe("30");
    expect(f.desde).toBe("2026-08-21");
    expect(f.hasta).toBeUndefined();
    expect(f.busqueda).toBeUndefined();
    expect(f.categoria).toBeUndefined();
    expect(f.motivo).toBeUndefined();
    expect(f.sububicacionId).toBeUndefined();
    expect(f.sub).toBeNull();
  });

  it("los períodos rápidos son 7, 30 y 90; cualquier otro valor cae al de 30", () => {
    expect([...PERIODOS_RAPIDOS]).toEqual([7, 30, 90]);
    expect(resolver({ rango: "7" })).toMatchObject({ periodo: "7", desde: "2026-09-13" });
    expect(resolver({ rango: "90" })).toMatchObject({ periodo: "90", desde: "2026-06-22" });
    expect(resolver({ rango: "15" })).toMatchObject({ periodo: "30", desde: "2026-08-21" });
    expect(resolver({ rango: "basura" })).toMatchObject({ periodo: "30" });
  });

  it("«Todo el historial» no recorta por fecha", () => {
    const f = resolver({ rango: "todo" });
    expect(f.periodo).toBe("todo");
    expect(f.desde).toBeUndefined();
    expect(f.hasta).toBeUndefined();
  });

  it("las fechas de «Personalizado» mandan sobre el período rápido, y una inválida se descarta", () => {
    expect(resolver({ desde: "2026-09-01", hasta: "2026-09-10", rango: "7" })).toMatchObject({ periodo: "personalizado", desde: "2026-09-01", hasta: "2026-09-10" });
    expect(resolver({ hasta: "2026-09-10" })).toMatchObject({ periodo: "personalizado", desde: undefined, hasta: "2026-09-10" });
    expect(resolver({ desde: "ayer", hasta: "2026-9-1" })).toMatchObject({ periodo: "30", desde: "2026-08-21", hasta: undefined });
  });

  it("acepta solo un tipo y un proceso válidos", () => {
    expect(resolver({ cat: "transferencia" }).categoria).toBe("transferencia");
    expect(resolver({ cat: "inventado" }).categoria).toBeUndefined();
    expect(resolver({ proc: "traslado_entrada" }).motivo).toBe("traslado_entrada");
    expect(resolver({ proc: "Venta; drop table" }).motivo).toBeUndefined();
  });

  it("la búsqueda se recorta y una vacía es «sin búsqueda»", () => {
    expect(resolver({ q: "  Traslado 24  " }).busqueda).toBe("Traslado 24");
    expect(resolver({ q: "   " }).busqueda).toBeUndefined();
  });

  it("la sububicación viaja por nombre corto y se resuelve a la de la sede que se mira", () => {
    expect(FILTROS_SUBUBICACION.map((f) => f.token)).toEqual(["piso", "almacen", "cuarentena"]);
    expect(resolver({ sub: "piso" })).toMatchObject({ sububicacionId: piso.id, sub: "piso" });
    expect(resolver({ sub: "almacen" })).toMatchObject({ sububicacionId: almacen.id, sub: "almacen" });
    expect(resolver({ sub: "cuarentena" })).toMatchObject({ sububicacionId: cuarentena.id, sub: "cuarentena" });
  });

  it("un enlace viejo con el uuid de la sububicación sigue funcionando y deja apretado su botón", () => {
    expect(resolver({ sub: almacen.id })).toMatchObject({ sububicacionId: almacen.id, sub: "almacen" });
  });

  it("una sububicación que la sede no tiene (el Taller no tiene piso) se ignora, no filtra a nada", () => {
    expect(resolver({ sub: "piso" }, [])).toMatchObject({ sububicacionId: undefined, sub: null });
    expect(resolver({ sub: "cuarentena" }, [piso, almacen])).toMatchObject({ sububicacionId: undefined, sub: null });
    // Un uuid que no es de esta sede tampoco: no puede filtrar por una sububicación ajena.
    expect(resolver({ sub: "44444444-4444-4444-8444-444444444444" })).toMatchObject({ sububicacionId: undefined, sub: null });
  });

  it("un `?usuario=` de un enlace viejo se ignora: ya no se filtra por persona", () => {
    const viejo = { q: "blusa", usuario: "6d27c17d-13b7-4c2b-84c8-a944f38431e7" };
    const f = resolver(viejo);
    expect(f.busqueda).toBe("blusa");
    expect(f).not.toHaveProperty("usuarioId");
    expect(f).not.toHaveProperty("usuario");
  });
});

describe("textoPeriodo", () => {
  it("los rápidos dicen «Últimos N días»; el resto, las fechas", () => {
    expect(textoPeriodo("7")).toBe("Últimos 7 días");
    expect(textoPeriodo("30")).toBe("Últimos 30 días");
    expect(textoPeriodo("90")).toBe("Últimos 90 días");
    expect(textoPeriodo("todo")).toBe("Todo el historial");
    expect(textoPeriodo("personalizado", "2026-09-01", "2026-09-10")).toBe("01/09/2026 – 10/09/2026");
    expect(textoPeriodo("personalizado", "2026-09-01")).toBe("Desde 01/09/2026");
    expect(textoPeriodo("personalizado", undefined, "2026-09-10")).toBe("Hasta 10/09/2026");
    expect(textoPeriodo("personalizado")).toBe("Todo el historial");
  });
});

describe("etiquetaActividad", () => {
  const base = { categoria: "salida" as const, delta: -1, venta: null, cambio: null, devolucion: null };
  it("distingue una venta de un retiro, aunque las dos sean «salida»", () => {
    expect(etiquetaActividad({ ...base, venta: { id: "v", nota: null, comprobante: null } })).toBe("Venta");
    expect(etiquetaActividad(base)).toBe("Salida");
  });
  it("un cambio o una devolución mandan sobre la venta de la que cuelgan", () => {
    const venta = { id: "v", nota: null, comprobante: null };
    expect(etiquetaActividad({ ...base, venta, cambio: { id: "c", diferencia: 0 } })).toBe("Cambio");
    expect(etiquetaActividad({ ...base, venta, devolucion: { id: "d", motivo: null, estado: "aprobada" } })).toBe("Devolución");
  });
  it("una fila que suma unidades y cuelga de una venta no se rotula «Venta»", () => {
    expect(etiquetaActividad({ ...base, categoria: "entrada", delta: 1, venta: { id: "v", nota: null, comprobante: null } })).toBe("Entrada");
  });
});
