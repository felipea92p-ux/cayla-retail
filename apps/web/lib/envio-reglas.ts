import { resolverCodigoV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";
import type { CompraResumen, LineaCompra } from "./compras-reglas";
import type { RecepcionDeCompra } from "./compras-indicadores";
import { diasDeAtraso, estadoLinea, faltanteDeLinea } from "./recepciones-reglas";

// Reglas puras del ENVÍO (ADR-0113): una llegada a la puerta que puede traer comprobantes de VARIOS
// proveedores, prendas fuera de comprobante con su origen y traslados de otra sede. Sin I/O: se
// prueban sin base ni navegador. Lo que dice la pantalla y lo que manda a `recibir_envio` sale de acá,
// para que el conteo que ve quien recibe sea exactamente el que se registra.

/** Por línea de comprobante: cuántas unidades de cada variante llegan. AUSENTE = «sin contar»; un 0 escrito es «se contó y no llegó nada». */
export type Reparto = Record<string /* lineaId */, Record<string /* varianteId */, number>>;

/**
 * Una prenda que llegó en el envío pero ningún comprobante la lista (ADR-0076), con su ORIGEN:
 * el proveedor que la mandó y si es un regalo (entra al stock sin costo y sin tocar el costo promedio).
 * Lo que viene de otra sede de CAYLA no va acá: se confirma como traslado (`ConteoTraslado`).
 */
export type ExtraEnvio = { productoId: string; varianteId: string; cantidad: number; costoUnitario: string; proveedorId: string; esRegalo: boolean };

/** Lo contado de un traslado en tránsito (envío interno): unidades que llegaron de cada variante enviada. AUSENTE = sin contar. */
export type ConteoTraslado = Record<string /* varianteId */, number>;

export type LineaEnTraslado = { varianteId: string; cantidadEnviada: number };

/** Una línea de un traslado en tránsito hacia esta sede: lo que el origen dice que mandó. */
export type LineaTrasladoEnCamino = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null; cantidadEnviada: number };

/** Un traslado que viene en camino hacia la sede (envío interno): se cuenta y confirma dentro del envío, no crea stock de la nada. */
export type TrasladoEnCamino = { id: string; numero: number; origenNombre: string; fechaEstimadaLlegada: string | null; nota: string | null; lineas: LineaTrasladoEnCamino[] };

// ---------------------------------------------------------------------------
// Quien cuenta no siempre ve dinero
// ---------------------------------------------------------------------------

/**
 * Cuenta CUALQUIER colaborador de la sede, pero los montos de la compra son del líder (D-27). La pantalla se
 * arma en el servidor, así que a un colaborador ni siquiera le llegan al navegador: el mismo comprobante, con
 * los montos en cero. Nada de lo que hace el colaborador (contar, escanear, recibir) usa dinero.
 */
export function comprobanteSinMontos(c: CompraResumen): CompraResumen {
  return { ...c, subtotal: 0, igv: 0, total: 0, pagado: 0, saldo: 0, notasCredito: 0 };
}

export function lineaSinCosto(l: LineaCompra): LineaCompra {
  return { ...l, costoUnitario: 0, subtotal: 0 };
}

/**
 * Los indicadores de Recibir para quien cuenta sin ser líder, calculados de SU PROPIA lista de comprobantes.
 * `resumen_compras` y `resumen_compras_extra` devuelven a un integrante los montos de su sede (solo tienen el candado
 * de sede, ADR-0075: lo encontraron las pruebas SQL de la sesión de Compras), así que para un colaborador ni se
 * piden: aquí solo hay cantidades y fechas, nada de dinero. La lista ya viene acotada a su sede por RLS. Si tuviera
 * más de una página (50 comprobantes pendientes en una sola sede) los números cuentan solo esa página.
 */
export type KpisDeLaLista = {
  porRecibir: number;
  unidadesPendientes: number;
  atrasadas: number;
  diasMasAtrasada: number | null;
  proveedorMasAtrasado: string | null;
  documentoMasAtrasada: string | null;
};

