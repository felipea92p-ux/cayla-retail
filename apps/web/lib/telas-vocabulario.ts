import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ColorAlta } from "@/lib/alta-producto";
import { leerVocabularioDeTelas, type VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";
import { clasesOfrecidas, leerClasesDeAvio, type ClaseDeAvio } from "@/lib/avio-clases-reglas";

// Las clases de avío (ADR-0580): botón, cierre, hilo, etiqueta, elástico, pretina… De la clase salen la unidad que se PROPONE, si lleva color y qué medida pide, así que sin ellas «Nuevo avío»
// no sabe qué preguntar: lo dice y no ofrece una lista vacía. La tabla es nueva, así que la web puede publicarse antes de que su SQL esté pegado; eso no tumba la pantalla, es `leyo: false`.
export async function getClasesDeAvio(): Promise<{ clases: ClaseDeAvio[]; leyo: boolean }> {
  const supabase = await createClient();
  // La tabla todavía no está en los tipos generados: se tipa el cliente, no el resultado.
  const { data, error } = await (
    supabase as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (col: string, v: boolean) => { order: (c: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> } } };
    }
  )
    .from("avio_clases")
    .select("id, nombre, prefijo, comportamiento, unidad_sugerida, pide_color, orden, activo, nota")
    .eq("activo", true)
    .order("orden");
  if (error || !data) {
    console.error(`clases de avío: ${error?.message ?? "sin datos"}`);
    return { clases: [], leyo: false };
  }
  return { clases: clasesOfrecidas(leerClasesDeAvio(data)), leyo: true };
}

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
