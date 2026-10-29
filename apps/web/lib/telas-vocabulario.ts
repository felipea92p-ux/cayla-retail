import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ColorAlta } from "@/lib/alta-producto";
import { leerVocabularioDeTelas, type VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";

// La carta de colores de «Nueva tela» (ADR-0554): la MISMA de Catálogo ▸ Nuevo producto (`ElegirColores`), con los mismos campos que lee `getContextoAlta`: familia, tipo, sinónimos, Pantone y ficha. Es un dato de apoyo:
// si no se lee, la hoja lo dice y no ofrece una carta vacía como si no hubiera colores.
export async function getColoresDeLaCarta(): Promise<{ colores: ColorAlta[]; leyo: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colores").select("codigo, nombre, hex, familia_color, tipo, sinonimos, pantone_tcx, descripcion, combina_con").eq("activo", true).order("orden");
  if (error || !data) {
    console.error(`carta de colores: ${error?.message ?? "sin datos"}`);
    return { colores: [], leyo: false };
  }
  return {
    colores: data.map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      hex: c.hex,
      familiaColor: c.familia_color ?? "",
      tipo: c.tipo,
      sinonimos: c.sinonimos ?? [],
      pantoneTcx: c.pantone_tcx ?? null,
      descripcion: c.descripcion ?? null,
      combinaCon: c.combina_con ?? [],
    })),
    leyo: true,
  };
}

// El vocabulario de tejidos y colores de la ficha de una tela (ADR-0400, actividad 8e): el MISMO de la prenda (Catálogo). Es un dato de apoyo: si no se lee, la lista de insumos sigue en pie y la ficha dice que no
// pudo cargar las opciones (principio 9), nunca ofrece una lista vacía como si no hubiera tejidos.

export async function getVocabularioDeTelas(): Promise<{ vocabulario: VocabularioDeTelas; leyo: boolean }> {
  const supabase = await createClient();
  const [tejidos, colores] = await Promise.all([
    supabase.from("tejidos").select("id, nombre").eq("activo", true).eq("estado", "aprobado").order("nombre"),
    supabase.from("colores").select("codigo, nombre, hex").eq("activo", true).order("nombre"),
  ]);
  if (tejidos.error || colores.error) {
    console.error(`vocabulario de telas: ${tejidos.error?.message ?? colores.error?.message}`);
    return { vocabulario: { tejidos: [], colores: [] }, leyo: false };
  }
  return { vocabulario: leerVocabularioDeTelas(tejidos.data, colores.data), leyo: true };
}
