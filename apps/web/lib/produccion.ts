import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional, leerTodas } from "@/lib/resultado";
import { compararTallas } from "@/lib/tallas";

// Producción del Taller (restaurada 2026-09-15 sobre V2). Solo lecturas: toda
// escritura pasa por las RPC de `20260915130000_produccion_del_taller.sql`
// (abrir / set_etapa / cerrar / anular / revertir), que son la única puerta —
// las tablas no tienen policy de insert/update/delete. Mismo patrón que
// `devoluciones.ts`: la pantalla lee con `exigir()` porque una orden que no
// se muestra es stock que nadie sabe que existe.

export type { EtapaClave, EstadoEtapa, EstadoOrden } from "@/lib/produccion-reglas";
import type { EtapaClave, EstadoEtapa, EstadoOrden } from "@/lib/produccion-reglas";

export type LineaOrden = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  cantidadPlan: number;
  /** null mientras la orden está en proceso. */
  cantidadBuenas: number | null;
};

export type OrdenProduccion = {
  id: string;
  productoId: string;
  referencia: string;
  categoria: string | null;
  estado: EstadoOrden;
  esMuestra: boolean;
  etapas: Partial<Record<EtapaClave, EstadoEtapa>>;
  costoTela: number;
  costoAvios: number;
  costoMaquila: number;
  cantidadPlan: number;
  cantidadBuenas: number | null;
  /** Generado por la base: costos ÷ buenas (o ÷ plan mientras no cierre). */
  costoUnitario: number;
  /** Precio de venta del modelo (el mayor entre sus variantes), para el
   *  semáforo de margen. 0 si el modelo aún no tiene precio. */
  precioVenta: number;
  fechaEntrega: string | null;
  nota: string | null;
  inventariadoEn: string | null;
  creadoEn: string;
  lineas: LineaOrden[];
};

export type Taller = { id: string; nombre: string };

/** El Taller: la única ubicación con `tipo = 'taller'`. `abrir_produccion`
 *  rechaza cualquier otra, así que sin Taller activo no hay módulo. */
export async function getTaller(): Promise<Taller | null> {
  const supabase = await createClient();
  return exigirOpcional(
    await supabase.from("ubicaciones").select("id, nombre").eq("tipo", "taller").eq("activo", true).limit(1).maybeSingle(),
    "el Taller"
  );
}

/** Órdenes del Taller, las más recientes primero. `limite` acota las
 *  terminadas/anuladas — las en proceso siempre vienen todas.
 *
 *  Los cuatro costos (tela, avíos, maquila y unitario) NO se leen de la tabla: desde F4e (D-G) `authenticated` no tiene SELECT sobre esas
 *  columnas (migración 20260921151000). Con `conCostos` (solo el líder) llegan por `fn_costos_producciones`; sin él quedan en 0 y la
 *  pantalla, que ya los oculta a quien no es líder, no los muestra. */
