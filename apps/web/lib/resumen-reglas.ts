import {
  calcularEstado,
  necesitaReponerPiso,
  UMBRAL_STOCK_BAJO_ALMACEN,
  UMBRAL_COBERTURA_CRITICA_DIAS,
  UMBRAL_COBERTURA_RIESGO_DIAS,
  UMBRAL_COBERTURA_SOBRESTOCK_DIAS,
  UMBRAL_SOBRESTOCK_SEMANAS,
  type EstadoStock,
} from "./inventario-reglas";
import { detectarHuecosCurva } from "./curva-variantes";
import { compararTallas } from "./tallas";

// Reglas del Resumen de Inventario (2026-09-17, ADR-0101). Puras, sin
// servidor: la RPC `fn_resumen_variantes` trae NÚMEROS crudos por variante y
// sede, y acá se decide qué significan. Es el único lugar donde viven
// "riesgo", "sobrestock", "curva incompleta", "mejora en camino" y "sugerir
// traslado" — Existencias y Resumen comparten `calcularEstado`/
// `necesitaReponerPiso`, así una prenda nunca es "Stock bajo" en una pestaña
// y "saludable" en la otra. Probado en `resumen-reglas.test.ts`.

// ---------------------------------------------------------------------------
// Constantes de ventana. Cambiarlas acá cambia toda la pantalla.
// ---------------------------------------------------------------------------

/** Cuántos días hacia atrás se mira la venta. Es un tope: si la prenda llegó
 *  a la sede hace 8 días, se divide entre 8 (ventana observable), no entre 30. */
export const VENTANA_VELOCIDAD_DIAS = 30;

/** Con menos días observados que esto, la velocidad NO se calcula: "historial
 *  insuficiente" en vez de un número que parece serio y no lo es. */
export const MIN_DIAS_HISTORIAL = 7;

/** Sin ninguna venta en toda la ventana observada y con stock, la prenda es
 *  candidata a «Posible sobrestock». Es LA ventana entera a propósito: la RPC
 *  topa `dias_observables` en `p_ventana_dias`, así que un número mayor sería
 *  inalcanzable y uno menor afirmaría sobrestock con parte de la ventana. */
export const DIAS_SIN_VENTA_SOBRESTOCK = VENTANA_VELOCIDAD_DIAS;

/** Por debajo de esta cantidad no vale la pena hablar de sobrestock. */
export const MIN_UNIDADES_SOBRESTOCK = 3;

/** Cuántos días de venta se busca cubrir con un traslado sugerido. */
export const DIAS_OBJETIVO_TRASLADO = 14;

// ---------------------------------------------------------------------------
// Entrada: una fila de `fn_resumen_variantes` ya mapeada a camelCase.
// ---------------------------------------------------------------------------

export type TipoUbicacion = "tienda" | "almacen" | "taller";

export type UbicacionEnRed = {
  ubicacionId: string;
  nombre: string;
  tipo: TipoUbicacion;
  separaPisoAlmacen: boolean;
  disponible: number;
  /** Lo que un traslado puede sacar: el almacén en una tienda, todo en el Taller. */
  almacen: number;
  diasObservables: number | null;
  ventasVentana: number;
  devolucionesVentana: number;
  enCamino: number;
};

export type FilaVarianteResumen = {
  varianteId: string;
  productoId: string;
  referencia: string;
  categoria: string | null;
  sku: string;
  codigo: string | null;
  talla: string | null;
  colorCodigo: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  stockMinimo: number | null;
  separaPisoAlmacen: boolean;
  piso: number;
  almacen: number;
  /** Stock sin sububicación en una tienda que separa piso/almacén (reingreso
   *  de una anulación de venta): está en la tienda, pero ni en piso ni en almacén. */
  sinSububicacion: number;
  cuarentena: number;
  disponible: number;
  primerIngreso: string | null;
  diasObservables: number | null;
  ventasVentana: number;
  devolucionesVentana: number;
  ultimaVenta: string | null;
  entradasVentana: number;
  mermasVentana: number;
  trasladosSalidaVentana: number;
  /** Todo lo enviado hacia esta sede y no confirmado (definición de Existencias). */
  enCamino: number;
  /** Solo lo que todavía no pasó su fecha estimada: lo único con lo que se
   *  proyecta cobertura o se descuenta de lo que hace falta. */
  enCaminoATiempo: number;
  enCaminoAtrasado: boolean;
  proximaLlegada: string | null;
  enRed: UbicacionEnRed[];
};

