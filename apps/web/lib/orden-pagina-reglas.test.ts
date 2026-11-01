import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FASES, faseDe } from "./orden-fases-reglas";
import {
  RPC_ANOTAR_TERMINE_CON_TELA,
  RPC_DESHACER_TERMINE,
  RPC_REGISTRAR_SALIDA_CON_TELA,
  argsDeshacerTermine,
  fraseDelEnvioConToken,
  leerEnvioConTela,
  DIAS_SIN_MOVERSE,
  MAX_MOTIVO_ANULACION,
  RPC_ANULAR_PRODUCCION,
  RPC_ANULAR_SALIDA,
  RPC_ANULAR_VUELTA,
  RPC_CERRAR_PRODUCCION,
  RPC_MARCAR_FASE,
  RPC_AGREGAR_PASO,
  RPC_QUITAR_PASO,
  RPC_REVERTIR_PRODUCCION,
  RPC_TELA_PENDIENTE,
  accionesDeFase,
  avisoMarcaSoloLider,
  avisoMinimoDeFase,
  buenasAlAnotarExcepcion,
  cantidadConUnidad,
  cantidadesAfuera,
  cantidadesDeFabricaDeSalida,
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
  marcaVivaDeFase,
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
  pendienteConCosto,
  pasosAgregables,
  pasoPosteriorEmpezado,
  textoDePasosBloqueados,
  puedeQuitarPaso,
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
  textoQuePasaConElStock,
  TEXTO_YA_ESTABA,
  RPC_MARCAR_YA_EN_STOCK,
  textoPrendasAfuera,
  textoQuePasaAlRevertir,
  totalDeCierre,
  textoQuePasaAlAnular,
  textoQueSigue,
  textoSeVende,
  textoTermine,
  textoVolvieron,
  todasLasQueCuentanHechas,
  estadoEnRuta,
  faseAbiertaDeLaRuta,
  subtituloEnRuta,
  tonoDeEntrada,
  MAX_MOTIVO_FALLA,
  buenasConFallas,
  diaParaLaBase,
  fallasQueCierran,
  lineasDeFallas,
  problemaDeDia,
  problemasDeFallas,
  textoFallas,
  totalFallas,
  type FallaBorrador,
  type FasePagina,
  type OrdenPagina,
  type TipoEvento,
  anotadoDelPaso,
  filaDelPaso,
  MAX_MOTIVO_CAMBIO,
  MAX_NOTA_ORDEN,
  RPC_COMENTAR_ORDEN,
  RPC_CORREGIR_ANOTACION,
  RPC_ELIMINAR_ANOTACION,
  RPC_RESTAURAR_ANOTACION,
  correccionSinCambios,
  disponiblesParaCorregir,
  fallasDeLaAnotacion,
  problemaDeCantidadesCorregidas,
  problemaDeMotivoCambio,
  problemaDeNota,
  queCambio,
  type AnotacionCorregible,
  RPC_AGREGAR_PASO_TARDE,
  avisoDePasoTarde,
  pasoAgregadoTarde,
  prendasQueYaPasaron,
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
    c.fases.push({ ...faseCruda({ clave: "ZZ-1", secuencia: 70, quien: "taller" }) });
    c.linea_de_tiempo.push({ id: "roto", tipo: "avance" } as never);
    const p = leerOrdenPagina(c)!;
    expect(p.fases).toHaveLength(3);
    expect(p.lineaDeTiempo).toHaveLength(8);
  });

  it("ADR-0551 C: cómo entra al stock la orden se lee de la base; sin el dato (una base atrasada) o con uno raro, es lo de siempre: movimiento", () => {
    const con = (v: unknown) => leerOrdenPagina({ ...crudo(), orden: { ...crudo().orden, ingreso_al_stock: v } })!.orden.ingresoAlStock;
    expect(con("ya_estaba")).toBe("ya_estaba");
    expect(con("movimiento")).toBe("movimiento");
    expect(con(undefined)).toBe("movimiento");
    expect(con(null)).toBe("movimiento");
    expect(con("en_camino")).toBe("movimiento");
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
    // Tela sin anotar (OP-3, Blusa Hanna): el costo real no la incluye y la etiqueta lo dice.
    const sinTela = orden({ costos: { tela_estimado: 327.24, avios_estimado: 0, tela_real: 0, avios_real: 0, servicios_estimado: 79.5, servicios_devengado: 79.5, total_estimado: 406.74, total_real_hasta_hoy: 79.5 } });
    expect(cifrasDeLaOrden(sinTela, HOY).costo).toMatchObject({ valor: 79.5, etiqueta: "Costo hasta hoy · sin la tela" });
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
    // El pendiente puede llevar su costo (ADR-0551): con tarifa o con fijo se devenga como un servicio; sin ninguno no suma nada.
    expect(pendienteConCosto({ tarifaPrenda: null, fijoOrden: 0 })).toBe(false);
    expect(pendienteConCosto({ tarifaPrenda: 4.5, fijoOrden: 0 })).toBe(true);
    expect(pendienteConCosto({ tarifaPrenda: null, fijoOrden: 40 })).toBe(true);
    expect(pendienteConCosto({ tarifaPrenda: 0, fijoOrden: 0 })).toBe(false);
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

  it("puedeQuitarPaso: solo un paso opcional que no empezó, en una orden en proceso y para quien opera (la base lo repite)", () => {
    const limpieza: FasePagina = { ...acabado, clave: "limpieza_revision", nombre: "Limpiar hilos y revisar" };
    expect(puedeQuitarPaso(limpieza, p)).toBe(true);
    // Un paso fijo de su ruta no se ofrece (Acabado es de la espina de la ruta anterior; Corte y Costura, de las dos).
    expect(puedeQuitarPaso(acabado, p)).toBe(false);
    expect(puedeQuitarPaso(costura, p)).toBe(false);
    // Con algo anotado, ya hecho, la orden cerrada o sin permiso de operar, tampoco.
    expect(puedeQuitarPaso({ ...limpieza, empezada: true }, p)).toBe(false);
    expect(puedeQuitarPaso({ ...limpieza, estado: "hecha" }, p)).toBe(false);
    expect(puedeQuitarPaso(limpieza, { ...p, orden: { ...p.orden, estado: "terminada" } })).toBe(false);
    expect(puedeQuitarPaso(limpieza, { ...p, permisos: { puedeOperar: false, veCostos: true } })).toBe(false);
  });

  it("paridad con la migración 20261028071000: la RPC existe y sus tres motivos son los que la pantalla ya conoce", () => {
    const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261028071000_produccion_quitar_paso_de_la_orden.sql"), "utf8");
    expect(sql).toContain(`create or replace function retail.${RPC_QUITAR_PASO}(p_fase_id uuid, p_motivo text default null)`);
    for (const hint of ["fase_empezada", "paso_fijo"]) expect(sql, hint).toContain(`hint = '${hint}'`);
    // «Pide firma» como toda escritura del Taller: lo hace `fn_produccion_operar_fase` (ve Producción, está en ese Taller y hay un responsable).
    expect(sql).toContain("fn_produccion_operar_fase(p_fase_id)");
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
  it("un servicio de pago único (ploteo) dice «pago único» y lo que toca por prenda, no «48 × S/ 0.00»", () => {
    const p = orden();
    const unico = { ...p, fases: p.fases.map((f) => (f.clave === "costura" ? { ...f, tarifaPrenda: null, fijoOrden: 24 } : f)) };
    expect(textoCosto(unico)!.filas[2]).toMatchObject({ estimado: "24.00", detalle: "Pago único por las 48 prendas · Confecciones del Norte · S/\u00a00.50 por prenda" });
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

describe("anotadoDelPaso (ADR-0586, actividad 3: corregir desde el paso)", () => {
  const faseDeLaOrden = (p: OrdenPagina, clave: string) => {
    const f = p.fases.find((x) => x.clave === clave);
    if (!f) throw new Error(`la orden de prueba no tiene ${clave}`);
    return f;
  };
  const evento = (e: Record<string, unknown>) => ({ cuando: "2026-10-16T16:00:00+00:00", quien_nombre: "Rosa", fase_clave: "costura", fase_nombre: "Costura", cantidad: 20, detalle: null, avance_id: null, ...e });

  it("el paso trae su «Terminé» con lo mismo que la historia, y la fila no repite el paso", () => {
    const p = orden();
    const [terminado, ...resto] = anotadoDelPaso(faseDeLaOrden(p, "corte"), p, "2026-10-16");
    expect(resto).toEqual([]);
    expect(terminado.corregible).toMatchObject({ faseClave: "corte", dia: "2026-10-15" });
    expect(terminado.ids).toEqual(lineaDeTiempoAgrupada(p, "2026-10-16")[1].entradas[0].ids);
    expect(filaDelPaso(terminado)).toEqual({ que: "Terminó", cuando: `jue 15 oct, ${terminado.hora}`, quien: "Rosa", cuanto: "48 prendas", detalle: "Negro 24 · Caqui 24", fija: null });
  });

  it("un «Terminé» con una talla deshecha ya no está vivo y sale; una Salida que la base no deja anular se queda, sin lápiz y con su porqué", () => {
    const p = orden({ deshechos: ["a-c32"] });
    expect(anotadoDelPaso(faseDeLaOrden(p, "corte"), p, "2026-10-16")).toEqual([]);
    const sinAnular = orden();
    const [salida, ...resto] = anotadoDelPaso(faseDeLaOrden(sinAnular, "costura"), sinAnular, "2026-10-16");
    expect(resto).toEqual([]);
    expect(salida.anulable).toBeNull();
    expect(filaDelPaso(salida)).toMatchObject({ que: "Salida", fija: "Ya no se anula: sus prendas ya volvieron. Si la vuelta estaba mal, anula primero la vuelta." });
  });

  it("una Vuelta viva que ya no se anula dice que el paso siguiente ya la usó; una anulada sale de la lista", () => {
    const p = orden({ linea_de_tiempo: [evento({ id: "v-1", tipo: "vuelta", anulable: false }), evento({ id: "v-2", tipo: "vuelta", anulable: false, anulada: true, cuando: "2026-10-16T15:00:00+00:00" })] });
    const lista = anotadoDelPaso(faseDeLaOrden(p, "costura"), p, "2026-10-16");
    expect(lista.map((e) => e.ids[0])).toEqual(["v-1"]);
    expect(filaDelPaso(lista[0]).fija).toBe("Ya no se anula: el paso siguiente ya usó estas prendas.");
  });

  it("el porqué de «ya no se anula» es el único motivo que la base tiene para una salida o una vuelta viva (20261015160000)", () => {
    const sql = readFileSync(join(RAIZ, "supabase", "migrations", "20261015160000_produccion_anular_salida_y_vuelta.sql"), "utf8");
    const cuerpo = (nombre: string) => sql.slice(sql.indexOf(`function retail.${nombre}`), sql.indexOf("$$;", sql.indexOf(`function retail.${nombre}`)));
    // Fuera de inexistente, anulación y ya anulada (que la lista ya saca), cada una devuelve un solo motivo.
    const motivos = (c: string) => [...c.matchAll(/return '([a-z_]+)'/g)].map((m) => m[1]).filter((m) => !["anular_inexistente", "anular_es_anulacion", "anular_ya_anulada"].includes(m));
    expect(motivos(cuerpo("fn_produccion_salida_anulable"))).toEqual(["anular_ya_volvio"]);
    expect(motivos(cuerpo("fn_produccion_vuelta_anulable"))).toEqual(["anular_ya_avanzo"]);
  });

  it("una Salida y una Vuelta anulables entran a su paso con su lápiz, de la más reciente a la más vieja; lo de otro paso y lo ya anulado, no", () => {
    const p = orden({
      linea_de_tiempo: [
        evento({ id: "s-1", tipo: "salida", anulable: true, cuando: "2026-10-15T15:00:00+00:00" }),
        evento({ id: "v-1", tipo: "vuelta", anulable: true, cuando: "2026-10-16T15:00:00+00:00" }),
        evento({ id: "s-otra", tipo: "salida", anulable: true, fase_clave: "acabado", fase_nombre: "Acabado" }),
        evento({ id: "s-anulada", tipo: "salida", anulable: true, anulada: true }),
      ],
    });
    const lista = anotadoDelPaso(faseDeLaOrden(p, "costura"), p, "2026-10-16");
    expect(lista.map((e) => e.ids[0])).toEqual(["v-1", "s-1"]);
    expect(lista.map((e) => filaDelPaso(e).que)).toEqual(["Vuelta", "Salida"]);
    expect(lista.map((e) => filaDelPaso(e).fija)).toEqual([null, null]);
  });

  it("un cambio de la historia (una corrección, una eliminación) no es de ningún paso: no tiene fase", () => {
    // Una eliminación lleva la fase de lo que quitó, pero la entrada es del cambio: el paso no la lista (su «Restaurar» vive en la historia).
    const nota = { id: "c-1", accion: "eliminar", objeto: "avance", fase_clave: "corte", fase_nombre: "Corte", quita_ids: [], pone_ids: [], deshace_ids: [], antes: null, despues: null, texto: "Se anotó dos veces", restaurado: false, quien_nombre: "Felipe", cuando: "2026-10-16T17:00:00+00:00" };
    const p = orden({ cambios: [nota] });
    const delCambio = lineaDeTiempoAgrupada(p, "2026-10-16").flatMap((d) => d.entradas).find((e) => e.ids[0] === "c-1");
    expect(delCambio?.faseClave).toBeNull();
    expect(anotadoDelPaso(faseDeLaOrden(p, "corte"), p, "2026-10-16").map((e) => e.ids[0])).not.toContain("c-1");
  });

  it("un hito (Ploteo) no trae lista aunque la historia tenga algo suyo que se anula: su marca ya tiene su botón (ADR-0586 act. 2)", () => {
    const p = orden({ linea_de_tiempo: [evento({ id: "s-pl", tipo: "salida", anulable: true, fase_clave: "ploteo", fase_nombre: "Ploteo" })] });
    const ploteo: FasePagina = { ...faseDeLaOrden(p, "corte"), clave: "ploteo", nombre: "Ploteo", hito: true, marcada: true, hechas: 0 };
    // Sin la guarda del hito la salida entraría: es la misma fase y la historia la deja anular.
    expect(anotadoDelPaso({ ...ploteo, hito: false }, p, "2026-10-16").map((e) => e.ids[0])).toEqual(["s-pl"]);
    expect(anotadoDelPaso(ploteo, p, "2026-10-16")).toEqual([]);
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
    expect(ayer.entradas[0]).toMatchObject({ titulo: "Terminó Corte", cuanto: "48 prendas", quien: "Rosa", detalle: "Negro 24 · Caqui 24" });
    expect(ayer.entradas[0].ids).toHaveLength(6);
  });
  it("«Corregir» (ADR-0570, actividad 3) solo si TODOS los avances de la entrada siguen vivos: basta que una talla tenga su Deshacer", () => {
    const [, ayer] = lineaDeTiempoAgrupada(orden(), "2026-10-16");
    // Del más reciente al más viejo, como la historia.
    expect(ayer.entradas[0].corregible).toMatchObject({ ids: [...TODAS].reverse().map((id) => `a-${id}`), faseClave: "corte", faseNombre: "Corte", dia: "2026-10-15", fallas: [] });
    expect(ayer.entradas[0].corregible?.buenas).toEqual(Object.fromEntries(TODAS.map((id) => [id, 8])));
    expect(lineaDeTiempoAgrupada(orden({ deshechos: ["a-c32"] }), "2026-10-16")[1].entradas[0].corregible).toBeNull();
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

  describe("cantidadesDeFabricaDeSalida — lo que «Salida» trae escrito", () => {
    const p = orden();
    const corte = p.fases.find((f) => f.clave === "corte")!;
    const costuraListo = (extra: Partial<FasePagina> = {}, v: Partial<FasePagina["porVariante"][number]> = {}): FasePagina => ({ ...costura(p), porVariante: costura(p).porVariante.map((x) => ({ ...x, entrada: 8, salieron: 0, afuera: 0, ...v })), ...extra });
    /** Corte mandado afuera sin registrar quién (Pendiente de registrar): el plan es 8 por talla y color y la base deja salir hasta 9 (8 + 10 %, hacia arriba). */
    const corteAfuera = (v: Partial<FasePagina["porVariante"][number]> = {}): FasePagina => ({ ...corte, quien: "servicio", proveedorId: null, proveedorNombre: null, porVariante: corte.porVariante.map((x) => ({ ...x, plan: 8, entrada: 9, hechas: 0, salieron: 0, afuera: 0, ...v })) });

    it("en Corte parte del plan, no del margen del 10 %: 8 por talla y color, no 9 (el 57 que se volvía 72)", () => {
      const f = corteAfuera();
      const fases = [f, ...p.fases.slice(1)];
      expect(cantidadesDeFabricaDeSalida(f, fases)).toEqual(Object.fromEntries(TODAS.map((id) => [id, 8])));
      // El tope que acepta la base no cambia: se puede mandar el margen escribiéndolo.
      expect(cantidadesQuePuedenSalir(f)).toEqual(Object.fromEntries(TODAS.map((id) => [id, 9])));
      expect(problemasDeSalida(f, Object.fromEntries(TODAS.map((id) => [id, "9"])), nombreDe)).toEqual([]);
    });
    it("en Corte lo que ya salió se descuenta del plan, y nunca pasa de lo que la base deja", () => {
      const f = corteAfuera({ salieron: 3 });
      const fases = [f, ...p.fases.slice(1)];
      expect(Object.values(cantidadesDeFabricaDeSalida(f, fases))).toEqual([5, 5, 5, 5, 5, 5]);
      // Si ya salió todo el plan, no queda nada de fábrica aunque el margen todavía deje mandar 1 más por talla y color.
      const completo = corteAfuera({ salieron: 8 });
      expect(cantidadesDeFabricaDeSalida(completo, [completo, ...p.fases.slice(1)])).toEqual({});
      expect(Object.values(cantidadesQuePuedenSalir(completo))).toEqual([1, 1, 1, 1, 1, 1]);
    });
    it("una talla y color sin plan cae a lo que puede salir; con el plan mayor que el tope, manda el tope", () => {
      const sinPlan = corteAfuera({ plan: null });
      expect(cantidadesDeFabricaDeSalida(sinPlan, [sinPlan, ...p.fases.slice(1)])).toEqual(Object.fromEntries(TODAS.map((id) => [id, 9])));
      const planGrande = corteAfuera({ plan: 20 });
      expect(cantidadesDeFabricaDeSalida(planGrande, [planGrande, ...p.fases.slice(1)])).toEqual(Object.fromEntries(TODAS.map((id) => [id, 9])));
    });
    it("en las demás fases es lo que puede salir, igual que antes", () => {
      const f = costuraListo({ quien: "servicio" }, { salieron: 3 });
      expect(cantidadesDeFabricaDeSalida(f, p.fases)).toEqual(cantidadesQuePuedenSalir(f));
      expect(Object.values(cantidadesDeFabricaDeSalida(f, p.fases))).toEqual([5, 5, 5, 5, 5, 5]);
    });
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

  it("ADR-0551 C · «ya estaban registradas»: el aviso y la hoja dicen que NO se sumó stock, nunca «entraron»; sin la marca, las frases de siempre", () => {
    expect(textoPasasteAlStock(57, "Chaleco Cayla", false, true)).toBe("Orden de Chaleco Cayla cerrada: 57 prendas ya estaban registradas, no se sumó stock");
    expect(textoPasasteAlStock(1, "Chaleco Cayla", false, true)).toBe("Orden de Chaleco Cayla cerrada: 1 prenda ya estaba registrada, no se sumó stock");
    expect(textoPasasteAlStock(3, "Chaleco Cayla", true, true)).toBe("Muestra Chaleco Cayla terminada");
    expect(textoPasasteAlStock(48, "Pantalón Lía", false, false)).toBe("48 prendas de Pantalón Lía entraron al stock del Taller");
    expect(textoQuePasaConElStock(48, false, false)).toBe("Entran 48 prendas al stock del Taller y cada talla queda en Movimientos");
    expect(textoQuePasaConElStock(1, false, false)).toBe("Entran 1 prenda al stock del Taller y cada talla queda en Movimientos");
    expect(textoQuePasaConElStock(57, false, true)).toBe("Las 57 prendas ya estaban registradas: no entra stock, la orden solo se cierra con su costo");
    expect(textoQuePasaConElStock(57, true, true)).toBe("La muestra se da por terminada");
    expect(textoQuePasaAlRevertir({ inventariadoEn: null, cantidadBuenas: 57, ingresoAlStock: "ya_estaba" })).toContain("no hay stock que devolver");
    expect(textoQuePasaAlRevertir({ inventariadoEn: null, cantidadBuenas: 57, ingresoAlStock: "ya_estaba" })).not.toContain("muestra");
    expect(TEXTO_YA_ESTABA.ayuda).toContain("no suma al stock");
  });

  it("ADR-0551 C: la web llama a la función de la marca con el nombre y los argumentos que la migración declara", () => {
    const SQL = readFileSync(join(RAIZ, "supabase", "migrations", "20261031171000_produccion_cierre_ya_estaba_en_stock.sql"), "utf8");
    expect(SQL).toContain(`create or replace function retail.${RPC_MARCAR_YA_EN_STOCK}(p_produccion_id uuid, p_ya_estaba boolean)`);
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

  it("accionesDeFase: «marcar» si no está marcada (quien opera); «desmarcar» (quitar la marca) solo a un líder (ADR-0586 act. 2); ninguna sin permiso o con la orden cerrada", () => {
    const sin = conPloteo();
    expect(accionesDeFase(sin.fases[0], sin)).toEqual(["marcar"]);
    expect(accionesDeFase(sin.fases[0], sin, { esLider: true })).toEqual(["marcar"]);
    const con = conPloteo(MARCADA);
    expect(accionesDeFase(con.fases[0], con)).toEqual([]);
    expect(accionesDeFase(con.fases[0], con, { esLider: true })).toEqual(["desmarcar"]);
    const ajena = conPloteo({}, {}, { permisos: { puede_operar: false, ve_costos: true } });
    expect(accionesDeFase(ajena.fases[0], ajena, { esLider: true })).toEqual([]);
    const cerrada = orden({ orden: { ...crudo().orden, estado: "terminada" }, fases: [ploteo(MARCADA)] });
    expect(accionesDeFase(cerrada.fases[0], cerrada, { esLider: true })).toEqual([]);
  });

  it("a quien opera y no es líder, Ploteo marcado le dice que un líder quita la marca; al líder, sin permiso, con la orden cerrada o sin marcar, nada", () => {
    const con = conPloteo(MARCADA);
    expect(avisoMarcaSoloLider(con.fases[0], con)).toBe("Si se marcó por error, un líder puede quitar la marca.");
    expect(avisoMarcaSoloLider(con.fases[0], con, { esLider: true })).toBeNull();
    expect(avisoMarcaSoloLider(conPloteo().fases[0], conPloteo())).toBeNull();
    expect(avisoMarcaSoloLider(con.fases[1], con)).toBeNull();
    const ajena = conPloteo(MARCADA, {}, { permisos: { puede_operar: false, ve_costos: true } });
    expect(avisoMarcaSoloLider(ajena.fases[0], ajena)).toBeNull();
    const cerrada = orden({ orden: { ...crudo().orden, estado: "terminada" }, fases: [ploteo(MARCADA)] });
    expect(avisoMarcaSoloLider(cerrada.fases[0], cerrada)).toBeNull();
  });

  it("marcaVivaDeFase: la marca más reciente que nadie deshizo (la que «Quitar la marca» quita desde el paso); sin marca, o en otra fase, null", () => {
    const linea = [
      { id: "m-2", cuando: "2026-10-16T15:00:00+00:00", quien_nombre: "Rosa", tipo: "marca", fase_clave: "ploteo", fase_nombre: "Ploteo", cantidad: 0, detalle: null, nota: null, avance_id: null },
      { id: "m-1b", cuando: "2026-10-15T23:00:00+00:00", quien_nombre: "Rosa", tipo: "desmarca", fase_clave: "ploteo", fase_nombre: "Ploteo", cantidad: 0, detalle: null, nota: null, avance_id: null },
      { id: "m-1", cuando: "2026-10-15T22:40:00+00:00", quien_nombre: "Rosa", tipo: "marca", fase_clave: "ploteo", fase_nombre: "Ploteo", cantidad: 0, detalle: null, nota: null, avance_id: null },
    ];
    const p = conPloteo(MARCADA, {}, { linea_de_tiempo: linea, deshechos: ["m-1"] });
    expect(marcaVivaDeFase(p.fases[0], p)).toBe("m-2");
    expect(marcaVivaDeFase(p.fases[1], p)).toBeNull();
    const sinMarcar = conPloteo({}, {}, { linea_de_tiempo: linea });
    expect(marcaVivaDeFase(sinMarcar.fases[0], sinMarcar)).toBeNull();
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
    expect(entradas[0]).toMatchObject({ detalle: "con Audaces", cuanto: null, anulable: null, marcaViva: { id: "m-2", faseClave: "ploteo", faseNombre: "Ploteo" } });
    expect(cuandoTerminoLaFase("ploteo", p.lineaDeTiempo)).toBe("2026-10-16T15:00:00+00:00");
  });

  it("paridad con la migración 20261019192000: marcar y sus motivos existen, y la línea de tiempo usa «marca» y «desmarca»", () => {
    const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261019192000_produccion_ploteo_la_fase_de_un_toque.sql"), "utf8");
    expect(sql).toContain(`create or replace function retail.${RPC_MARCAR_FASE}(`);
    for (const hint of ["fase_no_es_hito", "marca_ya_hecha", "fase_es_hito"]) expect(sql, hint).toContain(`hint = '${hint}'`);
    expect(sql).toContain("then 'marca' else 'desmarca'");
    expect(sql).toContain("'hito', true, 'marcada', v_empezada");
  });

  it("paridad con la migración 20261031160000 (ADR-0586 act. 2): quitar y restaurar la marca piden un líder (marca_solo_lider) y el camino viejo sin motivo se borra", () => {
    const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261031160000_produccion_quitar_marca_solo_lider.sql"), "utf8");
    expect(sql).toContain("drop function if exists retail.deshacer_marca_fase(uuid);");
    expect(sql.match(/hint = 'marca_solo_lider'/g)).toHaveLength(2);
    expect(sql).toContain("pg_temp.reemplazar_anclado('retail.eliminar_anotacion_orden(uuid[],text)'");
    expect(sql).toContain("pg_temp.reemplazar_anclado('retail.restaurar_anotacion_orden(uuid,text)'");
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

// ---------- Los complementos de la prenda en la página de la orden (ADR-0563) ----------

describe("los complementos (forro, otras telas) en la página de la orden", () => {
  const material = (extra: Record<string, unknown>) => ({ id: "pi-1", insumo_id: "i-1", nombre: "Lino", tipo: "tela", unidad: "metro", color_codigo: "NEG", consumo_por_prenda: 1.2, cantidad_plan: 42, usado: 0, saldo: 100, ...extra });
  it("lee `es_complemento` de una tela; sin la llave, o con otra cosa que `true`, es la tela de siempre; un avío nunca es complemento", () => {
    expect(orden({ insumos: [material({ es_complemento: true })] }).insumos[0].esComplemento).toBe(true);
    expect(orden({ insumos: [material({})] }).insumos[0].esComplemento).toBe(false);
    expect(orden({ insumos: [material({ es_complemento: "true" })] }).insumos[0].esComplemento).toBe(false);
    expect(orden({ insumos: [material({ tipo: "avio", es_complemento: true })] }).insumos[0].esComplemento).toBe(false);
  });
  it("la tabla de la orden pone la tela principal primero, luego el forro y los avíos al final, y dice cuál es complemento", () => {
    const insumos = [
      material({ id: "pi-b", insumo_id: "i-boton", nombre: "Botón", tipo: "avio", unidad: "unidad", color_codigo: null, consumo_por_prenda: 4, cantidad_plan: 96 }),
      material({ id: "pi-f", insumo_id: "i-forro", nombre: "Forro popelina", color_codigo: null, consumo_por_prenda: 0.9, cantidad_plan: 43.2, es_complemento: true }),
      material({ id: "pi-l", insumo_id: "i-lino", nombre: "Lino" }),
    ];
    const filas = filasDeTela(orden({ insumos }).insumos);
    expect(filas.map((f) => [f.nombre, f.tipo, f.complemento])).toEqual([
      ["Lino", "tela", false],
      ["Forro popelina", "tela", true],
      ["Botón", "avio", false],
    ]);
  });
  it("una misma tela que es complemento en un color y principal en otro NO se marca como complemento en la tabla (solo si lo es en todos sus colores)", () => {
    const mezcla = [material({ id: "pi-a", color_codigo: "NEG", es_complemento: true }), material({ id: "pi-b", color_codigo: "CRU" })];
    expect(filasDeTela(orden({ insumos: mezcla }).insumos)[0].complemento).toBe(false);
  });
});

// ---------- Agregar un paso a una orden abierta (ADR-0566) ----------

describe("agregar un paso: cuándo se ofrece (la base repite todo y manda)", () => {
  const base = orden();
  const fase = (clave: FasePagina["clave"], nombre: string, secuencia: number, extra: Partial<FasePagina> = {}): FasePagina => ({ ...base.fases[0], id: `f-${clave}`, clave, nombre, secuencia, estado: "pendiente", actual: false, empezada: false, hechas: 0, ...extra });
  const NUEVA = [fase("ploteo", "Ploteo", 5, { estado: "hecha", empezada: true }), fase("corte", "Corte", 10, { estado: "hecha", empezada: true }), fase("habilitado", "Habilitado", 15, { estado: "hecha", empezada: true }), fase("costura", "Costura", 30, { estado: "hecha", empezada: true }), fase("planchado", "Planchado", 65)];
  const q = (fases: FasePagina[], parche: Partial<Pick<OrdenPagina, "permisos" | "procesos">> & { estado?: string } = {}) => ({
    orden: { ...base.orden, estado: (parche.estado ?? "en_proceso") as OrdenPagina["orden"]["estado"] },
    permisos: parche.permisos ?? { puedeOperar: true, veCostos: true },
    fases,
    procesos: parche.procesos ?? FASES,
  });

  it("la orden del Chaleco (Costura hecha, Planchado sin empezar) puede sumar Pegar cierre, Ojales y botones y Lavado o teñido, en el orden de la ruta", () => {
    const { ofrecidos, bloqueados } = pasosAgregables(q(NUEVA));
    expect(ofrecidos.map((x) => x.clave)).toEqual(["pegar_cierre", "ojales_botones", "lavanderia"]);
    expect(ofrecidos.map((x) => x.nombre)).toEqual(["Pegar cierre", "Ojales y botones", "Lavado o teñido"]);
    expect(ofrecidos.map((x) => x.quienSugerido)).toEqual(["taller", "taller", "servicio"]);
    expect(bloqueados).toEqual([]);
  });
  it("no se ofrece lo que ya está en la ruta", () => {
    const con = [...NUEVA.slice(0, 4), fase("ojales_botones", "Ojales y botones", 35), NUEVA[4]];
    expect(pasosAgregables(q(con)).ofrecidos.map((x) => x.clave)).toEqual(["pegar_cierre", "lavanderia"]);
  });
  it("si un paso POSTERIOR ya empezó no se ofrece, y se dice por qué en vez de esconderlo", () => {
    const planchando = [...NUEVA.slice(0, 4), { ...NUEVA[4], empezada: true, estado: "en_curso" as const }];
    const r = pasosAgregables(q(planchando));
    expect(r.ofrecidos).toEqual([]);
    expect(r.bloqueados[1]).toEqual({ clave: "ojales_botones", nombre: "Ojales y botones", porQue: "Planchado ya empezó, y Ojales y botones iría antes", yaEmpezo: "Planchado" });
    expect(r.bloqueados.map((b) => b.clave)).toEqual(["pegar_cierre", "ojales_botones", "lavanderia"]);
  });
  it("una orden con Planchado HECHO (la del Short, captura del 30-oct) tampoco ofrece nada, y lo dice con una frase para la hoja", () => {
    const hecho = [...NUEVA.slice(0, 4), { ...NUEVA[4], empezada: true, estado: "hecha" as const }];
    const r = pasosAgregables(q(hecho));
    expect(r.ofrecidos).toEqual([]);
    expect(textoDePasosBloqueados(r.bloqueados)).toBe("Pegar cierre, Ojales y botones y Lavado o teñido ya no entran: Planchado ya empezó y irían antes.");
    expect(textoDePasosBloqueados(r.bloqueados.slice(1, 2))).toBe("Ojales y botones ya no entra: Planchado ya empezó y iría antes.");
    expect(textoDePasosBloqueados([])).toBeNull();
  });
  it("«Otro proceso…» pasa por la misma regla: un proceso que iría antes de un paso ya empezado se frena en la hoja, no después de dar de alta el proceso", () => {
    const hecho = [...NUEVA.slice(0, 4), { ...NUEVA[4], empezada: true, estado: "hecha" as const }];
    expect(pasoPosteriorEmpezado(hecho, 30.5)?.nombre).toBe("Planchado");
    expect(pasoPosteriorEmpezado(hecho, 65.5)).toBeUndefined();
  });
  it("un paso ANTERIOR empezado no frena nada (Costura a medias)", () => {
    const a_medias = [...NUEVA.slice(0, 3), { ...NUEVA[3], estado: "en_curso" as const, actual: true, hechas: 10 }, NUEVA[4]];
    expect(pasosAgregables(q(a_medias)).ofrecidos.map((x) => x.clave)).toEqual(["pegar_cierre", "ojales_botones", "lavanderia"]);
  });
  it("una orden de la ruta anterior (Acabado) no mezcla con las fases nuevas: solo se ofrece lo que es de las dos rutas", () => {
    const anterior = [fase("corte", "Corte", 10), fase("costura", "Costura", 30), fase("acabado", "Acabado", 60)];
    expect(pasosAgregables(q(anterior)).ofrecidos.map((x) => x.clave)).toEqual(["pegar_cierre", "lavanderia"]);
  });
  it("un proceso que dio de alta el líder se ofrece en su lugar; uno apagado no (ADR-0570, actividad 5)", () => {
    const propio = { ...faseDe("pegar_cierre"), clave: "tenido_en_frio", nombre: "Teñido en frío", ayuda: "", secuencia: 31, delSistema: false };
    const apagado = { ...faseDe("lavanderia"), activo: false };
    const procesos = [...FASES.filter((f) => f.clave !== "lavanderia"), propio, apagado];
    expect(pasosAgregables(q(NUEVA, { procesos })).ofrecidos.map((x) => `${x.clave}@${x.lugar}`)).toEqual(["tenido_en_frio@31", "pegar_cierre@32", "ojales_botones@35"]);
  });
  it("sin permiso de operar, con la orden cerrada o sin fases, no se ofrece nada", () => {
    expect(pasosAgregables(q(NUEVA, { permisos: { puedeOperar: false, veCostos: true } }))).toEqual({ ofrecidos: [], bloqueados: [] });
    expect(pasosAgregables(q(NUEVA, { estado: "terminada" }))).toEqual({ ofrecidos: [], bloqueados: [] });
    expect(pasosAgregables(q([]))).toEqual({ ofrecidos: [], bloqueados: [] });
  });
  it("paridad con la migración 20261029051000: la RPC existe, sus argumentos son los que manda la hoja y sus motivos son los que la pantalla ya conoce", () => {
    const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261029051000_produccion_agregar_paso_a_la_orden.sql"), "utf8");
    expect(sql).toContain(`create or replace function retail.${RPC_AGREGAR_PASO}(`);
    for (const arg of ["p_produccion_id", "p_clave", "p_quien", "p_proveedor_id", "p_tarifa_prenda", "p_fijo_orden", "p_cantidad_minima", "p_fecha_prometida", "p_proveedor_pendiente", "p_posicion"]) expect(sql, arg).toContain(arg);
    for (const hint of ["paso_despues_empezado", "orden_cerrada", "orden_inexistente", "responsable_requerido"]) expect(sql, hint).toContain(`hint = '${hint}'`);
    // La ruta completa pasa la validación de abrir y el candado es el de las demás escrituras de la orden.
    expect(sql).toContain("retail.fn_produccion_fases_normalizar(");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('produccion:'");
  });
});

describe("agregar un paso que se olvidó (ADR-0586): el líder lo agrega ya hecho", () => {
  const base = orden();
  const fase = (clave: FasePagina["clave"], nombre: string, secuencia: number, extra: Partial<FasePagina> = {}): FasePagina => ({ ...base.fases[0], id: `f-${clave}`, clave, nombre, secuencia, estado: "pendiente", actual: false, empezada: false, hechas: 0, segundas: 0, faltantes: 0, salieron: 0, hito: false, ...extra });
  // La orden del Short Sastre Recover (captura del 30-oct): todo hecho con las 16, Planchado incluido, y sin Ojales y botones.
  const SHORT = [
    fase("ploteo", "Ploteo", 5, { estado: "hecha", empezada: true, hito: true }),
    fase("corte", "Corte", 10, { estado: "hecha", empezada: true, hechas: 16 }),
    fase("habilitado", "Habilitado", 15, { estado: "hecha", empezada: true, hechas: 16 }),
    fase("costura", "Costura", 30, { estado: "hecha", empezada: true, hechas: 16 }),
    fase("planchado", "Planchado", 65, { estado: "hecha", empezada: true, hechas: 16 }),
  ];
  const q = (fases: FasePagina[]) => ({ orden: { ...base.orden, estado: "en_proceso" as const }, permisos: { puedeOperar: true, veCostos: true }, fases, procesos: FASES });

  it("al líder se le ofrece Ojales y botones marcado «tarde»: va antes de Planchado y entra con las 16 que ya están en Planchado", () => {
    const { ofrecidos, bloqueados } = pasosAgregables(q(SHORT), { esLider: true });
    const ojales = ofrecidos.find((x) => x.clave === "ojales_botones");
    expect(ojales?.tarde).toEqual({ antesDe: "Planchado", prendas: 16 });
    expect(ofrecidos.every((x) => x.tarde !== null)).toBe(true);
    expect(bloqueados).toEqual([]);
  });
  it("a quien no es líder no se le ofrece: sigue apagado con su porqué (la base repite: paso_tarde_solo_lider)", () => {
    const { ofrecidos, bloqueados } = pasosAgregables(q(SHORT));
    expect(ofrecidos).toEqual([]);
    expect(bloqueados.find((b) => b.clave === "ojales_botones")?.porQue).toBe("Planchado ya empezó, y Ojales y botones iría antes");
  });
  it("Planchado anotado y deshecho entero ya no «empezó», pero la base igual lo frena: la línea de tiempo lo recuerda y es «tarde» (al líder con 0, a los demás apagado)", () => {
    const deshecho = SHORT.map((f) => (f.clave === "planchado" ? { ...f, estado: "pendiente" as const, empezada: false, hechas: 0 } : f));
    const linea = [{ ...orden().lineaDeTiempo[0], faseClave: "planchado" as const, tipo: "deshacer" as const }];
    expect(pasosAgregables({ ...q(deshecho), lineaDeTiempo: linea }, { esLider: true }).ofrecidos.find((x) => x.clave === "ojales_botones")?.tarde).toEqual({ antesDe: "Planchado", prendas: 0 });
    expect(pasosAgregables({ ...q(deshecho), lineaDeTiempo: linea }).bloqueados.map((b) => b.clave)).toContain("ojales_botones");
    expect(pasoPosteriorEmpezado(deshecho, 35, linea)?.nombre).toBe("Planchado");
    expect(pasoPosteriorEmpezado(deshecho, 35)).toBeUndefined();
  });
  it("lo que no empezó después se sigue agregando vacío, como antes (tarde: null)", () => {
    const sinPlanchar = SHORT.map((f) => (f.clave === "planchado" ? { ...f, estado: "pendiente" as const, empezada: false, hechas: 0 } : f));
    expect(pasosAgregables(q(sinPlanchar), { esLider: true }).ofrecidos.find((x) => x.clave === "ojales_botones")?.tarde).toBeNull();
  });
  it("las prendas que ya pasaron son las que el paso siguiente ya usó (buenas, segundas, perdidas o lo que salió a su servicio), no todas las del paso de antes", () => {
    expect(prendasQueYaPasaron(SHORT, 35)).toBe(16);
    expect(prendasQueYaPasaron(SHORT.map((f) => (f.clave === "planchado" ? { ...f, hechas: 2, segundas: 1, faltantes: 1 } : f)), 35)).toBe(4);
    expect(prendasQueYaPasaron(SHORT.map((f) => (f.clave === "planchado" ? { ...f, quien: "servicio" as const, hechas: 3, salieron: 5 } : f)), 35)).toBe(5);
    expect(prendasQueYaPasaron(SHORT, 70)).toBe(0);
  });
  it("la hoja lo dice en una frase: qué avanzó y con cuántas entra", () => {
    expect(avisoDePasoTarde("Ojales y botones", { antesDe: "Planchado", prendas: 16 })).toBe(
      "Ojales y botones entra hecho con las 16 prendas que ya están en Planchado. Lo que falte se anota cuando se haga. Queda en la historia con tu motivo."
    );
    expect(avisoDePasoTarde("Ojales y botones", { antesDe: "Planchado", prendas: 1 })).toContain("con la prenda que ya está en Planchado");
    expect(avisoDePasoTarde("Ojales y botones", { antesDe: "Planchado", prendas: 0 })).toContain("entra vacío");
  });
  it("la historia lo cuenta («Agregó Ojales y botones tarde · 16 prendas ya hechas · Afuera con … · Por qué: …») y el paso sabe que entró tarde", () => {
    const cambio = {
      id: "c-t",
      accion: "paso_tarde",
      objeto: null,
      fase_clave: "ojales_botones",
      fase_nombre: "Ojales y botones",
      quita_ids: [],
      pone_ids: ["a-1", "a-2"],
      deshace_ids: [],
      antes: null,
      despues: { clave: "ojales_botones", quien: "servicio", proveedor_nombre: "Ojalería Lima", prendas: 16, hecho: "2026-10-28T17:00:00+00:00", antes_de: "planchado" },
      texto: "Se olvidó anotarlo",
      restaurado: false,
      quien_nombre: "Felipe",
      cuando: "2026-10-16T16:00:00+00:00",
    };
    const p = orden({ cambios: [cambio] });
    expect(p.cambios[0]).toMatchObject({ accion: "paso_tarde", faseClave: "ojales_botones", antes: null, despues: null, tarde: { prendas: 16, quien: "servicio", proveedorNombre: "Ojalería Lima", hecho: "2026-10-28T17:00:00+00:00" } });
    const entrada = lineaDeTiempoAgrupada(p, "2026-10-16").flatMap((d) => d.entradas).find((e) => e.tipo === "paso_tarde");
    expect(entrada).toMatchObject({ titulo: "Agregó Ojales y botones tarde", cuanto: "16 prendas ya hechas", detalle: "Afuera con Ojalería Lima · volvió el mié 28 oct · Por qué: Se olvidó anotarlo", restaurable: null });
    expect(tonoDeEntrada("paso_tarde")).toBe("cambio");
    expect(pasoAgregadoTarde({ clave: "ojales_botones" }, p.cambios)?.texto).toBe("Se olvidó anotarlo");
    expect(pasoAgregadoTarde({ clave: "planchado" }, p.cambios)).toBeUndefined();
  });
  it("paridad con la migración 20261031002000: la RPC, los argumentos que manda la hoja y sus motivos", () => {
    const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261031002000_produccion_agregar_paso_tarde.sql"), "utf8");
    expect(sql).toContain(`create or replace function retail.${RPC_AGREGAR_PASO_TARDE}(`);
    for (const arg of ["p_produccion_id", "p_clave", "p_motivo", "p_hecho_en", "p_quien", "p_proveedor_id", "p_tarifa_prenda", "p_fijo_orden", "p_cantidad_minima", "p_proveedor_pendiente", "p_posicion"]) expect(sql, arg).toContain(arg);
    for (const hint of ["paso_tarde_solo_lider", "paso_no_es_tarde", "paso_tarde_hito", "orden_cerrada", "responsable_requerido"]) expect(sql, hint).toContain(`hint = '${hint}'`);
    // Lo que da por hecho es lo que el paso siguiente ya usó (la cuenta de fn_produccion_exigir_cadena), y bloquea la fila de la orden como cerrar_produccion.
    expect(sql).toContain("retail.fn_produccion_fase_siguiente(v_fase)");
    expect(sql).toContain("for update");
    expect(sql).toContain("retail.fn_es_lider()");
    expect(sql).toContain("retail.fn_produccion_motivo_cambio(p_motivo)");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('produccion:'");
  });
});

describe("la ruta viva (ADR-0570): un color por paso y un paso abierto", () => {
  const p = orden();
  const [corte, costura, acabado] = p.fases;

  it("estadoEnRuta: verde lo hecho, ámbar lo que toca (la actual o una que ya empezó), gris lo que falta", () => {
    expect(estadoEnRuta(corte)).toBe("hecha");
    expect(estadoEnRuta(costura)).toBe("toca");
    expect(estadoEnRuta(acabado)).toBe("pendiente");
    // Una fase que empezó en paralelo con la actual también pide que alguien anote.
    expect(estadoEnRuta({ ...acabado, estado: "en_curso" })).toBe("toca");
  });

  it("faseAbiertaDeLaRuta: la actual; sin actual, la primera sin terminar; todo hecho, la última; sin pasos, nada", () => {
    expect(faseAbiertaDeLaRuta(p.fases)?.clave).toBe("costura");
    expect(faseAbiertaDeLaRuta(p.fases.map((f) => ({ ...f, actual: false })))?.clave).toBe("costura");
    expect(faseAbiertaDeLaRuta(p.fases.map((f) => ({ ...f, estado: "hecha" as const, actual: false })))?.clave).toBe("acabado");
    expect(faseAbiertaDeLaRuta([])).toBeNull();
  });

  it("subtituloEnRuta: cuántas y cuándo si está hecha, «Te toca» en la actual, quién la hará si falta", () => {
    expect(subtituloEnRuta(corte, "2026-10-15T22:40:00+00:00", 48)).toBe("48 · jue 15 oct");
    expect(subtituloEnRuta(corte, null, 48)).toBe("48 hechas");
    expect(subtituloEnRuta(costura, null, 48)).toBe("Te toca");
    expect(subtituloEnRuta({ ...acabado, estado: "en_curso", hechas: 12, entrada: 30 }, null, 48)).toBe("12 de 48");
    expect(subtituloEnRuta(acabado, null, 48)).toBe("Taller");
    expect(subtituloEnRuta({ ...acabado, quien: "servicio", proveedorNombre: "Ojalería Lima" }, null, 48)).toBe("Afuera · Ojalería Lima");
  });

  it("subtituloEnRuta: un paso que se marca (Ploteo) dice «Hecho» con su día, sin contar prendas", () => {
    const ploteo: FasePagina = { ...corte, clave: "ploteo", nombre: "Ploteo", hito: true, marcada: true, hechas: 0 };
    expect(subtituloEnRuta(ploteo, "2026-10-13T15:00:00+00:00", 48)).toBe("Hecho · mar 13 oct");
    expect(subtituloEnRuta(ploteo, null, 48)).toBe("Hecho");
  });

  it("tonoDeEntrada: lo hecho en verde, lo que salió en camino, lo deshecho o anulado como cambio, la apertura aparte", () => {
    expect((["avance", "vuelta", "marca"] as TipoEvento[]).map(tonoDeEntrada)).toEqual(["hecho", "hecho", "hecho"]);
    expect(tonoDeEntrada("salida")).toBe("camino");
    expect((["deshacer", "anulacion", "desmarca"] as TipoEvento[]).map(tonoDeEntrada)).toEqual(["cambio", "cambio", "cambio"]);
    expect(tonoDeEntrada("apertura")).toBe("inicio");
  });

  it("la tela «por anotar»: ya se cortó y la orden no tiene nada descontado; con algo anotado ya no; un avío nunca", () => {
    const sinNadaUsado = orden().insumos.map((i) => ({ ...i, usado: 0 }));
    const [tela, boton] = filasDeTela(sinNadaUsado, true);
    expect(tela).toMatchObject({ yaCortada: true, porAnotar: true });
    expect(boton.porAnotar).toBe(false);
    // 35 m ya anotados: no falta anotar aunque sea menos que el plan.
    expect(filasDeTela(orden().insumos, true)[0].porAnotar).toBe(false);
    // Sin cortar todavía, no hay nada que anotar.
    expect(filasDeTela(sinNadaUsado, false)[0].porAnotar).toBe(false);
  });
});

describe("«Terminé» con falla y con fecha (ADR-0570, actividad 2)", () => {
  const p = orden();
  const [corte, , acabado] = p.fases;
  const nombreDe = (id: string) => `la variante ${id}`;
  const falla = (varianteId: string, cantidad: string, destino: FallaBorrador["destino"] = "segunda"): FallaBorrador => ({ varianteId, cantidad, destino });

  it("lo que falta terminar descuenta las segundas y las perdidas ya anotadas (un arreglo sigue faltando)", () => {
    const enCurso: FasePagina = { ...acabado, estado: "en_curso", porVariante: acabado.porVariante.map((v) => ({ ...v, entrada: 8, hechas: 3, fallasSegundas: v.varianteId === "n28" ? 2 : 0, fallasPerdidas: v.varianteId === "n28" ? 1 : 0 })) };
    const faltan = cantidadesQueFaltan(enCurso, p.fases);
    expect(faltan.n28).toBe(2);
    expect(faltan.c30).toBe(5);
  });

  it("en el Taller lo que no salió bien se dice «perdida»; en un servicio sigue siendo «faltante»", () => {
    const tallerHecho: FasePagina = { ...corte, segundas: 1, faltantes: 2 };
    expect(textoDeFase(tallerHecho, { previa: null, terminoEl: null, totalPlan: 48 }).detalle).toBe("Hecha · 1 segunda · 2 perdidas");
  });

  it("buenasConFallas: anotar 2 con falla baja las buenas de esa talla y color; nunca las sube", () => {
    const faltan = { n28: 8, c28: 8 };
    expect(buenasConFallas(faltan, { n28: "8", c28: "8" }, [falla("n28", "2")])).toEqual({ n28: "6", c28: "8" });
    // Lo que la persona ya había bajado a mano se respeta.
    expect(buenasConFallas(faltan, { n28: "3", c28: "8" }, [falla("n28", "2")])).toEqual({ n28: "3", c28: "8" });
    // Dos filas de la misma talla y color se suman.
    expect(buenasConFallas(faltan, { n28: "8" }, [falla("n28", "2"), falla("n28", "1", "perdida")])).toEqual({ n28: "5" });
  });

  it("totales: todas las fallas, y solo las que cierran la fase (segunda y perdida, no el arreglo)", () => {
    const filas = [falla("n28", "2"), falla("c28", "1", "arreglo"), falla("", "4"), falla("n30", "x")];
    expect(totalFallas(filas)).toBe(3);
    expect(fallasQueCierran(filas)).toBe(2);
  });

  it("problemasDeFallas: sin talla, sin cantidad, pasarse de lo que falta y sin motivo, cada uno en una frase", () => {
    const faltan = { n28: 8 };
    expect(problemasDeFallas(faltan, { n28: "6" }, [falla("n28", "2")], "Mancha", nombreDe)).toEqual([]);
    expect(problemasDeFallas(faltan, { n28: "6" }, [falla("", "1")], "Mancha", nombreDe)).toEqual(["Elige la talla y el color de cada prenda con falla."]);
    expect(problemasDeFallas(faltan, { n28: "6" }, [falla("n28", "0")], "Mancha", nombreDe)).toEqual(["Escribe cuántas con falla hay en la variante n28."]);
    expect(problemasDeFallas(faltan, { n28: "8" }, [falla("n28", "1")], "Mancha", nombreDe)).toEqual(["En la variante n28 faltan 8: entre buenas y con falla anotaste 9."]);
    expect(problemasDeFallas(faltan, { n28: "6" }, [falla("n28", "2")], "  ", nombreDe)).toEqual(["Cuenta qué pasó con las prendas con falla."]);
    expect(problemasDeFallas(faltan, { n28: "6" }, [falla("n28", "2")], "x".repeat(MAX_MOTIVO_FALLA + 1), nombreDe)).toHaveLength(1);
    // Sin fallas no se pide motivo.
    expect(problemasDeFallas(faltan, { n28: "8" }, [], "", nombreDe)).toEqual([]);
  });

  it("lineasDeFallas: una línea por talla, color y destino (las repetidas se suman), con el motivo; las vacías no viajan", () => {
    expect(lineasDeFallas([falla("n28", "2"), falla("n28", "1"), falla("n28", "1", "perdida"), falla("", "3"), falla("c28", "0")], " Mancha ")).toEqual([
      { variante_id: "n28", cantidad: 3, destino: "segunda", motivo: "Mancha" },
      { variante_id: "n28", cantidad: 1, destino: "perdida", motivo: "Mancha" },
    ]);
  });

  it("textoFallas: «2 segundas · 1 perdida · 1 se arregla», sin los ceros", () => {
    expect(textoFallas({ segunda: 2, perdida: 1, arreglo: 1 })).toBe("2 segundas · 1 perdida · 1 se arregla");
    expect(textoFallas({ segunda: 0, perdida: 0, arreglo: 2 })).toBe("2 se arreglan");
  });

  it("el día: hoy de fábrica; nunca futuro ni antes de abrir la orden; a la base viaja nulo si es hoy", () => {
    expect(problemaDeDia("2026-10-19", "2026-10-19", "2026-10-13")).toBeNull();
    expect(problemaDeDia("2026-10-15", "2026-10-19", "2026-10-13")).toBeNull();
    expect(problemaDeDia("2026-10-20", "2026-10-19", "2026-10-13")).toMatch(/todavía no llega/);
    expect(problemaDeDia("2026-10-12", "2026-10-19", "2026-10-13")).toMatch(/se abrió el mar 13 oct/);
    expect(problemaDeDia("", "2026-10-19", "2026-10-13")).toMatch(/Elige el día/);
    expect(diaParaLaBase("2026-10-19", "2026-10-19")).toBeNull();
    expect(diaParaLaBase("2026-10-15", "2026-10-19")).toBe("2026-10-15");
  });

  it("la línea de tiempo: las fallas de una anotación son UNA entrada roja, con su resumen, su porqué y su «Corregir»; otro día dice cuándo se anotó", () => {
    const conFallas = orden({
      linea_de_tiempo: [
        { id: "fa-1", cuando: "2026-10-17T17:00:00+00:00", registrado_en: "2026-10-19T14:12:00.001+00:00", quien_nombre: "Claudia", tipo: "falla", fase_clave: "acabado", fase_nombre: "Acabado", cantidad: 2, destino: "segunda", motivo: "Mancha", variante_id: "n28", falla_id: "fa-1" },
        { id: "fa-2", cuando: "2026-10-17T17:00:00+00:00", registrado_en: "2026-10-19T14:12:00.002+00:00", quien_nombre: "Claudia", tipo: "falla", fase_clave: "acabado", fase_nombre: "Acabado", cantidad: 1, destino: "perdida", motivo: "Mancha", variante_id: "c28", falla_id: "fa-2" },
      ],
    });
    const [dia] = lineaDeTiempoAgrupada(conFallas, HOY);
    expect(dia.dia).toBe("2026-10-17");
    expect(dia.entradas).toHaveLength(1);
    expect(dia.entradas[0]).toMatchObject({
      titulo: "Con falla en Acabado",
      cuanto: "3 prendas",
      detalle: "2 segundas · 1 perdida: Mancha",
      anotado: "anotó el lun 19 oct a las 09:12",
      corregible: {
        ids: ["fa-1", "fa-2"],
        faseClave: "acabado",
        buenas: {},
        fallas: [
          { varianteId: "n28", destino: "segunda", cantidad: 2, motivo: "Mancha" },
          { varianteId: "c28", destino: "perdida", cantidad: 1, motivo: "Mancha" },
        ],
        dia: "2026-10-17",
      },
    });
    expect(tonoDeEntrada("falla")).toBe("problema");
    expect(tonoDeEntrada("falla_deshecha")).toBe("cambio");
  });



  it("paridad con la migración 20261029164000: los mismos rechazos (hints), el mismo tope del motivo y las llaves que la página lee", () => {
    const mig = readFileSync(join(RAIZ, "supabase", "migrations", "20261029164000_produccion_termine_con_falla_y_fecha.sql"), "utf8");
    for (const hint of ["falla_sin_motivo", "falla_destino_invalido", "falla_cantidad_invalida", "falla_repetida", "avance_excede", "avance_fecha_futura", "avance_fecha_antes_de_abrir", "deshacer_ya_hecho"]) {
      expect(mig, hint).toContain(`'${hint}'`);
    }
    expect(mig).toContain(`length(motivo) <= ${MAX_MOTIVO_FALLA}`);
    expect(mig).toContain("destino in ('segunda', 'perdida', 'arreglo')");
    for (const k of ["fallas_segundas", "fallas_perdidas", "falla_id", "registrado_en", "destino"]) expect(mig, k).toContain(`'${k}'`);
    expect(mig).toContain("create or replace function retail.anotar_termine(p_fase_id uuid, p_lineas jsonb, p_nota text default null, p_hecho_en date default null, p_fallas jsonb default null)");
    expect(mig).toContain("create or replace function retail.deshacer_falla(p_falla_id uuid)");
  });
});

describe("corregir, eliminar y restaurar con su historia (ADR-0570, actividad 3)", () => {
  const CORTE = TODAS.map((id) => `a-${id}`);
  const eliminacion = (parche: Record<string, unknown> = {}) => ({
    id: "c-1",
    accion: "eliminar",
    objeto: "termine",
    fase_clave: "corte",
    fase_nombre: "Corte",
    quita_ids: CORTE,
    pone_ids: [],
    deshace_ids: ["d-1"],
    antes: { buenas: TODAS.map((v) => ({ variante_id: v, cantidad: 8 })), fallas: [], hecho: "2026-10-15T22:40:00+00:00", nota: null },
    despues: null,
    texto: "Se anotó dos veces",
    restaurado: false,
    quien_nombre: "Felipe",
    cuando: "2026-10-16T16:00:00+00:00",
    ...parche,
  });
  const deshacerDeLaEliminacion = { id: "d-1", cuando: "2026-10-16T16:00:00+00:00", quien_nombre: "Felipe", tipo: "deshacer", fase_clave: "corte", fase_nombre: "Corte", cantidad: 8, detalle: "8 de n28", variante_id: "n28", avance_id: null };

  it("lee los cambios y lo ya deshecho; lo suelto se descarta", () => {
    const p = orden({ cambios: [eliminacion(), { id: "x" }, { id: "y", accion: "borrar", cuando: "2026-10-16T16:00:00+00:00" }], deshechos: ["a-n28", 3] });
    expect(p.cambios).toHaveLength(1);
    expect(p.cambios[0]).toMatchObject({ accion: "eliminar", objeto: "termine", faseClave: "corte", quitaIds: CORTE, deshaceIds: ["d-1"], texto: "Se anotó dos veces" });
    expect(p.cambios[0].antes?.buenas).toHaveLength(6);
    expect(p.deshechos).toEqual(["a-n28"]);
    expect(orden().cambios).toEqual([]);
  });

  it("lo que un cambio quitó (y sus Deshacer) sale de la vista; en su lugar va el cambio, con cuántas, de qué día y por qué, y su «Restaurar»", () => {
    const p = orden({ linea_de_tiempo: [...crudo().linea_de_tiempo, deshacerDeLaEliminacion], cambios: [eliminacion()], deshechos: CORTE });
    const entradas = lineaDeTiempoAgrupada(p, "2026-10-16").flatMap((d) => d.entradas);
    expect(entradas.map((e) => e.titulo)).toEqual(["Eliminó lo terminado en Corte", "Salida de Costura", "Abrió la orden"]);
    expect(entradas[0]).toMatchObject({ cuanto: "48 prendas", detalle: "del jue 15 oct · Por qué: Se anotó dos veces", restaurable: { cambioId: "c-1" }, restaurado: false, quien: "Felipe", corregible: null });
    expect(tonoDeEntrada(entradas[0].tipo)).toBe("cambio");
  });

  it("una eliminación restaurada ya no trae «Restaurar» y lleva su marca; la restauración es otra entrada", () => {
    const restauracion = { ...eliminacion({ id: "c-2", accion: "restaurar", quita_ids: [], pone_ids: ["a-r1"], deshace_ids: [], antes: null, texto: "Se eliminó por error", cuando: "2026-10-16T17:00:00+00:00" }), despues: eliminacion().antes };
    const p = orden({ linea_de_tiempo: [...crudo().linea_de_tiempo, deshacerDeLaEliminacion], cambios: [restauracion, eliminacion({ restaurado: true })], deshechos: CORTE });
    const [hoy] = lineaDeTiempoAgrupada(p, "2026-10-16");
    expect(hoy.entradas.map((e) => [e.titulo, e.restaurable, e.restaurado])).toEqual([
      ["Restauró lo terminado en Corte", null, false],
      ["Eliminó lo terminado en Corte", null, true],
      ["Salida de Costura", null, false],
    ]);
    expect(hoy.entradas[0]).toMatchObject({ cuanto: "48 prendas", detalle: "Por qué: Se eliminó por error" });
  });

  it("una corrección dice de cuánto a cuánto, qué cambió y por qué; lo corregido lleva su marca y dice «corrigió el…», nunca «anotó»", () => {
    const corregido = { id: "a-nuevo", cuando: "2026-10-15T22:40:00+00:00", registrado_en: "2026-10-16T16:00:00+00:00", quien_nombre: "Felipe", tipo: "avance", fase_clave: "corte", fase_nombre: "Corte", cantidad: 6, detalle: "6 de n28", variante_id: "n28", avance_id: null };
    const correccion = eliminacion({
      accion: "corregir",
      quita_ids: ["a-n28"],
      pone_ids: ["a-nuevo"],
      deshace_ids: ["d-1"],
      antes: { buenas: [{ variante_id: "n28", cantidad: 8 }], fallas: [], hecho: "2026-10-15T22:40:00+00:00", nota: null },
      despues: { buenas: [{ variante_id: "n28", cantidad: 6 }], fallas: [{ variante_id: "n28", destino: "segunda", cantidad: 2, motivo: "Mancha" }], hecho: "2026-10-15T22:40:00+00:00", nota: null },
      texto: "Cantidad equivocada",
    });
    const p = orden({ linea_de_tiempo: [...crudo().linea_de_tiempo, corregido, deshacerDeLaEliminacion], cambios: [correccion], deshechos: ["a-n28"] });
    const entradas = lineaDeTiempoAgrupada(p, "2026-10-16").flatMap((d) => d.entradas);
    const cambio = entradas.find((e) => e.tipo === "corregir")!;
    expect(cambio).toMatchObject({ titulo: "Corrigió lo terminado en Corte", cuanto: "8 → 6", detalle: "Negro 28: 8 → 6 · con falla: 2 segundas · Por qué: Cantidad equivocada" });
    const nuevo = entradas.find((e) => e.ids.includes("a-nuevo"))!;
    expect(nuevo).toMatchObject({ titulo: "Terminó Corte", corregida: true, anotado: "corrigió el vie 16 oct a las 11:00", hora: "17:40" });
    expect(nuevo.corregible?.ids).toEqual(["a-nuevo"]);
    // Las otras cinco tallas del corte siguen como estaban, corregibles.
    expect(entradas.find((e) => e.ids.includes("a-n30"))?.corregible?.ids).toHaveLength(5);
    expect(entradas.some((e) => e.ids.includes("a-n28") || e.ids.includes("d-1"))).toBe(false);
  });

  it("queCambio: las tallas que cambiaron, las fallas y el día; nada si es igual", () => {
    const lineas = orden().lineas;
    const a = { buenas: [{ varianteId: "n28", cantidad: 8 }, { varianteId: "c30", cantidad: 4 }], fallas: [], hecho: "2026-10-15T22:40:00+00:00", nota: null };
    expect(queCambio(a, { ...a, hecho: "2026-10-16T17:00:00+00:00" }, lineas)).toBe("del jue 15 oct al vie 16 oct");
    expect(queCambio(a, { ...a, buenas: [{ varianteId: "n28", cantidad: 8 }] }, lineas)).toBe("Caqui 30: 4 → 0");
    expect(queCambio({ ...a, fallas: [{ varianteId: "n28", destino: "perdida", cantidad: 1, motivo: "Mancha" }] }, a, lineas)).toBe("sin fallas");
    expect(queCambio(a, a, lineas)).toBeNull();
  });

  it("una nota del equipo es una entrada neutra con su texto; la marca quitada y su restauración dicen la fase", () => {
    const nota = { id: "n-1", accion: "nota", objeto: null, fase_clave: null, fase_nombre: null, quita_ids: [], pone_ids: [], deshace_ids: [], antes: null, despues: null, texto: "La tela llegó con una mancha", restaurado: false, quien_nombre: "Rosa", cuando: "2026-10-16T18:00:00+00:00" };
    const marca = eliminacion({ id: "m-c", objeto: "marca", fase_clave: "corte", fase_nombre: "Ploteo", quita_ids: ["m-x"], antes: null, texto: "Todavía no se hizo", cuando: "2026-10-16T17:30:00+00:00" });
    const [hoy] = lineaDeTiempoAgrupada(orden({ cambios: [nota, marca] }), "2026-10-16");
    expect(hoy.entradas[0]).toMatchObject({ tipo: "nota", titulo: "Nota", detalle: "La tela llegó con una mancha", quien: "Rosa", hora: "13:00", cuanto: null, restaurable: null });
    expect(tonoDeEntrada("nota")).toBe("neutro");
    expect(hoy.entradas[1]).toMatchObject({ titulo: "Quitó la marca de Ploteo", detalle: "Por qué: Todavía no se hizo", restaurable: { cambioId: "m-c", marca: true } });
  });

  it("un cambio de tipo (ADR-0581) cuenta de qué tipo a cuál pasó, con su motivo aparte, y es un cambio de la orden, no una anotación", () => {
    const tipo = (despues: boolean, texto: string, cuando: string) => ({
      id: `t-${cuando}`, accion: "tipo", objeto: null, fase_clave: null, fase_nombre: null, quita_ids: [], pone_ids: [], deshace_ids: [],
      antes: { es_muestra: !despues }, despues: { es_muestra: despues }, texto, restaurado: false, quien_nombre: "Felipe", cuando,
    });
    const aLote = tipo(false, "Pasó de muestra a lote de producción · Ya tienen el molde", "2026-10-16T18:00:00+00:00");
    const aMuestra = tipo(true, "Pasó de lote de producción a muestra", "2026-10-16T19:00:00+00:00");
    const [hoy] = lineaDeTiempoAgrupada(orden({ cambios: [aLote, aMuestra] }), "2026-10-16");
    // Lo más nuevo arriba.
    expect(hoy.entradas[0]).toMatchObject({ tipo: "tipo", titulo: "Pasó de lote de producción a muestra", detalle: null, quien: "Felipe", cuanto: null, restaurable: null, corregible: null });
    expect(hoy.entradas[1]).toMatchObject({ tipo: "tipo", titulo: "Pasó de muestra a lote de producción", detalle: "Por qué: Ya tienen el molde" });
    expect(tonoDeEntrada("tipo")).toBe("cambio");
  });

  const anotacion: AnotacionCorregible = {
    ids: ["a-1", "fa-1"],
    faseClave: "acabado",
    faseNombre: "Acabado",
    buenas: { n28: 6 },
    fallas: [
      { varianteId: "n28", destino: "segunda", cantidad: 1, motivo: "Mancha" },
      { varianteId: "n28", destino: "arreglo", cantidad: 1, motivo: "Mancha" },
    ],
    dia: "2026-10-17",
  };
  const nombreDe = (id: string) => id;

  it("lo que cabe al corregir: lo que falta más lo que ocupaba esa anotación (un arreglo no ocupaba lugar)", () => {
    expect(disponiblesParaCorregir({ n28: 1, c28: 3 }, anotacion)).toEqual({ n28: 8, c28: 3 });
    expect(fallasDeLaAnotacion(anotacion)).toEqual({
      fallas: [
        { varianteId: "n28", cantidad: "1", destino: "segunda" },
        { varianteId: "n28", cantidad: "1", destino: "arreglo" },
      ],
      motivo: "Mancha",
    });
  });

  it("las cantidades corregidas: no más de lo que cabe en una talla sin fallas, y sin nada se usa «Eliminar»", () => {
    const caben = { n28: 8, c28: 3 };
    expect(problemaDeCantidadesCorregidas(caben, { n28: "8", c28: "3" }, [], nombreDe)).toBeNull();
    expect(problemaDeCantidadesCorregidas(caben, { c28: "4" }, [], nombreDe)).toBe("En c28 caben 3: anotaste 4.");
    expect(problemaDeCantidadesCorregidas(caben, { n28: "0" }, [], nombreDe)).toMatch(/usa «Eliminar»/);
    expect(problemaDeCantidadesCorregidas(caben, { n28: "0" }, [{ varianteId: "n28", cantidad: "2", destino: "perdida" }], nombreDe)).toBeNull();
  });

  it("sin cambios no hay nada que guardar: mismas buenas, mismas fallas con su motivo y el mismo día", () => {
    const { fallas, motivo } = fallasDeLaAnotacion(anotacion);
    expect(correccionSinCambios(anotacion, { n28: "6" }, fallas, motivo, "2026-10-17")).toBe(true);
    expect(correccionSinCambios(anotacion, { n28: "5" }, fallas, motivo, "2026-10-17")).toBe(false);
    expect(correccionSinCambios(anotacion, { n28: "6" }, fallas, motivo, "2026-10-16")).toBe(false);
    expect(correccionSinCambios(anotacion, { n28: "6" }, fallas, "Quemadura de plancha", "2026-10-17")).toBe(false);
    expect(correccionSinCambios(anotacion, { n28: "6" }, fallas.slice(0, 1), motivo, "2026-10-17")).toBe(false);
    expect(correccionSinCambios(anotacion, { n28: "6", c28: "" }, fallas, motivo, "2026-10-17")).toBe(true);
  });

  it("el motivo de un cambio y una nota: obligatorios y con su tope", () => {
    expect(problemaDeMotivoCambio("  ")).toMatch(/Cuenta por qué/);
    expect(problemaDeMotivoCambio("Cantidad equivocada")).toBeNull();
    expect(problemaDeMotivoCambio("x".repeat(MAX_MOTIVO_CAMBIO + 1))).toMatch(/muy largo/);
    expect(problemaDeNota("")).toBe("Escribe la nota.");
    expect(problemaDeNota("x".repeat(MAX_NOTA_ORDEN + 1))).toMatch(/muy larga/);
    expect(problemaDeNota("La tela llegó con una mancha")).toBeNull();
  });

  it("paridad con la migración 20261029173000: las RPC, los rechazos (hints), los topes y las llaves que la página lee", () => {
    const mig = readFileSync(join(RAIZ, "supabase", "migrations", "20261029173000_produccion_corregir_y_eliminar_con_historia.sql"), "utf8");
    expect(mig).toContain(`create or replace function retail.${RPC_CORREGIR_ANOTACION}(p_ids uuid[], p_lineas jsonb, p_fallas jsonb, p_hecho_en date, p_motivo text)`);
    expect(mig).toContain(`create or replace function retail.${RPC_ELIMINAR_ANOTACION}(p_ids uuid[], p_motivo text)`);
    expect(mig).toContain(`create or replace function retail.${RPC_RESTAURAR_ANOTACION}(p_cambio_id uuid, p_motivo text)`);
    expect(mig).toContain(`create or replace function retail.${RPC_COMENTAR_ORDEN}(p_produccion_id uuid, p_texto text)`);
    for (const hint of ["cambio_sin_motivo", "cambio_motivo_largo", "corregir_vacio", "corregir_sin_cambios", "cambio_ya_avanzo", "cambio_ya_deshecho", "restaurar_ya_hecho", "nota_vacia", "nota_larga"]) {
      expect(mig, hint).toContain(`'${hint}'`);
    }
    expect(mig).toContain(`length(v) > ${MAX_MOTIVO_CAMBIO}`);
    expect(mig).toContain(`length(v_texto) > ${MAX_NOTA_ORDEN}`);
    for (const k of ["cambios", "deshechos", "quita_ids", "pone_ids", "deshace_ids", "restaurado", "fase_clave", "quien_nombre"]) expect(mig, k).toContain(`'${k}'`);
  });
});

// ---------- «Terminé» y la Salida con su tela, todo o nada (ADR-0587) ----------

describe("leerEnvioConTela — lo que devuelve el envío con token", () => {
  it("un envío nuevo trae los ids para «Deshacer»; solo los textos", () => {
    const r = leerEnvioConTela({ repetido: false, avance_ids: ["av-1", "av-2"], falla_ids: [], consumo_ids: ["mi-1", 3] });
    expect(r).toEqual({ repetido: false, deshacer: { avanceIds: ["av-1", "av-2"], fallaIds: [], consumoIds: ["mi-1"] } });
    expect(argsDeshacerTermine(r.deshacer!)).toEqual({ p_avance_ids: ["av-1", "av-2"], p_falla_ids: [], p_consumo_ids: ["mi-1"] });
  });
  it("un reintento que la base ya tenía («repetido») no ofrece «Deshacer»: no sabe qué escribió el primero", () => {
    expect(leerEnvioConTela({ repetido: true, fases: [] })).toEqual({ repetido: true, deshacer: null });
  });
  it("una Salida (sin prendas que deshacer) y una respuesta rara no ofrecen «Deshacer»", () => {
    expect(leerEnvioConTela({ repetido: false, fases: [], tela: [], consumo_ids: [] }).deshacer).toBeNull();
    expect(leerEnvioConTela(null)).toEqual({ repetido: false, deshacer: null });
    expect(leerEnvioConTela([1, 2])).toEqual({ repetido: false, deshacer: null });
  });
});

describe("fraseDelEnvioConToken — con token, repetir es seguro", () => {
  it("si se cortó la red, pide volver a apretar el mismo botón y promete que no se anota dos veces", () => {
    const frase = fraseDelEnvioConToken({ message: "TypeError: Failed to fetch", code: "" } as never, "anotar lo que terminaste en corte", "Terminé");
    expect(frase).toContain("Vuelve a apretar «Terminé»");
    expect(frase).toContain("no se anota dos veces");
  });
  it("un «no» de la base dice lo de la base", () => {
    expect(fraseDelEnvioConToken({ message: "En el estante había 45 de Lino", code: "P0001", hint: "uso_quedo_de_mas" } as never, "anotar", "Terminé")).toBe("En el estante había 45 de Lino");
  });
});

describe("Paridad con la migración del corte con su tela (20261031014000)", () => {
  const mig = readFileSync(join(RAIZ, "supabase", "migrations", "20261031014000_produccion_corte_con_su_tela_todo_o_nada.sql"), "utf8");
  it("las tres funciones que llama la pantalla existen con los parámetros que se mandan, y devuelven lo que se lee", () => {
    expect(mig).toContain(`create or replace function retail.${RPC_ANOTAR_TERMINE_CON_TELA}(`);
    expect(mig).toContain(`create or replace function retail.${RPC_REGISTRAR_SALIDA_CON_TELA}(`);
    expect(mig).toContain(`create or replace function retail.${RPC_DESHACER_TERMINE}(p_avance_ids uuid[], p_falla_ids uuid[], p_consumo_ids uuid[])`);
    for (const p of ["p_fase_id", "p_lineas", "p_nota", "p_hecho_en", "p_fallas", "p_tela", "p_token", "p_guia"]) expect(mig, p).toContain(p);
    for (const k of ["repetido", "avance_ids", "falla_ids", "consumo_ids"]) expect(mig, k).toContain(`'${k}'`);
  });
});
