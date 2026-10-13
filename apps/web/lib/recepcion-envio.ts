import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_DETALLE_ENVIO } from "@/lib/ordenes-compra-reglas";
import { compararTallas } from "@/lib/tallas";
import {
  leerDetalleEnvio,
  leerEnviosPorAbrir,
  leerOrdenesDirectas,
  RPC_ENVIOS_POR_ABRIR,
  RPC_ENVIOS_POR_RECIBIR,
  RPC_ORDENES_DIRECTAS,
  type CatalogoParaRecibir,
  type DetalleEnvio,
  type EnvioPorAbrir,
  type OrdenDirecta,
  type TallaDeLaCategoria,
} from "@/lib/recepcion-envio-reglas";

// Recibir en la sede un envío de orden de compra (ADR-0362, fase 4): lo que la pantalla lee en el servidor. Las reglas viven en la base
// (`fn_envios_por_recibir`, `fn_ordenes_directas_por_recibir`, `fn_envio_detalle`, todas con el módulo Recibir u Órdenes de compra); la
// lectura tolera la web publicada antes que la migración (principio 9): una función que todavía no existe no tumba la puerta de Recibir ni
// la pantalla. El vocabulario (categorías con sus tallas, tejidos y patrones, colores, marcas) es de lectura abierta a toda sesión.

type Respuesta = { data: unknown; error: { message: string; code?: string } | null };

async function rpc(nombre: string, args?: Record<string, unknown>): Promise<Respuesta> {
  const supabase = await createClient();
  return (await (supabase.rpc(nombre as never, (args ?? {}) as never) as unknown as PromiseLike<Respuesta>)) as Respuesta;
}

/** ¿La base todavía no tiene esa función? (la web publicada antes que la migración). */
const faltaLaFuncion = (e: { message: string; code?: string } | null): boolean =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message));

/** Los envíos en camino y abiertos a una sede (`fn_envios_por_recibir`, fase 4); si la base todavía no la tiene, los en camino de la fase 3
 *  (`fn_envios_por_abrir`, sin «creado por mí»). */
async function enviosPorRecibir(ubicacionId: string): Promise<Respuesta> {
  const nueva = await rpc(RPC_ENVIOS_POR_RECIBIR, { p_ubicacion_id: ubicacionId });
  return faltaLaFuncion(nueva.error) ? rpc(RPC_ENVIOS_POR_ABRIR, { p_ubicacion_id: ubicacionId }) : nueva;
}

/**
 * Lo que la puerta de Recibir ofrece arriba de «Llegó mercadería»: los envíos de órdenes de compra en camino (o ya abiertos) a esta sede y
 * las órdenes «directo» que llegan sin guía (decisión 48). Es SECUNDARIO: si una lectura falla, esa parte no sale; si fallan las dos, la
 * tarjeta no sale (`null`) y la puerta recibe igual.
 */
export async function getPorRecibirEnLaSede(ubicacionId: string): Promise<{ envios: EnvioPorAbrir[]; ordenes: OrdenDirecta[] } | null> {
  const [envios, ordenes] = await Promise.all([
    enviosPorRecibir(ubicacionId).catch((e: unknown) => ({ data: null, error: { message: String(e) } })),
    rpc(RPC_ORDENES_DIRECTAS, { p_ubicacion_id: ubicacionId }).catch((e: unknown) => ({ data: null, error: { message: String(e) } })),
  ]);
  if (envios.error) console.error(`${RPC_ENVIOS_POR_RECIBIR}: ${envios.error.message}`);
  if (ordenes.error) console.error(`${RPC_ORDENES_DIRECTAS}: ${ordenes.error.message}`);
  if (envios.error && ordenes.error) return null;
  return { envios: envios.error ? [] : leerEnviosPorAbrir(envios.data), ordenes: ordenes.error ? [] : leerOrdenesDirectas(ordenes.data) };
}

