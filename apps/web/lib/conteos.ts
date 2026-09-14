import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";
import type { FilaPrevisualizacion } from "@/lib/conteo-varianza";

// Conteos físicos (Felipe, 2026-09-14): abrir_conteo/conteo_contar/cerrar_conteo
// ya existían y siguen probados intactos — este archivo solo trae lecturas.
// La única pieza nueva de verdad es `previsualizar_cierre_conteo`
// (0015_previsualizar_conteo.sql), que alimenta `resumirVarianza()`
// (conteo-varianza.ts), ya escrita y ya probada antes de esta tarea.

export type ItemConteoAbierto = {
  id: string;
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidadSistema: number;
  cantidadContada: number;
};

export type ConteoAbierto = {
  id: string;
  ubicacionId: string;
  creadoEn: string;
  abiertoPorNombre: string;
  items: ItemConteoAbierto[];
};

export async function getConteoAbierto(ubicacionId: string): Promise<ConteoAbierto | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("conteos")
    .select("id, ubicacion_id, created_at, abierto_por")
    .eq("ubicacion_id", ubicacionId)
    .eq("estado", "abierto")
    .maybeSingle();
  const conteo = exigirOpcional(res, "el conteo abierto");
  if (!conteo) return null;

  const [itemsRes, nombreRes] = await Promise.all([
    supabase
      .from("conteo_items")
      .select(
        `id, variante_id, cantidad_sistema, cantidad_contada,
         variante:variantes ( sku, talla, color:colores ( nombre ), producto:productos ( referencia ) )`
      )
      .eq("conteo_id", conteo.id)
      .order("id"),
    conteo.abierto_por
      ? supabase.rpc("fn_nombres_personas", { p_ids: [conteo.abierto_por] })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const items = exigir(itemsRes, "los ítems ya contados");
  const nombres = exigir(nombreRes, "el nombre de quien abrió el conteo");

  return {
    id: conteo.id,
    ubicacionId: conteo.ubicacion_id,
    creadoEn: conteo.created_at,
    abiertoPorNombre: nombres[0]?.nombre ?? "—",
    items: items.map((i) => ({
      id: i.id,
      varianteId: i.variante_id,
      sku: i.variante?.sku ?? "",
      referencia: i.variante?.producto?.referencia ?? "",
      talla: i.variante?.talla ?? null,
      color: i.variante?.color?.nombre ?? null,
      cantidadSistema: i.cantidad_sistema,
      cantidadContada: i.cantidad_contada,
    })),
  };
}

export type ConteoCerrado = {
  id: string;
  creadoEn: string;
  cerradoEn: string | null;
  abiertoPorNombre: string;
  cerradoPorNombre: string;
  lineasContadas: number;
};

export async function getConteosCerradosRecientes(ubicacionId: string, limite = 10): Promise<ConteoCerrado[]> {
  const supabase = await createClient();
  const conteos = exigir(
    await supabase
      .from("conteos")
      .select("id, created_at, cerrado_en, abierto_por, cerrado_por, conteo_items(count)")
      .eq("ubicacion_id", ubicacionId)
      .eq("estado", "cerrado")
      .order("cerrado_en", { ascending: false })
      .limit(limite),
    "los conteos cerrados"
  );
  if (conteos.length === 0) return [];

  const ids = [...new Set(conteos.flatMap((c) => [c.abierto_por, c.cerrado_por]).filter((id): id is string => !!id))];
  const nombres = exigir(await supabase.rpc("fn_nombres_personas", { p_ids: ids }), "los nombres de responsables");
  const nombrePorId = new Map(nombres.map((n) => [n.id, n.nombre]));

  return conteos.map((c) => ({
    id: c.id,
    creadoEn: c.created_at,
    cerradoEn: c.cerrado_en,
    abiertoPorNombre: (c.abierto_por && nombrePorId.get(c.abierto_por)) || "—",
    cerradoPorNombre: (c.cerrado_por && nombrePorId.get(c.cerrado_por)) || "—",
    lineasContadas: c.conteo_items?.[0]?.count ?? 0,
  }));
}

export async function getPrevisualizacionCierre(conteoId: string): Promise<FilaPrevisualizacion[]> {
  const supabase = await createClient();
  return exigir(
    await supabase.rpc("previsualizar_cierre_conteo", { p_conteo_id: conteoId }),
    "la vista previa del cierre"
  );
}
