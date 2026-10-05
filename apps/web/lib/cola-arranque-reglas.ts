// Reglas del «cierre de la cola de arranque» (ADR-0334): un líder da por hechas, en bloque y sin identificar la prenda, las ventas
// sin registrar de UNA tienda mientras dura la adopción. Lógica pura: la usan la lista de Ventas sin registrar y el modal que cierra.
//
// CONTRATO
//   PROMETE: dadas las filas de la cola y los plazos por tienda, decir qué tiendas se pueden cerrar hoy, cuántas prendas y cuántos soles
//            hay en cada una, y desde qué momento exacto se cierran (el `corte` que se manda a la base).
//   ASUME:   que `vendidoEn` es el texto de fecha que devuelve la base TAL CUAL (con microsegundos): el corte lo reenvía sin pasar por
//            `Date`, que corta a milisegundos y dejaría fuera la última venta (`vendido_en <= corte` la vería 0,4 ms más nueva).
//   NO HACE: no decide nada de negocio nuevo. El plazo, el motivo y el permiso los hace cumplir `cerrar_cola_arranque`; esto solo
//            evita ofrecer un botón que la base va a rechazar.
import { hoyLima } from "./fechas-lima";

export type MotivoCierre = "no_se_sabe" | "aun_no_cargada" | "ultima_unidad";

/** Las razones de la lista cerrada de la base (`cierres_cola_arranque.motivo`), en palabras del negocio. */
export const MOTIVOS_CIERRE: readonly { clave: MotivoCierre; titulo: string; ayuda: string }[] = [
  { clave: "no_se_sabe", titulo: "Nadie recuerda cuál era", ayuda: "No tenía etiqueta y ya no se puede saber qué prenda fue." },
  { clave: "aun_no_cargada", titulo: "La prenda aún no está cargada", ayuda: "Todavía no entra al sistema; la carga o el conteo la deja cuadrada." },
  { clave: "ultima_unidad", titulo: "Se vendió la última unidad de un modelo", ayuda: "Nadie la cargó y ya no queda ninguna para contar." },
];

export function motivoLegible(clave: string | null | undefined): string {
  return MOTIVOS_CIERRE.find((m) => m.clave === clave)?.titulo ?? "Sin motivo";
}

export type MotivoReapertura = "devolucion_o_cambio" | "ya_se_sabe" | "cierre_por_error";

/** Por qué un líder reabre una venta cerrada (`reabrir_prenda_cerrada`, 20261005110000): la lista cerrada de la base, en palabras del negocio. */
export const MOTIVOS_REAPERTURA: readonly { clave: MotivoReapertura; titulo: string; ayuda: string }[] = [
  { clave: "devolucion_o_cambio", titulo: "Una cliente la quiere devolver o cambiar", ayuda: "Reabierta, se regulariza con su prenda real y recién entonces se puede devolver." },
  { clave: "ya_se_sabe", titulo: "Ya se sabe qué prenda era", ayuda: "Se identifica ahora y el stock de esa prenda queda cuadrado." },
  { clave: "cierre_por_error", titulo: "Se cerró por error", ayuda: "Vuelve a pendientes, como si no se hubiera cerrado." },
];

/** Lo mínimo de una fila de la cola para armar el cierre. */
export type FilaDeCola = { estado: string; ubicacionId: string; sede: string; precioCobrado: number; vendidoEn: string };

export type SedeParaCerrar = {
  ubicacionId: string;
  sede: string;
  pendientes: number;
  soles: number;
  /** La venta pendiente más vieja y la más nueva (texto de la base, sin tocar): el rango que verá quien cierra. */
  desde: string;
  /** El momento que se manda como `p_hasta`: la venta pendiente más nueva QUE VIO el líder. Lo que entre después no se cierra. */
  corte: string;
  /** Último día del plazo (AAAA-MM-DD, Lima), o null si la tienda no tiene plazo: sin plazo no hay botón. */
  plazoHasta: string | null;
  /** Días que quedan contando hoy: 0 = hoy es el último día. null si no hay plazo o ya venció. */
  diasDePlazo: number | null;
  puedeCerrar: boolean;
};

/** El plazo vale hasta el final de su último día (la base lo compara con `fn_hoy_lima()`: inclusivo). */
export function plazoVigente(plazoHasta: string | null, hoy: string): boolean {
  return plazoHasta !== null && hoy <= plazoHasta;
}

const MS_DIA = 86_400_000;
function dias(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d) / MS_DIA;
}

export function diasDePlazo(plazoHasta: string | null, hoy: string): number | null {
  return plazoHasta !== null && plazoVigente(plazoHasta, hoy) ? dias(plazoHasta) - dias(hoy) : null;
}

/**
 * Las tiendas que tienen ventas sin registrar pendientes, con lo que se cerraría en cada una. Solo cuentan las PENDIENTES: lo ya
 * regularizado, cerrado o anulado no se cierra otra vez. Una tienda sin plazo (o con el plazo vencido) aparece igual —para que la
 * pantalla pueda decir por qué no se puede— pero con `puedeCerrar: false`.
 */
