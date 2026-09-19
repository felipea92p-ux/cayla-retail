import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getEjesPorCategoria, type EjesPorCategoria, type ValorVocabulario } from "@/lib/catalogo-v2";
import { hoyLima, vigenciaDe } from "@/lib/etiqueta-vigencia";
import type { ColorAlta } from "@/lib/alta-producto";

// Todo lo que "Nuevo producto" necesita leer, en una sola pasada (ADR-0109).
//
// CONTRATO
//   PROMETE: una foto de solo lectura del catálogo para armar el árbol
//            familia → categoría → atributos, y de lo que la persona ya hizo
//            antes (colores más usados y último costo por categoría).
//   ASUME:   quien llama ya verificó que es Líder; esto no decide permisos.
//   NO HACE: no escribe, y "último costo"/"más usados" son SUGERENCIAS sobre
//            las últimas 2.000 variantes creadas — no un dato contable.
//
// POR QUÉ 2.000 Y NO TODO: hoy hay ~150 variantes; en 3 años, unas 10.000.
// Traerlas todas en cada apertura del formulario para contar colores sería
// trabajo tirado, y lo reciente pesa más que lo viejo (un color que se usó
// hace dos años no debería competir con el de esta temporada).

export type FamiliaAlta = { codigo: string; nombre: string; exigeTejidoPatron: boolean };
export type CategoriaAlta = { id: string; nombre: string; familia: string | null; prefijo: string | null; padreNombre: string | null };
export type EtiquetaAlta = { id: string; nombre: string; estilo: string };

export type ContextoAlta = {
  familias: FamiliaAlta[];
  categorias: CategoriaAlta[];
  colores: ColorAlta[];
  /** categoriaId → color_codigo → cuántas variantes recientes lo usan. */
  usoColores: Record<string, Record<string, number>>;
  /** categoriaId → costo de la última variante con costo (> 0) de esa categoría. */
  costoSugerido: Record<string, { costo: number; referencia: string }>;
  /** prefijo → último correlativo asignado (el próximo código es ultimo + 1). */
  correlativos: Record<string, number>;
  etiquetas: EtiquetaAlta[];
  ejes: EjesPorCategoria;
  /** Todo el vocabulario aprobado: para configurar una categoría sin salir del alta. */
  universo: { tallas: ValorVocabulario[]; tejidos: ValorVocabulario[]; patrones: ValorVocabulario[] };
};

const VENTANA_VARIANTES = 2000;

export async function getContextoAlta(): Promise<ContextoAlta> {
  const supabase = await createClient();
  const [resFamilias, resCategorias, resColores, resVariantes, resCorrelativos, resEtiquetas, resTallas, resTejidos, resPatrones, ejes] =
    await Promise.all([
      supabase.from("familias").select("codigo, nombre, exige_tejido_patron").eq("activo", true).order("orden"),
      supabase.from("categorias").select("id, nombre, familia, prefijo, categoria_padre_id").eq("activo", true).order("nombre"),
      supabase.from("colores").select("codigo, nombre, hex, familia_color").eq("activo", true).order("orden"),
      supabase
        .from("variantes")
        .select("color_codigo, costo, created_at, producto:productos!inner ( categoria_id, referencia )")
        .order("created_at", { ascending: false })
        .limit(VENTANA_VARIANTES),
      supabase.from("codigos_correlativos").select("prefijo, ultimo"),
      supabase
        .from("etiquetas")
        .select("id, nombre, estilo, vigente_desde, vigente_hasta")
        .eq("activo", true)
        .eq("estado", "aprobado")
        .order("nombre"),
      supabase.from("tallas").select("id, valor").eq("activo", true).eq("estado", "aprobado").order("valor"),
      supabase.from("tejidos").select("id, nombre").eq("activo", true).eq("estado", "aprobado").order("nombre"),
      supabase.from("patrones").select("id, nombre").eq("activo", true).eq("estado", "aprobado").order("nombre"),
      getEjesPorCategoria(),
    ]);

  const categoriasCrudas = exigir(resCategorias, "las categorías del catálogo");
  const nombrePorId = new Map(categoriasCrudas.map((c) => [c.id, c.nombre]));

  const usoColores: ContextoAlta["usoColores"] = {};
  const costoSugerido: ContextoAlta["costoSugerido"] = {};
  // Vienen del más nuevo al más viejo: la primera variante con costo de cada categoría es la última que se cargó.
  for (const v of exigir(resVariantes, "las variantes recientes")) {
    const categoriaId = v.producto?.categoria_id;
    if (!categoriaId) continue;
    if (v.color_codigo) {
      const porColor = (usoColores[categoriaId] ??= {});
      porColor[v.color_codigo] = (porColor[v.color_codigo] ?? 0) + 1;
    }
    if (v.costo > 0 && !costoSugerido[categoriaId]) {
      costoSugerido[categoriaId] = { costo: Number(v.costo), referencia: v.producto?.referencia ?? "" };
    }
  }

  const correlativos: Record<string, number> = {};
  for (const c of exigir(resCorrelativos, "los correlativos de código")) correlativos[c.prefijo] = c.ultimo;

  const hoy = hoyLima();
  const etiquetas = exigir(resEtiquetas, "las etiquetas del catálogo")
    // Una campaña ya terminada no se ofrece para una prenda nueva.
    .filter((e) => vigenciaDe(e.vigente_desde, e.vigente_hasta, hoy)?.estado !== "terminada")
    .map((e) => ({ id: e.id, nombre: e.nombre, estilo: e.estilo }));

  return {
    familias: exigir(resFamilias, "las familias del catálogo").map((f) => ({
      codigo: f.codigo,
      nombre: f.nombre,
      exigeTejidoPatron: f.exige_tejido_patron,
    })),
    categorias: categoriasCrudas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      familia: c.familia,
      prefijo: c.prefijo,
      padreNombre: c.categoria_padre_id ? (nombrePorId.get(c.categoria_padre_id) ?? null) : null,
    })),
    colores: exigir(resColores, "los colores del vocabulario").map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      hex: c.hex,
      familiaColor: c.familia_color ?? "",
    })),
    usoColores,
    costoSugerido,
    correlativos,
    etiquetas,
    ejes,
    universo: {
      tallas: exigir(resTallas, "las tallas aprobadas").map((t) => ({ id: t.id, texto: t.valor })),
      tejidos: exigir(resTejidos, "los tejidos aprobados").map((t) => ({ id: t.id, texto: t.nombre })),
      patrones: exigir(resPatrones, "los patrones aprobados").map((t) => ({ id: t.id, texto: t.nombre })),
    },
  };
}