// ---------------------------------------------------------------------------
// Velocidad y cobertura
// ---------------------------------------------------------------------------

export type EstadoVelocidad = "ok" | "sin_ventas" | "historial_corto" | "sin_historial";

export type Velocidad = {
  estado: EstadoVelocidad;
  /** Unidades por día; null cuando no hay base honesta para calcularla. */
  unidadesDia: number | null;
  diasObservados: number | null;
  ventasNetas: number;
};

export function calcularVelocidad(diasObservables: number | null, ventas: number, devoluciones: number): Velocidad {
  const ventasNetas = Math.max(ventas - devoluciones, 0);
  if (diasObservables === null) return { estado: "sin_historial", unidadesDia: null, diasObservados: null, ventasNetas };
  if (diasObservables < MIN_DIAS_HISTORIAL) {
    return { estado: "historial_corto", unidadesDia: null, diasObservados: diasObservables, ventasNetas };
  }
  const unidadesDia = ventasNetas / diasObservables;
  return { estado: unidadesDia > 0 ? "ok" : "sin_ventas", unidadesDia, diasObservados: diasObservables, ventasNetas };
}

/** Días que dura `unidades` al ritmo de `velocidad`, sin redondear (para
 *  comparar contra umbrales). Null si no hay ritmo medible — nunca "infinito"
 *  ni 0 disfrazado. */
export function coberturaExacta(unidades: number, velocidad: Velocidad): number | null {
  if (velocidad.estado !== "ok" || !velocidad.unidadesDia) return null;
  return unidades / velocidad.unidadesDia;
}

/** La misma cobertura, a un decimal, para mostrar. */
export function calcularCobertura(unidades: number, velocidad: Velocidad): number | null {
  const exacta = coberturaExacta(unidades, velocidad);
  return exacta === null ? null : Math.round(exacta * 10) / 10;
}

/** Sell-through de la ventana: vendido / (vendido + lo que quedó + lo que se
 *  perdió + lo que se mandó a otra sede). Por conservación de unidades eso
 *  equivale a vendido / (stock inicial + recibido) sin reconstruir el stock
 *  inicial. Solo con historial suficiente; y como CAYLA no modela colección/
 *  temporada, es sell-through de VENTANA, no de campaña (limitación en el ADR). */
