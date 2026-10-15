import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIAS_SIN_MOVERSE,
  accionesDeFase,
  avancesNuevos,
  avisoMinimoDeFase,
  cantidadConUnidad,
  cantidadesQueFaltan,
  cifrasDeLaOrden,
  cuandoTerminoLaFase,
  diaCorto,
  estadoDeLaOrden,
  faltaTerminar,
  fechaLimaDe,
  filasDeTela,
  fraseDeLaOrden,
  horaLima,
  leerOrdenPagina,
  lineaDeTiempoAgrupada,
  numeroDeOrdenEnUrl,
  puedeCambiarQuien,
  queSigue,
  quienDeFase,
  rojoDeLaOrden,
  textoApertura,
  textoColoresYTallas,
  textoCosto,
  textoDeFase,
  textoQueSigue,
  textoSeVende,
  textoTermine,
  type FasePagina,
  type OrdenPagina,
} from "./orden-pagina-reglas";

// La respuesta de `fn_orden_produccion` tal como la escribe la migración 20261014155000: una orden de 48 pantalones (negro y caqui, tallas 28/30/32, 8 de cada una).
const V = { negro: ["n28", "n30", "n32"], caqui: ["c28", "c30", "c32"] } as const;
const TODAS = [...V.negro, ...V.caqui];

function lineasCrudas() {
  return TODAS.map((id) => ({
    variante_id: id,
    codigo: `PAN-${id}`,
    talla: id.slice(1),
    color_codigo: id.startsWith("n") ? "NEG" : "CAQ",
    color_nombre: id.startsWith("n") ? "Negro" : "Caqui",
    color_hex: id.startsWith("n") ? "#111111" : "#c2b280",
    cantidad_plan: 8,
    cantidad_buenas: null,
  }));
}

/** Una fase como la manda `fn_fases_de_orden` + `por_variante`. `hechas`/`afuera`/`salieron` por talla y color (todas iguales, para el ejemplo). */
function faseCruda(o: Record<string, unknown> & { clave: string; secuencia: number; quien: string }, porVariante: Partial<{ entrada: number; hechas: number; salieron: number; afuera: number }> = {}) {
  const entrada = porVariante.entrada ?? 8;
  const hechas = porVariante.hechas ?? 0;
  const salieron = porVariante.salieron ?? 0;
  const afuera = porVariante.afuera ?? 0;
  return {
    id: `f-${o.clave}`,
    nombre: { corte: "Corte", costura: "Costura", acabado: "Acabado", bordado: "Bordado" }[o.clave as string] ?? o.clave,
    posicion: null,
    proveedor_id: null,
    proveedor_nombre: null,
    tarifa_prenda: null,
    fijo_orden: 0,
    cantidad_minima: null,
    fecha_prometida: null,
    nota: null,
    entrada: entrada * 6,
    hechas: hechas * 6,
    afuera: afuera * 6,
    salieron: salieron * 6,
    segundas: 0,
    faltantes: 0,
    estado: "pendiente",
    actual: false,
    empezada: false,
    desde: null,
    dias_en_fase: null,
    devengado: null,
    por_variante: TODAS.map((id) => ({ variante_id: id, plan: 8, entrada, hechas, salieron, volvieron_buenas: 0, segundas: 0, faltantes: 0, afuera })),
    ...o,
  };
}

function crudo(parche: Record<string, unknown> = {}) {
  return {
    orden: {
      id: "orden-1",
      numero: 2,
      numero_texto: "OP-000002",
      estado: "en_proceso",
      es_muestra: false,
      fecha_entrega: "2026-10-23",
      nota: null,
      created_at: "2026-10-13T14:05:00+00:00",
      creado_por: "p-1",
      creado_por_nombre: "Felipe",
      inventariado_at: null,
      cantidad_plan: 48,
      cantidad_buenas: null,
      ubicacion_id: "u-taller",
      ubicacion_nombre: "Taller",
      producto: { id: "prod-1", referencia: "Pantalón Lía", codigo: "PAN-001", estado: "activo", categoria: { id: "c1", nombre: "Pantalones", prefijo: "PAN", familia: "ropa" }, tejido_id: "t1", tejido_nombre: "Gabardina", precio: 129 },
    },
    lineas: lineasCrudas(),
    fases: [
      faseCruda({ clave: "corte", secuencia: 10, quien: "taller", estado: "hecha", empezada: true, entrada: 48 }, { entrada: 9, hechas: 8 }),
      faseCruda(
        { clave: "costura", secuencia: 30, quien: "servicio", proveedor_id: "pv-1", proveedor_nombre: "Confecciones del Norte", tarifa_prenda: 4.5, cantidad_minima: 150, fecha_prometida: "2026-10-21", estado: "en_curso", actual: true, empezada: true, desde: "2026-10-16T15:12:00+00:00", dias_en_fase: 3 },
        { entrada: 8, hechas: 0, salieron: 8, afuera: 8 },
      ),
      faseCruda({ clave: "acabado", secuencia: 60, quien: "taller" }, { entrada: 0 }),
    ],
    insumos: [
      { id: "pi-1", insumo_id: "i-1", codigo: "TEL-1", nombre: "Gabardina", tipo: "tela", unidad: "metro", color_codigo: "NEG", color_nombre: "Negro", consumo_por_prenda: 1.5, cantidad_plan: 36, usado: 35, saldo: 20, nota: null },
      { id: "pi-2", insumo_id: "i-2", codigo: "AVI-1", nombre: "Botón", tipo: "avio", unidad: "unidad", color_codigo: null, color_nombre: null, consumo_por_prenda: 2, cantidad_plan: 96, usado: 0, saldo: 500, nota: null },
    ],
    costos: { tela_estimado: 1080, avios_estimado: 96, tela_real: 1050, avios_real: 0, servicios_estimado: 216, servicios_devengado: 0, total_estimado: 1392, total_real_hasta_hoy: 1050 },
    linea_de_tiempo: [
      { id: "s-1", cuando: "2026-10-16T15:12:00+00:00", quien_nombre: "Rosa", tipo: "salida", fase_clave: "costura", fase_nombre: "Costura", cantidad: 48, detalle: "48 prendas a Confecciones del Norte", guia: null, lineas: [], avance_id: null },
      ...TODAS.map((id, i) => ({ id: `a-${id}`, cuando: `2026-10-15T22:40:00.00${i}+00:00`, quien_nombre: "Rosa", tipo: "avance", fase_clave: "corte", fase_nombre: "Corte", cantidad: 8, detalle: `8 de ${id}`, variante_id: id, avance_id: null })),
      { id: "o-1", cuando: "2026-10-13T14:05:00+00:00", quien_nombre: "Felipe", tipo: "apertura", fase_clave: null, fase_nombre: null, cantidad: 48, detalle: "48 prendas · afuera: Costura con Confecciones del Norte", avance_id: null },
    ],
    permisos: { puede_operar: true, ve_costos: true },
    ...parche,
  };
}

