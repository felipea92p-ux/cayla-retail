import type { createClient as crearCliente } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional, leerTodas } from "@/lib/resultado";
import { armarEtiquetas, fechaDeAlcance, mejorCampanaPorVariante, sumarEntradas, type EtiquetaPrecio } from "@/lib/etiqueta-precio-reglas";
import { vigenciaDe, type Vigencia } from "@/lib/etiqueta-vigencia";

type Cliente = Awaited<ReturnType<typeof crearCliente>>;

/** De dónde vienen las prendas a etiquetar:
 *  - `lotes`: los de un ingreso (Recibir o Ingreso sin comprobante); una etiqueta por unidad que entró.
 *  - `produccion`: una producción cerrada del Taller; una por prenda buena.
 *  - `campana`: las prendas que una campaña alcanza y que hay en la tienda; una por unidad en stock.
 *  - `producto`: las tallas y colores de un modelo que hay en la tienda; una por unidad en stock. */
export type OrigenEtiquetas =
  | { tipo: "lotes"; ids: string[] }
  | { tipo: "produccion"; id: string }
  | { tipo: "campana"; id: string; ubicacionId: string }
  | { tipo: "producto"; id: string; ubicacionId: string };

export type EtiquetasDePrecio = {
  etiquetas: EtiquetaPrecio[];
  sinCodigo: string[];
  /** Con `?campana=`: la campaña pedida y su vigencia (decide el título). `null` si no existe o no es una campaña. */
  campana?: { nombre: string; pct: number; vigencia: Vigencia | null } | null;
  /** Con `?producto=`: el nombre del modelo. */
  producto?: string | null;
};

/**
 * Las etiquetas de precio de un origen (ADR-0180): una fila por prenda, con cuántas imprimir y el precio que la caja
 * cobra HOY. Si la prenda tiene una campaña vigente, la etiqueta la lleva (paso 2, Felipe 2026-09-23), con el mismo
 * descuento bajado al .90 que cobra la caja (ADR-0182).
 *
 * No hay función nueva en la base a propósito:
 * - Todo ingreso ya escribe sus `movimientos` de entrada con el lote o la producción (principio 4). Esto solo los lee.
 * - El stock es el de `stock`.
 * - Qué prendas alcanza una campaña lo decide `fn_campanas_por_variante`, la misma función que usa la caja.
 *
 * La seguridad es la de siempre: `movimientos_select` y `stock_select` solo dejan ver las sedes que uno opera.
 */
