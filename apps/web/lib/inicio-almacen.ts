import { createClient } from "@/lib/supabase/server";
import { contar, tolerarLectura } from "@/lib/inicio";
import { hoyLima } from "@/lib/etiqueta-vigencia";
import { getExistencias } from "@/lib/inventario-v2";
import { getExistenciasProductos } from "@/lib/catalogo-v2";
import { accionHoyPorVariante } from "@/lib/existencias-recomendaciones";
import { politicaDe } from "@/lib/politica-operativa-inventario";
import { getResumenTienda } from "@/lib/movimientos-v2";
import { listarPorRecibir } from "@/lib/compras";
import { getTrasladosEnCurso } from "@/lib/traslados";
import type { ClaveModulo } from "@/lib/modulos";
import {
  armarNuevos,
  avanceDelTrayecto,
  etiquetaLlegada,
  existenciasDeAlmacen,
  inicioDeAyerLima,
  siglaSede,
  type Existencias,
  type FilaNuevoCruda,
  type NuevoProducto,
  type OrigenDeProducto,
} from "@/lib/inicio-almacen-reglas";

// Lecturas del Inicio de una cuenta de Almacén (Felipe, 2026-09-30; maqueta docs/maquetas/inicio-almacen-2026-09/).
// Cada una falla POR SEPARADO y devuelve `null` («no se pudo leer»): jamás un cero que engañe (principio 9). Reutilizan las
// mismas fuentes que sus pantallas (Existencias, Traslados, Compras, Movimientos) para que el número del Inicio y el de la
// pantalla a la que lleva no puedan discrepar. Ninguna escribe.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Lo que cuenta como producto «del catálogo»: activo, no de prueba y no rechazado. Una sola definición para todas las cifras. */
function productosVigentes(supabase: Supabase, columnas: string, opciones?: { count: "exact"; head: true }) {
  return supabase
    .from("productos")
    .select(columnas, opciones)
    .eq("estado", "activo")
    .eq("es_prueba", false)
    .neq("estado_alta", "rechazado");
}

// ── «Nuevo en otras sedes» ───────────────────────────────────────────────────────────────────────

const MAX_NUEVOS = 12;

/**
 * Los productos dados de alta hoy y ayer (día de Lima), del más nuevo al más viejo, con lo que la tarjeta necesita: foto,
 * precio, colores y cuánto hay YA en la sede de quien mira. Una lectura de `productos` con sus variantes y sus fotos; lo que hay
 * en esta sede sale de `fn_existencias_productos` (`getExistenciasProductos`), la misma cifra que Existencias y el Catálogo:
 * ninguna pantalla suma la tabla `stock` por su cuenta (ADR-0270, `lib/stock-una-sola-cifra.test.ts`). Si esa función falla o
 * todavía no está en la base, solo falta ese dato (`enMiSede: null`) y la tarjeta no dice un 0 que no sabe.
 *
 * En qué sede se registró sale de `fn_producto_origen` (`producto_origen`, ADR-0292): `productos` no la guarda porque el catálogo
 * es de todas las sedes. Si la función no responde o todavía no está en la base, solo falta ese dato (`sede: null`) y la tarjeta
 * no muestra sigla; los productos anteriores a la tabla tampoco la tienen y no se les inventa una.
 * Quién lo dio de alta: `productos.propuesto_por` → `fn_nombres_personas`; si esa función falla solo falta el nombre.
 */
export async function getNuevosDelCatalogo(ubicacionId: string, ahoraMs: number = Date.now()): Promise<NuevoProducto[] | null> {
  return tolerarLectura("los productos nuevos", async () => {
    const supabase = await createClient();
    const res = await productosVigentes(
      supabase,
      `id, codigo, referencia, created_at, propuesto_por,
       producto_fotos ( url, orden, es_principal ),
       variantes ( id, precio, activo, color:colores ( nombre, hex ) )`
    )
      .gte("created_at", inicioDeAyerLima(ahoraMs))
      .order("created_at", { ascending: false })
      .limit(MAX_NUEVOS);
    if (res.error) throw new Error(res.error.message);
    const filas = (res.data ?? []) as unknown as FilaNuevoCruda[];

    const ids = [...new Set(filas.map((f) => f.propuesto_por).filter((x): x is string => !!x))];
    const nombres = new Map<string, string>();
    if (ids.length > 0) {
      const n = await supabase.rpc("fn_nombres_personas", { p_ids: ids });
      if (n.error) console.error("Inicio · no se pudieron leer los nombres de quien dio de alta:", n.error.message);
      for (const p of n.data ?? []) nombres.set(p.id, p.nombre);
    }
    const [existencias, porProducto] = await Promise.all([
      getExistenciasProductos(filas.map((f) => f.id), ubicacionId),
      getOrigenDeProductos(supabase, filas.map((f) => f.id)),
    ]);
    const aqui = existencias === null ? null : new Map([...existencias].map(([id, e]) => [id, e.aqui]));
    return armarNuevos(filas, nombres, aqui, ahoraMs, { porProducto, miUbicacionId: ubicacionId });
  });
}