const orden = (parche: Record<string, unknown> = {}): OrdenPagina => {
  const leida = leerOrdenPagina(crudo(parche));
  if (!leida) throw new Error("la orden de prueba no se leyó");
  return leida;
};
const HOY = "2026-10-19";

describe("leerOrdenPagina — lee lo que manda fn_orden_produccion", () => {
  it("lee la orden, sus tres fases en el orden de la ruta, la tela, los costos y la línea de tiempo", () => {
    const p = orden();
    expect(p.orden).toMatchObject({ numeroTexto: "OP-000002", estado: "en_proceso", cantidadPlan: 48, ubicacionNombre: "Taller", creadoPorNombre: "Felipe" });
    expect(p.orden.producto).toMatchObject({ referencia: "Pantalón Lía", precio: 129, categoria: { prefijo: "PAN", familia: "ropa" } });
    expect(p.lineas).toHaveLength(6);
    expect(p.fases.map((f) => [f.clave, f.estado, f.quien])).toEqual([
      ["corte", "hecha", "taller"],
      ["costura", "en_curso", "servicio"],
      ["acabado", "pendiente", "taller"],
    ]);
    expect(p.fases[1]).toMatchObject({ proveedorNombre: "Confecciones del Norte", tarifaPrenda: 4.5, cantidadMinima: 150, fechaPrometida: "2026-10-21", afuera: 48, actual: true, diasEnFase: 3 });
    expect(p.fases[1].porVariante).toHaveLength(6);
    expect(p.insumos).toHaveLength(2);
    expect(p.costos).toMatchObject({ totalEstimado: 1392, totalRealHastaHoy: 1050 });
    expect(p.lineaDeTiempo).toHaveLength(8);
    expect(p.permisos).toEqual({ puedeOperar: true, veCostos: true });
  });

  it("sin costos de la base, no se ven (aunque el permiso diga que sí)", () => {
    const p = orden({ costos: null });
    expect(p.costos).toBeNull();
    expect(p.permisos.veCostos).toBe(false);
  });

  it("una respuesta que no es una orden es null (la página dice «no encontramos esa orden»)", () => {
    for (const malo of [null, undefined, "x", 3, [], {}, { orden: null }, { orden: { id: "a" } }, { orden: { id: "a", numero: 1 } }]) expect(leerOrdenPagina(malo)).toBeNull();
  });

  it("descarta lo suelto sin romper: una fase de clave desconocida, un evento sin fecha", () => {
    const c = crudo();
    c.fases.push({ ...faseCruda({ clave: "zzz", secuencia: 70, quien: "taller" }) });
    c.linea_de_tiempo.push({ id: "roto", tipo: "avance" } as never);
    const p = leerOrdenPagina(c)!;
    expect(p.fases).toHaveLength(3);
    expect(p.lineaDeTiempo).toHaveLength(8);
  });

  it("los números que llegan como texto (numeric) se leen igual", () => {
    const c = crudo();
    c.fases[1].tarifa_prenda = "4.50" as never;
    c.insumos[0].cantidad_plan = "36.000" as never;
    const p = leerOrdenPagina(c)!;
    expect(p.fases[1].tarifaPrenda).toBe(4.5);
    expect(p.insumos[0].cantidadPlan).toBe(36);
  });
});

describe("numeroDeOrdenEnUrl", () => {
  it("OP-000067, op-67 y 67 son la misma orden; lo demás no es una orden", () => {
    expect(numeroDeOrdenEnUrl("OP-000067")).toBe(67);
    expect(numeroDeOrdenEnUrl("op-67")).toBe(67);
    expect(numeroDeOrdenEnUrl("67")).toBe(67);
    for (const malo of ["", "OP-", "OP-000000", "0", "abc", "OP-12x", "-5", "1234567890", "%E0%A4%A", "OP%"]) expect(numeroDeOrdenEnUrl(malo), malo).toBeNull();
  });
});