export function kpisDeLaLista(compras: CompraResumen[], ahora: Date = new Date()): KpisDeLaLista {
  let unidadesPendientes = 0;
  let atrasadas = 0;
  let peor: CompraResumen | null = null;
  let peorDias = 0;
  for (const c of compras) {
    unidadesPendientes += Math.max(0, c.facturadoCantidad - c.recibidoCantidad - c.cerradoCantidad);
    if (!c.recepcionAtrasada) continue;
    atrasadas += 1;
    const dias = diasDeAtraso(c, ahora);
    if (dias > peorDias) {
      peorDias = dias;
      peor = c;
    }
  }
  return {
    porRecibir: compras.length,
    unidadesPendientes,
    atrasadas,
    diasMasAtrasada: peor ? peorDias : null,
    proveedorMasAtrasado: peor?.proveedorNombre ?? null,
    documentoMasAtrasada: peor?.documento ?? null,
  };
}

// ---------------------------------------------------------------------------
// Presentación de proveedores
// ---------------------------------------------------------------------------

const RAZON_SOCIAL = new Set(["sac", "sa", "srl", "eirl", "ltda", "cia", "de", "del", "la", "el", "y", "e", "&"]);

/** «Textiles Andina SAC» → «TA». Sin la razón social («SAC», «EIRL»…) ni conectores; con una sola palabra útil, su inicial. */
export function inicialesProveedor(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const utiles = palabras.filter((p) => !RAZON_SOCIAL.has(p.toLowerCase().replace(/[.,]/g, "")));
  const base = utiles.length >= 1 ? utiles : palabras;
  return (
    base
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join("")
      .toUpperCase() || "·"
  );
}

// ---------------------------------------------------------------------------
// Bloques: un comprobante = un bloque de líneas por contar
// ---------------------------------------------------------------------------

export type BloqueEnvio = { compra: CompraResumen; lineas: LineaCompra[] };

/** null = sin contar. Una línea con variante está contada si tiene ESA variante anotada (aunque sea 0); una agrupada, si tiene el objeto (`{}` = «nada llegó»). */
export function llegoLinea(l: LineaCompra, reparto: Reparto): number | null {
  const anotado = reparto[l.id];
  if (!anotado) return null;
  if (l.varianteId) return anotado[l.varianteId] ?? null;
  return Object.values(anotado).reduce((a, n) => a + n, 0);
}

/**
 * Los bloques del envío, en el orden en que llegan `compras` (por urgencia): cada comprobante marcado con
 * sus líneas que todavía tienen algo pendiente. Un comprobante puede ser de cualquier proveedor.
 */
export function bloquesDelEnvio(compras: CompraResumen[], seleccionadas: string[], lineas: LineaCompra[]): BloqueEnvio[] {
  const marcadas = new Set(seleccionadas);
  return compras
    .filter((c) => marcadas.has(c.id))
    .map((compra) => ({ compra, lineas: lineas.filter((l) => l.compraId === compra.id && l.pendiente > 0) }));
}

/** Los proveedores distintos del envío, en el orden de sus bloques. */
export function proveedoresDelEnvio(bloques: BloqueEnvio[]): { id: string; nombre: string }[] {
  const vistos = new Map<string, string>();
  for (const b of bloques) if (!vistos.has(b.compra.proveedorId)) vistos.set(b.compra.proveedorId, b.compra.proveedorNombre);
  return [...vistos.entries()].map(([id, nombre]) => ({ id, nombre }));
}

// ---------------------------------------------------------------------------
// Totales de la barra: Esperadas · Contadas · Sin contar · Faltantes · Fuera de comprobante
// ---------------------------------------------------------------------------

