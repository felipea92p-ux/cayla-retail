import { createClient } from "@/lib/supabase/server";
import { leerTodas, tolerar } from "@/lib/resultado";
import type { ProductoDeCatalogo } from "@/lib/existencias-catalogo-reglas";

// Lectura ligera de `productos` para Existencias: la marca, la categoría (y su familia) de cada producto y qué productos activos
// tiene el catálogo (los puros, en `existencias-catalogo-reglas.ts`). Son ~13 filas hoy y unas 500-600 a 3 años.
//
// Aparte del `select` de `stock` (`getStockPorUbicacion`) A PROPÓSITO: ese lo comparten Vender, Cambios y Traslados, y
// si un embed fallara ahí se caería la caja. Y aparte de la lectura de `es_prueba` de `getExistencias`: si esta falla, la
// pantalla pierde la marca, pero los datos de prueba siguen ocultos.
//
// Es un dato SECUNDARIO (`tolerar`, no `exigir`): nadie decide cuánto reponer mirando la marca. Si falla, la pantalla
// sigue con su stock, sin marca (el filtro no se pinta y el buscador no la busca) y lo dice en un aviso en vez de
// callar — y el error real queda en el log del servidor, porque `tolerar` solo guarda un texto para la persona.
//
// CUIDADO con lo que se pide de `variantes` (aprendido el 2026-09-26, lo encontró la revisión antes de publicar): la
// primera versión usaba `variantes!inner ( count )`. PostgREST lo traduce a un agregado de fila completa y eso exige leer
// TODAS las columnas de `variantes`; `authenticated` no puede leer `costo` (migración 20260923193700), así que la lectura
// habría fallado para todas las cuentas y la pantalla habría quedado sin marca. Se pide solo `id`, con el filtro de
// activas y `limit 1` por producto (no hace falta más para saber «¿tiene alguna variante activa?»), y SIN `!inner`:
// así un producto sin variantes activas igual trae su marca (una fila «en camino» puede pertenecer a uno) y la página
// decide con `conVariantesActivas` si lo ofrece como «en el catálogo, sin stock aquí». Comprobado con el cliente real de
// supabase-js contra un PostgREST y una base con la misma restricción de columnas, con el rol `authenticated`.
export async function getCatalogoParaExistencias(): Promise<{ productos: ProductoDeCatalogo[]; fallo: string | null }> {
  const supabase = await createClient();
  const respuesta = await leerTodas(
    (desde, hasta) =>
      supabase
        .from("productos")
        .select("id, referencia, descripcion, estado, estado_alta, es_prueba, marca:marcas ( nombre ), categoria:categorias ( nombre, familia ), variantes ( id )")
        .eq("variantes.activo", true)
        .limit(1, { referencedTable: "variantes" })
        .order("id")
        .range(desde, hasta),
    // Casi siempre cabe en una página: en serie, la segunda solo se pide si la primera vino llena (ADR-0192).
    { enParalelo: 1 },
  );
  if (respuesta.error) console.error("Existencias: no se pudo leer la marca de los productos:", respuesta.error);
  const { datos, fallo } = tolerar(respuesta, "la marca de los productos");
  const productos: ProductoDeCatalogo[] = (datos ?? []).map((p) => ({
    id: p.id,
    referencia: p.referencia,
    marca: p.marca?.nombre ?? null,
    categoria: p.categoria?.nombre ?? null,
    familia: p.categoria?.familia ?? null,
    estado: p.estado,
    descripcion: p.descripcion,
    estadoAlta: p.estado_alta,
    esPrueba: p.es_prueba,
    conVariantesActivas: (p.variantes ?? []).length > 0,
  }));
  return { productos, fallo };
}

/** Un color del catálogo, con lo que la barra de Existencias necesita para agruparlo y pintarlo como en Productos. */
export type ColorDeCatalogo = { nombre: string; hex: string | null; familia: string | null; tipo: string | null };

// La familia de cada color (`colores.familia_color`) para el filtro «Color» agrupado por familia (2026-10-03, como Productos).
// Aparte del `select` de `stock` por la misma razón que la marca: ese lo comparten Vender, Cambios y Traslados. Se leen TODOS los
// colores (también los apagados): una sede puede tener stock de un color que ya no se ofrece al crear prendas. Son ~95 filas.
// Dato SECUNDARIO: si falla, el filtro de color sigue, como lista plana sin familias, y no se avisa (nada se deja de ver).
export async function getColoresParaExistencias(): Promise<ColorDeCatalogo[]> {
  const supabase = await createClient();
  const respuesta = await supabase.from("colores").select("nombre, hex, familia_color, tipo");
  if (respuesta.error) console.error("Existencias: no se pudo leer la familia de los colores:", respuesta.error);
  const { datos } = tolerar(respuesta, "la familia de los colores");
  return (datos ?? []).map((c) => ({ nombre: c.nombre, hex: c.hex, familia: c.familia_color, tipo: c.tipo }));
}