describe("fechas en palabras de tienda", () => {
  it("diaCorto, fechaLimaDe y horaLima (Lima va cinco horas detrás de UTC)", () => {
    expect(diaCorto("2026-10-23")).toBe("vie 23 oct");
    expect(diaCorto("2026-10-21")).toBe("mié 21 oct");
    expect(fechaLimaDe("2026-10-14T03:30:00+00:00")).toBe("2026-10-13");
    expect(fechaLimaDe("2026-10-14T05:00:00+00:00")).toBe("2026-10-14");
    expect(horaLima("2026-10-16T15:12:00+00:00")).toBe("10:12");
  });
  it("cantidadConUnidad abrevia la unidad", () => {
    expect(cantidadConUnidad(72, "metro")).toBe("72 m");
    expect(cantidadConUnidad(1.5, "metro")).toBe("1.5 m");
    expect(cantidadConUnidad(96, "unidad")).toBe("96 und");
  });
});

describe("la ficha", () => {
  it("la frase de la cabecera, los colores y tallas, la apertura y el precio", () => {
    const p = orden();
    expect(fraseDeLaOrden(p.orden)).toBe("Pantalón Lía · 48 prendas · entrega vie 23 oct");
    expect(fraseDeLaOrden({ ...p.orden, esMuestra: true, fechaEntrega: null, cantidadPlan: 1 })).toBe("Muestra de Pantalón Lía · 1 prenda · sin fecha de entrega");
    expect(textoColoresYTallas(p.lineas)).toBe("negro y caqui · tallas 28, 30 y 32");
    expect(textoColoresYTallas([])).toBeNull();
    expect(textoApertura(p.orden)).toBe("Abierta el martes 13 por Felipe");
    expect(textoSeVende(129)).toBe("se vende a S/ 129.00");
    expect(textoSeVende(0)).toBeNull();
    expect(textoSeVende(null)).toBeNull();
  });
  it("dónde está la orden, en un chip", () => {
    const p = orden();
    expect(estadoDeLaOrden(p.orden, p.fases)).toEqual({ texto: "En costura · afuera", tono: "pizarra" });
    expect(estadoDeLaOrden({ ...p.orden, estado: "terminada" }, p.fases).texto).toBe("Pasó al stock");
    expect(estadoDeLaOrden({ ...p.orden, estado: "anulada" }, p.fases).texto).toBe("Anulada");
    expect(estadoDeLaOrden(p.orden, p.fases.map((f) => ({ ...f, estado: "hecha" as const, actual: false }))).texto).toBe("Lista para pasar al stock");
  });
  it("las cifras de la cabecera: prendas por color, entrega en días y el costo solo si se ve", () => {
    const p = orden();
    const c = cifrasDeLaOrden(p, HOY);
    expect(c.prendas).toEqual({ valor: 48, etiqueta: "Prendas", aparte: "24 negro · 24 caqui" });
    expect(c.entrega).toEqual({ valor: 4, etiqueta: "Para el vie 23 oct", nota: "días", atrasada: false });
    expect(c.costo).toEqual({ valor: 1050, nota: "de S/ 1,392.00", etiqueta: "Costo hasta hoy" });
    expect(cifrasDeLaOrden(orden({ costos: null }), HOY).costo).toBeNull();
    expect(cifrasDeLaOrden(p, "2026-10-25").entrega).toMatchObject({ valor: 2, etiqueta: "Atrasada · era el vie 23 oct", atrasada: true });
    expect(cifrasDeLaOrden(p, "2026-10-23").entrega).toMatchObject({ valor: 0, nota: "hoy" });
    expect(cifrasDeLaOrden(p, "2026-10-22").entrega).toMatchObject({ valor: 1, nota: "día" });
    expect(cifrasDeLaOrden({ ...p, orden: { ...p.orden, fechaEntrega: null } }, HOY).entrega.valor).toBeNull();
    expect(cifrasDeLaOrden({ ...p, orden: { ...p.orden, estado: "terminada", cantidadBuenas: 46 } }, HOY)).toMatchObject({ prendas: { valor: 46, etiqueta: "Prendas buenas" }, entrega: { atrasada: false, valor: null } });
  });
});