export type TotalesEnvio = {
  /** Lo pendiente de los comprobantes marcados. */
  esperadas: number;
  /** Lo que se contó en sus líneas (suma al stock al confirmar). */
  contadas: number;
  /** Pendiente de las líneas que nadie contó: no suman y siguen pendientes. */
  sinContar: number;
  /** Lo que faltó en líneas contadas cortas. */
  faltantes: number;
  /** Prendas fuera de comprobante, con proveedor: suman al stock, no cuentan contra ninguna deuda. */
  fueraDeComprobante: number;
  /** Unidades contadas de traslados internos (de otra sede). */
  deOtraSede: number;
  lineasTotal: number;
  lineasContadas: number;
  /** Líneas contadas por encima de lo pendiente: la RPC las rechazaría. */
  excedidas: number;
};

export function extraCompleto(e: ExtraEnvio): boolean {
  return !!e.varianteId && !!e.proveedorId && e.cantidad > 0;
}

export function totalesEnvio(
  bloques: BloqueEnvio[],
  reparto: Reparto,
  extras: ExtraEnvio[],
  traslados: { lineas: LineaEnTraslado[]; conteo: ConteoTraslado }[] = [],
): TotalesEnvio {
  let esperadas = 0;
  let contadas = 0;
  let sinContar = 0;
  let faltantes = 0;
  let lineasTotal = 0;
  let lineasContadas = 0;
  let excedidas = 0;
  for (const b of bloques) {
    for (const l of b.lineas) {
      const llego = llegoLinea(l, reparto);
      lineasTotal += 1;
      esperadas += l.pendiente;
      if (llego === null) {
        sinContar += l.pendiente;
        continue;
      }
      lineasContadas += 1;
      contadas += llego;
      faltantes += faltanteDeLinea(llego, l.pendiente);
      if (estadoLinea(llego, l.pendiente) === "excede") excedidas += 1;
    }
  }
  const fueraDeComprobante = extras.filter(extraCompleto).reduce((a, e) => a + e.cantidad, 0);
  const deOtraSede = traslados.reduce((a, t) => a + t.lineas.reduce((s, l) => s + (t.conteo[l.varianteId] ?? 0), 0), 0);
  return { esperadas, contadas, sinContar, faltantes, fueraDeComprobante, deOtraSede, lineasTotal, lineasContadas, excedidas };
}

// ---------------------------------------------------------------------------
// Escaneo: cada lectura suma 1 al comprobante que trae esa prenda
// ---------------------------------------------------------------------------

export type ResultadoEscaneo =
  | { tipo: "sumado"; lineaId: string; compraId: string; varianteId: string; documento: string; proveedorNombre: string; referencia: string; detalle: string }
  | { tipo: "completo"; referencia: string; detalle: string }
  | { tipo: "fuera"; varianteId: string; productoId: string; referencia: string; detalle: string }
  | { tipo: "desconocido" };

type VarianteEscaneable = PrendaBuscableV2 & { productoId: string };

const detalleDe = (v: { talla: string | null; color: string | null; sku: string }) => [v.talla, v.color].filter(Boolean).join(" / ") || v.sku;

/**
 * Qué hace una lectura de la pistola. La prenda se busca por SKU o código de barras; luego se suma a la
 * PRIMERA línea (en el orden de los bloques: lo más urgente primero) que la traiga y todavía tenga cupo.
 * Si todas sus líneas ya están completas, se avisa en vez de pasarse; si ningún comprobante del envío la
 * trae, es una prenda fuera de comprobante.
 */
export function resolverEscaneo(texto: string, variantes: VarianteEscaneable[], bloques: BloqueEnvio[], reparto: Reparto): ResultadoEscaneo {
  const v = resolverCodigoV2(texto, variantes);
  if (!v) return { tipo: "desconocido" };

  let hayLinea = false;
  for (const b of bloques) {
    for (const l of b.lineas) {
      const trae = l.varianteId === v.varianteId || (l.varianteId === null && l.productoId === v.productoId);
      if (!trae) continue;
      hayLinea = true;
      const cupo = l.pendiente - (llegoLinea(l, reparto) ?? 0);
      if (cupo > 0) {
        return {
          tipo: "sumado",
          lineaId: l.id,
          compraId: b.compra.id,
          varianteId: v.varianteId,
          documento: b.compra.documento,
          proveedorNombre: b.compra.proveedorNombre,
          referencia: v.referencia,
          detalle: detalleDe(v),
        };
      }
    }
  }
  if (hayLinea) return { tipo: "completo", referencia: v.referencia, detalle: detalleDe(v) };
  return { tipo: "fuera", varianteId: v.varianteId, productoId: v.productoId, referencia: v.referencia, detalle: detalleDe(v) };
}

