import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";
import type { FilaPrevisualizacion } from "@/lib/conteo-varianza";
import { getAparienciaVariantes, type Apariencia } from "@/lib/apariencia-variantes";
import { fotoPrincipal } from "@/lib/inventario-reglas";
import { getCostosVariantes } from "@/lib/catalogo-v2";
import { codigoDeEtiqueta } from "@/lib/prenda-reglas";
import { prioridadDesdeFila } from "@/lib/conteo-reglas";

// Conteos físicos (Felipe, 2026-09-14): abrir_conteo/conteo_contar/cerrar_conteo
// ya existían y siguen probados intactos — este archivo solo trae lecturas.
// La única pieza nueva de verdad es `previsualizar_cierre_conteo`
// (0015_previsualizar_conteo.sql), que alimenta `resumirVarianza()`
// (conteo-varianza.ts), ya escrita y ya probada antes de esta tarea.

export type ItemConteoAbierto = {
  id: string;
  varianteId: string;
  /** El código de la etiqueta (`codigoDeEtiqueta`), no `variantes.sku`: 128 de 130 lo tienen NULL (ADR-0058). Solo se muestra. */
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  /** Lo anotado. A propósito SIN la cantidad del sistema: esto viaja al navegador de quien cuenta, y el conteo es a
   *  ciegas hasta revisar (ADR-0174). La diferencia la calcula `previsualizar_cierre_conteo` al revisar. */
  cantidadContada: number;
};

export type ConteoAbierto = {
  id: string;
  /** Número corrido (20260916200000): «Conteo 7». */
  numero: number;
  ubicacionId: string;
  // null: conteo de toda la ubicación (Taller, o una tienda antes de
  // 20260914210000_inventario_piso_almacen.sql). Con piso/almacén
  // configurado, abrir_conteo ya no deja abrir uno así — siempre viene con
  // sububicación.
  sububicacionId: string | null;
  sububicacionNombre: string | null;
  creadoEn: string;
  abiertoPorNombre: string;
  /** `todo` o `categoria` (20260916110000); con categoría, su nombre. */
  alcance: string;
  alcanceCategoriaNombre: string | null;
  items: ItemConteoAbierto[];
};