describe("las fases", () => {
  const p = orden();
  const [corte, costura, acabado] = p.fases;

  it("quién la hace", () => {
    expect(quienDeFase(corte)).toBe("Taller");
    expect(quienDeFase(costura)).toBe("Confecciones del Norte");
    expect(quienDeFase({ ...costura, proveedorNombre: null })).toBe("Un servicio");
  });

  it("textoDeFase: hecha, afuera, pendiente", () => {
    const lineaTiempo = p.lineaDeTiempo;
    expect(textoDeFase(corte, { previa: null, terminoEl: cuandoTerminoLaFase("corte", lineaTiempo), totalPlan: 48 })).toEqual({ cifra: "48", de: "de 48", detalle: "Hecha el jue 15 oct" });
    expect(textoDeFase(costura, { previa: corte, terminoEl: null, totalPlan: 48 })).toEqual({ cifra: "0", de: "de 48 de vuelta", detalle: "48 afuera con Confecciones del Norte · prometido mié 21 oct" });
    expect(textoDeFase(acabado, { previa: costura, terminoEl: null, totalPlan: 48 })).toEqual({ cifra: "0", de: "de 48", detalle: "Empieza cuando termine Costura" });
  });
  it("textoDeFase: en el Taller a medias, y lo que ya puede entrar de la fase anterior", () => {
    const enCurso: FasePagina = { ...corte, estado: "en_curso", actual: true, hechas: 20, entrada: 50, diasEnFase: 2 };
    expect(textoDeFase(enCurso, { previa: null, terminoEl: null, totalPlan: 50 })).toEqual({ cifra: "20", de: "de 50 terminadas", detalle: "Faltan 30 · 2 días en esta fase" });
    expect(textoDeFase({ ...enCurso, diasEnFase: 0 }, { previa: null, terminoEl: null, totalPlan: 50 }).detalle).toBe("Faltan 30");
    // La primera fase no espera a nadie: sin nada hecho, lo que falta es todo el plan.
    expect(textoDeFase({ ...corte, estado: "pendiente", actual: true, hechas: 0, entrada: 50 }, { previa: null, terminoEl: null, totalPlan: 50 })).toEqual({ cifra: "0", de: "de 50", detalle: "Faltan 50" });
    expect(textoDeFase({ ...acabado, entrada: 20 }, { previa: costura, terminoEl: null, totalPlan: 50 }).detalle).toBe("Ya pueden entrar 20 de Costura");
  });
  it("textoDeFase: un servicio antes de salir, con segundas y faltantes después de volver", () => {
    expect(textoDeFase({ ...costura, estado: "pendiente", empezada: false, afuera: 0, salieron: 0, entrada: 48, hechas: 0 }, { previa: corte, terminoEl: null, totalPlan: 48 }).detalle).toBe("48 prendas listas para mandar a Confecciones del Norte");
    const volvio = textoDeFase({ ...costura, estado: "hecha", hechas: 46, segundas: 1, faltantes: 1, afuera: 0, salieron: 48 }, { previa: corte, terminoEl: "2026-10-20T20:00:00+00:00", totalPlan: 48 });
    expect(volvio).toEqual({ cifra: "46", de: "de 48", detalle: "Hecha el mar 20 oct · 1 segunda · 1 faltante" });
  });

  it("cantidadesQueFaltan: en Corte es el plan menos lo cortado (aunque la base deje cortar un 10 % más); en las demás, lo que entró menos lo terminado", () => {
    const sinCortar: FasePagina = { ...corte, estado: "pendiente", porVariante: corte.porVariante.map((v) => ({ ...v, hechas: 0, entrada: 9, plan: 8 })) };
    expect(cantidadesQueFaltan(sinCortar, p.fases)).toEqual(Object.fromEntries(TODAS.map((id) => [id, 8])));
    const cortoDeMas: FasePagina = { ...corte, porVariante: corte.porVariante.map((v) => ({ ...v, hechas: 9, entrada: 9, plan: 8 })) };
    expect(cantidadesQueFaltan(cortoDeMas, p.fases)).toEqual({});
    const costuraTaller: FasePagina = { ...costura, quien: "taller", porVariante: costura.porVariante.map((v, i) => ({ ...v, entrada: i < 2 ? 5 : 0, hechas: i === 0 ? 2 : 0 })) };
    expect(cantidadesQueFaltan(costuraTaller, p.fases)).toEqual({ n28: 3, n30: 5 });
    expect(faltaTerminar(costuraTaller, p.fases)).toBe(8);
  });

  it("accionesDeFase: «Terminé» en el Taller, «Salida» y «Vuelta» en un servicio; nada si no se puede operar o la fase ya está hecha", () => {
    const sinCortar: FasePagina = { ...corte, estado: "en_curso", actual: true, porVariante: corte.porVariante.map((v) => ({ ...v, hechas: 0, entrada: 9 })) };
    const con = (fases: FasePagina[], extra: Partial<OrdenPagina> = {}) => ({ ...p, fases, ...extra });
    expect(accionesDeFase(sinCortar, con([sinCortar, costura, acabado]))).toEqual(["terminar"]);
    expect(accionesDeFase(corte, p)).toEqual([]);
    expect(accionesDeFase(costura, p)).toEqual(["vuelta"]);
    expect(accionesDeFase({ ...costura, afuera: 20, salieron: 20, entrada: 48 }, p)).toEqual(["salida", "vuelta"]);
    expect(accionesDeFase({ ...costura, estado: "pendiente", afuera: 0, salieron: 0, entrada: 48 }, p)).toEqual(["salida"]);
    expect(accionesDeFase(sinCortar, con([sinCortar], { permisos: { puedeOperar: false, veCostos: true } }))).toEqual([]);
    expect(accionesDeFase(sinCortar, con([sinCortar], { orden: { ...p.orden, estado: "terminada" } }))).toEqual([]);
  });

  it("queSigue: la fase actual y lo que le toca, o pasar al stock", () => {
    expect(queSigue(p.fases, "en_proceso")).toMatchObject({ accion: "vuelta", fase: { clave: "costura" } });
    const cortando: FasePagina = { ...corte, estado: "en_curso", actual: true, porVariante: corte.porVariante.map((v) => ({ ...v, hechas: 0, entrada: 9 })) };
    expect(queSigue([cortando, { ...costura, actual: false }, acabado], "en_proceso")).toMatchObject({ accion: "terminar", fase: { clave: "corte" } });
    expect(queSigue([{ ...corte, estado: "hecha" }, { ...costura, estado: "pendiente", actual: true, afuera: 0, salieron: 0, entrada: 48 }, acabado], "en_proceso").accion).toBe("salida");
    expect(queSigue(p.fases.map((f) => ({ ...f, estado: "hecha" as const, actual: false })), "en_proceso")).toMatchObject({ accion: "pasar_al_stock", fase: { clave: "acabado" } });
    expect(queSigue(p.fases, "terminada").accion).toBe("nada");
    expect(queSigue([], "en_proceso").accion).toBe("nada");
  });
  it("textoQueSigue", () => {
    expect(textoQueSigue(queSigue(p.fases, "en_proceso"), p.fases)).toBe("Sigue: recibir costura de Confecciones del Norte (48 afuera).");
    expect(textoQueSigue({ fase: acabado, accion: "pasar_al_stock" }, p.fases)).toBe("Sigue: pasar las prendas al stock del Taller.");
    expect(textoQueSigue({ fase: null, accion: "nada" }, p.fases)).toBeNull();
    const cortando: FasePagina = { ...corte, estado: "en_curso", actual: true, porVariante: corte.porVariante.map((v) => ({ ...v, hechas: 0, entrada: 9 })) };
    expect(textoQueSigue({ fase: cortando, accion: "terminar" }, [cortando])).toBe("Sigue: terminar corte (faltan 48).");
  });

  it("puedeCambiarQuien: solo mientras la fase no empezó y la orden está en proceso", () => {
    expect(puedeCambiarQuien(acabado, p)).toBe(true);
    expect(puedeCambiarQuien(costura, p)).toBe(false);
    expect(puedeCambiarQuien(corte, p)).toBe(false);
    expect(puedeCambiarQuien(acabado, { ...p, permisos: { puedeOperar: false, veCostos: true } })).toBe(false);
    expect(puedeCambiarQuien(acabado, { ...p, orden: { ...p.orden, estado: "terminada" } })).toBe(false);
  });

  it("avisoMinimoDeFase: avisa si la orden lleva menos que el mínimo del servicio; no bloquea y no avisa al Taller", () => {
    expect(avisoMinimoDeFase(costura, 48)).toBe("Confecciones del Norte cobra desde 150 prendas; esta orden lleva 48.");
    expect(avisoMinimoDeFase(costura, 150)).toBeNull();
    expect(avisoMinimoDeFase({ ...costura, cantidadMinima: null }, 48)).toBeNull();
    expect(avisoMinimoDeFase(acabado, 48)).toBeNull();
    expect(avisoMinimoDeFase({ ...costura, estado: "hecha" }, 48)).toBeNull();
  });

  it("cuandoTerminoLaFase: lo último que se anotó en la fase", () => {
    expect(cuandoTerminoLaFase("corte", p.lineaDeTiempo)).toBe("2026-10-15T22:40:00.005+00:00");
    expect(cuandoTerminoLaFase("acabado", p.lineaDeTiempo)).toBeNull();
  });
});