/** Lo emite `KpisRecibir` (que no comparte estado con la pantalla) para marcar un comprobante; lo escucha `RecepcionEnvio`. `detail` = id del comprobante. */
export const EVENTO_MARCAR = "recibir:marcar";

/** Suma UNA unidad de `varianteId` a una línea. Una línea agrupada (sin variante) reparte lo que llega entre las variantes del producto. */
export function sumarUnidad(reparto: Reparto, linea: LineaCompra, varianteId: string): Reparto {
  const propias = { ...(reparto[linea.id] ?? {}) };
  propias[varianteId] = (propias[varianteId] ?? 0) + 1;
  return { ...reparto, [linea.id]: propias };
}

/** Resta UNA unidad (el «Deshacer» de la última lectura). Nunca baja de 0 y, si la línea queda en 0 sin haber estado contada antes, sigue contada en 0: lo desanotado por completo lo hace `vaciar`. */
export function restarUnidad(reparto: Reparto, linea: LineaCompra, varianteId: string): Reparto {
  const propias = { ...(reparto[linea.id] ?? {}) };
  const actual = propias[varianteId] ?? 0;
  if (actual <= 1) delete propias[varianteId];
  else propias[varianteId] = actual - 1;
  const copia = { ...reparto };
  if (Object.keys(propias).length === 0) delete copia[linea.id];
  else copia[linea.id] = propias;
  return copia;
}

// ---------------------------------------------------------------------------
// Ayudas de conteo (spike de Recibir, 2026-09-19): la guía, el escáner que no se queda en un callejón
// ---------------------------------------------------------------------------

/**
 * ¿La guía tiene el formato de una guía de remisión (`T001-000123`: una letra, tres dígitos, guion, el número)?
 * Es solo una AYUDA al teclear —el tilde del campo—: no bloquea recibir, porque la guía puede anotarse después
 * y cada transportista escribe la suya de una manera.
 */
export function guiaConFormato(guia: string): boolean {
  return /^[A-Z]\d{3}-\d{3,8}$/.test(guia.trim().toUpperCase());
}

/**
 * Los comprobantes pendientes que NO están marcados y que traen esta prenda (por variante, o por producto si la
 * línea vino agrupada). Sirve al escáner: si la pistola lee algo que ningún comprobante del envío trae pero otro
 * comprobante pendiente sí, lo primero que se ofrece es agregar ese comprobante al envío, no anotarlo como
 * «fuera de comprobante». En el orden en que llegan `compras` (por urgencia).
 */
export function comprobantesQueTraen(varianteId: string, productoId: string, compras: CompraResumen[], lineas: LineaCompra[], marcados: string[]): CompraResumen[] {
  const yaMarcados = new Set(marcados);
  return compras.filter(
    (c) => !yaMarcados.has(c.id) && lineas.some((l) => l.compraId === c.id && l.pendiente > 0 && (l.varianteId === varianteId || (l.varianteId === null && l.productoId === productoId))),
  );
}

/** Lo que entra por cada comprobante en este envío, para el resumen previo: solo las líneas ya contadas. */
export type FilaResumenComprobante = { compraId: string; proveedorNombre: string; documento: string; llegan: number; faltan: number; lineasCortas: string[] };

export function resumenPorComprobante(bloques: BloqueEnvio[], reparto: Reparto): FilaResumenComprobante[] {
  const filas: FilaResumenComprobante[] = [];
  for (const { compra, lineas } of bloques) {
    let llegan = 0;
    let faltan = 0;
    const lineasCortas: string[] = [];
    for (const l of lineas) {
      const llego = llegoLinea(l, reparto);
      if (llego === null) continue;
      llegan += llego;
      if (llego < l.pendiente) {
        faltan += l.pendiente - llego;
        lineasCortas.push(l.id);
      }
    }
    if (llegan > 0 || faltan > 0) filas.push({ compraId: compra.id, proveedorNombre: compra.proveedorNombre, documento: compra.documento, llegan, faltan, lineasCortas });
  }
  return filas;
}

