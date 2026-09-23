import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import { armarEtiquetas, sumarEntradas, type EtiquetaPrecio } from "@/lib/etiqueta-precio-reglas";

/** De dónde vienen las prendas a etiquetar: los lotes de un ingreso (Recibir o Ingreso sin comprobante) o una
 *  producción cerrada del Taller. Las dos puertas ya dejan sus entradas amarradas en `movimientos`. */
export type OrigenEtiquetas = { tipo: "lotes"; ids: string[] } | { tipo: "produccion"; id: string };

/**
 * Las etiquetas de precio de lo que ENTRÓ por un ingreso (ADR-0180): una por prenda, con su cantidad.
 *
 * No hay función nueva en la base a propósito. Todo ingreso ya escribe sus `movimientos` de entrada con el lote o la
 * producción (principio 4: una sola fuente de verdad); esto solo los lee. Y la seguridad es la de siempre: la política
 * `movimientos_select` deja ver solo lo de las sedes que uno opera, así que nadie imprime lo que entró a otra tienda
 * aunque escriba el id en la URL — le sale vacío.
 */
export async function getEtiquetasDeIngreso(origen: OrigenEtiquetas): Promise<{ etiquetas: EtiquetaPrecio[]; sinCodigo: string[] }> {
  const supabase = await createClient();

  // PostgREST corta en 1.000 filas SIN error (resultado.ts): se lee por páginas, con `id` como orden único.
  const movimientos = exigir(
    await leerTodas((desde, hasta) => {
      const consulta = supabase.from("movimientos").select("id, variante_id, cantidad").eq("tipo", "entrada");
      return (origen.tipo === "lotes" ? consulta.in("lote_id", origen.ids) : consulta.eq("produccion_id", origen.id)).order("id").range(desde, hasta);
    }),
    "lo que entró en este ingreso",
  );
  const entradas = sumarEntradas(movimientos);
  if (entradas.size === 0) return { etiquetas: [], sinCodigo: [] };

  const variantes = exigir(
    await supabase
      .from("variantes")
      .select("id, producto_id, codigo, sku, precio, color_codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia )")
      .in("id", [...entradas.keys()]),
    "las prendas que entraron",
  );

  // Las otras tallas de esos modelos, para la fila «Tallas del modelo». Un envío grande (50 modelos × 20 variantes)
  // pasa las 1.000 filas: cortada, la etiqueta saldría con tallas de menos sin que nadie lo note.
  const productoIds = [...new Set(variantes.map((v) => v.producto_id))];
  const hermanas = exigir(
    await leerTodas((desde, hasta) =>
      supabase.from("variantes").select("id, producto_id, color_codigo, activo, talla:tallas ( valor )").in("producto_id", productoIds).order("id").range(desde, hasta),
    ),
    "las tallas de esos modelos",
  );

  return armarEtiquetas(
    entradas,
    variantes.map((v) => ({
      id: v.id,
      productoId: v.producto_id,
      prenda: v.producto?.referencia ?? "",
      codigo: v.codigo,
      sku: v.sku,
      precio: Number(v.precio),
      colorCodigo: v.color_codigo,
      color: v.color?.nombre ?? null,
      talla: v.talla?.valor ?? null,
    })),
    hermanas.map((h) => ({ productoId: h.producto_id, colorCodigo: h.color_codigo, talla: h.talla?.valor ?? null, activo: h.activo })),
  );
}