export function calcularSellThrough(f: FilaVarianteResumen, velocidad: Velocidad): number | null {
  if (velocidad.estado === "sin_historial" || velocidad.estado === "historial_corto") return null;
  const base = f.disponible + velocidad.ventasNetas + f.mermasVentana + f.trasladosSalidaVentana;
  if (base <= 0) return null;
  return Math.round((velocidad.ventasNetas / base) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Situación y acción por variante
// ---------------------------------------------------------------------------

export type Situacion =
  | "riesgo_quiebre"
  | "mejora_en_camino"
  | "curva_incompleta"
  | "reponer_tienda"
  | "reponer_piso"
  | "posible_sobrestock"
  | "normal";

export type Accion =
  | "sugerir_traslado"
  | "reponer"
  | "mover_a_piso"
  | "esperar_recepcion"
  | "revisar_redistribucion"
  | "revisar"
  | "vigilar";

export const ETIQUETA_SITUACION: Record<Situacion, string> = {
  riesgo_quiebre: "Riesgo de quiebre",
  mejora_en_camino: "Mejora con en camino",
  curva_incompleta: "Curva incompleta",
  reponer_tienda: "Reponer tienda",
  reponer_piso: "Reponer piso",
  posible_sobrestock: "Posible sobrestock",
  normal: "Normal",
};

export const ETIQUETA_ACCION: Record<Accion, string> = {
  sugerir_traslado: "Sugerir traslado",
  reponer: "Reponer",
  mover_a_piso: "Mover a piso",
  esperar_recepcion: "Esperar recepción",
  revisar_redistribucion: "Revisar redistribución",
  revisar: "Revisar",
  vigilar: "Vigilar / liquidar",
};

/** Lo primero que pide acción va primero. */
export const ORDEN_SITUACION: Record<Situacion, number> = {
  riesgo_quiebre: 0,
  curva_incompleta: 1,
  reponer_tienda: 2,
  reponer_piso: 3,
  mejora_en_camino: 4,
  posible_sobrestock: 5,
  normal: 6,
};

export type SugerenciaTraslado = {
  varianteId: string;
  origenId: string;
  origenNombre: string;
  origenTipo: TipoUbicacion;
  /** Lo que el origen tiene disponible hoy (para la columna "En la red"). */
  origenDisponible: number;
  destinoId: string;
  destinoNombre: string;
  cantidad: number;
  /** Por qué el origen puede ceder esa cantidad sin quedarse corto. */
  motivo: string;
};

export type CurvaDeVariante = {
  /** Las tallas hermanas (mismo producto y color) que SÍ tienen stock acá. */
  tallasConStock: string[];
};

export type AnalisisVariante = {
  fila: FilaVarianteResumen;
  velocidad: Velocidad;
  coberturaDias: number | null;
  coberturaProyectadaDias: number | null;
  sellThroughPct: number | null;
  /** Semáforo de Existencias, la MISMA función; null donde no hay piso/almacén. */
  estadoTienda: EstadoStock | null;
  reponerPiso: boolean;
  situacion: Situacion;
  /** Dentro de riesgo: sin stock o cobertura ≤ UMBRAL_COBERTURA_CRITICA_DIAS. */
  critico: boolean;
  accion: Accion | null;
  sugerencia: SugerenciaTraslado | null;
  curva: CurvaDeVariante | null;
  /** Por qué CAYLA dice lo que dice, en frases cortas para el detalle. */
  motivos: string[];
};

export type Ubicacion = { id: string; nombre: string; tipo: TipoUbicacion };

/** Por qué se piden unidades — cambia cuántas se piden. */
export type MotivoNecesidad = "demanda" | "reserva" | "curva";

const MS_POR_DIA = 86_400_000;

function diasHasta(iso: string | null, ahora: Date): number | null {
  if (!iso) return null;
  return (new Date(iso).getTime() - ahora.getTime()) / MS_POR_DIA;
}

/** Cuántas unidades harían falta en el destino, descontando SOLO lo que viene
 *  a tiempo (lo atrasado no se puede dar por llegado):
 *  - demanda: llegar a DIAS_OBJETIVO_TRASLADO de cobertura; sin ritmo medible
 *    pero con ventas recientes (historial corto y stock en cero), al menos lo
 *    que se vendió.
 *  - reserva: volver a poner el almacén de la tienda por encima del umbral de
 *    Existencias (la política de Felipe), o lo que pida la demanda si es más.
 *  - curva: tapar el hueco — con 1 alcanza para que la talla exista. */
export function unidadesNecesarias(f: FilaVarianteResumen, velocidad: Velocidad, motivo: MotivoNecesidad): number {
  const porDemanda =
    velocidad.estado === "ok" && velocidad.unidadesDia
      ? Math.ceil(velocidad.unidadesDia * DIAS_OBJETIVO_TRASLADO) - f.disponible - f.enCaminoATiempo
      : velocidad.ventasNetas;
  switch (motivo) {
    case "curva":
      return 1;
    case "reserva":
      return Math.max(UMBRAL_STOCK_BAJO_ALMACEN + 1 - f.almacen - f.enCaminoATiempo, porDemanda, 1);
    default:
      return Math.max(porDemanda, 1);
  }
}

/** Cuántas unidades puede dar otra sede sin crearse su propio problema:
 *  - El Taller no vende a clientas: cede todo lo que tiene.
 *  - Una tienda cede solo desde su ALMACÉN (un traslado nunca vacía el piso),
 *    nunca por debajo del umbral de reserva de Existencias (si no, su propio
 *    Resumen pediría la prenda de vuelta al día siguiente), y si vende, conserva
 *    además UMBRAL_COBERTURA_RIESGO_DIAS de cobertura propia.
 *  - Una tienda sin historial suficiente no se toca: no sabemos qué necesita. */
export function capacidadDeOrigen(o: UbicacionEnRed): { unidades: number; motivo: string } {
  if (o.tipo === "taller") {
    return { unidades: Math.max(o.almacen, 0), motivo: `${o.nombre} no vende a clientas` };
  }
  const velocidad = calcularVelocidad(o.diasObservables, o.ventasVentana, o.devolucionesVentana);
  const sobraEnAlmacen = Math.max(o.almacen - (UMBRAL_STOCK_BAJO_ALMACEN + 1), 0);
  if (velocidad.estado === "ok" && velocidad.unidadesDia) {
    const reserva = Math.ceil(velocidad.unidadesDia * UMBRAL_COBERTURA_RIESGO_DIAS);
    const unidades = Math.max(Math.min(sobraEnAlmacen, o.disponible - reserva), 0);
    return { unidades, motivo: `${o.nombre} vende ${velocidad.unidadesDia.toFixed(2)}/día y se queda con ${o.disponible - unidades}` };
  }
  if (velocidad.estado === "sin_ventas") {
    return { unidades: sobraEnAlmacen, motivo: `${o.nombre} no vendió esta prenda en ${velocidad.diasObservados} días` };
  }
  return { unidades: 0, motivo: `${o.nombre} sin historial suficiente` };
}

export function sugerirTraslado(
  f: FilaVarianteResumen,
  velocidad: Velocidad,
  destino: Ubicacion,
  motivo: MotivoNecesidad = "demanda",
): SugerenciaTraslado | null {
  const necesarias = unidadesNecesarias(f, velocidad, motivo);
  let mejor: { o: UbicacionEnRed; unidades: number; motivo: string } | null = null;
  for (const o of f.enRed) {
    const cap = capacidadDeOrigen(o);
    if (cap.unidades <= 0) continue;
    // Más capacidad gana; a igualdad, el Taller antes que vaciar otra tienda.
    if (!mejor || cap.unidades > mejor.unidades || (cap.unidades === mejor.unidades && o.tipo === "taller" && mejor.o.tipo !== "taller")) {
      mejor = { o, unidades: cap.unidades, motivo: cap.motivo };
    }
  }
  if (!mejor) return null;
  return {
    varianteId: f.varianteId,
    origenId: mejor.o.ubicacionId,
    origenNombre: mejor.o.nombre,
    origenTipo: mejor.o.tipo,
    origenDisponible: mejor.o.disponible,
    destinoId: destino.id,
    destinoNombre: destino.nombre,
    cantidad: Math.min(necesarias, mejor.unidades),
    motivo: mejor.motivo,
  };
}

/** Curvas incompletas por producto+color en ESTA sede. La curva "esperada"
 *  son las tallas con variante dada de alta que alguna vez pasaron por la sede
 *  (la RPC ya filtra las que jamás la pisaron): un hueco es una talla en cero
 *  con stock antes y después en el orden canónico. */
export function curvasPorVariante(filas: FilaVarianteResumen[]): Map<string, CurvaDeVariante> {
  const grupos = new Map<string, FilaVarianteResumen[]>();
  for (const f of filas) {
    if (f.talla === null) continue;
    const clave = `${f.productoId}::${f.colorCodigo ?? ""}`;
    (grupos.get(clave) ?? grupos.set(clave, []).get(clave)!).push(f);
  }
  const resultado = new Map<string, CurvaDeVariante>();
  for (const grupo of grupos.values()) {
    const huecos = detectarHuecosCurva(grupo.map((f) => ({ varianteId: f.varianteId, talla: f.talla, stock: f.disponible })));
    for (const h of huecos) {
      const variante = grupo.find((f) => f.talla === h.tallaFaltante);
      if (variante) resultado.set(variante.varianteId, { tallasConStock: [...h.tallasConStock].sort(compararTallas) });
    }
  }
  return resultado;
}

export function analizarVariante(
  f: FilaVarianteResumen,
  destino: Ubicacion,
  curva: CurvaDeVariante | null,
  ahora: Date = new Date(),
): AnalisisVariante {
  const velocidad = calcularVelocidad(f.diasObservables, f.ventasVentana, f.devolucionesVentana);
  const exacta = coberturaExacta(f.disponible, velocidad);
  const proyectadaExacta = f.enCaminoATiempo > 0 ? coberturaExacta(f.disponible + f.enCaminoATiempo, velocidad) : exacta;
  const coberturaDias = exacta === null ? null : Math.round(exacta * 10) / 10;
  const coberturaProyectadaDias = proyectadaExacta === null ? null : Math.round(proyectadaExacta * 10) / 10;
  const sellThroughPct = calcularSellThrough(f, velocidad);
  const esTienda = destino.tipo !== "taller";
  const estadoTienda = f.separaPisoAlmacen ? calcularEstado(f.piso, f.almacen) : null;
  const reponerPiso = f.separaPisoAlmacen && necesitaReponerPiso(f.piso, f.almacen);
  const diasLlegada = diasHasta(f.proximaLlegada, ahora);

  const motivos: string[] = [];
  const hayDemanda = velocidad.estado === "ok" || velocidad.ventasNetas > 0;
  const sinStockConDemanda = f.disponible === 0 && hayDemanda;
  const coberturaBaja = exacta !== null && exacta <= UMBRAL_COBERTURA_RIESGO_DIAS;
  const critico = sinStockConDemanda || (exacta !== null && exacta <= UMBRAL_COBERTURA_CRITICA_DIAS);
  const sinVentasProlongado =
    velocidad.estado === "sin_ventas" && (velocidad.diasObservados ?? 0) >= DIAS_SIN_VENTA_SOBRESTOCK;
  const recordarPiso = () => {
    if (reponerPiso) motivos.push(`Mientras tanto, bajar al piso lo que queda en el almacén (${f.almacen})`);
  };
  const sinOrigen = () =>
    f.enRed.length === 0 ? "Ninguna otra sede tiene stock: reponer desde proveedor o Taller" : "Las otras sedes no pueden ceder sin quedarse cortas";

  let situacion: Situacion = "normal";
  let accion: Accion | null = null;
  let sugerencia: SugerenciaTraslado | null = null;

  if (sinStockConDemanda || coberturaBaja) {
    situacion = "riesgo_quiebre";
    if (f.disponible === 0) motivos.push(`Sin stock en ${destino.nombre} y con ${velocidad.ventasNetas} venta${velocidad.ventasNetas === 1 ? "" : "s"} en la ventana`);
    else motivos.push(`Cobertura de ${formatoCobertura(exacta!)} al ritmo actual (${velocidad.unidadesDia!.toFixed(2)}/día)`);

    // Lo que viene solo "salva" si llega antes de que se agote lo que hay
    // (un día de gracia) y deja la cobertura fuera del riesgo.
    const llegaATiempo = diasLlegada === null || diasLlegada <= Math.max(exacta ?? 0, 0) + 1;
    const proyectadaSalva = f.enCaminoATiempo > 0 && proyectadaExacta !== null && proyectadaExacta > UMBRAL_COBERTURA_RIESGO_DIAS && llegaATiempo;
    if (proyectadaSalva) {
      situacion = "mejora_en_camino";
      accion = "esperar_recepcion";
      motivos.push(`Llegan +${f.enCaminoATiempo}${diasLlegada !== null ? ` en ${formatoCobertura(Math.max(diasLlegada, 0))}` : ""}: la cobertura pasa a ${formatoCobertura(proyectadaExacta!)}`);
    } else {
      if (f.enCaminoATiempo > 0 && !llegaATiempo) motivos.push(`Llegan +${f.enCaminoATiempo}, pero recién en ${formatoCobertura(diasLlegada!)}: después de agotarse lo que hay`);
      if (f.enCaminoAtrasado) motivos.push(`Hay ${f.enCamino - f.enCaminoATiempo} en un traslado atrasado: no se cuentan`);
      sugerencia = sugerirTraslado(f, velocidad, destino);
      if (sugerencia) {
        accion = "sugerir_traslado";
        motivos.push(`${sugerencia.origenNombre} puede mandar ${sugerencia.cantidad}: ${sugerencia.motivo}`);
      } else {
        accion = "reponer";
        motivos.push(sinOrigen());
      }
    }
    recordarPiso();
  } else if (curva) {
    situacion = "curva_incompleta";
    motivos.push(`Falta la talla ${f.talla} entre ${curva.tallasConStock.join(", ")}`);
    if (f.enCaminoATiempo > 0) {
      accion = "esperar_recepcion";
      motivos.push(`Ya vienen +${f.enCaminoATiempo} de esta talla`);
    } else {
      sugerencia = sugerirTraslado(f, velocidad, destino, "curva");
      if (sugerencia) {
        accion = "revisar_redistribucion";
        motivos.push(`${sugerencia.origenNombre} tiene esta talla: ${sugerencia.motivo}`);
      } else {
        accion = "reponer";
        motivos.push("Ninguna otra sede puede ceder esta talla");
      }
    }
  } else if (esTienda && sinVentasProlongado && f.disponible >= MIN_UNIDADES_SOBRESTOCK) {
    // Antes que "reponer tienda": pedir más de algo que no vendió ni una
    // unidad en toda la ventana es fabricar sobrestock. En el Taller no
    // aplica: no vende a clientas, su stock es para distribuir.
    situacion = "posible_sobrestock";
    accion = "vigilar";
    motivos.push(`Sin ventas en ${velocidad.diasObservados} días con ${f.disponible} unidades`);
    recordarPiso();
  } else if (esTienda && (estadoTienda === "stock_bajo" || estadoTienda === "sin_stock")) {
    // La misma regla de Existencias ("¿a esta tienda le queda de dónde
    // sacar?"): reserva en el umbral o menos = pedir a otra sede o al Taller.
    // Es reposición de TIENDA, no de piso — y no es "riesgo" porque no hay
    // ritmo de venta que lo pruebe, solo la política de reserva de Felipe. Por
    // eso el traslado solo se SUGIERE con evidencia de venta; sin ella, se
    // revisa a mano (no se manda mercadería a ciegas).
    situacion = "reponer_tienda";
    const sinUbicar = estadoTienda === "sin_stock" && f.disponible > 0;
    motivos.push(
      sinUbicar
        ? `${f.disponible} unidad${f.disponible === 1 ? "" : "es"} sin ubicar (reingreso de anulación): ubicarlas en piso o almacén antes de pedir`
        : estadoTienda === "sin_stock"
          ? `Sin stock en ${destino.nombre}, sin ventas observadas en la ventana`
          : `Almacén de la tienda en ${f.almacen} (umbral ${UMBRAL_STOCK_BAJO_ALMACEN}): pronto no habrá con qué reponer el piso`,
    );
    const necesarias = unidadesNecesarias(f, velocidad, "reserva");
    if (sinUbicar) {
      accion = "revisar";
    } else if (f.enCaminoATiempo >= necesarias) {
      accion = "esperar_recepcion";
      motivos.push(`Llegan +${f.enCaminoATiempo}${diasLlegada !== null ? ` en ${formatoCobertura(Math.max(diasLlegada, 0))}` : ""}`);
    } else if (velocidad.estado === "ok") {
      sugerencia = sugerirTraslado(f, velocidad, destino, "reserva");
      if (sugerencia) {
        accion = "sugerir_traslado";
        motivos.push(`${sugerencia.origenNombre} puede mandar ${sugerencia.cantidad}: ${sugerencia.motivo}`);
      } else {
        accion = "reponer";
        motivos.push(sinOrigen());
      }
    } else {
      accion = "revisar";
      motivos.push(
        velocidad.estado === "sin_ventas"
          ? `Sin ventas en ${velocidad.diasObservados} días: no se sugiere traer más sin revisar`
          : "Sin historial suficiente para sugerir cuánto traer",
      );
    }
    recordarPiso();
  } else if (reponerPiso) {
    situacion = "reponer_piso";
    accion = "mover_a_piso";
    motivos.push(`Piso en ${f.piso} con ${f.almacen} en el almacén de la tienda`);
  } else if (
    esTienda &&
    velocidad.estado === "ok" &&
    exacta !== null &&
    exacta >= UMBRAL_COBERTURA_SOBRESTOCK_DIAS &&
    f.disponible >= MIN_UNIDADES_SOBRESTOCK
  ) {
    situacion = "posible_sobrestock";
    accion = "vigilar";
    motivos.push(`Cobertura de ${Math.round(exacta / 7)} semanas (umbral ${UMBRAL_SOBRESTOCK_SEMANAS}) con ${f.disponible} unidades`);
  }

  if (situacion === "normal" && velocidad.estado === "historial_corto") {
    motivos.push(`Historial corto: ${velocidad.diasObservados} día${velocidad.diasObservados === 1 ? "" : "s"} observado${velocidad.diasObservados === 1 ? "" : "s"}`);
  }
  if (situacion === "normal" && !esTienda && f.disponible > 0) {
    motivos.push(`${destino.nombre} no vende a clientas: su stock está para distribuir`);
  }

  return {
    fila: f,
    velocidad,
    coberturaDias,
    coberturaProyectadaDias,
    sellThroughPct,
    estadoTienda,
    reponerPiso,
    situacion,
    critico: situacion === "riesgo_quiebre" && critico,
    accion,
    sugerencia,
    curva,
    motivos,
  };
}

// ---------------------------------------------------------------------------
// La pantalla entera
// ---------------------------------------------------------------------------

export type ResumenAnalitico = {
  ubicacion: Ubicacion;
  analisis: AnalisisVariante[];
  /** % de variantes de la sede sin ninguna situación; null si no hay ninguna. */
  salud: { porcentaje: number; sinAlerta: number; relevantes: number } | null;
  riesgo: { total: number; criticas: number };
  traslados: { total: number; entreTiendas: number; desdeTaller: number };
  reposicionAhora: { total: number; sinStock: number; coberturaCritica: number };
  /** Reserva de tienda bajo el umbral de Existencias (pedir a otra sede/Taller). */
  reponerTienda: { total: number };
  curvas: { total: number; productos: number };
  sobrestock: { total: number };
  enCamino: { total: number; unidades: number };
  decisiones: AnalisisVariante[];
  vigilar: { analisis: AnalisisVariante; razon: string }[];
};

function puntajeVigilar(a: AnalisisVariante): number {
  switch (a.situacion) {
    case "riesgo_quiebre":
      return (a.fila.disponible === 0 ? 100 : a.critico ? 90 : 70) + Math.min(a.velocidad.ventasNetas / 100, 0.99);
    case "curva_incompleta":
      return 60;
    case "posible_sobrestock":
      return 50 + Math.min((a.coberturaDias ?? 0) / 100, 9);
    case "reponer_tienda":
      return a.fila.disponible === 0 ? 48 : 45;
    case "reponer_piso":
      return 40;
    case "mejora_en_camino":
      return 30;
    default:
      return 0;
  }
}

function razonVigilar(a: AnalisisVariante): string {
  switch (a.situacion) {
    case "riesgo_quiebre":
      return a.fila.disponible === 0 ? "Sin stock con demanda" : `Cobertura ${formatoCobertura(a.coberturaDias!)}`;
    case "curva_incompleta":
      return "Curva incompleta";
    case "reponer_tienda":
      return a.fila.disponible === 0 ? "Sin stock en la sede" : "Reserva baja";
    case "posible_sobrestock":
      return a.coberturaDias !== null ? `Sobrestock (${Math.round(a.coberturaDias / 7)} sem.)` : "Sin ventas en la ventana";
    case "reponer_piso":
      return "Falta en piso";
    case "mejora_en_camino":
      return `Llegan +${a.fila.enCaminoATiempo}`;
    default:
      return "";
  }
}

export function analizarInventario(filas: FilaVarianteResumen[], ubicacion: Ubicacion, ahora: Date = new Date()): ResumenAnalitico {
  const curvas = curvasPorVariante(filas);
  const analisis = filas.map((f) => analizarVariante(f, ubicacion, curvas.get(f.varianteId) ?? null, ahora));

  const sinAlerta = analisis.filter((a) => a.situacion === "normal").length;
  const riesgo = analisis.filter((a) => a.situacion === "riesgo_quiebre");
  const sugerencias = analisis.filter((a) => a.sugerencia !== null);
  const curvasList = analisis.filter((a) => a.situacion === "curva_incompleta");
  const sobrestock = analisis.filter((a) => a.situacion === "posible_sobrestock");
  const mejora = analisis.filter((a) => a.situacion === "mejora_en_camino");

  const decisiones = analisis
    .filter((a) => a.situacion !== "normal")
    .sort(
      (a, b) =>
        ORDEN_SITUACION[a.situacion] - ORDEN_SITUACION[b.situacion] ||
        Number(b.critico) - Number(a.critico) ||
        (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity) ||
        b.velocidad.ventasNetas - a.velocidad.ventasNetas ||
        a.fila.referencia.localeCompare(b.fila.referencia, "es"),
    );

  const vigilar = [...decisiones]
    .sort((a, b) => puntajeVigilar(b) - puntajeVigilar(a))
    .slice(0, 5)
    .map((a) => ({ analisis: a, razon: razonVigilar(a) }));

  return {
    ubicacion,
    analisis,
    salud:
      analisis.length === 0
        ? null
        : { porcentaje: Math.round((sinAlerta / analisis.length) * 100), sinAlerta, relevantes: analisis.length },
    riesgo: { total: riesgo.length, criticas: riesgo.filter((a) => a.critico).length },
    traslados: {
      total: sugerencias.length,
      entreTiendas: sugerencias.filter((a) => a.sugerencia!.origenTipo !== "taller").length,
      desdeTaller: sugerencias.filter((a) => a.sugerencia!.origenTipo === "taller").length,
    },
    reposicionAhora: {
      total: riesgo.filter((a) => a.critico).length,
      sinStock: riesgo.filter((a) => a.fila.disponible === 0).length,
      coberturaCritica: riesgo.filter((a) => a.critico && a.fila.disponible > 0).length,
    },
    reponerTienda: { total: analisis.filter((a) => a.situacion === "reponer_tienda").length },
    curvas: { total: curvasList.length, productos: new Set(curvasList.map((a) => `${a.fila.productoId}::${a.fila.colorCodigo}`)).size },
    sobrestock: { total: sobrestock.length },
    enCamino: { total: mejora.length, unidades: mejora.reduce((acc, a) => acc + a.fila.enCaminoATiempo, 0) },
    decisiones,
    vigilar,
  };
}

// ---------------------------------------------------------------------------
// Textos de la tabla
// ---------------------------------------------------------------------------

export function formatoCobertura(dias: number): string {
  if (dias >= 21) return `${Math.round(dias / 7)} sem.`;
  if (dias < 1) return "< 1 día";
  const unDecimal = Math.round(dias * 10) / 10;
  const texto = Number.isInteger(unDecimal) ? String(unDecimal) : unDecimal.toFixed(1);
  return `${texto} día${unDecimal === 1 ? "" : "s"}`;
}

/** "2 días", "14 sem.", "1.5 días → 5 días" — la columna COBERTURA. */
export function textoCobertura(a: AnalisisVariante): string {
  if (a.velocidad.estado === "sin_historial") return "Sin historial";
  if (a.velocidad.estado === "historial_corto") return "Historial corto";
  if (a.velocidad.estado === "sin_ventas") return "Sin ventas";
  if (a.coberturaDias === null) return "—";
  const actual = formatoCobertura(a.coberturaDias);
  if (a.fila.enCaminoATiempo > 0 && a.coberturaProyectadaDias !== null && a.coberturaProyectadaDias !== a.coberturaDias) {
    return `${actual} → ${formatoCobertura(a.coberturaProyectadaDias)}`;
  }
  return actual;
}

/** La columna EN LA RED: siempre "dónde hay cuánto" (disponible de la otra
 *  sede), nunca la cantidad sugerida — esa va en la acción. */
export function textoEnRed(a: AnalisisVariante): string {
  if (a.sugerencia) return `${a.sugerencia.origenNombre}: ${a.sugerencia.origenDisponible}`;
  if (a.accion === "esperar_recepcion" && a.fila.enCaminoATiempo > 0) return `Llegan +${a.fila.enCaminoATiempo}`;
  if (a.situacion === "reponer_piso") return "Almacén tienda";
  const conStock = a.fila.enRed.filter((o) => o.disponible > 0);
  if (conStock.length === 0) return a.fila.enRed.some((o) => o.enCamino > 0) ? "En camino a otra sede" : "Solo aquí";
  if (conStock.length === 1) return `${conStock[0].nombre}: ${conStock[0].disponible}`;
  return "Red estable";
}

/** La columna ACCIÓN SUGERIDA: la acción y, si hay traslado, cuántas unidades. */
export function textoAccion(a: AnalisisVariante): string {
  if (!a.accion) return "—";
  const base = ETIQUETA_ACCION[a.accion];
  if (a.sugerencia && (a.accion === "sugerir_traslado" || a.accion === "revisar_redistribucion")) {
    return `${base} · ${a.sugerencia.cantidad} ud${a.sugerencia.cantidad === 1 ? "" : "s"}`;
  }
  return base;
}