/** Un movimiento que dejará el envío en el stock: la unidad de prensa de la pantalla de «Envío recibido». */
export type MovimientoDelEnvio = { cantidad: number; referencia: string; detalle: string; origen: string };

/**
 * Los movimientos de entrada que deja el envío, en el orden en que se ven en pantalla: primero lo que trae cada
 * comprobante, luego lo fuera de comprobante y por último lo de otra sede. `dePrenda` resuelve la variante para
 * las líneas agrupadas, las prendas fuera de comprobante y los traslados. Lo que quedó en 0 no es un movimiento.
 */
export function movimientosDelEnvio(p: {
  bloques: BloqueEnvio[];
  reparto: Reparto;
  extras: ExtraEnvio[];
  traslados: { numero: number; lineas: { varianteId: string; referencia: string; talla: string | null; color: string | null }[]; conteo: ConteoTraslado }[];
  dePrenda: (varianteId: string) => { referencia: string; detalle: string } | null;
}): MovimientoDelEnvio[] {
  const salida: MovimientoDelEnvio[] = [];
  for (const { compra, lineas } of p.bloques) {
    for (const l of lineas) {
      const anotado = p.reparto[l.id];
      if (!anotado) continue;
      for (const [varianteId, n] of Object.entries(anotado)) {
        if (n <= 0) continue;
        const v = l.varianteId === varianteId ? { referencia: l.referencia, detalle: detalleDe({ talla: l.talla, color: l.color, sku: l.sku ?? "" }) } : p.dePrenda(varianteId);
        salida.push({ cantidad: n, referencia: v?.referencia ?? l.referencia, detalle: v?.detalle ?? "", origen: compra.documento });
      }
    }
  }
  for (const e of p.extras.filter(extraCompleto)) {
    const v = p.dePrenda(e.varianteId);
    salida.push({ cantidad: e.cantidad, referencia: v?.referencia ?? "Prenda", detalle: [v?.detalle, e.esRegalo ? "regalo" : null].filter(Boolean).join(" · "), origen: "fuera de comprobante" });
  }
  for (const t of p.traslados) {
    for (const l of t.lineas) {
      const n = t.conteo[l.varianteId] ?? 0;
      if (n > 0) salida.push({ cantidad: n, referencia: l.referencia, detalle: detalleDe({ talla: l.talla, color: l.color, sku: "" }), origen: `traslado ${t.numero}` });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
// El pedido a `recibir_envio`
// ---------------------------------------------------------------------------

export type CierreElegido = { lineaId: string; faltan: number; motivo: string };
export type TrasladoAConfirmar = { transferenciaId: string; lineas: LineaEnTraslado[]; conteo: ConteoTraslado };

export type PedidoEnvio = {
  p_ubicacion_id: string;
  p_items: { compra_item_id: string; variante_id: string; cantidad: number }[];
  p_extras: { proveedor_id: string; variante_id: string; cantidad: number; es_regalo: boolean; costo_unitario?: number }[];
  p_traslados: { transferencia_id: string; lineas: { variante_id: string; cantidad: number }[] }[];
  p_cierres: { compra_item_id: string; cantidad: number; motivo: string }[];
  /** Siempre vacío desde 2026-09-19: la nota de crédito se registra en `/compras/notas-credito`, no acá.
   *  Viaja igual porque `recibir_envio` sigue aceptando el parámetro (la base no se tocó). */
  p_notas_credito: never[];
  p_numero_guia?: string;
  p_nota?: string;
  p_token: string;
};

/**
 * Arma el pedido exactamente como lo espera la RPC. Solo viaja lo contado (`> 0`): una línea sin contar
 * o en 0 no suma al stock. Un regalo nunca lleva costo; el costo de una prenda comprada fuera de
 * comprobante es opcional. De un traslado viajan TODAS sus líneas enviadas (contadas o no, aunque sea 0):
 * la base exige que ninguna quede sin decir qué pasó.
 *
 * Notas de crédito: ya NO viajan (2026-09-19). Recepción cuenta y decide; el documento del proveedor se
 * reclama y se registra en `/compras/notas-credito`. `p_notas_credito` sigue en el pedido, siempre vacío,
 * porque `recibir_envio` lo sigue aceptando y la base no se tocó.
 */
export function armarPedidoEnvio(p: {
  ubicacionId: string;
  bloques: BloqueEnvio[];
  reparto: Reparto;
  extras: ExtraEnvio[];
  traslados: TrasladoAConfirmar[];
  cierres: CierreElegido[];
  numeroGuia: string;
  nota: string;
  token: string;
}): PedidoEnvio {
  const p_items = p.bloques.flatMap((b) =>
    b.lineas.flatMap((l) =>
      Object.entries(p.reparto[l.id] ?? {})
        .filter(([, n]) => n > 0)
        .map(([varianteId, n]) => ({ compra_item_id: l.id, variante_id: varianteId, cantidad: n })),
    ),
  );
  const p_extras = p.extras.filter(extraCompleto).map((e) => ({
    proveedor_id: e.proveedorId,
    variante_id: e.varianteId,
    cantidad: e.cantidad,
    es_regalo: e.esRegalo,
    ...(!e.esRegalo && e.costoUnitario ? { costo_unitario: Number(e.costoUnitario) } : {}),
  }));
  const p_traslados = p.traslados.map((t) => ({
    transferencia_id: t.transferenciaId,
    lineas: t.lineas.map((l) => ({ variante_id: l.varianteId, cantidad: t.conteo[l.varianteId] ?? 0 })),
  }));
  return {
    p_ubicacion_id: p.ubicacionId,
    p_items,
    p_extras,
    p_traslados,
    p_cierres: p.cierres.map((c) => ({ compra_item_id: c.lineaId, cantidad: c.faltan, motivo: c.motivo })),
    p_notas_credito: [],
    ...(p.numeroGuia.trim() ? { p_numero_guia: p.numeroGuia.trim() } : {}),
    ...(p.nota.trim() ? { p_nota: p.nota.trim() } : {}),
    p_token: p.token,
  };
}

/**
 * Lo que ya está contado en envíos guardados SIN CONEXIÓN que todavía no subieron (ADR-0209): las líneas de
 * comprobante (recibidas o cerradas) y los traslados. La pantalla los saca de «pendientes» mientras esperan, igual
 * que Vender descuenta del stock lo vendido sin red — si no, alguien volvería a contar el mismo comprobante y, al
 * volver el internet, subirían dos recepciones de la misma mercadería. Un envío RECHAZADO no entra: la base no lo
 * registró y ese comprobante sigue por recibir.
 */
export function pendienteEnCola(pedidos: Pick<PedidoEnvio, "p_items" | "p_cierres" | "p_traslados">[]): { lineas: Set<string>; traslados: Set<string> } {
  const lineas = new Set<string>();
  const traslados = new Set<string>();
  for (const p of pedidos) {
    for (const i of p.p_items ?? []) lineas.add(i.compra_item_id);
    for (const c of p.p_cierres ?? []) lineas.add(c.compra_item_id);
    for (const t of p.p_traslados ?? []) traslados.add(t.transferencia_id);
  }
  return { lineas, traslados };
}

/** ¿Todas las líneas enviadas de un traslado tienen su conteo? La base lo exige (aunque sea 0). */
export function trasladoContadoEntero(lineas: LineaEnTraslado[], conteo: ConteoTraslado): boolean {
  return lineas.length > 0 && lineas.every((l) => conteo[l.varianteId] !== undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// «Recibidas» agrupadas por ENVÍO (ADR-0113: lo que quedó pendiente)
//
// `listar_recepciones_compras` devuelve una fila por (lote, comprobante): un envío de tres proveedores con una sola
// guía salía como tres filas sueltas y quien las lee tenía que adivinar que eran la misma llegada. El agrupado no
// necesita otra migración: cada lote sabe a qué envío pertenece (`lotes.envio_id`) y eso se pide aparte.
// ---------------------------------------------------------------------------------------------------------------

/** A qué envío pertenece un lote y cuántos lotes y proveedores trajo ese envío EN TOTAL (no solo los que caben en la página). */
export type EnvioDeLote = { envioId: string; numeroGuia: string | null; lotes: number; proveedores: number };

export type GrupoRecepcion =
  | {
      tipo: "envio";
      envioId: string;
      numeroGuia: string | null;
      fechaRecepcion: string;
      ubicacionNombre: string;
      /** Proveedores que trajo el envío, contados en la base (no solo los que salen en la página). */
      proveedores: number;
      filas: RecepcionDeCompra[];
      unidadesLlegaron: number;
      unidadesFacturadas: number;
      faltante: number;
      /**
       * La página no muestra TODO el envío (el límite de filas lo cortó): los totales de arriba serían de una parte y
       * dirían menos de lo que llegó, así que la pantalla no los pinta.
       */
      parcial: boolean;
    }
  | { tipo: "suelta"; fila: RecepcionDeCompra };

/**
 * Agrupa las recepciones de un mismo envío bajo una cabecera. Solo forman grupo los envíos de DOS o más proveedores:
 * uno con un solo proveedor ya es una fila normal (la guía ya sale en ella) y una cabecera con un solo hijo es ruido.
 * Las recepciones anteriores al envío (sin `envio_id`) quedan sueltas, como siempre. El orden es el de la lista: cada
 * grupo ocupa el lugar de su primera fila.
 *
 * `llegoAlLimite`: la lista se pidió con un tope de filas y se llenó. Entonces lo último de la página puede ser la mitad
 * de un lote, así que el grupo que contiene la última fila también se marca parcial.
 */
export function agruparPorEnvio(recepciones: readonly RecepcionDeCompra[], envios: Record<string, EnvioDeLote>, opciones: { llegoAlLimite?: boolean } = {}): GrupoRecepcion[] {
  const grupos: GrupoRecepcion[] = [];
  const posicion = new Map<string, number>();
  const ultima = recepciones[recepciones.length - 1];
  const envioDeLaUltima = ultima ? envios[ultima.loteId] : undefined;

  for (const r of recepciones) {
    const e = envios[r.loteId];
    if (!e || e.proveedores < 2) {
      grupos.push({ tipo: "suelta", fila: r });
      continue;
    }
    const donde = posicion.get(e.envioId);
    if (donde === undefined) {
      posicion.set(e.envioId, grupos.length);
      grupos.push({
        tipo: "envio",
        envioId: e.envioId,
        numeroGuia: e.numeroGuia,
        fechaRecepcion: r.fechaRecepcion,
        ubicacionNombre: r.ubicacionNombre,
        proveedores: e.proveedores,
        filas: [r],
        unidadesLlegaron: r.unidadesLlegaron,
        unidadesFacturadas: r.unidadesFacturadas,
        faltante: Math.max(0, r.faltante),
        parcial: false,
      });
    } else {
      const g = grupos[donde];
      if (g.tipo !== "envio") continue;
      g.filas.push(r);
      g.unidadesLlegaron += r.unidadesLlegaron;
      g.unidadesFacturadas += r.unidadesFacturadas;
      g.faltante += Math.max(0, r.faltante);
    }
  }

  for (const g of grupos) {
    if (g.tipo !== "envio") continue;
    const lotesEnPagina = new Set(g.filas.map((f) => f.loteId)).size;
    const lotesDelEnvio = envios[g.filas[0].loteId]?.lotes ?? lotesEnPagina;
    const esLaUltima = !!opciones.llegoAlLimite && envioDeLaUltima?.envioId === g.envioId;
    g.parcial = lotesEnPagina < lotesDelEnvio || esLaUltima;
  }
  return grupos;
}