export async function getConteoAbierto(ubicacionId: string): Promise<ConteoAbierto | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("conteos")
    .select("id, numero, ubicacion_id, created_at, abierto_por, alcance, sububicacion:sububicaciones ( id, nombre ), categoria:categorias ( nombre )")
    .eq("ubicacion_id", ubicacionId)
    .eq("estado", "abierto")
    .maybeSingle();
  const conteo = exigirOpcional(res, "el conteo abierto");
  if (!conteo) return null;

  const [itemsRes, nombreRes] = await Promise.all([
    supabase
      .from("conteo_items")
      .select(
        `id, variante_id, cantidad_contada,
         variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) )`
      )
      .eq("conteo_id", conteo.id)
      .order("id"),
    conteo.abierto_por
      ? supabase.rpc("fn_nombres_personas", { p_ids: [conteo.abierto_por] })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const items = exigir(itemsRes, "los ítems ya contados");
  const nombres = exigir(nombreRes, "el nombre de quien abrió el conteo");

  return {
    id: conteo.id,
    numero: conteo.numero,
    ubicacionId: conteo.ubicacion_id,
    sububicacionId: conteo.sububicacion?.id ?? null,
    sububicacionNombre: conteo.sububicacion?.nombre ?? null,
    creadoEn: conteo.created_at,
    abiertoPorNombre: nombres[0]?.nombre ?? "—",
    alcance: conteo.alcance,
    alcanceCategoriaNombre: conteo.categoria?.nombre ?? null,
    items: items.map((i) => ({
      id: i.id,
      varianteId: i.variante_id,
      sku: i.variante ? codigoDeEtiqueta(i.variante) : "",
      referencia: i.variante?.producto?.referencia ?? "",
      talla: i.variante?.talla?.valor ?? null,
      color: i.variante?.color?.nombre ?? null,
      cantidadContada: i.cantidad_contada,
    })),
  };
}

export type ConteoResumen = {
  id: string;
  numero: number;
  estado: string;
  creadoEn: string;
  cerradoEn: string | null;
  sububicacionNombre: string | null;
  sububicacionTipo: string | null;
  alcance: string;
  alcanceCategoriaNombre: string | null;
  abiertoPorNombre: string;
  cerradoPorNombre: string;
  lineas: number;
  lineasConDiferencia: number;
  sistema: number;
  contado: number;
  /** contado − sistema, en unidades: negativo = faltó. */
  diferencia: number;
  /** La misma diferencia valorizada al costo actual de cada variante. null = esta cuenta no ve el dinero (20260923193700). */
  solesDiferencia: number | null;
};

/** Los conteos de una ubicación con su resultado ya sumado — el abierto (si
 *  hay) primero, después los cerrados del más reciente al más antiguo.
 *  `fn_conteos_resumen` (20260916200000) hace la suma en Postgres: traer los
 *  `conteo_items` de cada conteo solo para mostrar un total sería cargar
 *  miles de filas por pantalla. */
export async function getConteosResumen(ubicacionId: string, limite = 20): Promise<ConteoResumen[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_conteos_resumen", { p_ubicacion_id: ubicacionId, p_limite: limite }), "los conteos");
  if (filas.length === 0) return [];

  const ids = [...new Set(filas.flatMap((c) => [c.abierto_por, c.cerrado_por]).filter((id): id is string => !!id))];
  const nombres = ids.length > 0 ? exigir(await supabase.rpc("fn_nombres_personas", { p_ids: ids }), "los nombres de responsables") : [];
  const nombrePorId = new Map(nombres.map((n) => [n.id, n.nombre]));

  return filas.map((c) => ({
    id: c.id,
    numero: c.numero,
    estado: c.estado,
    creadoEn: c.created_at,
    cerradoEn: c.cerrado_en,
    sububicacionNombre: c.sububicacion_nombre,
    sububicacionTipo: c.sububicacion_tipo,
    alcance: c.alcance,
    alcanceCategoriaNombre: c.alcance_categoria_nombre,
    abiertoPorNombre: (c.abierto_por && nombrePorId.get(c.abierto_por)) || "—",
    cerradoPorNombre: (c.cerrado_por && nombrePorId.get(c.cerrado_por)) || "—",
    lineas: c.lineas,
    lineasConDiferencia: c.lineas_con_diferencia,
    sistema: c.sistema,
    contado: c.contado,
    diferencia: c.diferencia,
    solesDiferencia: c.soles_diferencia === null ? null : Number(c.soles_diferencia),
  }));
}

export async function getPrevisualizacionCierre(conteoId: string): Promise<FilaPrevisualizacion[]> {
  const supabase = await createClient();
  return exigir(
    await supabase.rpc("previsualizar_cierre_conteo", { p_conteo_id: conteoId }),
    "la vista previa del cierre"
  );
}

// ============================================================================
// Alcance + cadencia (20260916110000): reactiva el campo `alcance` del
// diseño "censo" (abandonado por accidente en el corte a V2) sobre la
// pantalla que SÍ está viva — `alcance` solo FILTRA la sugerencia de abajo,
// no cambia conteo_contar/cerrar_conteo.
//
// Criterio de la sugerencia (20260917130000): ordena por plata en riesgo
// (stock.cantidad × precio), no por ventas del mes — una prenda cara de
// baja rotación puede tener más plata parada en la percha que un básico
// barato que vende mucho, y antes perdía siempre contra él. Especificación
// completa en la migración y en ADR-0074.
// ============================================================================

export type PrioridadConteo = {
  varianteId: string;
  /** El código de la etiqueta (`codigoDeEtiqueta`); la función de Postgres solo trae `variantes.sku`, casi siempre NULL. */
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  /** Una variante puede tener unidades sin contar en piso Y en almacén a
   *  la vez — son dos filas reales, no una duplicada (20260918). Null en
   *  ubicaciones sin piso/almacén separado (Taller). */
  sububicacionId: string | null;
  diasSinContar: number | null;
  valorEnRiesgo: number;
  /** La miniatura y el color, con la misma regla que Existencias (`lib/apariencia-variantes.ts`).
   *  La función de Postgres no los devuelve. Ausente = no se pudieron leer: la fila se dibuja
   *  igual, sin foto y con el color en texto. */
  apariencia?: Apariencia;
};

/** Las 20 variantes que más conviene contar primero: nunca contadas antes,
 *  después por plata en riesgo (stock × precio). Acotado a una categoría si
 *  se pasa `categoriaId`. */
export async function getPrioridadConteo(ubicacionId: string, categoriaId?: string | null): Promise<PrioridadConteo[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("fn_prioridad_conteo", {
      p_ubicacion_id: ubicacionId,
      ...(categoriaId ? { p_alcance_categoria_id: categoriaId } : {}),
    }),
    "qué conviene contar primero"
  );
  const apariencia = await getAparienciaVariantes(
    supabase,
    filas.map((f) => f.variante_id)
  );
  return filas.map((f) => prioridadDesdeFila(f, apariencia.get(f.variante_id)));
}

// ============================================================================
// Detalle de un conteo cerrado (2026-09-16, diseño de Felipe): las líneas
// que se contaron, con sistema, físico y diferencia. Hasta hoy un conteo
// cerrado solo mostraba «N líneas contadas» — el detalle existía en la base
// (`conteo_items`) y no en ninguna pantalla.
// ============================================================================