describe("la tela", () => {
  it("alcanza o faltan N: lo que queda en el estante contra lo que falta usar", () => {
    const filas = filasDeTela(orden().insumos);
    expect(filas[0]).toMatchObject({ id: "i-1", nombre: "Gabardina · negro", plan: "36 m", usado: "35 m", saldo: "20 m", alcanza: true, faltan: null, detalle: "1.5 m por prenda" });
    expect(filas[1]).toMatchObject({ nombre: "Botón", plan: "96 und", alcanza: true });
    const justa = filasDeTela(orden().insumos.map((i) => ({ ...i, usado: 0, saldo: 30 })));
    expect(justa[0]).toMatchObject({ alcanza: false, faltan: "6 m" });
  });
  it("una misma tela en dos colores sale de UN estante: se suman los planes contra un solo saldo, y lo usado no se duplica", () => {
    const dos = orden().insumos.filter((i) => i.tipo === "tela").flatMap((i) => [
      { ...i, id: "pi-a", colorNombre: "Caqui", cantidadPlan: 37.8, usado: 0, saldo: 44 },
      { ...i, id: "pi-b", colorNombre: "Negro", cantidadPlan: 37.8, usado: 0, saldo: 44 },
    ]);
    const [fila] = filasDeTela(dos);
    expect(filasDeTela(dos)).toHaveLength(1);
    expect(fila).toMatchObject({ nombre: "Gabardina", detalle: "caqui 37.8 m · negro 37.8 m", plan: "75.6 m", usado: "0 m", saldo: "44 m", alcanza: false, faltan: "31.6 m" });
    // El libro dice lo mismo (20 m usados) en las dos filas: es UN solo consumo, no 40.
    const conUso = dos.map((i) => ({ ...i, usado: 20, saldo: 30 }));
    expect(filasDeTela(conUso)[0]).toMatchObject({ usado: "20 m", alcanza: false, faltan: "25.6 m" });
    expect(filasDeTela(conUso.map((i) => ({ ...i, saldo: 60 })))[0].alcanza).toBe(true);
  });
  it("una tela y un avío son dos filas", () => {
    expect(filasDeTela(orden().insumos).map((f) => f.nombre)).toEqual(["Gabardina · negro", "Botón"]);
  });
  it("lo ya usado no se cuenta dos veces: usó 35 de 36 y quedan 2 en el estante, alcanza", () => {
    expect(filasDeTela(orden().insumos.map((i) => ({ ...i, usado: 35, cantidadPlan: 36, saldo: 2 })))[0].alcanza).toBe(true);
  });
});