export function sedesParaCerrar(filas: readonly FilaDeCola[], plazos: Readonly<Record<string, string>>, ahora: Date = new Date()): SedeParaCerrar[] {
  const hoy = hoyLima(ahora);
  const porSede = new Map<string, SedeParaCerrar & { _ms: number; _msDesde: number }>();
  for (const f of filas) {
    if (f.estado !== "pendiente") continue;
    const ms = new Date(f.vendidoEn).getTime();
    const actual = porSede.get(f.ubicacionId);
    if (!actual) {
      const plazoHasta = plazos[f.ubicacionId] ?? null;
      porSede.set(f.ubicacionId, {
        ubicacionId: f.ubicacionId,
        sede: f.sede,
        pendientes: 1,
        soles: f.precioCobrado,
        desde: f.vendidoEn,
        corte: f.vendidoEn,
        plazoHasta,
        diasDePlazo: diasDePlazo(plazoHasta, hoy),
        puedeCerrar: plazoVigente(plazoHasta, hoy),
        _ms: ms,
        _msDesde: ms,
      });
      continue;
    }
    actual.pendientes += 1;
    actual.soles += f.precioCobrado;
    if (ms > actual._ms) {
      actual._ms = ms;
      actual.corte = f.vendidoEn;
    }
    if (ms < actual._msDesde) {
      actual._msDesde = ms;
      actual.desde = f.vendidoEn;
    }
  }
  return [...porSede.values()]
    .map((s) => ({
      ubicacionId: s.ubicacionId,
      sede: s.sede,
      pendientes: s.pendientes,
      soles: Math.round(s.soles * 100) / 100,
      desde: s.desde,
      corte: s.corte,
      plazoHasta: s.plazoHasta,
      diasDePlazo: s.diasDePlazo,
      puedeCerrar: s.puedeCerrar,
    }))
    .sort((a, b) => a.sede.localeCompare(b.sede, "es"));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// «Identificar con sugerencias» (20261005120000): la base propone parejas (venta sin registrar → prenda) y un líder confirma.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lo que devuelve `fn_cola_arranque_candidatas`: la pareja y cuántas unidades hay de esa prenda en la tienda. */
export type ParejaSugerida = { prenda_id: string; variante_id: string; en_stock: number };

/** Lo mínimo de una venta pendiente para mostrarla junto a su sugerencia. */
export type VentaPendiente = { id: string; descripcion: string; categoria: string; talla: string; color: string; precioCobrado: number; vendidoEn: string; vendidoPor: string };

/** Lo mínimo de una prenda del catálogo (la misma que reconoce el modal «Regularizar»). */
export type PrendaDelCatalogo = { id: string; nombre: string; codigo: string; categoria: string; talla: string; color: string; precio: number };

export type Sugerencia = {
  prendaId: string;
  varianteId: string;
  venta: VentaPendiente;
  prenda: PrendaDelCatalogo;
  enStock: number;
  /** Cobrado − precio oficial, a céntimos: negativa = se cobró menos (descuento no planificado). */
  diferencia: number;
};

/**
 * Las filas de la hoja de revisión: cada pareja de la base unida con lo que anotó caja y con la prenda sugerida, de la venta más
 * antigua a la más nueva. Una pareja cuya venta ya no está pendiente (la regularizaron mientras tanto) o cuya prenda no está en el
 * catálogo que carga la pantalla NO se muestra: confirmar a ciegas una pareja que no se puede leer no sería confirmar.
 */
export function armarSugerencias(parejas: readonly ParejaSugerida[], ventas: readonly VentaPendiente[], prendas: readonly PrendaDelCatalogo[]): Sugerencia[] {
  const venta = new Map(ventas.map((v) => [v.id, v]));
  const prenda = new Map(prendas.map((p) => [p.id, p]));
  const filas: Sugerencia[] = [];
  for (const p of parejas) {
    const v = venta.get(p.prenda_id);
    const c = prenda.get(p.variante_id);
    if (!v || !c) continue;
    filas.push({ prendaId: p.prenda_id, varianteId: p.variante_id, venta: v, prenda: c, enStock: p.en_stock, diferencia: Math.round((v.precioCobrado - c.precio) * 100) / 100 });
  }
  return filas.sort((a, b) => a.venta.vendidoEn.localeCompare(b.venta.vendidoEn) || a.prendaId.localeCompare(b.prendaId));
}

/** El cuerpo que recibe `regularizar_prendas_sugeridas`: solo las parejas marcadas, en el orden en que se ven. */
export function paresParaConfirmar(sugerencias: readonly Sugerencia[], marcadas: ReadonlySet<string>): { prenda_id: string; variante_id: string }[] {
  return sugerencias.filter((s) => marcadas.has(s.prendaId)).map((s) => ({ prenda_id: s.prendaId, variante_id: s.varianteId }));
}
