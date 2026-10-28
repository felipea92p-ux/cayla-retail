import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIAS_SIN_MOVERSE,
  MAX_MOTIVO_ANULACION,
  RPC_ANULAR_PRODUCCION,
  RPC_ANULAR_SALIDA,
  RPC_ANULAR_VUELTA,
  RPC_CERRAR_PRODUCCION,
  RPC_DESHACER_MARCA,
  RPC_MARCAR_FASE,
  RPC_REVERTIR_PRODUCCION,
  RPC_TELA_PENDIENTE,
  accionesDeFase,
  avancesNuevos,
  avisoMinimoDeFase,
  buenasAlAnotarExcepcion,
  cantidadConUnidad,
  cantidadesAfuera,
  cantidadesQuePuedenSalir,
  cantidadesTerminadas,
  cantidadesQueFaltan,
  cifrasDeLaOrden,
  cuandoTerminoLaFase,
  detalleDeVuelta,
  devengadoDeLaRespuesta,
  diaCorto,
  esPrimeraFase,
  estadoDeLaOrden,
  faltaTerminar,
  fechaLimaDe,
  filasDeTela,
  fraseDeLaOrden,
  horaLima,
  insumosPorDevolver,
  leerOrdenPagina,
  lineaDeTiempoAgrupada,
  lineasDeCierre,
  lineasDeSalida,
  lineasDeVuelta,
  numeroDeOrdenEnUrl,
  prendasAfuera,
  previaQueCuenta,
  problemaDeAnulacion,
  problemasDeCierre,
  problemasDeSalida,
  problemasDeVuelta,
  puedeCambiarQuien,
  puedeRegistrarQuien,
  esPendienteDeRegistrar,
  fasesSinRegistrar,
  queSigue,
  quedanAfuera,
  quienDeFase,
  resumenDeCierre,
  rojoDeLaOrden,
  rpcDeAnulacion,
  textoAnulaste,
  textoAnulasteLaOrden,
  textoApertura,
  textoColoresYTallas,
  textoCosto,
  textoDeFase,
  textoMandaste,
  textoPasasteAlStock,
  textoPrendasAfuera,
  textoQuePasaAlRevertir,
  totalDeCierre,
  textoQuePasaAlAnular,
  textoQueSigue,
  textoSeVende,
  textoTermine,
  textoVolvieron,
  todasLasQueCuentanHechas,
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
/** La misma orden con el corte todavía en curso: la tela que falta usar sigue haciendo falta (con el corte hecho ya no). */
const sinTerminarElCorte = () => crudo().fases.map((f) => (f.clave === "corte" ? { ...f, estado: "en_curso" } : f));

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
    expect(textoSeVende(129)).toBe("se vende a S/\u00a0129.00");
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
    expect(c.costo).toEqual({ valor: 1050, nota: "de S/\u00a01,392.00", etiqueta: "Costo hasta hoy" });
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

  it("«pendiente de registrar» (ADR-0551 pendiente de registrar): un servicio sin proveedor; se dice así, se puede registrar aunque la fase ya empezó y solo con la orden en proceso", () => {
    const pendiente: FasePagina = { ...costura, proveedorId: null, proveedorNombre: null };
    expect(esPendienteDeRegistrar(pendiente)).toBe(true);
    expect(esPendienteDeRegistrar(costura)).toBe(false);
    expect(esPendienteDeRegistrar(corte)).toBe(false);
    expect(quienDeFase(pendiente)).toBe("Pendiente de registrar");
    expect(fasesSinRegistrar([corte, pendiente, acabado])).toEqual([pendiente]);
    expect(puedeCambiarQuien(pendiente, p)).toBe(false); // ya empezó: quién la hace no se cambia…
    expect(puedeRegistrarQuien(pendiente, p)).toBe(true); // …pero SÍ se registra quién fue
    expect(puedeRegistrarQuien(costura, p)).toBe(false);
    expect(puedeRegistrarQuien(pendiente, { ...p, permisos: { puedeOperar: false, veCostos: true } })).toBe(false);
    expect(puedeRegistrarQuien(pendiente, { ...p, orden: { ...p.orden, estado: "terminada" } })).toBe(false);
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
  it("cada fila dice si es tela o avío, y la tela va primero aunque el avío esté antes en la base", () => {
    const [tela, avio] = orden().insumos;
    const alReves = [avio, tela];
    expect(filasDeTela(alReves).map((f) => [f.nombre, f.tipo])).toEqual([["Gabardina · negro", "tela"], ["Botón", "avio"]]);
  });
  it("un avío de UN color dice su color en el nombre, y el mismo avío en dos colores es una sola fila con el detalle", () => {
    const [, boton] = orden().insumos;
    const deUnColor = { ...boton, colorCodigo: "BEI", colorNombre: "Beige" };
    expect(filasDeTela([deUnColor])[0]).toMatchObject({ nombre: "Botón · beige", tipo: "avio" });
    const dosColores = [deUnColor, { ...boton, id: "pi-b", colorCodigo: "NEG", colorNombre: "Negro" }];
    expect(filasDeTela(dosColores)).toHaveLength(1);
    expect(filasDeTela(dosColores)[0].detalle).toContain("beige");
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
    expect(t.filas[2]).toMatchObject({ estimado: "216.00", real: "al volver", realPendiente: true, detalle: "48 × S/\u00a04.50 · Confecciones del Norte" });
    expect(t.total).toEqual({ estimado: "1,392.00", real: "1,050.00" });
    expect(t.porPrenda).toEqual({ estimado: "29.00", real: "al cerrar", realPendiente: true });
  });
  it("con la Vuelta, el servicio muestra lo devengado; cerrada la orden, el real por prenda", () => {
    const p = orden();
    const conVuelta = { ...p, fases: p.fases.map((f) => (f.clave === "costura" ? { ...f, devengado: 207, fijoOrden: 80 } : f)) };
    expect(textoCosto(conVuelta)!.filas[2]).toMatchObject({ real: "207.00", realPendiente: false, detalle: "48 × S/\u00a04.50 · Confecciones del Norte + S/\u00a080.00 fijo", estimado: "296.00" });
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
    // El corte todavía no terminó: la tela que falta usar sigue haciendo falta.
    const p = orden({ fases: sinTerminarElCorte(), insumos: [{ id: "pi-1", insumo_id: "i-1", nombre: "Lino", tipo: "tela", unidad: "metro", color_codigo: null, consumo_por_prenda: 1.5, cantidad_plan: 72, usado: 0, saldo: 40 }] });
    const causa = rojoDeLaOrden(p, "2026-10-17").find((c) => c.clave === "tela_no_llega");
    expect(causa?.titulo).toBe("La tela no alcanza");
    expect(causa?.porque).toContain("lino (faltan 32 m)");
  });
  it("con el corte HECHO la tela ya no falta: lo que sobra del plan no pone la orden en rojo (OP-343: plan 75.6 m, usado 44 m, 0 m en el estante); los avíos sí pueden faltar después del corte", () => {
    const lino = { id: "pi-1", insumo_id: "i-1", nombre: "Lino", tipo: "tela", unidad: "metro", color_codigo: null, consumo_por_prenda: 1.575, cantidad_plan: 75.6, usado: 44, saldo: 0 };
    const botones = { id: "pi-2", insumo_id: "i-2", nombre: "Botón", tipo: "avio", unidad: "unidad", color_codigo: null, consumo_por_prenda: 2, cantidad_plan: 96, usado: 0, saldo: 0 };
    expect(rojoDeLaOrden(orden({ insumos: [lino] }), "2026-10-17").map((c) => c.clave)).not.toContain("tela_no_llega");
    expect(filasDeTela(orden({ insumos: [lino] }).insumos, true)[0]).toMatchObject({ alcanza: true, faltan: null, yaCortada: true });
    const conAvio = rojoDeLaOrden(orden({ insumos: [lino, botones] }), "2026-10-17").find((c) => c.clave === "tela_no_llega");
    expect(conAvio?.porque).toContain("botón (faltan 96 und)");
    expect(conAvio?.porque).not.toContain("lino");
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

// ---------- Salida y Vuelta (actividad 4) ----------

describe("Salida y Vuelta — lo que se puede mandar y lo que está afuera, por talla y color", () => {
  /** La costura de la orden de ejemplo: a cada talla y color entraron 8, salieron 8 (todo está afuera). */
  const costura = (o: ReturnType<typeof orden>) => o.fases.find((f) => f.clave === "costura")!;
  const nombreDe = (id: string) => `la variante ${id}`;
  const vacio = {};

  it("una fase con todo afuera no tiene nada por mandar; lo que está afuera es lo que salió menos lo que volvió", () => {
    const f = costura(orden());
    expect(cantidadesQuePuedenSalir(f)).toEqual({});
    expect(cantidadesAfuera(f)).toEqual(Object.fromEntries(TODAS.map((id) => [id, 8])));
  });
  it("sin salir nada, lo que puede salir es lo que entró; y nada está afuera", () => {
    const o = orden({ fases: [crudo().fases[0], faseCruda({ clave: "costura", secuencia: 30, quien: "servicio", proveedor_id: "pv-1", proveedor_nombre: "Confecciones del Norte", tarifa_prenda: 4.5, estado: "pendiente" }, { entrada: 8 }), crudo().fases[2]] });
    const f = costura(o);
    expect(cantidadesQuePuedenSalir(f)).toEqual(Object.fromEntries(TODAS.map((id) => [id, 8])));
    expect(cantidadesAfuera(f)).toEqual({});
  });
  it("lo que ya salió se descuenta de lo que puede salir, talla por talla", () => {
    const o = orden({ fases: [crudo().fases[0], faseCruda({ clave: "costura", secuencia: 30, quien: "servicio", proveedor_id: "pv-1", proveedor_nombre: "X", tarifa_prenda: 4.5 }, { entrada: 8, salieron: 5, afuera: 5 }), crudo().fases[2]] });
    expect(Object.values(cantidadesQuePuedenSalir(costura(o)))).toEqual([3, 3, 3, 3, 3, 3]);
  });

  describe("problemasDeSalida", () => {
    const sinNada = orden({ fases: [crudo().fases[0], faseCruda({ clave: "costura", secuencia: 30, quien: "servicio", proveedor_id: "pv-1", proveedor_nombre: "X", tarifa_prenda: 4.5 }, { entrada: 8 }), crudo().fases[2]] });
    it("nada escrito: pide escribir algo (salida_sin_lineas)", () => {
      expect(problemasDeSalida(costura(sinNada), vacio, nombreDe).map((p) => p.hint)).toEqual(["salida_sin_lineas"]);
      expect(problemasDeSalida(costura(sinNada), { n28: "0", n30: "", c28: "x" }, nombreDe).map((p) => p.hint)).toEqual(["salida_sin_lineas"]);
    });
    it("de más: dice de cuál talla y color y cuánto sí puede (salida_excede)", () => {
      const p = problemasDeSalida(costura(sinNada), { n28: "9", n30: "8" }, nombreDe);
      expect(p).toEqual([{ hint: "salida_excede", texto: "De la variante n28 solo puedes mandar 8: escribiste 9." }]);
    });
    it("lo justo y lo parcial no tienen problemas", () => {
      expect(problemasDeSalida(costura(sinNada), Object.fromEntries(TODAS.map((id) => [id, "8"])), nombreDe)).toEqual([]);
      expect(problemasDeSalida(costura(sinNada), { n28: "3" }, nombreDe)).toEqual([]);
    });
    it("una talla sin nada listo para mandar lo dice con otra frase", () => {
      const p = problemasDeSalida(costura(orden()), { n28: "1" }, nombreDe);
      expect(p).toEqual([{ hint: "salida_excede", texto: "De la variante n28 no hay nada listo para mandar." }]);
    });
    it("lineasDeSalida manda solo lo mayor que cero, en el orden de la fase y con enteros", () => {
      expect(lineasDeSalida(costura(sinNada), { c30: "2", n28: "5", n30: "0", n32: "", c28: "3.9" })).toEqual([
        { variante_id: "n28", cantidad: 5 },
        { variante_id: "c28", cantidad: 3 },
        { variante_id: "c30", cantidad: 2 },
      ]);
    });
  });

  describe("problemasDeVuelta", () => {
    const f = () => costura(orden());
    const buenasTodas = Object.fromEntries(TODAS.map((id) => [id, "8"]));
    it("nada escrito (vuelta_sin_lineas)", () => {
      expect(problemasDeVuelta(f(), { buenas: {}, segundas: {}, faltantes: {} }, "", nombreDe).map((p) => p.hint)).toEqual(["vuelta_sin_lineas"]);
    });
    it("todo volvió bueno: sin problemas y sin motivo", () => {
      expect(problemasDeVuelta(f(), { buenas: buenasTodas, segundas: {}, faltantes: {} }, "", nombreDe)).toEqual([]);
    });
    it("de más: buenas + segundas + faltantes pasan de lo que hay afuera (vuelta_excede)", () => {
      const p = problemasDeVuelta(f(), { buenas: { n28: "8" }, segundas: { n28: "1" }, faltantes: {} }, "salió con una mancha", nombreDe);
      expect(p).toEqual([{ hint: "vuelta_excede", texto: "De la variante n28 hay 8 afuera: anotaste 9." }]);
    });
    it("segundas o faltantes sin decir qué pasó (vuelta_sin_motivo); con el motivo, nada", () => {
      const c = { buenas: { n28: "6" }, segundas: { n28: "1" }, faltantes: { n28: "1" } };
      expect(problemasDeVuelta(f(), c, "  ", nombreDe).map((p) => p.hint)).toEqual(["vuelta_sin_motivo"]);
      expect(problemasDeVuelta(f(), c, "se perdieron en el taller", nombreDe)).toEqual([]);
    });
    it("el motivo viaja solo en las líneas que traen segundas o faltantes, y las celdas en cero no viajan", () => {
      const c = { buenas: { n28: "6", n30: "8" }, segundas: { n28: "1" }, faltantes: { n28: "1" } };
      expect(lineasDeVuelta(f(), c, " se perdieron ")).toEqual([
        { variante_id: "n28", buenas: 6, segundas: 1, faltantes: 1, motivo: "se perdieron" },
        { variante_id: "n30", buenas: 8, segundas: 0, faltantes: 0, motivo: null },
      ]);
    });
    it("quedanAfuera: lo que hay afuera menos lo que se está anotando, nunca negativo", () => {
      expect(quedanAfuera(f(), { buenas: {}, segundas: {}, faltantes: {} })).toBe(48);
      expect(quedanAfuera(f(), { buenas: buenasTodas, segundas: {}, faltantes: {} })).toBe(0);
      expect(quedanAfuera(f(), { buenas: { n28: "5" }, segundas: { n28: "1" }, faltantes: { n28: "1" } })).toBe(41);
      // Pasarse en una celda no hace negativo el total (el exceso lo dice `problemasDeVuelta`, por talla y color).
      expect(quedanAfuera(f(), { buenas: { n28: "99" }, segundas: {}, faltantes: {} })).toBe(0);
    });
  });

  describe("buenasAlAnotarExcepcion — «volvieron buenas» nace con todo; lo que faltó deja de ser bueno", () => {
    it("una celda cuadrada baja sus buenas al anotar una segunda o un faltante", () => {
      expect(buenasAlAnotarExcepcion({ afuera: 8, buenas: "8", segundas: "", faltantes: "" }, { faltantes: "3" })).toBe("5");
      expect(buenasAlAnotarExcepcion({ afuera: 8, buenas: "5", segundas: "", faltantes: "3" }, { segundas: "2" })).toBe("3");
    });
    it("quitar la excepción devuelve las buenas", () => {
      expect(buenasAlAnotarExcepcion({ afuera: 8, buenas: "5", segundas: "", faltantes: "3" }, { faltantes: "" })).toBe("8");
    });
    it("una celda que la persona ya dejó sin cuadrar no se toca", () => {
      expect(buenasAlAnotarExcepcion({ afuera: 8, buenas: "4", segundas: "", faltantes: "" }, { faltantes: "3" })).toBe("4");
    });
    it("nunca baja de cero", () => {
      expect(buenasAlAnotarExcepcion({ afuera: 8, buenas: "8", segundas: "", faltantes: "" }, { faltantes: "20" })).toBe("0");
    });
  });

  describe("los textos", () => {
    it("el aviso de una Salida y el de una Vuelta", () => {
      expect(textoMandaste(48, "Confecciones del Norte")).toBe("Mandaste 48 prendas a Confecciones del Norte");
      expect(textoMandaste(1, "X")).toBe("Mandaste 1 prenda a X");
      expect(textoVolvieron({ buenas: 40, segundas: 5, faltantes: 3 }, "Confecciones del Norte")).toBe("Volvieron 40 prendas buenas de Confecciones del Norte");
      expect(textoVolvieron({ buenas: 1, segundas: 0, faltantes: 0 }, "X")).toBe("Volvieron 1 prenda buena de X");
      expect(textoVolvieron({ buenas: 0, segundas: 0, faltantes: 4 }, "X")).toBe("Anotaste lo que pasó con las prendas de X");
    });
    it("el renglón de una Vuelta dice lo que no volvió bueno y, si se ven costos, lo que se le debe", () => {
      expect(detalleDeVuelta({ numeroTexto: "OP-000002", segundas: 0, faltantes: 0, devengado: null })).toBe("OP-000002");
      expect(detalleDeVuelta({ numeroTexto: "OP-000002", segundas: 5, faltantes: 3, devengado: 180 })).toBe("OP-000002 · 5 segundas · 3 faltaron: queda anotado por qué · se le deben S/\u00a0180.00 hasta ahora");
      expect(detalleDeVuelta({ numeroTexto: "OP-000002", segundas: 0, faltantes: 1, devengado: 0 })).toBe("OP-000002 · 1 faltó: queda anotado por qué");
    });
    it("el devengado se lee de la respuesta de la base, o es null", () => {
      expect(devengadoDeLaRespuesta([{ id: "a", devengado: 81 }, { id: "b", devengado: null }], "a")).toBe(81);
      expect(devengadoDeLaRespuesta([{ id: "a", devengado: "81.00" }], "a")).toBe(81);
      expect(devengadoDeLaRespuesta([{ id: "b", devengado: null }], "b")).toBeNull();
      expect(devengadoDeLaRespuesta([{ id: "a", devengado: 1 }], "otra")).toBeNull();
      expect(devengadoDeLaRespuesta("no es una lista", "a")).toBeNull();
      expect(devengadoDeLaRespuesta(null, "a")).toBeNull();
    });
  });

  describe("paridad con registrar_salida y registrar_vuelta (20261014155000)", () => {
    const salida = funcion("registrar_salida");
    const vuelta = funcion("registrar_vuelta");
    it("las dos llaman con los argumentos que la página manda", () => {
      expect(SQL).toContain("create or replace function retail.registrar_salida(p_fase_id uuid, p_lineas jsonb, p_guia text default null, p_nota text default null)");
      expect(SQL).toContain("create or replace function retail.registrar_vuelta(p_fase_id uuid, p_lineas jsonb, p_guia text default null, p_nota text default null)");
    });
    it("los hints que la pantalla sabe decir existen en la base (la Salida valida sus líneas con el ayudante compartido, que arma «salida_…» con el nombre de la operación)", () => {
      const ayudante = funcion("fn_produccion_lineas_cantidad");
      expect(salida).toContain("fn_produccion_lineas_cantidad(p_lineas, 'salida')");
      expect(ayudante).toContain("p_que || '_sin_lineas'");
      expect(salida).toContain("hint = 'salida_excede'");
      for (const h of ["vuelta_sin_lineas", "vuelta_excede", "vuelta_sin_motivo"]) expect(vuelta, h).toContain(`hint = '${h}'`);
    });
    it("las llaves de cada línea son las que lee la base", () => {
      const ayudante = funcion("fn_produccion_lineas_cantidad");
      for (const k of ["variante_id", "cantidad"]) expect(ayudante, k).toContain(`->> '${k}'`);
      for (const k of ["variante_id", "buenas", "segundas", "faltantes", "motivo"]) expect(vuelta, k).toContain(`->> '${k}'`);
    });
    it("el tope de la Salida es lo que entró menos lo que ya salió, y el de la Vuelta es lo que salió menos lo que ya volvió", () => {
      expect(vuelta).toMatch(/v_volvieron \+ v_buenas \+ v_segundas \+ v_faltantes > v_salieron/);
      expect(salida).toContain("salida_excede");
    });
    it("la Vuelta suma sus buenas como avance de la fase (por eso hechas cuenta lo que volvió bueno)", () => {
      expect(vuelta).toMatch(/insert into retail\.produccion_avances[\s\S]*'vuelta'/);
    });
  });
});

// ---------- Anular una salida o una vuelta (ADR-0400, actividad 4b) ----------

describe("anular una salida o una vuelta", () => {
  const SQL_ANULAR = readFileSync(join(RAIZ, "supabase", "migrations", "20261015160000_produccion_anular_salida_y_vuelta.sql"), "utf8");
  const evento = (e: Record<string, unknown>) => ({ cuando: "2026-10-16T16:00:00+00:00", quien_nombre: "Rosa", fase_clave: "costura", fase_nombre: "Costura", cantidad: 20, detalle: null, avance_id: null, ...e });
  const conEventos = (...eventos: Record<string, unknown>[]) => orden({ linea_de_tiempo: eventos.map((e, i) => evento({ id: `e-${i}`, ...e })) });

  it("la lectura trae lo que la base marca en cada salida y vuelta, y por defecto nada es anulable ni está anulado", () => {
    const [sinMarca, conMarca] = conEventos({ tipo: "salida" }, { tipo: "vuelta", anulable: true, anulada: true }).lineaDeTiempo;
    expect(sinMarca).toMatchObject({ anulable: false, anulada: false, anula: null, motivo: null });
    expect(conMarca).toMatchObject({ anulable: true, anulada: true });
  });

  it("una salida o una vuelta que se puede anular ofrece «Anular» con su id; una ya anulada no, y se lee apagada", () => {
    const dias = lineaDeTiempoAgrupada(
      conEventos(
        { id: "s-1", tipo: "salida", anulable: true, cuando: "2026-10-16T16:00:00+00:00" },
        { id: "v-1", tipo: "vuelta", anulable: true, anulada: false, cuando: "2026-10-16T15:00:00+00:00" },
        { id: "s-2", tipo: "salida", anulable: false, anulada: true, cuando: "2026-10-16T14:00:00+00:00" },
        { id: "s-3", tipo: "salida", anulable: false, anulada: false, cuando: "2026-10-16T13:00:00+00:00" }
      ),
      "2026-10-16"
    );
    const [salida, vuelta, anulada, sinAnular] = dias[0].entradas;
    expect(salida.anulable).toEqual({ id: "s-1", que: "salida" });
    expect(vuelta.anulable).toEqual({ id: "v-1", que: "vuelta" });
    expect(anulada).toMatchObject({ anulable: null, anulada: true });
    expect(sinAnular).toMatchObject({ anulable: null, anulada: false });
  });

  it("una base que marca anulable y anulada a la vez no ofrece Anular (la anulada manda)", () => {
    const [entrada] = lineaDeTiempoAgrupada(conEventos({ id: "s-1", tipo: "salida", anulable: true, anulada: true }), "2026-10-16")[0].entradas;
    expect(entrada.anulable).toBeNull();
  });

  it("la anulación es su propia entrada: qué anuló, cuántas prendas y por qué; nunca ofrece Anular ni se lee apagada", () => {
    const [salida, vuelta] = lineaDeTiempoAgrupada(
      conEventos(
        { id: "a-1", tipo: "anulacion", anula: "salida", cantidad: 20, motivo: "me equivoqué de taller", cuando: "2026-10-16T16:00:00+00:00" },
        { id: "a-2", tipo: "anulacion", anula: "vuelta", cantidad: 18, motivo: "la guía era de otra orden", cuando: "2026-10-16T15:00:00+00:00" }
      ),
      "2026-10-16"
    )[0].entradas;
    expect(salida).toMatchObject({ titulo: "Anuló la salida de Costura", cuanto: "20 prendas", detalle: "Por qué: me equivoqué de taller", anulable: null, anulada: false });
    expect(vuelta).toMatchObject({ titulo: "Anuló la vuelta de Costura", cuanto: "18 prendas buenas", detalle: "Por qué: la guía era de otra orden" });
  });

  it("el motivo es obligatorio y los espacios no cuentan (como anular_sin_motivo en la base)", () => {
    expect(problemaDeAnulacion("")).toBe("Cuéntanos por qué se anula.");
    expect(problemaDeAnulacion("   \n ")).toBe("Cuéntanos por qué se anula.");
    expect(problemaDeAnulacion("me equivoqué")).toBeNull();
    expect(MAX_MOTIVO_ANULACION).toBe(200);
  });

  it("cada cosa que se anula llama a su función, y los textos hablan de salida o de vuelta", () => {
    expect(rpcDeAnulacion("salida")).toBe(RPC_ANULAR_SALIDA);
    expect(rpcDeAnulacion("vuelta")).toBe(RPC_ANULAR_VUELTA);
    expect(textoAnulaste("salida")).toBe("Anulaste la salida");
    expect(textoAnulaste("vuelta")).toBe("Anulaste la vuelta");
    expect(textoQuePasaAlAnular("salida")).toContain("dejan de contarse como enviadas");
    expect(textoQuePasaAlAnular("vuelta")).toContain("vuelven a estar afuera");
    expect(textoQuePasaAlAnular("salida")).toContain("no se borra");
  });

  describe("paridad con la migración 20261015160000", () => {
    it("las dos funciones existen con los argumentos que la hoja manda", () => {
      expect(SQL_ANULAR).toContain(`create or replace function retail.${RPC_ANULAR_SALIDA}(p_salida_id uuid, p_motivo text)`);
      expect(SQL_ANULAR).toContain(`create or replace function retail.${RPC_ANULAR_VUELTA}(p_vuelta_id uuid, p_motivo text)`);
    });
    it("el motivo es obligatorio también en la base, y los espacios no cuentan", () => {
      expect(SQL_ANULAR).toContain("hint = 'anular_sin_motivo'");
      expect(SQL_ANULAR).toContain("nullif(btrim(coalesce(p_motivo, '')), '')");
    });
    it("la línea de tiempo manda lo que la pantalla lee de cada anulación y de cada salida o vuelta", () => {
      for (const k of ["anulada", "anulable", "anula", "motivo"]) expect(SQL_ANULAR, k).toContain(`'${k}'`);
      expect(SQL_ANULAR).toContain("'tipo', 'anulacion'");
      expect(SQL_ANULAR).toContain("'anula', 'salida'");
      expect(SQL_ANULAR).toContain("'anula', 'vuelta'");
    });
    it("los rechazos que la pantalla puede mostrar existen como hint en la base", () => {
      for (const h of ["anular_inexistente", "anular_es_anulacion", "anular_ya_anulada", "anular_ya_volvio", "anular_ya_avanzo"]) expect(SQL_ANULAR, h).toContain(h);
    });
    it("anular nunca toca el stock ni los libros: ninguna de las dos escribe en movimientos", () => {
      expect(SQL_ANULAR).not.toMatch(/insert into retail\.(movimientos|movimientos_insumo|stock)\b/);
    });
  });
});

// ---------- Pasar la orden al stock, anularla y revertirla (ADR-0400, actividad 6) ----------

describe("pasar la orden al stock, anularla y revertirla", () => {
  const nombreDe = (id: string) => `la variante ${id}`;
  const costuraHecha = faseCruda({ clave: "costura", secuencia: 30, quien: "servicio", proveedor_id: "pv-1", proveedor_nombre: "Confecciones del Norte", tarifa_prenda: 4.5, estado: "hecha" }, { entrada: 8, salieron: 8, hechas: 8 });
  const corteHecho = faseCruda({ clave: "corte", secuencia: 10, quien: "taller", estado: "hecha" }, { entrada: 9, hechas: 8 });
  /** Las tres fases hechas; a cada talla y color entraron 8 a Acabado y `hechas` salieron buenas. */
  const lista = (hechas = 8, parche: Record<string, unknown> = {}) => orden({ fases: [corteHecho, costuraHecha, faseCruda({ clave: "acabado", secuencia: 60, quien: "taller", estado: "hecha" }, { entrada: 8, hechas })], ...parche });
  const escritas = (n: number) => Object.fromEntries(TODAS.map((id) => [id, String(n)]));

  it("lo terminado en la última fase, por talla y color, es lo que puede entrar al stock (y el valor de fábrica de la hoja)", () => {
    expect(cantidadesTerminadas(lista(8).fases)).toEqual(Object.fromEntries(TODAS.map((id) => [id, 8])));
    expect(cantidadesTerminadas(lista(5).fases)).toEqual(Object.fromEntries(TODAS.map((id) => [id, 5])));
    expect(cantidadesTerminadas(lista(0).fases)).toEqual({});
    expect(cantidadesTerminadas([])).toEqual({});
  });

  it("prendas afuera: la primera fase de la ruta que las tiene, y la frase de la base (con cuántas, de qué fase y con quién)", () => {
    expect(prendasAfuera(lista().fases)).toBeNull();
    const afuera = orden(); // la costura de la orden de ejemplo tiene 48 afuera con Confecciones del Norte
    const a = prendasAfuera(afuera.fases);
    expect(a).toMatchObject({ n: 48, servicio: "Confecciones del Norte" });
    expect(textoPrendasAfuera(a!)).toBe("Hay 48 prendas de Costura afuera con Confecciones del Norte: anota primero su vuelta (o los faltantes, con su motivo).");
    expect(textoPrendasAfuera({ fase: a!.fase, servicio: "un servicio", n: 1 })).toContain("Hay 1 prenda de Costura");
  });

  it("sin problemas cuando entra lo terminado o menos; de más, una frase por talla y color; ninguna buena, se anula", () => {
    const o = lista(8);
    expect(problemasDeCierre(o.fases, o.lineas, escritas(8), nombreDe)).toEqual([]);
    expect(problemasDeCierre(o.fases, o.lineas, escritas(3), nombreDe)).toEqual([]);
    expect(problemasDeCierre(o.fases, o.lineas, { ...escritas(8), n28: "9", c32: "10" }, nombreDe)).toEqual([
      { hint: "cierre_buenas_exceden", texto: "No puedes pasar al stock 9 de la variante n28: en Acabado se terminaron 8." },
      { hint: "cierre_buenas_exceden", texto: "No puedes pasar al stock 10 de la variante c32: en Acabado se terminaron 8." },
    ]);
    expect(problemasDeCierre(o.fases, o.lineas, {}, nombreDe).map((p) => p.hint)).toEqual(["cierre_sin_buenas"]);
    expect(problemasDeCierre(o.fases, o.lineas, escritas(0), nombreDe).map((p) => p.hint)).toEqual(["cierre_sin_buenas"]);
  });

  it("con prendas todavía afuera no se pasa al stock, y eso manda sobre lo demás", () => {
    const o = orden();
    expect(problemasDeCierre(o.fases, o.lineas, escritas(8), nombreDe).map((p) => p.hint)).toEqual(["cierre_con_prendas_afuera"]);
  });

  it("las líneas de cerrar_produccion: una por talla y color de la orden, las que no se escribieron en cero y con enteros", () => {
    const o = lista(8);
    expect(lineasDeCierre(o.lineas, { n28: "8", n30: "3.9", c28: "x" })).toEqual([
      { variante_id: "n28", cantidad: 8 },
      { variante_id: "n30", cantidad: 3 },
      { variante_id: "n32", cantidad: 0 },
      { variante_id: "c28", cantidad: 0 },
      { variante_id: "c30", cantidad: 0 },
      { variante_id: "c32", cantidad: 0 },
    ]);
    expect(totalDeCierre({ n28: "8", n30: "3.9", c28: "x", c30: "-4" })).toBe(11);
  });

  it("el resumen: las segundas y faltantes quedan anotadas, y quien ve los costos ve cuánto sale cada prenda (el costo se reparte entre las buenas)", () => {
    const o = lista(8);
    o.fases[1] = { ...o.fases[1], segundas: 2, faltantes: 1 };
    const conCostos = { ...o, costos: { telaEstimado: 0, aviosEstimado: 0, telaReal: 0, aviosReal: 0, serviciosEstimado: 0, serviciosDevengado: 216, totalEstimado: 0, totalRealHastaHoy: 216 }, permisos: { puedeOperar: true, veCostos: true } };
    expect(resumenDeCierre(conCostos, 48)).toEqual({ buenas: 48, segundas: 2, faltantes: 1, costoTotal: 216, costoPorPrenda: 4.5 });
    expect(resumenDeCierre(conCostos, 36).costoPorPrenda).toBe(6);
    expect(resumenDeCierre(conCostos, 0)).toMatchObject({ costoTotal: 216, costoPorPrenda: null });
    expect(resumenDeCierre({ ...conCostos, permisos: { puedeOperar: true, veCostos: false } }, 48)).toMatchObject({ costoTotal: null, costoPorPrenda: null });
    expect(resumenDeCierre({ ...conCostos, costos: null }, 48)).toMatchObject({ costoTotal: null, costoPorPrenda: null });
  });

  it("los avisos: cuántas entraron (o que la muestra se dio por terminada), y que la orden se anuló o volvió a estar en proceso", () => {
    expect(textoPasasteAlStock(48, "Pantalón Lía", false)).toBe("48 prendas de Pantalón Lía entraron al stock del Taller");
    expect(textoPasasteAlStock(1, "Pantalón Lía", false)).toBe("1 prenda de Pantalón Lía entró al stock del Taller");
    expect(textoPasasteAlStock(3, "Pantalón Lía", true)).toBe("Muestra Pantalón Lía terminada");
    expect(textoAnulasteLaOrden("Pantalón Lía")).toBe("Orden de Pantalón Lía anulada");
  });

  it("al anular, la tela y los avíos que ya se usaron vuelven al estante: una vez por insumo, y solo los usados", () => {
    expect(insumosPorDevolver(orden().insumos)).toEqual([{ nombre: "Gabardina", texto: "35 m" }]);
    const dosColores = orden().insumos.flatMap((i) => [i, { ...i, id: `${i.id}-b`, colorNombre: "Caqui" }]);
    expect(insumosPorDevolver(dosColores)).toEqual([{ nombre: "Gabardina", texto: "35 m" }]);
    expect(insumosPorDevolver([])).toEqual([]);
  });

  it("al revertir, dice qué pasa con el stock: las prendas salen (con un movimiento) o, en una muestra, nada que devolver", () => {
    expect(textoQuePasaAlRevertir({ inventariadoEn: "2026-10-15T12:00:00+00:00", cantidadBuenas: 46 })).toContain("Las 46 prendas salen del stock del Taller");
    expect(textoQuePasaAlRevertir({ inventariadoEn: null, cantidadBuenas: 3 })).toBe("La muestra vuelve a estar en proceso. No había stock que devolver.");
  });

  describe("paridad con la migración 20261014160000", () => {
    const SQL_CIERRE = readFileSync(join(RAIZ, "supabase", "migrations", "20261014160000_produccion_cierre_al_stock_y_costos_del_taller.sql"), "utf8");
    const cerrar = SQL_CIERRE.slice(SQL_CIERRE.indexOf("create or replace function retail.cerrar_produccion("), SQL_CIERRE.indexOf("-- ---------- 4. Anular una orden"));
    it("la web llama a las tres funciones con los nombres y los argumentos que la base declara", () => {
      expect(RPC_CERRAR_PRODUCCION).toBe("cerrar_produccion");
      expect(RPC_ANULAR_PRODUCCION).toBe("anular_produccion");
      expect(RPC_REVERTIR_PRODUCCION).toBe("revertir_produccion");
      for (const arg of ["p_produccion_id uuid", "p_buenas jsonb", "p_costo_tela numeric", "p_costo_avios numeric", "p_costo_maquila numeric", "p_confirma_costo_atipico boolean"]) expect(cerrar, arg).toContain(arg);
      expect(SQL_CIERRE).toContain("create or replace function retail.anular_produccion(p_produccion_id uuid, p_motivo text default null)");
    });
    it("cada línea que manda la hoja lleva las llaves que lee la base", () => {
      for (const k of ["variante_id", "cantidad"]) expect(cerrar, k).toContain(`->> '${k}'`);
    });
    it("los hints y las frases que la hoja sabe decir existen en la base, con las mismas palabras", () => {
      for (const h of ["cierre_con_prendas_afuera", "cierre_buenas_exceden"]) expect(cerrar, h).toContain(`hint = '${h}'`);
      expect(SQL_CIERRE).toContain("hint = 'anular_con_prendas_afuera'");
      expect(SQL_CIERRE.match(/anota primero su vuelta \(o los faltantes, con su motivo\)/g)).toHaveLength(2);
      expect(cerrar).toContain("No puedes pasar al stock % de %: en % se terminaron %");
      expect(cerrar).toContain("No salió ninguna prenda buena — si la corrida se perdió, anula la orden en vez de cerrarla");
    });
    it("el costo de los servicios sale de lo devengado, y los montos de tela y avíos siguen siendo los del libro de insumos", () => {
      expect(cerrar).toContain("coalesce(p_costo_maquila, retail.fn_costo_servicios_orden(p_produccion_id))");
      expect(cerrar).toContain("costo_tela = coalesce(p_costo_tela, costo_tela)");
      expect(cerrar).toContain("costo_avios = coalesce(p_costo_avios, costo_avios)");
    });
    it("solo las buenas entran al stock: el único movimiento que escribe es la entrada de las líneas con buenas", () => {
      expect(cerrar.match(/insert into movimientos \(/g)).toHaveLength(1);
      expect(cerrar).toContain("where produccion_id = p_produccion_id and cantidad_buenas > 0");
    });
    it("los costos del Taller los ve el líder o quien ve Producción parado en ese Taller", () => {
      expect(SQL_CIERRE).toContain("retail.fn_es_lider() or (retail.fn_ve_modulo('produccion') and retail.fn_puede_operar_ubicacion(p_ubicacion_id))");
      expect(SQL_CIERRE.match(/where retail\.fn_ve_costos_del_taller\(p_ubicacion_id\)/g)).toHaveLength(2);
    });
  });
});

// ---------- La tela cuenta lo que otras órdenes ya reservan y muestra lo pedido (ADR-0400, actividad 7) ----------

describe("la tela: lo comprometido por otras órdenes y lo pedido", () => {
  const SQL_TELA = readFileSync(join(RAIZ, "supabase", "migrations", "20261015165000_produccion_tela_pendiente_de_la_orden.sql"), "utf8");
  const pendiente = ({ fases, ...cuerpo }: Record<string, unknown>) =>
    orden({ ...(fases ? { fases } : {}), tela_pendiente: [{ insumo_id: "i-1", comprometido_otras: 0, en_camino: 0, atrasado: 0, pedidos: [], ...cuerpo }] } as never);

  it("sin `tela_pendiente` (una base o una lista que no lo manda) cada insumo no tiene nada reservado ni pedido: «alcanza» se mide contra todo el estante, como antes", () => {
    const [gabardina] = orden().insumos;
    expect(gabardina).toMatchObject({ comprometidoOtras: 0, pedidos: [] });
    expect(filasDeTela(orden().insumos)[0]).toMatchObject({ alcanza: true, faltan: null, faltanNumero: null, reservadoPorOtras: null, pedidos: [] });
  });

  it("lee lo que reservan las otras y lo pedido; lo que no se entiende se descarta o queda en cero", () => {
    const o = pendiente({ comprometido_otras: "12.5", pedidos: [{ numero_texto: "OI-000003", proveedor: "Textiles Andinos", cantidad: "50", unidad: "metro", fecha_entrega: "2026-10-23" }, { numero_texto: null, cantidad: 3 }, "basura"] });
    expect(o.insumos[0]).toMatchObject({ comprometidoOtras: 12.5, enCamino: 0, atrasado: 0, pedidos: [{ numeroTexto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 50, unidad: "metro", fechaEntrega: "2026-10-23", atrasado: false }] });
    // Lo que viene y lo atrasado se leen como números (nunca negativos); un pedido marcado atrasado se lee atrasado.
    const v = pendiente({ en_camino: "35", atrasado: "-3", pedidos: [{ numero_texto: "OI-000009", proveedor: "X", cantidad: 5, unidad: "metro", fecha_entrega: "2026-10-10", atrasado: true }] });
    expect(v.insumos[0]).toMatchObject({ enCamino: 35, atrasado: 0, pedidos: [{ atrasado: true }] });
    expect(pendiente({ comprometido_otras: -4 }).insumos[0].comprometidoOtras).toBe(0);
    expect(orden({ tela_pendiente: "no es una lista" } as never).insumos[0].comprometidoOtras).toBe(0);
  });

  it("lo que otras órdenes reservan se resta de lo libre: con 20 m en el estante y 20 reservados, a una orden a la que le falta 1 m le faltan 1 m (antes decía «Alcanza»)", () => {
    const [f] = filasDeTela(pendiente({ comprometido_otras: 20 }).insumos);
    expect(f).toMatchObject({ alcanza: false, faltan: "1 m", faltanNumero: 1, reservadoPorOtras: "Otras órdenes ya reservan 20 m" });
    expect(filasDeTela(pendiente({ comprometido_otras: 19 }).insumos)[0]).toMatchObject({ alcanza: true });
  });

  it("lo que viene en camino SÍ cuenta (regla de Felipe, 2026-10-16): con 1 m de falta y 35 m por recibir alcanza «gracias a lo que viene», y se ve de qué pedido", () => {
    const o = pendiente({ comprometido_otras: 20, en_camino: 35, pedidos: [{ numero_texto: "OI-000003", proveedor: "Textiles Andinos", cantidad: 35, unidad: "metro", fecha_entrega: "2026-10-23", atrasado: false }] });
    const [f] = filasDeTela(o.insumos);
    expect(f).toMatchObject({ alcanza: true, conLoQueViene: true, faltan: null, faltanNumero: null, enCamino: "35 m", atrasado: null });
    expect(f.pedidos).toEqual(["OI-000003 · 35 m a Textiles Andinos · llega el vie 23 oct"]);
  });

  it("si lo que viene no cubre, sigue faltando lo que queda: con 1 m de falta y 0.4 m por recibir faltan 0.6 m", () => {
    const [f] = filasDeTela(pendiente({ comprometido_otras: 20, en_camino: 0.4 }).insumos);
    expect(f).toMatchObject({ alcanza: false, conLoQueViene: false, faltan: "0.6 m", faltanNumero: 0.6, enCamino: "0.4 m" });
  });

  it("un pedido ATRASADO no cuenta: la tela sigue faltando y el pedido sale con su aviso, aparte de lo que viene", () => {
    const o = pendiente({
      comprometido_otras: 20,
      en_camino: 0,
      atrasado: 35,
      pedidos: [{ numero_texto: "OI-000002", proveedor: "Textiles Andinos", cantidad: 35, unidad: "metro", fecha_entrega: "2026-10-10", atrasado: true }],
    });
    const [f] = filasDeTela(o.insumos);
    expect(f).toMatchObject({ alcanza: false, faltan: "1 m", enCamino: null, atrasado: "35 m" });
    expect(f.pedidos).toEqual(["OI-000002 · 35 m a Textiles Andinos · debía llegar el sáb 10 oct (atrasado, no lo cuento)"]);
  });

  it("«la tela no alcanza» (la causa que pone la orden en rojo) cuenta lo reservado igual en la página y en la lista", () => {
    expect(rojoDeLaOrden(orden(), HOY).map((c) => c.clave)).not.toContain("tela_no_llega");
    expect(rojoDeLaOrden(pendiente({ comprometido_otras: 20, fases: sinTerminarElCorte() }), HOY).map((c) => c.clave)).toContain("tela_no_llega");
  });

  it("«la tela no alcanza» tampoco salta si lo que viene en camino la cubre; sí si el pedido está atrasado", () => {
    expect(rojoDeLaOrden(pendiente({ comprometido_otras: 20, en_camino: 35, fases: sinTerminarElCorte() }), HOY).map((c) => c.clave)).not.toContain("tela_no_llega");
    expect(rojoDeLaOrden(pendiente({ comprometido_otras: 20, en_camino: 0, atrasado: 35, fases: sinTerminarElCorte() }), HOY).map((c) => c.clave)).toContain("tela_no_llega");
  });

  describe("paridad con la migración 20261015165000", () => {
    it("la web llama a la función con el nombre y el argumento que la base declara", () => {
      expect(RPC_TELA_PENDIENTE).toBe("fn_tela_pendiente_de_la_orden");
      expect(SQL_TELA).toContain(`create or replace function retail.${RPC_TELA_PENDIENTE}(p_produccion_id uuid)`);
    });
    it("manda las llaves que la web lee", () => {
      for (const k of ["insumo_id", "comprometido_otras", "pedidos", "numero_texto", "proveedor", "cantidad", "unidad", "fecha_entrega"]) expect(SQL_TELA, k).toContain(`'${k}'`);
    });
    it("manda lo que viene en camino y lo atrasado, tomados de la lectura única `fn_tela_en_camino`", () => {
      for (const k of ["en_camino", "atrasado", "cuenta"]) expect(SQL_TELA, k).toContain(`'${k}'`);
      expect(SQL_TELA).toContain("create or replace function retail.fn_tela_en_camino(p_ubicacion_id uuid)");
      expect(SQL_TELA).toContain("v_camino := coalesce(retail.fn_tela_en_camino(v_ubicacion), '[]'::jsonb)");
    });
    it("cuenta las OTRAS órdenes en proceso (nunca la propia) y, de las órdenes de insumos generadas, solo lo que falta recibir (sin ventana de 60 días)", () => {
      expect(SQL_TELA).toContain("p3.estado = 'en_proceso' and p3.id <> p_produccion_id");
      expect(SQL_TELA).toContain("p2.estado = 'en_proceso' and p2.id <> p_produccion_id");
      expect(SQL_TELA).toContain("oi.estado = 'generada' and r.queda > 0");
      expect(SQL_TELA).toContain("retail.fn_orden_insumo_por_recibir_lineas(oi.id)");
      expect(SQL_TELA).not.toContain("- 60");
    });
    it("un pedido está atrasado cuando su fecha estimada de entrega ya pasó (sin fecha, no se puede probar y cuenta)", () => {
      expect(SQL_TELA).toContain("oi.fecha_entrega_estimada is not null and oi.fecha_entrega_estimada < retail.fn_hoy_lima()");
    });
    it("la lista de Órdenes lleva lo mismo que la página", () => {
      const SQL_LISTA = readFileSync(join(RAIZ, "supabase", "migrations", "20261015005000_produccion_lista_de_ordenes.sql"), "utf8");
      expect(SQL_LISTA).toContain("'tela_pendiente', retail.fn_tela_pendiente_de_la_orden(v_id)");
    });
  });
});

describe("una fase que se marca (Ploteo, ADR-0400 act. k y l): hecha con un toque, sin contar prendas", () => {
  /** Ploteo como lo manda `fn_fases_de_orden`: sin cantidades, con `hito` y `marcada`. */
  const ploteo = (parche: Record<string, unknown> = {}) =>
    faseCruda({ clave: "ploteo", secuencia: 5, quien: "taller", nombre: "Ploteo", hito: true, marcada: false, estado: "pendiente", actual: true, ...parche }, { entrada: 0 });
  /** La orden con Ploteo antes de Corte (que sigue siendo la primera que cuenta) y Acabado al final. */
  const conPloteo = (parchePloteo: Record<string, unknown> = {}, parcheCorte: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
    orden({
      fases: [
        ploteo(parchePloteo),
        faseCruda({ clave: "corte", secuencia: 10, quien: "taller", estado: "pendiente", ...parcheCorte }, { entrada: 9 }),
        faseCruda({ clave: "acabado", secuencia: 60, quien: "taller" }, { entrada: 0 }),
      ],
      ...extra,
    });
  const MARCADA = { estado: "hecha", actual: false, empezada: true, marcada: true };

  it("lee hito y marcada; una fase que cuenta prendas viene con hito en falso", () => {
    const [pl, corte] = conPloteo().fases;
    expect([pl.hito, pl.marcada, corte.hito, corte.marcada]).toEqual([true, false, false, false]);
    expect(conPloteo(MARCADA).fases[0].marcada).toBe(true);
  });

  it("Corte sigue siendo la primera fase que cuenta: su «lo que falta» es el plan, y la fase de antes que cuenta se salta a Ploteo", () => {
    const p = conPloteo();
    const [pl, corte, acabado] = p.fases;
    expect(esPrimeraFase(pl, p.fases)).toBe(false);
    expect(esPrimeraFase(corte, p.fases)).toBe(true);
    expect(esPrimeraFase(acabado, p.fases)).toBe(false);
    expect(faltaTerminar(corte, p.fases)).toBe(48);
    expect(previaQueCuenta(p.fases, 0)).toBeNull();
    expect(previaQueCuenta(p.fases, 1)).toBeNull();
    expect(previaQueCuenta(p.fases, 2)?.clave).toBe("corte");
    expect(faltaTerminar(pl, p.fases)).toBe(0);
  });

  it("accionesDeFase: «marcar» si no está marcada, «desmarcar» si ya; ninguna sin permiso o con la orden cerrada", () => {
    const sin = conPloteo();
    expect(accionesDeFase(sin.fases[0], sin)).toEqual(["marcar"]);
    const con = conPloteo(MARCADA);
    expect(accionesDeFase(con.fases[0], con)).toEqual(["desmarcar"]);
    const ajena = conPloteo({}, {}, { permisos: { puede_operar: false, ve_costos: true } });
    expect(accionesDeFase(ajena.fases[0], ajena)).toEqual([]);
    const cerrada = orden({ orden: { ...crudo().orden, estado: "terminada" }, fases: [ploteo(MARCADA)] });
    expect(accionesDeFase(cerrada.fases[0], cerrada)).toEqual([]);
  });

  it("queSigue y textoQueSigue: lo primero es marcar el ploteo; después, terminar el corte", () => {
    const sin = conPloteo();
    expect(queSigue(sin.fases, "en_proceso")).toMatchObject({ accion: "marcar", fase: { clave: "ploteo" } });
    expect(textoQueSigue(queSigue(sin.fases, "en_proceso"), sin.fases)).toBe("Sigue: marcar ploteo como hecho.");
    const con = conPloteo(MARCADA, { actual: true });
    expect(queSigue(con.fases, "en_proceso")).toMatchObject({ accion: "terminar", fase: { clave: "corte" } });
  });

  it("«Lista para pasar al stock» no espera a un ploteo sin marcar (la base solo mira lo terminado en la última fase)", () => {
    const todo = orden({
      fases: [
        ploteo(),
        faseCruda({ clave: "corte", secuencia: 10, quien: "taller", estado: "hecha", empezada: true }, { entrada: 9, hechas: 8 }),
        faseCruda({ clave: "acabado", secuencia: 60, quien: "taller", estado: "hecha", empezada: true }, { entrada: 8, hechas: 8 }),
      ],
    });
    expect(todasLasQueCuentanHechas(todo.fases)).toBe(true);
    expect(estadoDeLaOrden(todo.orden, todo.fases)).toEqual({ texto: "Lista para pasar al stock", tono: "verde" });
    expect(queSigue(todo.fases, "en_proceso").accion).toBe("pasar_al_stock");
    expect(estadoDeLaOrden(conPloteo().orden, conPloteo().fases)).toEqual({ texto: "En ploteo", tono: "pizarra" });
    expect(todasLasQueCuentanHechas([])).toBe(false);
  });

  it("textoDeFase: «Por hacer» con quién espera, «Hecho» con el día de la marca, y lo que cobra un servicio de ploteo por orden", () => {
    const sin = conPloteo().fases[0];
    expect(textoDeFase(sin, { previa: null, terminoEl: null, totalPlan: 48 })).toEqual({ cifra: "Por hacer", de: "", detalle: "Se marca con un toque cuando la marcada esté lista" });
    expect(textoDeFase(conPloteo(MARCADA).fases[0], { previa: null, terminoEl: "2026-10-15T22:40:00+00:00", totalPlan: 48 })).toEqual({ cifra: "Hecho", de: "", detalle: "Marcado el jue 15 oct" });
    const afuera = conPloteo({ quien: "servicio", proveedor_id: "pv-2", proveedor_nombre: "Plotter Lima", fijo_orden: 40, fecha_prometida: "2026-10-21" }).fases[0];
    expect(textoDeFase(afuera, { previa: null, terminoEl: null, totalPlan: 48 }).detalle).toBe("Con Plotter Lima · prometido mié 21 oct · S/\u00a040.00 por orden");
    const afueraHecho = conPloteo({ ...MARCADA, quien: "servicio", proveedor_id: "pv-2", proveedor_nombre: "Plotter Lima", fijo_orden: 40 }).fases[0];
    expect(textoDeFase(afueraHecho, { previa: null, terminoEl: "2026-10-15T22:40:00+00:00", totalPlan: 48 }).detalle).toBe("Marcado el jue 15 oct · con Plotter Lima · S/\u00a040.00 por orden");
  });

  it("«Cambiar quién» se ofrece en Ploteo mientras no esté marcado (la hoja pide el fijo por orden); marcado ya empezó", () => {
    const p = conPloteo();
    expect(puedeCambiarQuien(p.fases[0], p)).toBe(true);
    expect(puedeCambiarQuien(p.fases[1], p)).toBe(true);
    const marcado = conPloteo(MARCADA);
    expect(puedeCambiarQuien(marcado.fases[0], marcado)).toBe(false);
  });

  it("la línea de tiempo cuenta lo marcado y lo deshecho, y el día de la marca es el de «Hecho»", () => {
    const linea = [
      { id: "m-2", cuando: "2026-10-16T15:00:00+00:00", quien_nombre: "Rosa", tipo: "marca", fase_clave: "ploteo", fase_nombre: "Ploteo", cantidad: 0, detalle: null, nota: "con Audaces", avance_id: null },
      { id: "m-1b", cuando: "2026-10-15T23:00:00+00:00", quien_nombre: "Rosa", tipo: "desmarca", fase_clave: "ploteo", fase_nombre: "Ploteo", cantidad: 0, detalle: null, nota: null, avance_id: null },
      { id: "m-1", cuando: "2026-10-15T22:40:00+00:00", quien_nombre: "Rosa", tipo: "marca", fase_clave: "ploteo", fase_nombre: "Ploteo", cantidad: 0, detalle: null, nota: null, avance_id: null },
    ];
    const p = conPloteo(MARCADA, {}, { linea_de_tiempo: linea });
    const entradas = lineaDeTiempoAgrupada(p, HOY).flatMap((d) => d.entradas);
    expect(entradas.map((e) => e.titulo)).toEqual(["Marcó Ploteo como hecho", "Deshizo la marca de Ploteo", "Marcó Ploteo como hecho"]);
    expect(entradas[0]).toMatchObject({ detalle: "con Audaces", cuanto: null, avanceIds: null, anulable: null });
    expect(cuandoTerminoLaFase("ploteo", p.lineaDeTiempo)).toBe("2026-10-16T15:00:00+00:00");
  });

  it("paridad con la migración 20261019192000: las dos RPC y sus motivos existen, y la línea de tiempo usa «marca» y «desmarca»", () => {
    const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261019192000_produccion_ploteo_la_fase_de_un_toque.sql"), "utf8");
    expect(sql).toContain(`create or replace function retail.${RPC_MARCAR_FASE}(`);
    expect(sql).toContain(`create or replace function retail.${RPC_DESHACER_MARCA}(`);
    for (const hint of ["fase_no_es_hito", "marca_ya_hecha", "marca_inexistente", "fase_es_hito"]) expect(sql, hint).toContain(`hint = '${hint}'`);
    expect(sql).toContain("then 'marca' else 'desmarca'");
    expect(sql).toContain("'hito', true, 'marcada', v_empezada");
  });
});

// ---------- Consumo por talla en la página de la orden (ADR-0513, actividad 2) ----------

describe("la tela de la orden con consumo por talla", () => {
  const lino = (extra: Record<string, unknown>) => ({ id: "pi-1", insumo_id: "i-1", nombre: "Lino", tipo: "tela", unidad: "metro", color_codigo: "NEG", consumo_por_prenda: 1.333, cantidad_plan: 42, usado: 0, saldo: 100, ...extra });
  it("lee `consumo_por_talla` como un mapa de números; lo que no es objeto, o no se lee, queda en null (una cifra para todas las tallas)", () => {
    expect(orden({ insumos: [lino({ consumo_por_talla: { S: 1, M: "1.5" } })] }).insumos[0].consumoPorTalla).toEqual({ S: 1, M: 1.5 });
    expect(orden({ insumos: [lino({ consumo_por_talla: null })] }).insumos[0].consumoPorTalla).toBeNull();
    expect(orden({ insumos: [lino({})] }).insumos[0].consumoPorTalla).toBeNull();
    expect(orden({ insumos: [lino({ consumo_por_talla: [1, 2] })] }).insumos[0].consumoPorTalla).toBeNull();
    expect(orden({ insumos: [lino({ consumo_por_talla: { S: "x", M: 0 } })] }).insumos[0].consumoPorTalla).toBeNull();
  });
  it("la sección Tela de la orden dice lo que lleva cada talla, de la más chica a la más grande, en vez de un promedio", () => {
    const fila = filasDeTela(orden({ insumos: [lino({ consumo_por_talla: { M: 1.5, S: 1 } })] }).insumos)[0];
    expect(fila.detalle).toBe("S 1 m · M 1.5 m por prenda");
    expect(filasDeTela(orden({ insumos: [lino({})] }).insumos)[0].detalle).toBe("1.33 m por prenda");
  });
});
