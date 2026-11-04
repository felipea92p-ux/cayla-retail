import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Lectura } from "@/lib/cuentas-dinero";
import { fotoPrincipal } from "@/lib/inventario-reglas";
import { leerRanking, ordenarTallas, POR_PAGINA, type FiltrosRanking, type PeriodoRanking, type Ranking } from "@/lib/reportes-ranking-reglas";

// Ventas ▸ Reportes ▸ Ranking de prendas: las lecturas (`fn_reporte_ventas_ranking`, 20261103235000, y los catálogos de los filtros). Lo que ve la
// cuenta lo decide la base: el líder, todas las tiendas; quien tiene el módulo en su rol, la suya. Si una lectura falla, la pantalla se dibuja igual y
// lo dice (principio 9): nunca un ranking a medias. Nada de costo ni de margen.

/** `sinAcceso`: la cuenta no tiene el módulo `reportes_ventas` (`42501`). La puerta de la pantalla ya lo frena; esto cubre lo que llegue por otro camino. */
export async function getRanking(f: FiltrosRanking, p: PeriodoRanking, porPagina: number = POR_PAGINA): Promise<Lectura<Ranking | null> & { sinAcceso: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_reporte_ventas_ranking" as never,
    {
      p_desde: p.desde,
      p_hasta: p.hasta,
      p_ubicacion: f.tienda,
      p_categoria: f.categoria,
      p_marca: f.marca,
      p_talla: f.talla,
      p_color: f.color,
      p_busqueda: f.q || null,
      p_nivel: f.nivel,
      p_orden: f.orden,
      p_pagina: f.pagina,
      p_por_pagina: porPagina,
    } as never,
  );
  if (error) return { datos: null, falla: `No se pudo leer el ranking: ${error.message}`, sinAcceso: (error as { code?: string }).code === "42501" };
  const r = leerRanking(data);
  if (!r) return { datos: null, falla: "El ranking llegó en una forma que no se entiende.", sinAcceso: false };
  return { datos: r, falla: null, sinAcceso: false };
}

/** Lo que se puede elegir en los filtros. */
export type OpcionesRanking = {
  categorias: { id: string; nombre: string }[];
  marcas: { id: string; nombre: string }[];
  tallas: { id: string; valor: string }[];
  colores: { codigo: string; nombre: string }[];
};
const VACIAS: OpcionesRanking = { categorias: [], marcas: [], tallas: [], colores: [] };

/** Los catálogos de los filtros (solo lo activo). Si uno falla, ese filtro no se ofrece y el resto sigue: el ranking no depende de ellos. */
export async function getOpcionesRanking(): Promise<Lectura<OpcionesRanking>> {
  const supabase = await createClient();
  const [cat, mar, tal, col] = await Promise.all([
    supabase.from("categorias").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("tallas").select("id, valor").eq("activo", true),
    supabase.from("colores").select("codigo, nombre").eq("activo", true).order("nombre"),
  ]);
  const falla = [cat.error && "categorías", mar.error && "marcas", tal.error && "tallas", col.error && "colores"].filter(Boolean).join(", ");
  return {
    datos: {
      categorias: cat.data ?? VACIAS.categorias,
      marcas: mar.data ?? VACIAS.marcas,
      tallas: ordenarTallas((tal.data ?? []).map((t) => ({ talla: t.valor, id: t.id }))).map((t) => ({ id: t.id, valor: t.talla })),
      colores: col.data ?? VACIAS.colores,
    },
    falla: falla ? `No se pudieron leer los filtros de: ${falla}.` : null,
  };
}

/** La foto principal de cada modelo que se ve en la página (una consulta chica, de a lo más una página de filas). Sin foto o si falla: el mosaico de siempre. */
export async function getFotosDeModelos(productoIds: readonly string[]): Promise<Map<string, string>> {
  const salida = new Map<string, string>();
  if (productoIds.length === 0) return salida;
  const supabase = await createClient();
  const { data } = await supabase.from("producto_fotos").select("producto_id, url, orden, es_principal").in("producto_id", [...productoIds]);
  const porProducto = new Map<string, { url: string; orden: number; es_principal: boolean }[]>();
  for (const f of data ?? []) porProducto.set(f.producto_id, [...(porProducto.get(f.producto_id) ?? []), { url: f.url, orden: f.orden, es_principal: f.es_principal }]);
  for (const [id, fotos] of porProducto) {
    const url = fotoPrincipal(fotos);
    if (url) salida.set(id, url);
  }
  return salida;
}

/** Cuántas filas se piden por vuelta al descargar (el máximo de la función) y hasta cuántas se entregan. */
const POR_PAGINA_DE_DESCARGA = 50;
export const TOPE_DE_DESCARGA = 1000;

/**
 * El ranking COMPLETO con los filtros puestos (todas las páginas), para descargarlo. Un archivo cortado que parece completo es peor que ninguno
 * (ADR-0230): si hay más de `TOPE_DE_DESCARGA` filas no se arma, y `truncado` lo dice para pedir un filtro. Si una vuelta falla a la mitad, falla todo.
 */
export async function getRankingCompleto(f: FiltrosRanking, p: PeriodoRanking): Promise<Lectura<Ranking | null> & { sinAcceso: boolean; truncado: boolean }> {
  const primera = await getRanking({ ...f, pagina: 0 }, p, POR_PAGINA_DE_DESCARGA);
  if (!primera.datos) return { ...primera, truncado: false };
  const total = primera.datos.cuantos;
  if (total > TOPE_DE_DESCARGA) return { ...primera, truncado: true };
  const filas = [...primera.datos.filas];
  for (let pagina = 1; filas.length < total; pagina++) {
    const siguiente = await getRanking({ ...f, pagina }, p, POR_PAGINA_DE_DESCARGA);
    if (!siguiente.datos || siguiente.datos.filas.length === 0) return { ...siguiente, datos: null, falla: siguiente.falla ?? "El ranking se cortó a la mitad.", truncado: false };
    filas.push(...siguiente.datos.filas);
  }
  return { datos: { ...primera.datos, filas }, falla: null, sinAcceso: false, truncado: false };
}
