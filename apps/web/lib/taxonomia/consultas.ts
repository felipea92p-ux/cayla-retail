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
 * Las categorías del estándar universal con su ruta completa, TODAS menos la
 * raíz de cada vertical.
 *
 * ESTO ESTUVO MAL Y SE ARREGLÓ CON DATOS. La primera versión mandaba solo las
 * HOJAS, razonando que anclar a una rama intermedia como "Prendas de vestir"
 * sería anclar a "ropa", que no dice nada. El examen de las 37 categorías de
 * CAYLA (2026-09-10) mostró el agujero: "Carteras/Bolsos", "Lencería",
 * "Trajes de baño", "Maquillaje" y "Anillos" existen en el estándar y tienen
 * hijos — 23, 15, 17, 8 y 2 respectivamente—, así que el filtro las escondía y
 * el modelo devolvía "no encontré nada" para categorías que sí estaban.
 *
 * El error de razonamiento fue confundir dos cosas distintas: una rama DEMASIADO
 * GENERAL ("Prendas de vestir", nivel 2) y una rama ESPECÍFICA QUE TIENE HIJOS
 * ("Bolsos"). Una categoría propia amplia tiene que poder anclar a una rama
 * amplia; forzarla hasta una hoja ("Bolsos de mano") es peor que no anclarla,
 * porque afirma algo que la marca nunca dijo.
 *
 * Se excluye solo el nivel 1 —"Ropa y accesorios", "Salud y belleza"—, que son
 * el nombre del vertical y nunca son una respuesta útil. Que el modelo no elija
 * ramas demasiado altas se resuelve donde corresponde: en la instrucción de
 * elegir siempre lo más específico que sea correcto, no escondiéndole el árbol.
 */
export async function getCategoriasUniversales(): Promise<TerminoUniversal[]> {
  const supabase = await createClient();

  // PostgREST corta cada respuesta a `max_rows` (1.000 en config.toml y en
  // producción) y NO avisa: devuelve 1.000 filas con status 200. El árbol tiene
  // 1.804 categorías de nivel > 1, ordenadas por ruta — o sea que "Salud y
  // belleza" (902 filas, la última alfabéticamente) quedaba casi entera fuera y
  // el modelo no podía anclar nada de belleza. Lo encontró la revisión
  // adversarial del 2026-09-11; el examen no lo vio porque lee por psql, que
  // no tiene ese tope. Se pagina en bloques de 1.000 hasta que llegue corto.
  const PAGINA = 1000;
  const todas: { id: string; nombre: string; ruta: string }[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const res = await supabase
      .from("taxonomia_categorias")
      .select("id, nombre, ruta, nivel")
      .gt("nivel", 1)
      .order("ruta")
      .range(desde, desde + PAGINA - 1);
    const bloque = exigir(res, "las categorías del estándar universal");
    todas.push(...bloque);
    if (bloque.length < PAGINA) break;
  }

  return todas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    ruta: c.ruta,
  }));
}