/** `producto_id` → sede donde se registró (`fn_producto_origen`); `null` si la función falla o no existe todavía (nunca rompe el Inicio). */
async function getOrigenDeProductos(supabase: Supabase, ids: string[]): Promise<Map<string, OrigenDeProducto> | null> {
  if (ids.length === 0) return new Map();
  // La función es de la migración 20260930170000 (producción la recibe después): su tipo aún no está en los tipos generados.
  const res = await supabase.rpc("fn_producto_origen" as never, { p_producto_ids: ids } as never);
  if (res.error) {
    console.error("Inicio · no se pudo leer en qué sede se registró cada producto:", res.error.message);
    return null;
  }
  const filas = (res.data ?? []) as unknown as { producto_id: string; ubicacion_id: string | null; ubicacion_nombre: string | null }[];
  return new Map(filas.map((f) => [f.producto_id, { ubicacionId: f.ubicacion_id, nombre: f.ubicacion_nombre }]));
}

// ── Colas nuevas de «Te toca» ────────────────────────────────────────────────────────────────────

/** Cuántos productos vigentes hay, y cuántos tienen al menos una foto. De aquí salen «Fotos que faltan» y el «% con foto». */
export async function getCoberturaDeFotos(): Promise<{ activos: number; conFoto: number } | null> {
  const supabase = await createClient();
  const [activos, conFoto] = await Promise.all([
    contar("los productos vigentes", productosVigentes(supabase, "id", { count: "exact", head: true })),
    // `!inner`: solo los productos que tienen al menos una fila de foto; el conteo exacto es el de los productos, no el de las fotos.
    contar("los productos con foto", productosVigentes(supabase, "id, producto_fotos!inner ( id )", { count: "exact", head: true })),
  ]);
  if (activos === null || conFoto === null) return null;
  return { activos, conFoto: Math.min(conFoto, activos) };
}

/** Productos vigentes sin marca o sin proveedor (ADR-0283): se completan después, editando el producto. */
export async function getPorCompletar(): Promise<number | null> {
  const supabase = await createClient();
  return contar(
    "los productos por completar",
    productosVigentes(supabase, "id", { count: "exact", head: true }).or("marca_id.is.null,proveedor_id.is.null")
  );
}

/** Facturas de mercadería a las que todavía les falta llegar algo a ESTA sede (`listarPorRecibir`, la misma lista de Recibir). */
export async function getPorRecibir(ubicacionId: string): Promise<{ facturas: number; primera: string | null } | null> {
  return tolerarLectura("la mercadería por recibir", async () => {
    const pagina = await listarPorRecibir({}, null, { sinMontos: true, ubicacionId });
    const primera = pagina.filas[0];
    return { facturas: pagina.filas.length, primera: primera ? `${primera.documento} · ${primera.proveedorNombre}` : null };
  });
}

// ── «En camino» ──────────────────────────────────────────────────────────────────────────────────

export type ViajeEnCamino = {
  id: string;
  numero: number;
  /** «entra» = viene hacia esta sede; «sale» = salió de esta sede. */
  sentido: "entra" | "sale";
  de: { nombre: string; sigla: string };
  a: { nombre: string; sigla: string };
  prendas: number;
  /** «llega ~4:30 p. m.»; `null` si el traslado no tiene hora estimada. */
  llegada: string | null;
  /** De 0 a 1; `null` sin hora estimada (no se dibuja una barra inventada). */
  avance: number | null;
};