export async function getOrdenesProduccion(tallerId: string, opciones: { conCostos: boolean; limite?: number } = { conCostos: false }): Promise<OrdenProduccion[]> {
  const limite = opciones.limite ?? 60;
  const supabase = await createClient();
  const costos = new Map(
    opciones.conCostos
      ? exigir(await supabase.rpc("fn_costos_producciones", { p_ubicacion_id: tallerId }), "los costos de las órdenes").map((c) => [c.produccion_id, c])
      : []
  );
  const filas = exigir(
    await supabase
      .from("producciones")
      .select(
        `id, producto_id, estado, es_muestra, etapas,
         cantidad_plan, cantidad_buenas, fecha_entrega, nota, inventariado_at, created_at,
         producto:productos ( referencia, categoria:categorias ( nombre ), variantes ( precio ) ),
         lineas:produccion_lineas (
           variante_id, cantidad_plan, cantidad_buenas,
           variante:variantes ( sku, talla:tallas ( valor ), color:colores ( nombre, hex ) )
         )`
      )
      .eq("ubicacion_id", tallerId)
      .order("created_at", { ascending: false })
      .limit(limite),
    "las órdenes de producción"
  );

  return filas.map((p) => ({
    id: p.id,
    productoId: p.producto_id,
    referencia: p.producto?.referencia ?? "(modelo)",
    categoria: p.producto?.categoria?.nombre ?? null,
    estado: p.estado as EstadoOrden,
    esMuestra: p.es_muestra,
    etapas: (p.etapas ?? {}) as OrdenProduccion["etapas"],
    costoTela: Number(costos.get(p.id)?.costo_tela ?? 0),
    costoAvios: Number(costos.get(p.id)?.costo_avios ?? 0),
    costoMaquila: Number(costos.get(p.id)?.costo_maquila ?? 0),
    cantidadPlan: p.cantidad_plan,
    cantidadBuenas: p.cantidad_buenas,
    costoUnitario: Number(costos.get(p.id)?.costo_unitario ?? 0),
    precioVenta: Math.max(0, ...(p.producto?.variantes ?? []).map((v) => Number(v.precio))),
    fechaEntrega: p.fecha_entrega,
    nota: p.nota,
    inventariadoEn: p.inventariado_at,
    creadoEn: p.created_at,
    lineas: (p.lineas ?? [])
      .map((l) => ({
        varianteId: l.variante_id,
        sku: l.variante?.sku ?? "",
        talla: l.variante?.talla?.valor ?? null,
        color: l.variante?.color?.nombre ?? null,
        colorHex: l.variante?.color?.hex ?? null,
        cantidadPlan: l.cantidad_plan,
        cantidadBuenas: l.cantidad_buenas,
      }))
      .sort(compararLineas),
  }));
}

export type VarianteDeModelo = {
  varianteId: string;
  sku: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  precio: number;
};

export type ModeloProducible = {
  productoId: string;
  referencia: string;
  categoria: string | null;
  variantes: VarianteDeModelo[];
};

/** Modelos con sus variantes activas, para el formulario de nueva orden. Un
 *  modelo sin variantes activas no se puede producir (no habría a qué talla
 *  sumarle stock), así que no se lista. */
export async function getModelosProducibles(): Promise<ModeloProducible[]> {
  const supabase = await createClient();
  // Por páginas con orden único (ADR-0192): los modelos crecen con el catálogo y PostgREST corta en 1.000 sin avisar —
  // un modelo fuera de la página no se podría producir. Las variantes embebidas no cuentan para el tope.
  const filas = exigir(
    await leerTodas((desde, hasta) =>
      supabase
        .from("productos")
        .select(
          `id, referencia, categoria:categorias ( nombre ),
           variantes ( id, sku, talla:tallas ( valor ), precio, activo, color:colores ( nombre, hex ) )`
        )
        .order("referencia")
        .order("id")
        .range(desde, hasta)
    ),
    "los modelos del catálogo"
  );

  return filas
    .map((p) => ({
      productoId: p.id,
      referencia: p.referencia,
      categoria: p.categoria?.nombre ?? null,
      variantes: (p.variantes ?? [])
        .filter((v) => v.activo)
        .map((v) => ({
          varianteId: v.id,
          sku: v.sku ?? "",
          talla: v.talla?.valor ?? null,
          color: v.color?.nombre ?? null,
          colorHex: v.color?.hex ?? null,
          precio: Number(v.precio),
        }))
        .sort(compararLineas),
    }))
    .filter((m) => m.variantes.length > 0);
}

/** Color primero, talla en orden canónico (S · M · L) — como el Taller
 *  arma la curva sobre la mesa de corte. */
function compararLineas(a: { color: string | null; talla: string | null }, b: { color: string | null; talla: string | null }): number {
  const porColor = (a.color ?? "").localeCompare(b.color ?? "", "es");
  if (porColor !== 0) return porColor;
  return compararTallas(a.talla ?? "", b.talla ?? "");
}