describe("el costo", () => {
  it("estimado contra real por concepto, con su momento donde todavía no hay real", () => {
    const t = textoCosto(orden())!;
    expect(t.filas.map((f) => f.concepto)).toEqual(["Tela", "Avíos", "Costura afuera"]);
    expect(t.filas[0]).toMatchObject({ estimado: "1,080.00", real: "1,050.00", realPendiente: false, detalle: "36 m de Gabardina" });
    expect(t.filas[1]).toMatchObject({ estimado: "96.00", real: "aún no", realPendiente: true });
    expect(t.filas[2]).toMatchObject({ estimado: "216.00", real: "al volver", realPendiente: true, detalle: "48 × S/ 4.50 · Confecciones del Norte" });
    expect(t.total).toEqual({ estimado: "1,392.00", real: "1,050.00" });
    expect(t.porPrenda).toEqual({ estimado: "29.00", real: "al cerrar", realPendiente: true });
  });
  it("con la Vuelta, el servicio muestra lo devengado; cerrada la orden, el real por prenda", () => {
    const p = orden();
    const conVuelta = { ...p, fases: p.fases.map((f) => (f.clave === "costura" ? { ...f, devengado: 207, fijoOrden: 80 } : f)) };
    expect(textoCosto(conVuelta)!.filas[2]).toMatchObject({ real: "207.00", realPendiente: false, detalle: "48 × S/ 4.50 · Confecciones del Norte + S/ 80.00 fijo", estimado: "296.00" });
    const cerrada = { ...p, orden: { ...p.orden, estado: "terminada" as const, cantidadBuenas: 46 } };
    expect(textoCosto(cerrada)!.porPrenda).toEqual({ estimado: "29.00", real: "22.83", realPendiente: false });
  });
  it("sin lote recibido no inventa un precio; sin permiso, no hay tabla", () => {
    const p = orden({ costos: { tela_estimado: 0, avios_estimado: 0, tela_real: 0, avios_real: 0, servicios_estimado: 216, servicios_devengado: 0, total_estimado: 216, total_real_hasta_hoy: 0 } });
    expect(textoCosto(p)!.filas[0].estimado).toBe("sin lote recibido");
    expect(textoCosto(orden({ costos: null }))).toBeNull();
    expect(textoCosto({ ...orden(), permisos: { puedeOperar: true, veCostos: false } })).toBeNull();
  });
  it("una orden sin tela ni servicios muestra solo el total", () => {
    const p = orden({ insumos: [], fases: [faseCruda({ clave: "corte", secuencia: 10, quien: "taller" }), faseCruda({ clave: "costura", secuencia: 30, quien: "taller" }), faseCruda({ clave: "acabado", secuencia: 60, quien: "taller" })], costos: { tela_estimado: 0, avios_estimado: 0, tela_real: 0, avios_real: 0, servicios_estimado: 0, servicios_devengado: 0, total_estimado: 0, total_real_hasta_hoy: 0 } });
    expect(textoCosto(p)!.filas).toEqual([]);
  });
});

describe("rojoDeLaOrden — las tres causas, cada una con su porqué", () => {
  it("una orden al día no pide nada", () => {
    expect(rojoDeLaOrden(orden(), "2026-10-17")).toEqual([]);
  });
  it("la entrega pasada", () => {
    expect(rojoDeLaOrden(orden(), "2026-10-26").map((c) => c.clave)).toContain("entrega_pasada");
    expect(rojoDeLaOrden(orden(), "2026-10-26").find((c) => c.clave === "entrega_pasada")?.porque).toBe("Era para el vie 23 oct y ya pasó hace 3 días.");
    expect(rojoDeLaOrden(orden(), "2026-10-24").find((c) => c.clave === "entrega_pasada")?.porque).toBe("Era para el vie 23 oct y ya pasó 1 día.");
    expect(rojoDeLaOrden(orden(), "2026-10-23").map((c) => c.clave)).not.toContain("entrega_pasada");
  });
  it("la tela que no llega", () => {
    const p = orden({ insumos: [{ id: "pi-1", insumo_id: "i-1", nombre: "Lino", tipo: "tela", unidad: "metro", color_codigo: null, consumo_por_prenda: 1.5, cantidad_plan: 72, usado: 0, saldo: 40 }] });
    const causa = rojoDeLaOrden(p, "2026-10-17").find((c) => c.clave === "tela_no_llega");
    expect(causa?.titulo).toBe("La tela no alcanza");
    expect(causa?.porque).toContain("lino (faltan 32 m)");
  });
  it(`${DIAS_SIN_MOVERSE} días sin que nadie anote nada; un servicio dentro de lo prometido no cuenta`, () => {
    const sinServicio = orden({
      fases: [faseCruda({ clave: "corte", secuencia: 10, quien: "taller", estado: "hecha" }, { entrada: 9, hechas: 8 }), faseCruda({ clave: "costura", secuencia: 30, quien: "taller", estado: "en_curso", actual: true }, { entrada: 8, hechas: 2 }), faseCruda({ clave: "acabado", secuencia: 60, quien: "taller" })],
    });
    const causa = rojoDeLaOrden(sinServicio, "2026-10-21").find((c) => c.clave === "sin_moverse");
    expect(causa).toEqual({ clave: "sin_moverse", titulo: "5 días sin moverse", porque: "Hace 5 días que nadie anota nada en esta orden: lo último fue el vie 16 oct." });
    expect(rojoDeLaOrden(sinServicio, "2026-10-19").map((c) => c.clave)).not.toContain("sin_moverse");
    expect(rojoDeLaOrden(sinServicio, "2026-10-20").map((c) => c.clave)).toContain("sin_moverse");
    // El servicio prometió para el mié 21: el 20 todavía está dentro de lo prometido.
    expect(rojoDeLaOrden(orden(), "2026-10-20").map((c) => c.clave)).not.toContain("sin_moverse");
    // Pasada la promesa, sí.
    expect(rojoDeLaOrden(orden(), "2026-10-22").map((c) => c.clave)).toContain("sin_moverse");
  });
  it("una orden cerrada o anulada no pide nada, aunque su fecha ya pasó", () => {
    for (const estado of ["terminada", "anulada"]) expect(rojoDeLaOrden(orden({ orden: { ...crudo().orden, estado } }), "2026-12-01")).toEqual([]);
  });
});

