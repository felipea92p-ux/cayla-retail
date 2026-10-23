import type { createClient as crearCliente } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional, leerTodas } from "@/lib/resultado";
import {
  armarEtiquetas,
  empresaDeEtiqueta,
  fechaDeAlcance,
  iconosPorVariante,
  mejorCampanaPorVariante,
  sumarEntradas,
  type CampanaDeVariante,
  type EmpresaEtiqueta,
  type EtiquetaDeLaPrenda,
  type EtiquetaPrecio,
} from "@/lib/etiqueta-precio-reglas";
import { vigenciaDe, type Vigencia } from "@/lib/etiqueta-vigencia";
import { fondoDeMuestra } from "@/lib/colores-familias";
import { getPreciosPorSede } from "@/lib/precios-sede-datos";

type Cliente = Awaited<ReturnType<typeof crearCliente>>;

/** De dónde vienen las prendas a etiquetar:
 *  - `lotes`: los de un ingreso (Recibir o Ingreso sin comprobante); una etiqueta por unidad que entró.
 *  - `produccion`: una producción cerrada del Taller; una por prenda buena.
 *  - `campana`: las prendas que una campaña alcanza y que hay en la tienda; una por unidad en stock.
 *  - `producto`: las tallas y colores de un modelo que hay en la tienda; una por unidad en stock. */
export type OrigenEtiquetas =
  /** `ubicacionId` en todos: la etiqueta sale con el precio de la tienda donde se imprime (precio propio, Felipe 2026-10-09). */
  | { tipo: "lotes"; ids: string[]; ubicacionId: string }
  | { tipo: "produccion"; id: string; ubicacionId: string }
  | { tipo: "campana"; id: string; ubicacionId: string }
  | { tipo: "producto"; id: string; ubicacionId: string }
  /** Tallas sueltas, las marcadas en Existencias (ADR-0237); una por unidad en stock, como `producto`. Con `unidades` (lo que
   *  acaba de entrar desde Editar producto), una por unidad NUEVA: las que ya estaban en la tienda ya tienen la suya. */
  | { tipo: "variantes"; ids: string[]; ubicacionId: string; unidades?: ReadonlyMap<string, number> };

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
 * descuento exacto que cobra la caja (ADR-0302).
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
  } else if (origen.tipo === "variantes") {
    entradas = origen.unidades ? new Map(origen.unidades) : origen.ids.length > 0 ? await stockEnTienda(supabase, origen.ubicacionId, origen.ids) : new Map();
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
    const alcance = await campanasDe(supabase, fechaDeAlcance(e.vigente_desde, e.vigente_hasta, hoy), [...stock.keys()], origen.ubicacionId);
    const suyas = new Set(alcance.filter((f) => f.etiqueta_id === e.id).map((f) => f.variante_id));
    entradas = new Map([...stock].filter(([id]) => suyas.has(id)));
  }
  if (entradas.size === 0) return { etiquetas: [], sinCodigo: [], ...extra };

  const variantes = exigir(
    await supabase
      .from("variantes")
      .select(
        "id, producto_id, codigo, sku, precio, color_codigo, talla:tallas ( valor ), color:colores ( nombre, hex, familia_color, tipo ), producto:productos ( referencia, categoria_id, empresa_id, marca:marcas ( nombre ) ), variante_etiquetas ( etiqueta_id )",
      )
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
  // Y el precio de ESTA tienda (precio propio, Felipe 2026-10-09): la etiqueta que se imprime aquí dice lo que cobra la caja de aquí.
  const [campanas, preciosSede, empresas] = await Promise.all([
    campanasQueCobra(supabase, hoy, [...entradas.keys()], origen.ubicacionId),
    getPreciosPorSede([origen.ubicacionId]),
    getEmpresasDelPapel(supabase),
  ]);
  const propios = preciosSede[origen.ubicacionId] ?? {};

  // Los íconos de las etiquetas comerciales de cada prenda (Felipe, 2026-09-29): las elegidas a mano y las que la alcanzan
  // por su categoría, con o sin descuento. La ganadora del precio sigue siendo la de `campanas`, la misma de la caja.
  const { conDescuento: iconos, sinDescuento: iconosSinDescuento } = await iconosDeLasPrendas(supabase, variantes, campanas, hoy);

  return {
    ...armarEtiquetas(
      entradas,
      variantes.map((v) => ({
        id: v.id,
        productoId: v.producto_id,
        prenda: v.producto?.referencia ?? "",
        codigo: v.codigo,
        sku: v.sku,
        precio: propios[v.id] ?? Number(v.precio),
        colorCodigo: v.color_codigo,
        color: v.color?.nombre ?? null,
        colorMuestra: fondoDeMuestra(v.color?.hex ?? null, v.color?.familia_color, v.color?.tipo) ?? null,
        talla: v.talla?.valor ?? null,
        marca: v.producto?.marca?.nombre ?? null,
        empresa: (v.producto?.empresa_id ? empresas.get(v.producto.empresa_id) : null) ?? null,
      })),
      hermanas.map((h) => ({ productoId: h.producto_id, colorCodigo: h.color_codigo, talla: h.talla?.valor ?? null, activo: h.activo })),
      campanas,
      iconos,
      iconosSinDescuento,
    ),
    ...extra,
  };
}

/** Cómo dice el papel cada empresa (ADR-0463): id → nombre, colibrí solo de CAYLA y link. Si la base todavía no tiene `fn_empresas()`
 *  (la migración se pega antes o después de la web) o no responde, queda vacío y TODAS salen como CAYLA, como siempre: nunca se cae. */
