import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import type { ModeloRotulo } from "@/lib/rotulos-reglas";
import { ID_PRODUCTO_CARGO_ESPECIAL } from "@/lib/cargo-especial";

/** Un modelo que se puede sumar desde el buscador de la pantalla. */
export type ModeloElegible = { productoId: string; referencia: string; codigo: string | null; categoria: string | null };

/**
 * Lo que necesita la pantalla de rótulos (ADR-0366): los modelos pedidos por la URL, con sus colores y tallas activos, y
 * el catálogo de modelos activos para el buscador «Agregar un modelo». Solo lee: un rótulo no escribe nada en la base.
 * Los colores y tallas son los del MODELO, no los del stock de la sede: el anaquel guarda el modelo, y una talla que hoy no
 * hay en el almacén va al mismo lugar cuando llegue.
 */
export async function getRotulos(productoIds: readonly string[]): Promise<{ modelos: ModeloRotulo[]; catalogo: ModeloElegible[] }> {
  const supabase = await createClient();
  const [pedidos, catalogo] = await Promise.all([
    productoIds.length === 0
      ? Promise.resolve([])
      : leerModelos(supabase, productoIds),
    // ~120 modelos hoy; `leerTodas` por si pasan de 1.000 (PostgREST corta sin error).
    leerTodas((desde, hasta) =>
      supabase
        .from("productos")
        .select("id, referencia, codigo, categoria:categorias ( nombre )")
        .eq("estado", "activo")
        .eq("estado_alta", "aprobado")
        // Solo prendas de verdad: ni la «Prenda sin registrar» de la caja (un producto interno) ni los de prueba.
        .eq("es_prueba", false)
        .neq("id", ID_PRODUCTO_CARGO_ESPECIAL)
        .order("referencia")
        .order("id")
        .range(desde, hasta),
    ).then((r) => exigir(r, "los modelos del catálogo")),
  ]);
  return {
    modelos: pedidos,
    catalogo: catalogo.map((p) => ({ productoId: p.id, referencia: p.referencia, codigo: p.codigo, categoria: p.categoria?.nombre ?? null })),
  };
}

/** Lee varios modelos por id. Sale en el orden pedido (el de la URL), sin los que no existen o no se pueden ver. */
export async function leerModelos(supabase: Awaited<ReturnType<typeof createClient>>, productoIds: readonly string[]): Promise<ModeloRotulo[]> {
  const filas = exigir(
    await supabase
      .from("productos")
      .select("id, referencia, codigo, categoria:categorias ( nombre ), variantes ( activo, talla:tallas ( valor ), color:colores ( nombre ) )")
      .in("id", productoIds.filter((id) => id !== ID_PRODUCTO_CARGO_ESPECIAL)),
    "los modelos de los rótulos",
  );
  const porId = new Map(
    filas.map((p) => {
      const activas = (p.variantes ?? []).filter((v) => v.activo);
      return [
        p.id,
        {
          productoId: p.id,
          referencia: p.referencia,
          codigo: p.codigo,
          categoria: p.categoria?.nombre ?? null,
          colores: activas.flatMap((v) => (v.color?.nombre ? [v.color.nombre] : [])),
          tallas: activas.flatMap((v) => (v.talla?.valor ? [v.talla.valor] : [])),
        } satisfies ModeloRotulo,
      ] as const;
    }),
  );
  return productoIds.flatMap((id) => {
    const m = porId.get(id);
    return m ? [m] : [];
  });
}
