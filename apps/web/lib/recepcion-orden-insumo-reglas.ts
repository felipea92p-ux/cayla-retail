// Recibir en el Taller contra la orden de insumos (ADR-0362, fase 7 parte 2 · actividad 3): la lógica pura de la hoja de Producción ▸
// Recibir. Sin React ni red: se importa desde el cliente y se prueba sola (`recepcion-orden-insumo-reglas.test.ts`).
//
//   PROMETE: leer lo que `fn_ordenes_insumo_por_recibir` dice que queda de cada orden (lo pedido, lo facturado en papeles vigentes, lo
//   recibido, lo que queda y el costo sugerido); decir qué le falta a la recepción con las MISMAS reglas que `recibir_orden_insumo` (de aquí
//   sale la guía de foco); armar lo que viaja a la base y leer lo que vuelve.
//   NO HACE: no habla con la base ni decide permisos (el módulo de Producción, el taller y «quien hizo la orden no la recibe» los decide la
//   función; aquí solo se avisa antes).
//
// Como la recepción del papel (`recibir-produccion-reglas.ts`): «Llegó» en blanco es todo lo que queda (lo más común) y «0» es que de ese
// insumo no llegó nada esta vez. A diferencia de ella, quien recibe una ORDEN ve y corrige el costo de lo que recibe (decisión 53): viene
// puesto el sugerido (el del papel si la línea tiene uno solo; si no, el neto de la orden) y es el costo con que el lote entra al Taller.
// Lo que NO va a llegar (actividad 4, «anotada en la orden»): «El resto no va a llegar», con su motivo, cierra todo lo que quede después de
// lo que llega ahora; queda en la orden como lo que el proveedor nos debe, a ese mismo costo.

import type { CampoDeGuia } from "./guia-campos";
import { aTexto } from "./orden-compra-alta";
import {
  TOPES_INSUMO,
  cantidadConUnidad,
  dudaDeCantidadInsumo,
  dudaDePrecioInsumo,
  leerCantidadInsumo,
  leerPrecioInsumo,
  nombreUnidad,
} from "./ordenes-insumo-reglas";
import { costoParaCaja } from "./comprobante-orden-insumo-reglas";
import { MOTIVOS_CIERRE, type MotivoCierre } from "./recibir-produccion-reglas";

/** Por qué no va a llegar el resto: los mismos motivos que la recepción del papel. */
export { MOTIVOS_CIERRE as MOTIVOS_NO_LLEGA };

export const RPC_ORDENES_INSUMO_POR_RECIBIR = "fn_ordenes_insumo_por_recibir";
export const RPC_RECIBIR_ORDEN_INSUMO = "recibir_orden_insumo";

/** Lo que la base acepta: hasta 200 líneas y una nota de 500 letras. El código de lote, corto (lo que se escribe en la etiqueta). */
export const TOPES_RECEPCION_OI = { lineas: 200, nota: 500, codigoLote: 40 } as const;

/** Una línea que se puede recibir: pedida en la orden (`orden`) o traída fuera de la orden por uno de sus papeles vigentes (`papel`). */
export type LineaOIPorRecibir = {
  tipo: "orden" | "papel";
  /** `orden_insumo_items.id` o, si es del papel, `comprobantes_produccion_items.id`. */
  itemId: string;
  posicion: number | null;
  insumoId: string;
  insumo: string;
  codigo: string | null;
  unidad: string;
  /** El papel que la trajo, si es de fuera de la orden («F001-901»). */
  documento: string | null;
  /** Lo pedido; null en una línea de fuera de la orden. Todo en la unidad de la línea. */
  pedido: number | null;
  facturado: number;
  recibido: number;
  queda: number;
  /** El costo sugerido por unidad, sin IGV. */
  costo: number;
};

