// El detalle de las fichas que se fusionan, para la hoja de comparar y la matriz de «Así va a quedar» (ADR-0650, rediseño
// 2026-11-13): sus tallas y colores (`variantes`, que lee toda cuenta de retail) y su stock en cada sede. El stock sale de
// `fn_existencias` (security definer, la única cifra de stock, ADR-0270): con la sede en null devuelve todas, también a quien
// no es líder (la RLS de `stock` solo le mostraría la suya). Solo lee: no hace falta migración.

import { createClient } from "./supabase/client";
import type { DetalleFusion } from "./fusionar-productos-ficha";

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function leerDetalleFusion(productoIds: string[]): Promise<DetalleFusion> {
  if (productoIds.length === 0) return { variantes: [], existencias: [], sedes: [] };
  const supabase = createClient();
  const [variantes, existencias, sedes] = await Promise.all([
    supabase
      .from("variantes")
      .select("id, producto_id, color_codigo, activo, talla:tallas ( valor ), color:colores ( nombre, hex )")
      .in("producto_id", productoIds),
    supabase.rpc("fn_existencias", { p_ubicacion_id: undefined, p_producto_ids: productoIds }),
    supabase.from("ubicaciones").select("id, nombre, tipo").eq("activo", true),
  ]);
  const error = variantes.error ?? existencias.error ?? sedes.error;
  if (error) throw error;
  return {
    variantes: (variantes.data ?? []).map((v) => {
      const color = uno(v.color as Uno<{ nombre: string; hex: string | null }>);
      return {
        varianteId: v.id,
        productoId: v.producto_id,
        colorCodigo: v.color_codigo,
        color: color?.nombre ?? "Sin color",
        colorHex: color?.hex ?? null,
        talla: uno(v.talla as Uno<{ valor: string }>)?.valor ?? null,
        // Una talla ya fusionada en otra queda `activo = false` (fusionar_productos, 20261112210000): con `activo` basta. Y
        // `fusionada_en_id` no está entre las columnas que puede leer la cuenta.
        vigente: v.activo,
      };
    }),
    existencias: (existencias.data ?? []).map((e) => ({
      varianteId: e.variante_id,
      ubicacionId: e.ubicacion_id,
      fisico: e.fisico,
      apartado: e.apartado,
      danado: e.danado,
      almacen: e.almacen_libre,
    })),
    sedes: (sedes.data ?? []).map((s) => ({ id: s.id, nombre: s.nombre, tipo: s.tipo })),
  };
}
