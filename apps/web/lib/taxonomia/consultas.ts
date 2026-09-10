import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { TerminoPropio, TerminoUniversal } from "./anclar";

/**
 * Lectura del estándar universal (0052) y del vocabulario propio de la marca.
 *
 * Las dos mitades del anclaje viven acá para que el endpoint y la pantalla lean
 * exactamente lo mismo. Todo falla en duro con `exigir`: un catálogo universal
 * que vuelve vacío por un error de consulta haría que la IA "no encuentre
 * ningún calce" y dejara todo sin anclar — un fallo que se ve como una decisión.
 */

/** El atributo universal 'color' — el handle es estable entre releases; el id numérico no lo prometen. */
const HANDLE_COLOR = "color";

export type VocabularioAnclado = {
  termino: TerminoPropio;
  /** Anclaje ya guardado en la base, o null si nadie lo ancló todavía. */
  ancladoA: { id: string; nombre: string } | null;
};

/** Los colores de la marca, con el universal al que ya cuelgan (si cuelgan). */
export async function getColoresPropios(): Promise<VocabularioAnclado[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("colores")
    .select("codigo, nombre, familia_color, taxonomia_valor_id, taxonomia_valores(id, nombre)")
    .eq("activo", true)
    .order("orden")
    .order("nombre");

  const filas = exigir(res, "los colores de la marca");
  return filas.map((c) => {
    // El embed de PostgREST devuelve objeto u array según cómo infiera la
    // relación; normalizarlo acá evita que cada pantalla lo adivine.
    const u = Array.isArray(c.taxonomia_valores) ? c.taxonomia_valores[0] : c.taxonomia_valores;
    return {
      termino: { clave: c.codigo, nombre: c.nombre, contexto: c.familia_color },
      ancladoA: u ? { id: u.id, nombre: u.nombre } : null,
    };
  });
}

/** Las categorías de la marca, con el universal al que ya cuelgan (si cuelgan). */
export async function getCategoriasPropias(): Promise<VocabularioAnclado[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("categorias")
    .select("id, nombre, familia, taxonomia_categoria_id, taxonomia_categorias(id, ruta)")
    .order("familia")
    .order("nombre");

  const filas = exigir(res, "las categorías de la marca");
  return filas.map((c) => {
    const u = Array.isArray(c.taxonomia_categorias) ? c.taxonomia_categorias[0] : c.taxonomia_categorias;
    return {
      termino: { clave: c.id, nombre: c.nombre, contexto: c.familia },
      ancladoA: u ? { id: u.id, nombre: u.ruta } : null,
    };
  });
}

/** Los colores del estándar universal (19 en v2026-08). */
export async function getColoresUniversales(): Promise<TerminoUniversal[]> {
  const supabase = await createClient();

  const resAttr = await supabase.from("taxonomia_atributos").select("id").eq("handle", HANDLE_COLOR).single();
  const attr = exigir(resAttr, "el atributo universal de color");

  const res = await supabase
    .from("taxonomia_valores")
    .select("id, nombre")
    .eq("atributo_id", attr.id)
    .order("nombre");

  return exigir(res, "los colores del estándar universal").map((v) => ({ id: v.id, nombre: v.nombre }));
}

/**
 * Las categorías del estándar universal, como hojas con su ruta completa.
 *
 * Solo las HOJAS (las que no son padre de nadie): anclar una categoría propia a
 * una rama intermedia como "Prendas de vestir" sería anclarla a "ropa", que no
 * dice nada. Además recorta el catálogo que viaja en el prompt casi a la mitad.
 */
export async function getCategoriasUniversales(): Promise<TerminoUniversal[]> {
  const supabase = await createClient();
  const res = await supabase.from("taxonomia_categorias").select("id, nombre, ruta, padre_id").order("ruta");

  const filas = exigir(res, "las categorías del estándar universal");
  const conHijos = new Set(filas.map((c) => c.padre_id).filter(Boolean));

  return filas
    .filter((c) => !conHijos.has(c.id))
    .map((c) => ({ id: c.id, nombre: c.nombre, ruta: c.ruta }));
}