export type OrdenInsumoPorRecibir = {
  id: string;
  numero: number;
  /** «OI-000012». */
  documento: string;
  proveedor: string;
  creadaEn: string | null;
  /** `personas.id` de quien hizo la orden: ella no la recibe (decisión 17). */
  creadaPorId: string | null;
  creadaPor: string | null;
  fechaEntregaEstimada: string | null;
  /** Solo las que tienen algo por recibir, en el orden de la base: las pedidas primero, después lo de fuera de la orden. */
  lineas: LineaOIPorRecibir[];
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const cifra = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function leerLinea(data: unknown): LineaOIPorRecibir | null {
  if (!data || typeof data !== "object") return null;
  const l = data as Record<string, unknown>;
  const tipo = l.tipo === "orden" || l.tipo === "papel" ? l.tipo : null;
  const itemId = texto(l.item_id);
  const insumoId = texto(l.insumo_id);
  const insumo = texto(l.insumo);
  const unidad = texto(l.unidad);
  const facturado = cifra(l.facturado);
  const recibido = cifra(l.recibido);
  const queda = cifra(l.queda);
  const costo = cifra(l.costo);
  if (!tipo || !itemId || !insumoId || !insumo || !unidad || facturado == null || recibido == null || queda == null || costo == null) return null;
  return {
    tipo,
    itemId,
    posicion: cifra(l.posicion),
    insumoId,
    insumo,
    codigo: texto(l.codigo),
    unidad,
    documento: texto(l.documento),
    pedido: cifra(l.pedido),
    facturado,
    recibido,
    queda,
    costo,
  };
}

/** Lee `fn_ordenes_insumo_por_recibir`. Una orden o una línea rara se descarta; una línea sin nada que recibir no se muestra. */
export function leerOrdenesPorRecibir(data: unknown): OrdenInsumoPorRecibir[] {
  return (Array.isArray(data) ? data : []).flatMap((o): OrdenInsumoPorRecibir[] => {
    if (!o || typeof o !== "object") return [];
    const r = o as Record<string, unknown>;
    const id = texto(r.id);
    const numero = cifra(r.numero);
    const documento = texto(r.documento);
    const proveedor = texto(r.proveedor);
    if (!id || numero == null || !documento || !proveedor) return [];
    const lineas = (Array.isArray(r.lineas) ? r.lineas : []).map(leerLinea).filter((l): l is LineaOIPorRecibir => l !== null && l.queda > 0);
    if (lineas.length === 0) return [];
    return [
      {
        id,
        numero,
        documento,
        proveedor,
        creadaEn: texto(r.creada_en),
        creadaPorId: texto(r.creada_por_id),
        creadaPor: texto(r.creada_por),
        fechaEntregaEstimada: texto(r.fecha_entrega_estimada),
        lineas,
      },
    ];
  });
}

/** ¿La hizo quien mira? Ella no la recibe (decisión 17): la hoja no se ofrece y lo dice. Sin persona (una terminal), decide el combo. */
export const esMiOrden = (o: Pick<OrdenInsumoPorRecibir, "creadaPorId">, personaId: string | null | undefined): boolean =>
  !!personaId && o.creadaPorId === personaId;

/** ¿Ya llegó algo de esta orden? (para el chip «Llegó en parte»). */
export const llegoAlgo = (o: Pick<OrdenInsumoPorRecibir, "lineas">): boolean => o.lineas.some((l) => l.recibido > 0);

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que se escribe en la hoja
// ---------------------------------------------------------------------------------------------------------------------------------

/** Por cada línea: cuánto llegó (vacío = todo lo que queda), el costo por unidad, un código de lote opcional y si el resto no va a
 *  llegar (con su motivo). */
export type EntradaRecepcionOI = { itemId: string; llego: string; costo: string; codigoLote: string; noLlegara: boolean; motivo: MotivoCierre };

export function entradaInicialOI(l: Pick<LineaOIPorRecibir, "itemId" | "costo">): EntradaRecepcionOI {
  return { itemId: l.itemId, llego: "", costo: costoParaCaja(Math.round(l.costo * 10_000)), codigoLote: "", noLlegara: false, motivo: "faltante" };
}

const milesimas = (n: number) => Math.round(n * 1000);

/** Cuánto llega de una línea, en milésimas de su unidad: lo escrito, o todo lo que queda si se dejó en blanco. null si no se entiende. */
export function milesimasQueLlegan(l: Pick<LineaOIPorRecibir, "queda">, e: Pick<EntradaRecepcionOI, "llego">): number | null {
  if (e.llego.trim() === "") return milesimas(l.queda);
  const c = leerCantidadInsumo(e.llego);
  return c.tipo === "ok" ? c.escalado : null;
}

/** Lo que queda de una línea después de lo que llega ahora, en milésimas (nunca menos de cero); null si «Llegó» no se entiende. */
export function milesimasQueQuedan(l: Pick<LineaOIPorRecibir, "queda">, e: Pick<EntradaRecepcionOI, "llego">): number | null {
  const m = milesimasQueLlegan(l, e);
  return m == null ? null : Math.max(0, milesimas(l.queda) - m);
}

/** ¿Esta línea cierra lo que queda? Solo si se marcó «no va a llegar» y, después de lo que llega ahora, todavía queda algo. */
export function cierraLinea(l: Pick<LineaOIPorRecibir, "queda">, e: Pick<EntradaRecepcionOI, "llego" | "noLlegara">): boolean {
  const resto = milesimasQueQuedan(l, e);
  return e.noLlegara && resto != null && resto > 0;
}

/** El primer problema de una línea, en una frase para quien recibe; null si está lista (llegue algo o no). */
export function problemaDeLineaRecepcion(l: LineaOIPorRecibir, e: EntradaRecepcionOI): string | null {
  const plural = nombreUnidad(l.unidad);
  if (e.llego.trim() !== "") {
    const c = leerCantidadInsumo(e.llego);
    if (c.tipo === "mal" && c.motivo === "ambiguo") return dudaDeCantidadInsumo(e.llego, l.unidad);
    if (c.tipo !== "ok" || c.escalado > TOPES_INSUMO.cantidadMilesimas) return `Lo que llegó va en ${plural}, con hasta tres decimales.`;
    if (c.escalado > milesimas(l.queda)) return `De ${l.insumo} solo quedan ${cantidadConUnidad(l.queda, l.unidad)} por recibir.`;
    // De este insumo no llegó nada esta vez: está bien, salvo que el resto no vaya a llegar (entonces se anota a su costo).
    if (c.escalado === 0 && !cierraLinea(l, e)) return null;
  }
  const costo = leerPrecioInsumo(e.costo);
  if (costo.tipo === "vacio") return `Escribe el costo por ${nombreUnidad(l.unidad, 1)} (0 si no tuvo costo).`;
  if (costo.tipo === "mal" && costo.motivo === "ambiguo") return dudaDePrecioInsumo(e.costo);
  if (costo.tipo === "mal" || costo.escalado > TOPES_INSUMO.precioDiezmilesimas) return "El costo va de S/ 0 a S/ 99 999.9999, con hasta cuatro decimales.";
  if (e.codigoLote.trim().length > TOPES_RECEPCION_OI.codigoLote) return `El código de lote va hasta ${TOPES_RECEPCION_OI.codigoLote} letras.`;
  return null;
}

/** Cuántas líneas se cierran porque el resto no va a llegar. */
export function cierresQueSeAnotan(o: Pick<OrdenInsumoPorRecibir, "lineas">, entradas: readonly EntradaRecepcionOI[]): number {
  return o.lineas.filter((l) => {
    const e = entradas.find((x) => x.itemId === l.itemId);
    return e ? cierraLinea(l, e) : false;
  }).length;
}

/** Cuántos lotes se van a abrir: uno por línea de la que llega algo. */
export function lotesQueSeAbren(o: Pick<OrdenInsumoPorRecibir, "lineas">, entradas: readonly EntradaRecepcionOI[]): number {
  return o.lineas.filter((l) => {
    const e = entradas.find((x) => x.itemId === l.itemId);
    const m = e ? milesimasQueLlegan(l, e) : milesimas(l.queda);
    return m != null && m > 0;
  }).length;
}

/** Los campos de la guía de foco, en el orden de la hoja. La guía no inventa reglas: son las de `recibir_orden_insumo`. */
export function camposDeRecepcionOI(
  o: OrdenInsumoPorRecibir,
  entradas: readonly EntradaRecepcionOI[],
  nota: string,
  responsable: { listo: boolean; motivo: string | null },
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = o.lineas.map((l) => {
    const e = entradas.find((x) => x.itemId === l.itemId) ?? entradaInicialOI(l);
    const problema = problemaDeLineaRecepcion(l, e);
    return { id: `linea-${l.itemId}`, nombre: l.insumo, requerido: true, hecho: problema === null, pendiente: problema ?? "" };
  });
  if (campos.every((c) => c.hecho) && lotesQueSeAbren(o, entradas) === 0 && cierresQueSeAnotan(o, entradas) === 0) {
    campos.push({
      id: "llega",
      nombre: "Lo que llegó",
      requerido: true,
      hecho: false,
      pendiente: "Escribe cuánto llegó de al menos un insumo, o marca lo que no va a llegar.",
    });
  }
  const notaLarga = nota.trim().length > TOPES_RECEPCION_OI.nota;
  campos.push({
    id: "nota",
    nombre: "Nota",
    requerido: notaLarga,
    hecho: nota.trim().length > 0 && !notaLarga,
    pendiente: notaLarga ? `La nota va hasta ${TOPES_RECEPCION_OI.nota} letras.` : "",
  });
  campos.push({ id: "responsable", nombre: "Quién recibe", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién recibe." });
  return campos;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que viaja a la base (números como TEXTO canónico) y lo que vuelve
// ---------------------------------------------------------------------------------------------------------------------------------

type NumerosDeRecepcion = { cantidad: string; costo_unitario: string; codigo_lote?: string; cierre?: { motivo: MotivoCierre } };
export type LineaRecepcionParaBase = ({ orden_insumo_item_id: string } | { comprobante_item_id: string }) & NumerosDeRecepcion;

export type ArgsRecibirOrdenInsumo = {
  p_orden_id: string;
  p_ubicacion_id: string;
  p_lineas: LineaRecepcionParaBase[];
  p_nota?: string;
  p_token: string;
};

/** Los argumentos de `recibir_orden_insumo`: solo las líneas de las que llega algo o que cierran lo que queda (con su motivo), con el
 *  costo que se ve en la hoja (el sugerido o el corregido). Solo se llama con la hoja lista (la guía sin nada requerido pendiente). */
export function argsRecibirOrdenInsumo(
  o: OrdenInsumoPorRecibir,
  entradas: readonly EntradaRecepcionOI[],
  { tallerId, nota, token }: { tallerId: string; nota: string; token: string },
): ArgsRecibirOrdenInsumo {
  const lineas = o.lineas.flatMap((l): LineaRecepcionParaBase[] => {
    const e = entradas.find((x) => x.itemId === l.itemId) ?? entradaInicialOI(l);
    const m = milesimasQueLlegan(l, e);
    const costo = leerPrecioInsumo(e.costo);
    const cierra = cierraLinea(l, e);
    if (m == null || costo.tipo !== "ok" || (m <= 0 && !cierra)) return [];
    const numeros: NumerosDeRecepcion = {
      cantidad: aTexto(m, 3, { recortar: true }),
      costo_unitario: aTexto(costo.escalado, 4, { recortar: true }),
      ...(e.codigoLote.trim() && m > 0 ? { codigo_lote: e.codigoLote.trim() } : {}),
      ...(cierra ? { cierre: { motivo: e.motivo } } : {}),
    };
    return [l.tipo === "orden" ? { orden_insumo_item_id: l.itemId, ...numeros } : { comprobante_item_id: l.itemId, ...numeros }];
  });
  const notaLimpia = nota.trim();
  return { p_orden_id: o.id, p_ubicacion_id: tallerId, p_lineas: lineas, ...(notaLimpia ? { p_nota: notaLimpia } : {}), p_token: token };
}

export type ResultadoRecepcionOI = { recepcionId: string; documento: string; lotes: number; cierres: number; queda: boolean; repetido: boolean };

/** Lee lo que contesta `recibir_orden_insumo`; null si no llegó la recepción (la base contestó otra cosa). */
export function leerResultadoRecepcionOI(data: unknown): ResultadoRecepcionOI | null {
  const crudo = Array.isArray(data) ? data[0] : data;
  if (!crudo || typeof crudo !== "object") return null;
  const r = crudo as Record<string, unknown>;
  const recepcionId = texto(r.recepcion_id);
  const documento = texto(r.documento);
  if (!recepcionId || !documento) return null;
  return { recepcionId, documento, lotes: cifra(r.lotes) ?? 0, cierres: cifra(r.cierres) ?? 0, queda: r.queda === true, repetido: r.repetido === true };
}

/** «Se abrieron 2 lotes y quedó anotado 1 insumo que no va a llegar. Todavía queda algo por recibir.» — el aviso de la esquina. */
export function detalleDeRecepcionOI(r: Pick<ResultadoRecepcionOI, "lotes" | "cierres" | "queda">): string {
  const lotes = r.lotes > 0 ? (r.lotes === 1 ? "Se abrió 1 lote" : `Se abrieron ${r.lotes} lotes`) : null;
  const anotados = r.cierres === 1 ? "quedó anotado 1 insumo que no va a llegar" : `quedaron anotados ${r.cierres} insumos que no van a llegar`;
  const cierres = r.cierres > 0 ? (lotes ? anotados : anotados.charAt(0).toUpperCase() + anotados.slice(1)) : null;
  const hecho = [lotes, cierres].filter(Boolean).join(" y ");
  return `${hecho}. ${r.queda ? "Todavía queda algo por recibir de esta orden." : "Ya no queda nada por recibir de esta orden."}`;
}