describe("lineaDeTiempoAgrupada", () => {
  it("agrupa por día, del más reciente al más viejo, con «Hoy» y «Ayer»", () => {
    const dias = lineaDeTiempoAgrupada(orden(), "2026-10-16");
    expect(dias.map((d) => d.etiqueta)).toEqual(["Hoy · viernes 16 de octubre", "Ayer · jueves 15 de octubre", "Martes 13 de octubre"]);
    expect(dias[0].hoy).toBe(true);
    expect(dias[1].hoy).toBe(false);
  });
  it("un «Terminé» de seis tallas es UNA entrada, con su resumen por color", () => {
    const [, ayer] = lineaDeTiempoAgrupada(orden(), "2026-10-16");
    expect(ayer.entradas).toHaveLength(1);
    expect(ayer.entradas[0]).toMatchObject({ titulo: "Terminó Corte", cuanto: "48 prendas", quien: "Rosa", detalle: "Negro 24 · Caqui 24", avanceIds: null });
    expect(ayer.entradas[0].ids).toHaveLength(6);
  });
  it("«Deshacer» solo si TODOS los avances de la entrada se pueden deshacer", () => {
    const c = crudo();
    for (const e of c.linea_de_tiempo) if (e.tipo === "avance") e.avance_id = `av-${e.id}` as never;
    const [, ayer] = lineaDeTiempoAgrupada(leerOrdenPagina(c)!, "2026-10-16");
    expect(ayer.entradas[0].avanceIds).toHaveLength(6);
    const c2 = crudo();
    for (const e of c2.linea_de_tiempo) if (e.tipo === "avance" && (e as { variante_id?: string }).variante_id !== "c32") e.avance_id = `av-${e.id}` as never;
    expect(lineaDeTiempoAgrupada(leerOrdenPagina(c2)!, "2026-10-16")[1].entradas[0].avanceIds).toBeNull();
  });
  it("la Salida y la apertura se muestran como las dice la base", () => {
    const [hoy, , antes] = lineaDeTiempoAgrupada(orden(), "2026-10-16");
    expect(hoy.entradas[0]).toMatchObject({ titulo: "Salida de Costura", detalle: "48 prendas a Confecciones del Norte", hora: "10:12", quien: "Rosa" });
    expect(antes.entradas[0]).toMatchObject({ titulo: "Abrió la orden", detalle: "48 prendas · afuera: Costura con Confecciones del Norte", quien: "Felipe" });
  });
  it("dos anotaciones lejos una de otra no se juntan", () => {
    const c = crudo();
    c.linea_de_tiempo = [
      { id: "x1", cuando: "2026-10-15T22:40:00.000+00:00", quien_nombre: "Rosa", tipo: "avance", fase_clave: "corte", fase_nombre: "Corte", cantidad: 8, detalle: "8", variante_id: "n28", avance_id: null },
      { id: "x2", cuando: "2026-10-15T22:50:00.000+00:00", quien_nombre: "Rosa", tipo: "avance", fase_clave: "corte", fase_nombre: "Corte", cantidad: 8, detalle: "8", variante_id: "n30", avance_id: null },
    ];
    expect(lineaDeTiempoAgrupada(leerOrdenPagina(c)!, "2026-10-16")[0].entradas).toHaveLength(2);
  });
});

