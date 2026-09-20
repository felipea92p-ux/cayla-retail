import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import {
  CATEGORIAS,
  leerCursorMovimientos,
  type CategoriaFila,
  type CategoriaMovimiento,
  type CursorMovimientos,
  type FiltrosMovimientos,
  type Movimiento,
  type ParamsMovimientos,
  type TipoMovimiento,
} from "@/lib/movimientos-reglas";
import type { EstadoComprobante, TipoComprobante } from "@/lib/comprobantes-reglas";

// Las páginas (server) importan todo desde acá; los componentes cliente
// importan SOLO `movimientos-reglas.ts`.
export * from "@/lib/movimientos-reglas";

// Historial de `retail.movimientos` — la fuente de verdad única del stock
// (append-only; inmutable por trigger desde 20260914165703). Desde el
// 2026-09-15 se lee con `fn_movimientos` (20260915090000_movimientos_lectura.sql):
// una fila plana por movimiento con la referencia de su proceso ya resuelta,
// filtros en Postgres y paginado por cursor. Antes eran embeds de PostgREST
// sobre los últimos 100, filtrados en memoria — sin búsqueda, sin filtros y
// sin poder juntar el nombre de la persona (vive en otro schema). Este
// archivo solo LEE; no existe ninguna escritura de Movimientos desde la UI.

export type PaginaMovimientos = {
  filas: Movimiento[];
  /** Cursor para pedir la página siguiente; null si esta es la última. */
  siguiente: CursorMovimientos | null;
};

export type ResumenMovimientos = Record<CategoriaMovimiento, { movimientos: number; unidades: number; delta: number }>;

export const TAMANO_PAGINA = 50;

export function cursorDesdeParams(p: ParamsMovimientos): CursorMovimientos | null {
  return leerCursorMovimientos(p.cursor);
}

type FilaRpc = {
  id: string;
  created_at: string;
  fecha_lima: string;
  hora: string;
  tipo: string;
  categoria: string;
  motivo: string | null;
  cantidad: number;
  delta: number;
  es_sistema: boolean;
  nota: string | null;
  variante_id: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  ubicacion_id: string;
  ubicacion_nombre: string;
  ubicacion_destino_id: string | null;
  ubicacion_destino_nombre: string | null;
  sububicacion_id: string | null;
  sububicacion_nombre: string | null;
  sububicacion_tipo: string | null;
  sububicacion_destino_id: string | null;
  sububicacion_destino_nombre: string | null;
  sububicacion_destino_tipo: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  venta_id: string | null;
  venta_nota: string | null;
  comprobante_tipo: string | null;
  comprobante_numero: string | null;
  comprobante_estado: string | null;
  lote_id: string | null;
  lote_guia: string | null;
  lote_nota: string | null;
  proveedor_nombre: string | null;
  compra_id: string | null;
  compra_documento: string | null;
  transferencia_id: string | null;
  transferencia_estado: string | null;
  transferencia_nota: string | null;
  conteo_id: string | null;
  conteo_cantidad_sistema: number | null;
  conteo_cantidad_contada: number | null;
  devolucion_id: string | null;
  devolucion_motivo: string | null;
  devolucion_estado: string | null;
  cambio_id: string | null;
  cambio_diferencia: number | null;
  // 20260919155000. Opcionales a propósito: si el código sale antes que la migración, la pantalla
  // sigue andando y solo dice «Traslado» / «Conteo» sin el número.
  transferencia_numero?: number | null;
  conteo_numero?: number | null;
};

function aMovimiento(f: FilaRpc): Movimiento {
  return {
    id: f.id,
    creadoEn: f.created_at,
    fecha: f.fecha_lima,
    hora: f.hora,
    tipo: f.tipo as TipoMovimiento,
    categoria: f.categoria as CategoriaFila,
    motivo: f.motivo,
    cantidad: f.cantidad,
    delta: f.delta,
    esSistema: f.es_sistema,
    nota: f.nota,
    varianteId: f.variante_id,
    sku: f.sku,
    referencia: f.referencia,
    talla: f.talla,
    color: f.color,
    ubicacionId: f.ubicacion_id,
    ubicacion: f.ubicacion_nombre,
    ubicacionDestinoId: f.ubicacion_destino_id,
    ubicacionDestino: f.ubicacion_destino_nombre,
    sububicacion: f.sububicacion_id ? { id: f.sububicacion_id, nombre: f.sububicacion_nombre ?? "", tipo: f.sububicacion_tipo } : null,
    sububicacionDestino: f.sububicacion_destino_id
      ? { id: f.sububicacion_destino_id, nombre: f.sububicacion_destino_nombre ?? "", tipo: f.sububicacion_destino_tipo }
      : null,
    usuarioId: f.usuario_id,
    usuario: f.usuario_nombre,
    venta: f.venta_id
      ? {
          id: f.venta_id,
          nota: f.venta_nota,
          comprobante:
            f.comprobante_numero && f.comprobante_tipo && f.comprobante_estado
              ? { tipo: f.comprobante_tipo as TipoComprobante, numero: f.comprobante_numero, estado: f.comprobante_estado as EstadoComprobante }
              : null,
        }
      : null,
    lote: f.lote_id ? { id: f.lote_id, guia: f.lote_guia, nota: f.lote_nota, proveedor: f.proveedor_nombre } : null,
    compra: f.compra_id ? { id: f.compra_id, documento: f.compra_documento } : null,
    transferencia: f.transferencia_id
      ? { id: f.transferencia_id, estado: f.transferencia_estado, nota: f.transferencia_nota, numero: f.transferencia_numero ?? null }
      : null,
    conteo: f.conteo_id
      ? { id: f.conteo_id, sistema: f.conteo_cantidad_sistema, contado: f.conteo_cantidad_contada, numero: f.conteo_numero ?? null }
      : null,
    devolucion: f.devolucion_id ? { id: f.devolucion_id, motivo: f.devolucion_motivo, estado: f.devolucion_estado } : null,
    // `cambio_diferencia` es `numeric` en Postgres — PostgREST lo manda como
    // string ("0.00"), nunca como number, para no perder precisión decimal.
    // Sin este `Number(...)`, `diferencia !== 0` compara un string contra un
    // number y JS nunca los ve iguales: ningún cambio "sin diferencia" se
    // detectaba como tal.
    cambio: f.cambio_id ? { id: f.cambio_id, diferencia: f.cambio_diferencia !== null ? Number(f.cambio_diferencia) : null } : null,
  };
}