/** Los traslados en tránsito de esta sede, los que vienen y los que salieron, del que llega antes al que llega después. */
export async function getEnCamino(ubicacionId: string, ahoraMs: number = Date.now()): Promise<ViajeEnCamino[] | null> {
  return tolerarLectura("lo que viene en camino", async () => {
    const traslados = await getTrasladosEnCurso(ubicacionId);
    return traslados
      .filter((t) => t.estado === "en_transito")
      .map((t): ViajeEnCamino => ({
        id: t.id,
        numero: t.numero,
        sentido: t.ubicacionDestinoId === ubicacionId ? "entra" : "sale",
        de: { nombre: t.ubicacionOrigenNombre, sigla: siglaSede(t.ubicacionOrigenNombre) },
        a: { nombre: t.ubicacionDestinoNombre, sigla: siglaSede(t.ubicacionDestinoNombre) },
        prendas: t.unidadesEnviadas,
        llegada: etiquetaLlegada(t.fechaEstimadaLlegada, ahoraMs),
        avance: avanceDelTrayecto(t.creadoEn, t.fechaEstimadaLlegada, ahoraMs),
      }))
      .sort((a, b) => (a.sentido === b.sentido ? 0 : a.sentido === "entra" ? -1 : 1))
      .slice(0, 4);
  });
}

// ── «Por colgar» y «Pulso del almacén» ─────────────────────────────────────────────────────────────

/**
 * Lo que sale de las existencias de la sede: cuánto hay atrás y qué está por colgar (`existenciasDeAlmacen`, la misma cuenta que
 * «Para hoy» de Existencias). La misma lectura (`getExistencias`) y la misma «Acción hoy» (`accionHoyPorVariante` con
 * `politicaDe`) que esa pantalla. `null` si no se pudo leer.
 */
export async function getExistenciasDeAlmacen(ubicacionId: string, ubicaciones: { id: string; nombre: string }[]): Promise<Existencias | null> {
  return tolerarLectura("las existencias de la sede", async () => {
    const stock = await getExistencias(ubicacionId, ubicaciones);
    const accion = accionHoyPorVariante(stock, politicaDe(ubicacionId));
    return existenciasDeAlmacen(stock.map((f) => ({ ...f, accionHoy: accion.get(f.varianteId) ?? null })));
  });
}

/** Unidades que entraron y salieron de la sede HOY (día de Lima), del resumen de Movimientos (`fn_movimientos_resumen_procesos`).
 *  `null` si la base no tiene esa función o no respondió. */
export async function getEntradasYSalidasDeHoy(ubicacionId: string): Promise<{ entraron: number; salieron: number } | null> {
  return tolerarLectura("los movimientos de hoy", async () => {
    const hoy = hoyLima();
    const r = await getResumenTienda(ubicacionId, { desde: hoy, hasta: hoy });
    if (r === null) throw new Error("sin resumen de movimientos");
    return { entraron: r.todos.entran, salieron: r.todos.salen };
  });
}

// ── Todo junto ───────────────────────────────────────────────────────────────────────────────────

/** `undefined` = esta cuenta no ve ese módulo (el bloque no existe); `null` = se intentó leer y falló (el bloque lo dice). */
export type DatosInicioAlmacen = {
  nuevos: NuevoProducto[] | null;
  fotos: { activos: number; conFoto: number } | null;
  porCompletar: number | null;
  porRecibir: { facturas: number; primera: string | null } | null | undefined;
  existencias: Existencias | null | undefined;
  hoy: { entraron: number; salieron: number } | null | undefined;
  enCamino: ViajeEnCamino[] | null | undefined;
};

/**
 * Todo lo que el Inicio de una cuenta de almacén lee, en paralelo. Cada lectura falla sola (`null`) y solo se pide lo que el
 * rol ve (ADR-0161): un aviso nunca lleva a «Sin acceso». Productos es obligatorio (es lo que define a la cuenta).
 */
export async function getInicioAlmacen(cuenta: {
  ubicacionId: string;
  ubicaciones: { id: string; nombre: string }[];
  ve: (m: ClaveModulo) => boolean;
}): Promise<DatosInicioAlmacen> {
  const { ubicacionId, ubicaciones, ve } = cuenta;
  const [nuevos, fotos, porCompletar, porRecibir, existencias, hoy, enCamino] = await Promise.all([
    getNuevosDelCatalogo(ubicacionId),
    tolerarLectura("la cobertura de fotos", getCoberturaDeFotos).then((r) => r ?? null),
    getPorCompletar(),
    ve("recibir") ? getPorRecibir(ubicacionId) : undefined,
    ve("existencias") ? getExistenciasDeAlmacen(ubicacionId, ubicaciones) : undefined,
    ve("movimientos") ? getEntradasYSalidasDeHoy(ubicacionId) : undefined,
    ve("traslados") ? getEnCamino(ubicacionId) : undefined,
  ]);
  return { nuevos, fotos, porCompletar, porRecibir, existencias, hoy, enCamino };
}