export async function getEtiquetasDePrecio(origen: OrigenEtiquetas, hoy: string): Promise<EtiquetasDePrecio> {
  const supabase = await createClient();
  const extra: Partial<EtiquetasDePrecio> = {};
  let entradas: Map<string, number>;

  if (origen.tipo === "lotes" || origen.tipo === "produccion") {
    // PostgREST corta en 1.000 filas SIN error (resultado.ts): se lee por páginas, con `id` como orden único.
    const movimientos = exigir(
      await leerTodas((desde, hasta) => {
        const consulta = supabase.from("movimientos").select("id, variante_id, cantidad").eq("tipo", "entrada");
        return (origen.tipo === "lotes" ? consulta.in("lote_id", origen.ids) : consulta.eq("produccion_id", origen.id)).order("id").range(desde, hasta);
      }),
      "lo que entró en este ingreso",
    );
    entradas = sumarEntradas(movimientos);
  } else if (origen.tipo === "producto") {
    // En una `const` aparte y no inline en `exigirOpcional(await …)`: con `.maybeSingle()` el tipo sale `never` (conteos.ts).
    const resProducto = await supabase.from("productos").select("referencia").eq("id", origen.id).maybeSingle();
    const producto = exigirOpcional(resProducto, "el producto");
    extra.producto = producto?.referencia ?? null;
    const ids = exigir(await supabase.from("variantes").select("id").eq("producto_id", origen.id), "las tallas y colores del producto").map((v) => v.id);
    entradas = ids.length > 0 ? await stockEnTienda(supabase, origen.ubicacionId, ids) : new Map();
  } else {
    const resCampana = await supabase
      .from("etiquetas")
      .select("id, nombre, descuento_pct, vigente_desde, vigente_hasta, estado, activo")
      .eq("id", origen.id)
      .maybeSingle();
    const e = exigirOpcional(resCampana, "la campaña");
    // Una etiqueta sin descuento no cambia ningún precio: no hay nada que reimprimir.
    if (!e || e.descuento_pct === null || e.estado !== "aprobado" || !e.activo) return { etiquetas: [], sinCodigo: [], campana: null };
    const vigencia = vigenciaDe(e.vigente_desde, e.vigente_hasta, hoy);
    extra.campana = { nombre: e.nombre, pct: Number(e.descuento_pct), vigencia };
    // Todavía no rige: la etiqueta diría el precio de hoy (sin campaña). Se imprime el día que empieza.
    if (vigencia?.estado === "proxima") return { etiquetas: [], sinCodigo: [], ...extra };
    const stock = await stockEnTienda(supabase, origen.ubicacionId, null);
    // Qué prendas de la tienda alcanza (o alcanzó, si ya terminó: para volver al precio normal).
    const alcance = await campanasDe(supabase, fechaDeAlcance(e.vigente_desde, e.vigente_hasta, hoy), [...stock.keys()]);
    const suyas = new Set(alcance.filter((f) => f.etiqueta_id === e.id).map((f) => f.variante_id));
    entradas = new Map([...stock].filter(([id]) => suyas.has(id)));
  }
  if (entradas.size === 0) return { etiquetas: [], sinCodigo: [], ...extra };

  const variantes = exigir(
    await supabase
      .from("variantes")
      .select("id, producto_id, codigo, sku, precio, color_codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia )")
      .in("id", [...entradas.keys()]),
    "las prendas a etiquetar",
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

  // La campaña de HOY de cada prenda: la etiqueta dice lo que la caja cobra hoy, venga de donde venga.
  const deHoy = await campanasDe(supabase, hoy, [...entradas.keys()]);
  const etiquetaIds = [...new Set(deHoy.map((f) => f.etiqueta_id))];
  const hastas = new Map(
    etiquetaIds.length === 0
      ? []
      : exigir(await supabase.from("etiquetas").select("id, vigente_hasta").in("id", etiquetaIds), "hasta cuándo rigen las campañas").map((e) => [e.id, e.vigente_hasta] as const),
  );

  return {
    ...armarEtiquetas(
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
      mejorCampanaPorVariante(deHoy, hastas),
    ),
    ...extra,
  };
}

/** Unidades en la tienda por prenda (todas sus sububicaciones: piso y almacén). `cantidad` es lo físico: lo apartado
 *  de una separación también está en la tienda y también lleva etiqueta (`cantidad_apartada ≤ cantidad`). */
async function stockEnTienda(supabase: Cliente, ubicacionId: string, varianteIds: string[] | null): Promise<Map<string, number>> {
  const filas = exigir(
    await leerTodas((desde, hasta) => {
      let q = supabase.from("stock").select("variante_id, sububicacion_id, cantidad").eq("ubicacion_id", ubicacionId).gt("cantidad", 0);
      if (varianteIds) q = q.in("variante_id", varianteIds);
      return q.order("variante_id").order("sububicacion_id", { nullsFirst: true }).range(desde, hasta);
    }),
    "el stock de la tienda",
  );
  return sumarEntradas(filas);
}

/** Las campañas que rigen en `fecha` sobre esas prendas: la MISMA función que usa la caja (`fn_campanas_por_variante`). */
async function campanasDe(supabase: Cliente, fecha: string, varianteIds: string[]) {
  if (varianteIds.length === 0) return [];
  return exigir(
    await leerTodas((desde, hasta) =>
      supabase
        .rpc("fn_campanas_por_variante", { p_hoy: fecha, p_tolerancia_dias: 0, p_variante_ids: varianteIds })
        .order("variante_id")
        .order("etiqueta_id")
        .range(desde, hasta),
    ),
    "las campañas de esas prendas",
  );
}