describe("avancesNuevos — lo que «Deshacer» del aviso tiene que deshacer", () => {
  it("los avances de esa fase que no estaban antes y todavía se pueden deshacer", () => {
    const antes = orden().lineaDeTiempo;
    const c = crudo();
    c.linea_de_tiempo.push(
      { id: "nuevo-1", cuando: "2026-10-19T15:00:00+00:00", quien_nombre: "Rosa", tipo: "avance", fase_clave: "acabado", fase_nombre: "Acabado", cantidad: 5, detalle: "", variante_id: "n28", avance_id: "av-1" } as never,
      { id: "nuevo-2", cuando: "2026-10-19T15:00:00+00:00", quien_nombre: "Rosa", tipo: "avance", fase_clave: "acabado", fase_nombre: "Acabado", cantidad: 5, detalle: "", variante_id: "n30", avance_id: "av-2" } as never,
      { id: "nuevo-3", cuando: "2026-10-19T15:00:00+00:00", quien_nombre: "Rosa", tipo: "avance", fase_clave: "costura", fase_nombre: "Costura", cantidad: 5, detalle: "", variante_id: "n30", avance_id: "av-3" } as never,
      { id: "nuevo-4", cuando: "2026-10-19T15:00:00+00:00", quien_nombre: "Rosa", tipo: "avance", fase_clave: "acabado", fase_nombre: "Acabado", cantidad: 5, detalle: "", variante_id: "n32", avance_id: null } as never,
    );
    expect(avancesNuevos(antes, leerOrdenPagina(c)!.lineaDeTiempo, "acabado")).toEqual(["av-1", "av-2"]);
    expect(avancesNuevos(antes, antes, "acabado")).toEqual([]);
  });
  it("textoTermine", () => {
    expect(textoTermine(120, "Corte")).toBe("Terminaste 120 prendas de Corte");
    expect(textoTermine(1, "Acabado")).toBe("Terminaste 1 prenda de Acabado");
  });
});

// ---------- Paridad con la migración: lo que la página lee sale del SQL, no de la memoria ----------

const RAIZ = join(__dirname, "..", "..", "..");
const SQL = readFileSync(join(RAIZ, "supabase", "migrations", "20261014155000_produccion_avance_salida_y_vuelta.sql"), "utf8");
function funcion(nombre: string): string {
  const desde = SQL.indexOf(`create or replace function retail.${nombre}(`);
  expect(desde, nombre).toBeGreaterThan(-1);
  return SQL.slice(desde, SQL.indexOf("$$;", desde));
}

describe("paridad con la migración 20261014155000", () => {
  const cuerpo = funcion("fn_orden_produccion");
  it("cada llave que la página lee de fn_orden_produccion existe en la función", () => {
    const leidas = [
      // orden
      "numero_texto", "es_muestra", "fecha_entrega", "created_at", "creado_por_nombre", "inventariado_at", "cantidad_plan", "cantidad_buenas", "ubicacion_id", "ubicacion_nombre", "tejido_nombre", "referencia", "precio", "categoria", "prefijo", "familia",
      // líneas
      "variante_id", "color_codigo", "color_nombre", "color_hex", "talla",
      // por variante de cada fase
      "entrada", "hechas", "salieron", "volvieron_buenas", "segundas", "faltantes", "afuera",
      // tela
      "insumo_id", "unidad", "consumo_por_prenda", "usado", "saldo",
      // costos
      "tela_estimado", "avios_estimado", "tela_real", "avios_real", "servicios_estimado", "servicios_devengado", "total_estimado", "total_real_hasta_hoy",
      // línea de tiempo
      "quien_nombre", "fase_clave", "fase_nombre", "avance_id", "detalle", "cuando",
      // permisos
      "puede_operar", "ve_costos",
    ];
    for (const k of leidas) expect(cuerpo, k).toContain(`'${k}'`);
  });
  it("los cinco tipos de la línea de tiempo son los que la página sabe escribir", () => {
    const tipos = new Set([...cuerpo.matchAll(/'tipo', (?:case when a\.origen = 'deshacer' then 'deshacer' else 'avance' end|'(\w+)')/g)].map((m) => m[1] ?? "avance/deshacer"));
    expect([...tipos].sort()).toEqual(["apertura", "avance/deshacer", "salida", "vuelta"]);
  });
  it("las llaves de cada fase vienen de fn_fases_de_orden (en la migración anterior)", () => {
    const anterior = readFileSync(join(RAIZ, "supabase", "migrations", "20261014154000_produccion_fases_y_tela_de_la_orden.sql"), "utf8");
    for (const k of ["clave", "nombre", "secuencia", "posicion", "quien", "proveedor_id", "proveedor_nombre", "tarifa_prenda", "fijo_orden", "cantidad_minima", "fecha_prometida", "entrada", "hechas", "afuera", "salieron", "segundas", "faltantes", "estado", "actual", "empezada", "desde", "dias_en_fase", "devengado"]) {
      expect(anterior, k).toContain(`'${k}'`);
    }
  });
  it("las funciones que la página llama existen con los argumentos que les manda", () => {
    expect(SQL).toContain("create or replace function retail.registrar_avance(p_fase_id uuid, p_lineas jsonb, p_nota text default null)");
    expect(SQL).toContain("create or replace function retail.deshacer_avance(p_avance_id uuid)");
    const anterior = readFileSync(join(RAIZ, "supabase", "migrations", "20261014154000_produccion_fases_y_tela_de_la_orden.sql"), "utf8");
    expect(anterior).toMatch(/cambiar_quien_fase\(\s*p_fase_id uuid, p_quien text, p_proveedor_id uuid default null, p_tarifa_prenda numeric default null,\s*p_fijo_orden numeric default null, p_cantidad_minima integer default null, p_fecha_prometida date default null/);
  });
});
