// «Para enviar» (ADR-0328 actividad 17; Felipe 2026-10-04): una prenda colgada no se manda a otra sede en un paso. Primero se
// sube al almacén (con «Subir prenda», eligiendo «para enviar a otra sede») y queda en esta lista hasta que sale el traslado
// —por cualquier camino: la base la descuenta sola cuando sale (`para_enviar_al_salir`)— o alguien dice «Ya no la envío».
//
// Lógica pura, sin React ni Supabase: se prueba en `para-enviar-reglas.test.ts`. La lista la da `fn_para_enviar`
// (migración 20261005100200); aquí se agrupa por destino, se arma el enlace a «Nuevo traslado» ya cargado y se decide qué
// manda la ventana «Subir prenda».

import { RUTA_NUEVO_TRASLADO } from "./traslados-reglas";

export type PrendaParaEnviar = {
  id: string;
  destinoId: string;
  destino: string;
  varianteId: string;
  producto: string;
  color: string | null;
  talla: string | null;
  sku: string | null;
  /** Lo que se subió para enviar. */
  cantidad: number;
  /** Lo que todavía no sale (lo que se subió menos lo que salió en traslados que no se anularon). */
  falta: number;
  /** Lo libre HOY en el almacén de esta sede, de esta prenda (si es menos que `falta`, algo pasó: se vendió o se movió). */
  enAlmacen: number;
  nota: string | null;
  creadoEn: string;
  creadoPorNombre: string | null;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const entero = (v: unknown): number => Math.max(0, Math.trunc(Number(v ?? 0)) || 0);

export function paraEnviarDeFila(f: Record<string, unknown>): PrendaParaEnviar {
  return {
    id: String(f.id ?? ""),
    destinoId: String(f.destino_id ?? ""),
    destino: String(f.destino ?? ""),
    varianteId: String(f.variante_id ?? ""),
    producto: String(f.producto ?? "Prenda"),
    color: texto(f.color),
    talla: texto(f.talla),
    sku: texto(f.sku),
    cantidad: entero(f.cantidad),
    falta: entero(f.falta),
    enAlmacen: entero(f.en_almacen),
    nota: texto(f.nota),
    creadoEn: String(f.created_at ?? ""),
    creadoPorNombre: texto(f.creado_por_nombre),
  };
}

/** «Blusa Carlita · Blanco · M». */
export function etiquetaParaEnviar(p: Pick<PrendaParaEnviar, "producto" | "color" | "talla">): string {
  return [p.producto, p.color, p.talla].filter((x): x is string => !!x && x.trim() !== "").join(" · ");
}

export type GrupoParaEnviar = {
  destinoId: string;
  destino: string;
  prendas: PrendaParaEnviar[];
  /** Prendas que faltan enviar a esa sede. */
  total: number;
  /** Las que hoy se pueden meter en la caja (lo que falta, topado a lo que hay libre en el almacén). */
  enviables: number;
};

/** Lo que sí se puede enviar hoy de una prenda: lo que falta, pero nunca más de lo libre en el almacén. */
export function enviableHoy(p: Pick<PrendaParaEnviar, "falta" | "enAlmacen">): number {
  return Math.min(p.falta, p.enAlmacen);
}

/** Una prenda que ya no está en el almacén como se subió (se vendió o se movió): la lista lo dice para que alguien decida. */
export function noEstaCompleta(p: Pick<PrendaParaEnviar, "falta" | "enAlmacen">): boolean {
  return p.enAlmacen < p.falta;
}

/** La lista por sede de destino (en orden alfabético), y dentro, lo más antiguo primero. Solo lo que falta enviar. */
export function agruparPorDestino(filas: readonly PrendaParaEnviar[]): GrupoParaEnviar[] {
  const grupos = new Map<string, GrupoParaEnviar>();
  for (const p of filas) {
    if (p.falta <= 0) continue;
    const g = grupos.get(p.destinoId) ?? { destinoId: p.destinoId, destino: p.destino, prendas: [], total: 0, enviables: 0 };
    g.prendas.push(p);
    g.total += p.falta;
    g.enviables += enviableHoy(p);
    grupos.set(p.destinoId, g);
  }
  for (const g of grupos.values()) g.prendas.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn) || a.id.localeCompare(b.id));
  return [...grupos.values()].sort((a, b) => a.destino.localeCompare(b.destino, "es"));
}

/**
 * «Armar el envío a Lima»: «Nuevo traslado» con el destino y las prendas ya cargadas (`?destino=&lineas=v:n,…`, el mismo
 * prellenado que usan Producción y Análisis). Cada prenda va con lo que se puede enviar hoy; una misma prenda subida dos veces
 * se suma en una línea. null si hoy no hay nada que se pueda meter en la caja.
 */
export function urlArmarEnvio(g: Pick<GrupoParaEnviar, "destinoId" | "prendas">): string | null {
  const porPrenda = new Map<string, number>();
  for (const p of g.prendas) {
    const n = enviableHoy(p);
    if (n > 0) porPrenda.set(p.varianteId, (porPrenda.get(p.varianteId) ?? 0) + n);
  }
  if (porPrenda.size === 0) return null;
  const lineas = [...porPrenda].map(([v, n]) => `${v}:${n}`).join(",");
  return `${RUTA_NUEVO_TRASLADO}?destino=${encodeURIComponent(g.destinoId)}&lineas=${encodeURIComponent(lineas)}`;
}

export const MAX_MOTIVO_YA_NO = 200;

/** «Ya no la envío» necesita un porqué (la base lo exige igual): es lo único que dice qué pasó con la prenda. */
export function motivoYaNoValido(motivo: string): boolean {
  const t = motivo.trim();
  return t.length > 0 && t.length <= MAX_MOTIVO_YA_NO;
}

// ---------------------------------------------------------------------------
// La ventana «Subir prenda»: ¿la subes para guardarla o para enviarla?
// ---------------------------------------------------------------------------

/** La RPC y sus parámetros cuando la subida es para enviar (`subir_para_enviar`): la misma subida + la lista. */
export const RPC_SUBIR_PARA_ENVIAR = "subir_para_enviar";
export const PARAMETROS_RPC_SUBIR_PARA_ENVIAR = ["p_ubicacion_id", "p_destino_id", "p_items", "p_nota", "p_token"] as const;

/** A qué sedes se puede mandar desde aquí: todas las otras activas (un traslado va de una sede a cualquier otra). */
export function destinosParaEnviar(
  ubicaciones: readonly { id: string; nombre: string; activo: boolean }[],
  miSedeId: string,
): { id: string; nombre: string }[] {
  return ubicaciones
    .filter((u) => u.activo && u.id !== miSedeId)
    .map(({ id, nombre }) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que falta en la parte «para enviar» de la ventana: si se eligió enviar, el destino; si no, nada. */
export function faltaDestino(paraEnviar: boolean, destinoId: string): boolean {
  return paraEnviar && destinoId === "";
}
