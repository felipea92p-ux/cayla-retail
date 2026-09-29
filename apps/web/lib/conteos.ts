import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional, tolerar } from "@/lib/resultado";
import { alcanceDeRespuesta, type AlcanceConteo } from "@/lib/conteo-inicio-reglas";
import { getCatalogo } from "@/lib/catalogo-v2";
import { codigosDeConteo, conteoResumenDesdeFila, detalleDesdeJson, type ConteoResumen, type DetalleConteo, type PrendaConteo } from "@/lib/conteo-reglas";

// Lecturas del Conteo rediseñado (2026-09-29). Este archivo solo LEE, y solo por funciones de la base:
//  · `fn_conteo_detalle`  → el detalle de UN conteo (cabecera + resumen + líneas) en un solo jsonb. Un solo renglón:
//    no lo alcanza el tope de 1.000 filas de PostgREST, que truncaría en silencio un conteo de ~1.200 variantes.
//  · `fn_conteos_resumen` → el historial de una sede, ya sumado en Postgres.
// Nunca lee `stock` (la cifra de «cuánto hay» es de `fn_existencias`, ADR-0270) ni costos: el conteo no habla de plata.
// Las escrituras (abrir, contar, recontar, confirmar, cerrar, cancelar) las hace el navegador con la firma del responsable.

export type { CabeceraConteo, ConteoResumen, DetalleConteo, EstadoConteo, EstadoLinea, LineaConteo, PrendaConteo, ResumenConteo } from "@/lib/conteo-reglas";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El detalle de un conteo: su cabecera, su resumen y una línea por variante (sin nombres: eso lo pone el catálogo, ver
 * `getCatalogoConteo`). `null` si el conteo no existe o quien pregunta no opera esa sede — la página responde 404, sin
 * distinguir las dos cosas. Un id que ni es un uuid tampoco es un conteo: 404 y no un error de Postgres.
 */
export async function getDetalleConteo(id: string): Promise<DetalleConteo | null> {
  if (!ES_UUID.test(id)) return null;
  const supabase = await createClient();
  const json = exigirOpcional(await supabase.rpc("fn_conteo_detalle", { p_conteo_id: id }), "el conteo");
  const detalle = detalleDesdeJson(json);
  if (!detalle || detalle.conteo.cerradoPorNombre !== null || !detalle.conteo.cerradoPor) return detalle;

  // La base trae quién abrió, no quién cerró: se busca solo si hace falta (el conteo cerrado que se está mirando).
  const nombres = exigir(await supabase.rpc("fn_nombres_personas", { p_ids: [detalle.conteo.cerradoPor] }), "el nombre de quien cerró el conteo");
  return { ...detalle, conteo: { ...detalle.conteo, cerradoPorNombre: nombres[0]?.nombre ?? null } };
}

/**
 * Los conteos de una sede con su resultado ya sumado — el abierto (si hay) primero, después los demás del más reciente
 * al más antiguo. `fn_conteos_resumen` hace la suma en Postgres: traer las líneas de cada conteo solo para mostrar un
 * total sería cargar miles de filas por pantalla.
 *
 * `lineas` cuenta solo las líneas verificadas, y `pendientes` las que siguen sin verificar: Análisis lee `lineas`,
 * `lineasConDiferencia`, `estado` y `cerradoEn` de acá para la exactitud, y con las pendientes dentro la inflaría.
 */
export async function getConteosResumen(ubicacionId: string, limite = 20): Promise<ConteoResumen[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_conteos_resumen", { p_ubicacion_id: ubicacionId, p_limite: limite }), "los conteos");
  if (filas.length === 0) return [];

  const ids = [...new Set(filas.flatMap((c) => [c.abierto_por, c.cerrado_por]).filter((id): id is string => !!id))];
  const nombres = ids.length > 0 ? exigir(await supabase.rpc("fn_nombres_personas", { p_ids: ids }), "los nombres de responsables") : [];
  const nombrePorId = new Map(nombres.map((n) => [n.id, n.nombre]));

  return filas.map((c) => conteoResumenDesdeFila(c, nombrePorId));
}

/**
 * Cuántas variantes traería un conteo de cada lugar y categoría de la sede, para decirlo ANTES de abrir («175 variantes por contar»).
 * Es un dato de apoyo, no una condición: si la función no está todavía en la base (la web salió antes que el SQL) o falla, devuelve
 * `null` y la tarjeta de abrir se dibuja igual, sin cifras — abrir un conteo nunca depende de esta lectura. Solo variantes, nunca
 * unidades: el conteo es a ciegas.
 */
export async function getAlcanceConteo(ubicacionId: string): Promise<AlcanceConteo | null> {
  const supabase = await createClient();
  const { alcance, fallo } = alcanceDeRespuesta(await supabase.rpc("fn_conteo_alcance", { p_ubicacion_id: ubicacionId }));
  // Queda dicho en el log del servidor: una cifra que falta en producción no se descubre solo mirando la pantalla.
  if (fallo) console.warn(`fn_conteo_alcance no respondió; «Abrir un conteo» sale sin cifras. ${fallo}`);
  return alcance;
}

/**
 * Lo que el conteo necesita saber de cada variante del catálogo para mostrarla y para reconocerla al escanear: a qué
 * modelo y color pertenece, su miniatura y sus códigos. Sin precio ni costo (el conteo no habla de plata) y sin
 * marca. Incluye las variantes inactivas: una prenda descontinuada puede tener stock y estar en la lista.
 *
 * El catálogo entero viaja al navegador porque un código escaneado puede ser de cualquier prenda (una que apareció
 * donde no estaba registrada). Es la copia guardada de `getCatalogo()`, no una consulta nueva.
 *
 * `categoriaId` sale de `categorias` cruzando por nombre —`VarianteCatalogo` solo trae el nombre, y el nombre es único
 * (`categorias_nombre_clave_unica`)—. Es una ayuda para avisar «no pertenece al conteo» antes de guardar: si falla, va
 * `null` y la base igual rechaza la prenda fuera de alcance (hint `fuera_de_alcance`), que la pantalla ya sabe leer.
 */
export async function getCatalogoConteo(): Promise<PrendaConteo[]> {
  const supabase = await createClient();
  const [catalogo, categorias] = await Promise.all([getCatalogo(), supabase.from("categorias").select("id, nombre")]);
  const { datos, fallo } = tolerar(categorias, "las categorías del conteo");
  if (fallo) console.error(fallo);
  const idPorNombre = new Map((datos ?? []).map((c) => [c.nombre, c.id]));

  return catalogo.map((v) => ({
    varianteId: v.varianteId,
    productoId: v.productoId,
    categoriaId: (v.categoria && idPorNombre.get(v.categoria)) || null,
    referencia: v.referencia,
    talla: v.talla,
    color: v.color,
    colorHex: v.colorHex,
    fotoUrl: v.fotoUrl,
    // `sku` es el código de la etiqueta (casi ninguna prenda tiene `sku`, ADR-0058) y `codigosBarras` conserva el sku
    // legado como opción de escaneo: lo que se teclea o se escanea sigue resolviendo la misma prenda.
    ...codigosDeConteo(v),
    activo: v.activo,
  }));
}