/** Los parámetros que comparten la lista y el resumen — un solo lugar para
 *  que los dos filtren igual. Solo se mandan los que tienen valor: la RPC
 *  tiene `default null` para todos. */
function paramsRpc(ubicacionId: string, filtros: FiltrosMovimientos) {
  return {
    p_ubicacion_id: ubicacionId,
    ...(filtros.desde ? { p_desde: filtros.desde } : {}),
    ...(filtros.hasta ? { p_hasta: filtros.hasta } : {}),
    ...(filtros.motivo ? { p_motivo: filtros.motivo } : {}),
    ...(filtros.busqueda ? { p_busqueda: filtros.busqueda } : {}),
    ...(filtros.sububicacionId ? { p_sububicacion_id: filtros.sububicacionId } : {}),
  };
}

export async function listarMovimientos(
  ubicacionId: string,
  filtros: FiltrosMovimientos = {},
  opciones: { cursor?: CursorMovimientos | null; limite?: number } = {}
): Promise<PaginaMovimientos> {
  const supabase = await createClient();
  const limite = opciones.limite ?? TAMANO_PAGINA;
  const filas = exigir(
    await supabase.rpc("fn_movimientos", {
      ...paramsRpc(ubicacionId, filtros),
      ...(filtros.categoria ? { p_categoria: filtros.categoria } : {}),
      ...(opciones.cursor ? { p_cursor_creado_en: opciones.cursor.creadoEn, p_cursor_id: opciones.cursor.id } : {}),
      p_limite: limite,
    }),
    "los movimientos"
  );
  // La función devuelve limite+1 filas a propósito: la de más solo dice "hay otra página".
  const hayMas = filas.length > limite;
  const pagina = (hayMas ? filas.slice(0, limite) : filas).map((f) => aMovimiento(f as FilaRpc));
  const ultima = pagina[pagina.length - 1];
  return { filas: pagina, siguiente: hayMas && ultima ? { creadoEn: ultima.creadoEn, id: ultima.id } : null };
}

/** Historial de Producto (Sesión A3, 2026-09-15): los movimientos de TODAS
 *  las variantes de un producto en una sede, sede por sede — mismo modelo de
 *  permiso que `/movimientos` (`fn_puede_operar_ubicacion`), sin agregar por
 *  toda la red. `fn_movimientos` resuelve `p_producto_id` a sus variantes
 *  (20260915204457_movimientos_por_producto.sql). Sin filtros de URL: el
 *  panel de un producto no necesita categoría/motivo/búsqueda, ya está
 *  acotado a ESE producto. */
export async function listarMovimientosProducto(
  productoId: string,
  ubicacionId: string,
  opciones: { cursor?: CursorMovimientos | null; limite?: number } = {}
): Promise<PaginaMovimientos> {
  const supabase = await createClient();
  const limite = opciones.limite ?? TAMANO_PAGINA;
  const filas = exigir(
    await supabase.rpc("fn_movimientos", {
      p_ubicacion_id: ubicacionId,
      p_producto_id: productoId,
      ...(opciones.cursor ? { p_cursor_creado_en: opciones.cursor.creadoEn, p_cursor_id: opciones.cursor.id } : {}),
      p_limite: limite,
    }),
    "el historial del producto"
  );
  const hayMas = filas.length > limite;
  const pagina = (hayMas ? filas.slice(0, limite) : filas).map((f) => aMovimiento(f as FilaRpc));
  const ultima = pagina[pagina.length - 1];
  return { filas: pagina, siguiente: hayMas && ultima ? { creadoEn: ultima.creadoEn, id: ultima.id } : null };
}

/** Totales por categoría del mismo filtro que la lista (sin categoría ni
 *  cursor: el resumen describe el período, no la página). Siempre trae las
 *  cinco categorías, en cero si no hubo nada. */
export async function getResumenMovimientos(ubicacionId: string, filtros: FiltrosMovimientos = {}): Promise<ResumenMovimientos> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_movimientos_resumen", paramsRpc(ubicacionId, filtros)), "el resumen de movimientos");
  const resumen = Object.fromEntries(CATEGORIAS.map((c) => [c, { movimientos: 0, unidades: 0, delta: 0 }])) as ResumenMovimientos;
  for (const f of filas) {
    const categoria = CATEGORIAS.find((c) => c === f.categoria);
    if (categoria) resumen[categoria] = { movimientos: Number(f.movimientos ?? 0), unidades: Number(f.unidades ?? 0), delta: Number(f.delta ?? 0) };
  }
  return resumen;
}