export type LineaConteo = {
  varianteId: string;
  /** El código de la etiqueta (`codigoDeEtiqueta`). Se muestra y desempata el orden; la prenda se identifica por `varianteId`. */
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  /** Para dibujar la prenda como Existencias (2026-09-21): el hex de `colores.hex` y la foto
   *  principal del producto. Vienen en la misma consulta que las líneas — un conteo entero
   *  puede tener miles, y pedirlas aparte (por id, en la URL) no alcanzaría. */
  colorHex: string | null;
  fotoUrl: string | null;
  sistema: number;
  contado: number;
  diferencia: number;
  /** La diferencia al costo actual de la variante (ADR-0174: el detalle la muestra por línea). null = sin permiso de ver el dinero. */
  soles: number | null;
};

export type ConteoDetalle = ConteoResumen & { lineasDetalle: LineaConteo[] };

export async function getConteoDetalle(id: string): Promise<ConteoDetalle | null> {
  const supabase = await createClient();
  // En una `const` aparte y no inline en `exigirOpcional(await …)`: con
  // `.maybeSingle()` el tipo contextual del genérico pisa la inferencia del
  // select y `cabecera` sale `never` (mismo patrón que `getConteoAbierto`).
  const res = await supabase
    .from("conteos")
    .select(
      "id, numero, estado, created_at, cerrado_en, abierto_por, cerrado_por, alcance, sububicacion:sububicaciones ( nombre, tipo ), categoria:categorias ( nombre )"
    )
    .eq("id", id)
    .maybeSingle();
  const cabecera = exigirOpcional(res, "el conteo");
  if (!cabecera) return null;

  const ids = [cabecera.abierto_por, cabecera.cerrado_por].filter((x): x is string => !!x);
  const [itemsRes, nombresRes] = await Promise.all([
    supabase
      .from("conteo_items")
      .select(
        `variante_id, cantidad_sistema, cantidad_contada,
         variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre, hex ), producto:productos ( referencia, producto_fotos ( url, orden, es_principal ) ) )`
      )
      .eq("conteo_id", id),
    ids.length > 0 ? supabase.rpc("fn_nombres_personas", { p_ids: ids }) : Promise.resolve({ data: [], error: null }),
  ]);
  const items = exigir(itemsRes, "las líneas del conteo");
  // El costo, por la puerta que revisa el permiso (20260923193700): sin permiso, null y el detalle va en unidades.
  const costos = await getCostosVariantes(items.map((i) => i.variante_id));
  const costoDe = (varianteId: string) => costos?.get(varianteId) ?? 0;
  const nombrePorId = new Map(exigir(nombresRes, "los nombres de responsables").map((n) => [n.id, n.nombre]));

  const lineasDetalle: LineaConteo[] = items
    .map((i) => ({
      varianteId: i.variante_id,
      sku: i.variante ? codigoDeEtiqueta(i.variante) : "",
      referencia: i.variante?.producto?.referencia ?? "",
      talla: i.variante?.talla?.valor ?? null,
      color: i.variante?.color?.nombre ?? null,
      colorHex: i.variante?.color?.hex ?? null,
      fotoUrl: fotoPrincipal(i.variante?.producto?.producto_fotos),
      sistema: i.cantidad_sistema,
      contado: i.cantidad_contada,
      diferencia: i.cantidad_contada - i.cantidad_sistema,
      soles: costos ? Math.round((i.cantidad_contada - i.cantidad_sistema) * costoDe(i.variante_id) * 100) / 100 : null,
    }))
    // Las diferencias primero, las más grandes arriba; después el resto por nombre.
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || a.referencia.localeCompare(b.referencia, "es") || a.sku.localeCompare(b.sku));

  // Para UN conteo las líneas ya están en memoria: se suman acá, con el mismo
  // criterio que `fn_conteos_resumen` (diferencia = contado − sistema, soles
  // al costo actual de la variante).
  const soles = items.reduce((acc, i) => acc + (i.cantidad_contada - i.cantidad_sistema) * costoDe(i.variante_id), 0);

  return {
    id: cabecera.id,
    numero: cabecera.numero,
    estado: cabecera.estado,
    creadoEn: cabecera.created_at,
    cerradoEn: cabecera.cerrado_en,
    sububicacionNombre: cabecera.sububicacion?.nombre ?? null,
    sububicacionTipo: cabecera.sububicacion?.tipo ?? null,
    alcance: cabecera.alcance,
    alcanceCategoriaNombre: cabecera.categoria?.nombre ?? null,
    abiertoPorNombre: (cabecera.abierto_por && nombrePorId.get(cabecera.abierto_por)) || "—",
    cerradoPorNombre: (cabecera.cerrado_por && nombrePorId.get(cabecera.cerrado_por)) || "—",
    lineas: lineasDetalle.length,
    lineasConDiferencia: lineasDetalle.filter((l) => l.diferencia !== 0).length,
    sistema: lineasDetalle.reduce((acc, l) => acc + l.sistema, 0),
    contado: lineasDetalle.reduce((acc, l) => acc + l.contado, 0),
    diferencia: lineasDetalle.reduce((acc, l) => acc + l.diferencia, 0),
    solesDiferencia: costos ? Math.round(soles * 100) / 100 : null,
    lineasDetalle,
  };
}
