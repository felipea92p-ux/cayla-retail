import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";
import { fotoPrincipal } from "@/lib/inventario-reglas";
import { codigoDeEtiqueta } from "@/lib/prenda-reglas";
import { tolerar } from "@/lib/resultado";

/* ====================================================================
   Apariencia de una variante · la miniatura y el color de una prenda
   (2026-09-21, anexo de ADR-0071)

   Por qué existe: `fn_prioridad_conteo` (la lista «Conviene contar
   primero») devuelve nombre, talla y color como TEXTO — ni la foto ni el
   hex del color. Para dibujar a la prenda como Existencias
   (`ProductoVarianteCelda`) hay que ir a buscarlos, y tienen que salir de
   la MISMA fuente con la MISMA regla que Existencias: `colores.hex` y la
   foto principal del PRODUCTO (`fotoPrincipal`). No sirve la foto por
   color de `getCatalogo()` (esa es de Vender, donde la clienta elige un
   color): la misma prenda se vería distinta en las dos pantallas.

   Recibe el cliente de Supabase en vez de crearlo porque lo usan los dos
   lados — el servidor (la lista que llega ya pintada) y el navegador (al
   filtrar por categoría) — cada uno con el suyo.

   El código de etiqueta viaja aquí por la misma razón (2026-09-26): `fn_prioridad_conteo` devuelve
   solo `variantes.sku`, y en producción 128 de 130 variantes lo tienen NULL (ADR-0058) — la fila
   salía sin código justo donde la colaboradora busca qué talla y color es. La consulta ya iba a
   `variantes` por id: pedir `codigo` de paso no suma un viaje. Cuando esa función devuelva el
   código, esto sobra sin romper a nadie (`conteo-reglas.ts › prioridadDesdeFila`).

   Si falla: es un dato secundario (`lib/resultado.ts`, `tolerar`). Nadie
   decide plata mirando una miniatura, así que la pantalla NO se cae; el
   mapa vuelve vacío y la celda se dibuja sin foto y con el color en texto
   — nunca con el degradado de «varios colores», que sería decir algo falso.
   ==================================================================== */

export type Apariencia = {
  /** `#rrggbb` de `colores.hex`; null en los colores que no son un color (Estampado, Multicolor, Animal print). */
  colorHex: string | null;
  /** La foto principal del producto; null si todavía no tiene fotos. */
  fotoUrl: string | null;
  /** El código que se lee en la etiqueta (`codigoDeEtiqueta`: código → sku legado); "" si no tiene ninguno.
   *  Solo se MUESTRA y se busca: para identificar la prenda se compara `varianteId`. */
  codigo: string;
};

type Cliente = SupabaseClient<Database, "retail">;

/** La apariencia de cada variante pedida, por id. Pensada para decenas de ids (viajan en la
 *  URL de la consulta), no para miles: para un conteo entero, pídela dentro de la misma
 *  consulta que trae las líneas, como hace `getConteoDetalle`. */
export async function getAparienciaVariantes(supabase: Cliente, ids: string[]): Promise<Map<string, Apariencia>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();

  const { datos, fallo } = tolerar(
    await supabase
      .from("variantes")
      .select("id, sku, codigo, color:colores ( hex ), producto:productos ( producto_fotos ( url, orden, es_principal ) )")
      .in("id", unicos),
    "las miniaturas y los colores"
  );
  if (fallo) console.error(fallo);

  return new Map((datos ?? []).map((v) => [v.id, { colorHex: v.color?.hex ?? null, fotoUrl: fotoPrincipal(v.producto?.producto_fotos), codigo: codigoDeEtiqueta(v) }]));
}
