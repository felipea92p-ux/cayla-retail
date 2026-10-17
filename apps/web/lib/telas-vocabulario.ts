import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerVocabularioDeTelas, type VocabularioDeTelas } from "@/lib/insumos-ficha-reglas";

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