type TallaEmbebida = { id: string; valor: string; activo: boolean };
type FilaCategoria = {
  id: string;
  nombre: string;
  prefijo: string | null;
  familia: string | null;
  categoria_tallas: { habitual: boolean; talla: TallaEmbebida | TallaEmbebida[] | null }[] | null;
};
type FilaEje = { categoria_id: string; valor: { id: string; nombre: string } | { id: string; nombre: string }[] | null };

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Lee el vocabulario: si algo falla, `null` (la pantalla sigue: «Ya la tengo» funciona; «Es nueva» y lo que no estaba en la guía lo dicen). */
export async function getCatalogoParaRecibir(): Promise<CatalogoParaRecibir | null> {
  try {
    const supabase = await createClient();
    const [categorias, colores, familias, tejidos, patrones, marcas, vinculos] = await Promise.all([
      supabase
        .from("categorias")
        .select("id, nombre, prefijo, familia, categoria_tallas ( habitual, talla:tallas ( id, valor, activo ) )")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("colores").select("codigo, nombre, hex, familia_color, tipo, sinonimos, pantone_tcx").eq("activo", true).order("orden").order("nombre"),
      supabase.from("familias").select("codigo, exige_tejido_patron"),
      supabase.from("categoria_tejidos").select("categoria_id, valor:tejidos!inner ( id, nombre )").eq("tejidos.activo", true),
      supabase.from("categoria_patrones").select("categoria_id, valor:patrones!inner ( id, nombre )").eq("patrones.activo", true),
      supabase.from("marcas").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("marca_proveedores").select("marca_id, proveedor_id"),
    ]);
    const error = categorias.error ?? colores.error ?? familias.error ?? tejidos.error ?? patrones.error ?? marcas.error;
    if (error) {
      console.error("[recepcion-envio] catálogo:", error.message);
      return null;
    }
    const exige = new Map((familias.data ?? []).map((f) => [f.codigo, Boolean(f.exige_tejido_patron)]));
    const agrupar = (filas: FilaEje[]) => {
      const out = new Map<string, { id: string; texto: string }[]>();
      for (const f of filas) {
        const v = uno(f.valor);
        if (v) out.set(f.categoria_id, [...(out.get(f.categoria_id) ?? []), { id: v.id, texto: v.nombre }]);
      }
      for (const lista of out.values()) lista.sort((a, b) => a.texto.localeCompare(b.texto, "es"));
      return out;
    };
    const tejidosPor = agrupar(tejidos.data as unknown as FilaEje[]);
    const patronesPor = agrupar(patrones.data as unknown as FilaEje[]);
    return {
      categorias: (categorias.data as unknown as FilaCategoria[]).map((c) => {
        const vistas = new Map<string, TallaDeLaCategoria>();
        for (const ct of c.categoria_tallas ?? []) {
          const t = uno(ct.talla);
          if (t && t.activo && !vistas.has(t.id)) vistas.set(t.id, { id: t.id, valor: t.valor, habitual: ct.habitual });
        }
        return {
          id: c.id,
          nombre: c.nombre,
          prefijo: c.prefijo,
          familia: c.familia,
          tallas: [...vistas.values()].sort((a, b) => compararTallas(a.valor, b.valor)),
          exigeTejidoPatron: exige.get(c.familia ?? "") ?? false,
          tejidos: tejidosPor.get(c.id) ?? [],
          patrones: patronesPor.get(c.id) ?? [],
        };
      }),
      colores: (colores.data ?? []).map((c) => ({
        codigo: c.codigo,
        nombre: c.nombre,
        hex: c.hex,
        familiaColor: c.familia_color ?? "",
        tipo: c.tipo,
        sinonimos: c.sinonimos ?? [],
        pantoneTcx: c.pantone_tcx ?? null,
      })),
      marcas: (marcas.data ?? []).map((m) => ({ id: m.id, nombre: m.nombre })),
      // Un adorno del orden de las marcas: si no se pudo leer, la lista sale igual, por nombre.
      vinculos: vinculos.error ? [] : (vinculos.data ?? []).map((v) => ({ marcaId: v.marca_id, proveedorId: v.proveedor_id })),
    };
  } catch (e) {
    console.error("[recepcion-envio] catálogo:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type DatosRecepcionEnvio = {
  detalle: DetalleEnvio | null;
  /** Por qué no se pudo leer el envío (la base no respondió). `null` con `detalle` vacío = ese envío no existe. */
  falla: string | null;
  /** Quien mira hizo alguna de las órdenes del envío (decisión 17). */
  creadoPorMi: boolean;
  /** Con el envío por recibir (en camino o abierto): el vocabulario para la prenda nueva y lo que no estaba en la guía. */
  catalogo: CatalogoParaRecibir | null;
  /** Solo con el envío cerrado: los lotes de la recepción, para imprimir sus etiquetas. */
  lotes: string[];
};

/** Los lotes de una recepción ya cerrada (`lotes.despacho_id`, fase 4). Un adorno: si la columna o la lectura fallan, sin etiquetas por lote. */
async function lotesDelEnvio(despachoId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    const consulta = supabase.from("lotes") as unknown as { select: (c: string) => { eq: (col: string, v: string) => PromiseLike<Respuesta> } };
    const { data, error } = await consulta.select("id").eq("despacho_id", despachoId);
    if (error || !Array.isArray(data)) return [];
    return data.map((f) => (f && typeof f === "object" ? (f as { id?: unknown }).id : null)).filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

/** Todo lo que necesita `/recibir/envio/[id]`. Lo secundario (quién hizo la orden, el vocabulario, los lotes) no tumba la pantalla. */
export async function getDatosRecepcionEnvio(id: string): Promise<DatosRecepcionEnvio> {
  const vacio = { creadoPorMi: false, catalogo: null, lotes: [] };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { detalle: null, falla: null, ...vacio };
  const res = await rpc(RPC_DETALLE_ENVIO, { p_despacho_id: id }).catch((e: unknown) => ({ data: null, error: { message: String(e) } }));
  if (res.error) {
    console.error(`${RPC_DETALLE_ENVIO}: ${res.error.message}`);
    return { detalle: null, falla: "No se pudo leer el envío. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder.", ...vacio };
  }
  const detalle = leerDetalleEnvio(res.data);
  if (!detalle) return { detalle: null, falla: null, ...vacio };

  const porRecibir = detalle.estado === "en_camino" || detalle.estado === "abierto";
  const [creadoPorMi, catalogo, lotes] = await Promise.all([
    // Decisión 17: el detalle lo trae (`creado_por_mi`); si la base todavía no lo dice ahí, se mira en la lista de la sede.
    detalle.creadoPorMi !== null || !porRecibir || !detalle.sede
      ? Promise.resolve(detalle.creadoPorMi ?? false)
      : enviosPorRecibir(detalle.sede.id)
          .then((r) => (r.error ? false : (leerEnviosPorAbrir(r.data).find((e) => e.id === detalle.id)?.creadoPorMi ?? false)))
          .catch(() => false),
    // También en camino: al «Empezar a recibir», el formulario sale enseguida, sin esperar otra lectura.
    porRecibir ? getCatalogoParaRecibir() : Promise.resolve(null),
    detalle.estado === "cerrado" && detalle.lotes.length === 0 ? lotesDelEnvio(detalle.id) : Promise.resolve(detalle.lotes),
  ]);
  return { detalle, falla: null, creadoPorMi, catalogo, lotes };
}