async function getEmpresasDelPapel(supabase: Cliente): Promise<Map<string, EmpresaEtiqueta>> {
  const { data, error } = await supabase.rpc("fn_empresas");
  if (error || !data) return new Map();
  return new Map(data.map((e) => [e.id, empresaDeEtiqueta(e)] as const));
}

/** Qué íconos lleva el papel de cada prenda. Son tres lecturas chicas y ninguna crece con el envío: las etiquetas a mano
 *  vienen embebidas en la propia variante, y las de categoría y el catálogo se piden por unas pocas ids (hay ~20). Solo
 *  cuentan las aprobadas y activas, como en `fn_campanas_por_variante`. */
async function iconosDeLasPrendas(
  supabase: Cliente,
  variantes: { id: string; producto: { categoria_id: string | null } | null; variante_etiquetas: { etiqueta_id: string }[] | null }[],
  campanas: ReturnType<typeof mejorCampanaPorVariante>,
  hoy: string,
) {
  const categoriaIds = [...new Set(variantes.flatMap((v) => (v.producto?.categoria_id ? [v.producto.categoria_id] : [])))];
  const deCategoria =
    categoriaIds.length === 0
      ? []
      : exigir(await supabase.from("etiqueta_categorias").select("etiqueta_id, categoria_id").in("categoria_id", categoriaIds), "las etiquetas por categoría");
  const directas = new Map(variantes.map((v) => [v.id, (v.variante_etiquetas ?? []).map((e) => e.etiqueta_id)] as const));
  const porCategoria = new Map<string, string[]>();
  for (const f of deCategoria) porCategoria.set(f.categoria_id, [...(porCategoria.get(f.categoria_id) ?? []), f.etiqueta_id]);

  const ids = [...new Set([...directas.values(), ...porCategoria.values()].flat())];
  const catalogo = new Map<string, Omit<EtiquetaDeLaPrenda, "etiquetaId">>(
    ids.length === 0
      ? []
      : exigir(
          await supabase.from("etiquetas").select("id, nombre, descuento_pct, vigente_desde, vigente_hasta").in("id", ids).eq("estado", "aprobado").eq("activo", true),
          "las etiquetas de las prendas",
        ).map((e) => [e.id, { nombre: e.nombre, pct: e.descuento_pct === null ? null : Number(e.descuento_pct), desde: e.vigente_desde, hasta: e.vigente_hasta }] as const),
  );
  const prendas = variantes.map((v) => ({ id: v.id, categoriaId: v.producto?.categoria_id ?? null }));
  // Las dos versiones salen de las mismas lecturas: la de siempre y la que se imprime «sin el descuento» (`sinDescuento`).
  return {
    conDescuento: iconosPorVariante(prendas, directas, porCategoria, catalogo, campanas, hoy),
    sinDescuento: iconosPorVariante(prendas, directas, porCategoria, catalogo, campanas, hoy, true),
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

/** La campaña que cobra la caja en `fecha` por prenda, con hasta cuándo rige: de las que alcanzan a cada una (la MISMA función de la
 *  caja), la de mayor %; a igual %, por nombre. La leen la etiqueta de papel y Catálogo (ADR-0472). Lanza si la base no responde: el
 *  papel no se imprime con un precio dudoso, y Catálogo la tolera mostrando el precio de lista.
 *  Con `ubicacionId` (la etiqueta de papel: se imprime EN una tienda) rigen también las campañas limitadas a esa tienda (ADR-0486,
 *  `fn_campanas_en_sede`): sin ella, la etiqueta de Tienda TRU no veía el Aniversario de solo-TRU y la caja sí lo cobraba (Felipe,
 *  2026-10-23). Sin `ubicacionId` (Catálogo, que no sabe de qué tienda habla) solo rigen las de todas las sedes. */
export async function campanasQueCobra(supabase: Cliente, fecha: string, varianteIds: string[], ubicacionId?: string): Promise<Map<string, CampanaDeVariante>> {
  const filas = await campanasDe(supabase, fecha, varianteIds, ubicacionId);
  const etiquetaIds = [...new Set(filas.map((f) => f.etiqueta_id))];
  const hastas = new Map(
    etiquetaIds.length === 0
      ? []
      : exigir(await supabase.from("etiquetas").select("id, vigente_hasta").in("id", etiquetaIds), "hasta cuándo rigen las campañas").map((e) => [e.id, e.vigente_hasta] as const),
  );
  return mejorCampanaPorVariante(filas, hastas);
}

/** Las campañas que rigen en `fecha` sobre esas prendas: la MISMA función que usa la caja. Con `ubicacionId`, las de esa tienda
 *  (`fn_campanas_en_sede`); sin ella, solo las de todas las sedes (`fn_campanas_por_variante`, que delega con sede nula). */
async function campanasDe(supabase: Cliente, fecha: string, varianteIds: string[], ubicacionId?: string) {
  if (varianteIds.length === 0) return [];
  return exigir(
    await leerTodas((desde, hasta) =>
      (ubicacionId
        ? supabase.rpc("fn_campanas_en_sede", { p_hoy: fecha, p_tolerancia_dias: 0, p_variante_ids: varianteIds, p_ubicacion_id: ubicacionId })
        : supabase.rpc("fn_campanas_por_variante", { p_hoy: fecha, p_tolerancia_dias: 0, p_variante_ids: varianteIds })
      )
        .order("variante_id")
        .order("etiqueta_id")
        .range(desde, hasta),
    ),
    "las campañas de esas prendas",
  );
}
