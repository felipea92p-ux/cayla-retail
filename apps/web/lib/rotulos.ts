import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import type { ModeloRotulo } from "@/lib/rotulos-reglas";
import { ID_PRODUCTO_CARGO_ESPECIAL } from "@/lib/cargo-especial";

/** Un modelo que se puede sumar desde el buscador de la pantalla: ya trae lo que dice su rótulo (marca y tallas), así sumarlo
 *  no tiene que volver al servidor. */
export type ModeloElegible = ModeloRotulo & { codigo: string | null; categoria: string | null };

/** Lo que el rótulo necesita de una fila de `productos` (con su marca y sus variantes). */
type FilaModelo = {
  id: string;
  referencia: string;
  marca: { nombre: string } | null;
  variantes: { activo: boolean; talla: { valor: string } | null }[] | null;
};

/** La marca y las tallas ACTIVAS del modelo: lo que dice su rótulo. */
function aModeloRotulo(p: FilaModelo): ModeloRotulo {
  return {
    productoId: p.id,
    referencia: p.referencia,
    marca: p.marca?.nombre ?? null,
    tallas: (p.variantes ?? []).filter((v) => v.activo).flatMap((v) => (v.talla?.valor ? [v.talla.valor] : [])),
  };
}

/**
 * Lo que necesita la pantalla de rótulos (ADR-0366): los modelos pedidos por la URL y el catálogo de modelos activos para el
 * buscador, los dos con su marca y sus tallas activas. Solo lee: un rótulo no escribe nada en la base.
 * Las tallas son las del MODELO, no las del stock de la sede: el anaquel guarda el modelo, y una talla que hoy no
 * hay en el almacén va al mismo lugar cuando llegue.
 *
 * El catálogo trae la marca y las tallas (ADR-0366, act. 2026-10-12) para que sumar o quitar una prenda pase en el navegador,
 * sin volver al servidor: antes cada prenda era una navegación (loader a pantalla completa y la pantalla armada de nuevo).
 * Medido en producción el 2026-10-12: 195 modelos y 1.266 variantes, unos 75 KB.
 */
export async function getRotulos(productoIds: readonly string[]): Promise<{ modelos: ModeloRotulo[]; catalogo: ModeloElegible[] }> {
  const supabase = await createClient();
  const [pedidos, catalogo] = await Promise.all([
    productoIds.length === 0
      ? Promise.resolve([])
      : leerModelos(supabase, productoIds),
    // `leerTodas` por si pasan de 1.000 modelos (PostgREST corta sin error).
    leerTodas((desde, hasta) =>
      supabase
        .from("productos")
        .select("id, referencia, codigo, categoria:categorias ( nombre ), marca:marcas ( nombre ), variantes ( activo, talla:tallas ( valor ) )")
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
    catalogo: catalogo.map((p) => ({ ...aModeloRotulo(p), codigo: p.codigo, categoria: p.categoria?.nombre ?? null })),
  };
}

/** Lee varios modelos por id. Sale en el orden pedido (el de la URL), sin los que no existen o no se pueden ver. */
export async function leerModelos(supabase: Awaited<ReturnType<typeof createClient>>, productoIds: readonly string[]): Promise<ModeloRotulo[]> {
  const filas = exigir(
    await supabase
      .from("productos")
      .select("id, referencia, marca:marcas ( nombre ), variantes ( activo, talla:tallas ( valor ) )")
      .in("id", productoIds.filter((id) => id !== ID_PRODUCTO_CARGO_ESPECIAL)),
    "los modelos de los rótulos",
  );
  const porId = new Map(filas.map((p) => [p.id, aModeloRotulo(p)] as const));
  return productoIds.flatMap((id) => {
    const m = porId.get(id);
    return m ? [m] : [];
  });
}
