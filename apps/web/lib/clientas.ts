import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import {
  aCambio,
  aClienta,
  aDevolucion,
  aSeparacion,
  agruparCompras,
  COLUMNAS_CLIENTA,
  type Clienta,
  type FichaClienta,
  type FilaCambio,
  type FilaClienta,
  type FilaCompra,
  type FilaDevolucion,
  type FilaSeparacion,
} from "@/lib/clientas-reglas";
import type { TextoClub, TipoTextoClub } from "@/lib/club-reglas";

// Ficha de clienta — lista y ficha completa (D-76/D-77 y el paso 2 del acta,
// docs/datos/DECISIONES-2026-09-26-clientas.md sección H). Página (server) importa este archivo;
// el panel cliente SOLO `clientas-reglas.ts` y `clientas-acciones.ts` (un Server Component nunca
// llama código de un archivo "use client", y viceversa nunca debería hacer falta).
export type { Clienta };

/** Las últimas `limite` clientas ACTIVAS (sin archivar), para la lista antes de buscar. Con
 *  `incluirArchivadas` trae también las archivadas/anonimizadas/fusionadas — para reactivar una,
 *  o para revisar el historial de una fusión. */
export async function getClientas(limite = 50, incluirArchivadas = false): Promise<Clienta[]> {
  const supabase = await createClient();
  let query = supabase
    .from("clientas")
    .select(COLUMNAS_CLIENTA)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (!incluirArchivadas) query = query.is("archivada_en", null);
  const filas = exigir(await query, "las clientas");
  return filas.map(aClienta);
}

/** La ficha completa: la clienta más su actividad, LEÍDA de ventas/cambios/devoluciones/
 *  separaciones (nunca una tabla copia) — `fn_clienta_*` cruzan las tres sedes a propósito, ver
 *  esas funciones (20260928180000_clienta_actividad_y_exportar.sql): la ficha es de la marca, no
 *  de la sede donde compró. */
export async function getFichaClienta(id: string): Promise<FichaClienta | null> {
  const supabase = await createClient();
  const [clienta, compras, cambios, devoluciones, separaciones] = await Promise.all([
    supabase
      .from("clientas")
      .select(COLUMNAS_CLIENTA)
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("fn_clienta_compras", { p_id: id }),
    supabase.rpc("fn_clienta_cambios", { p_id: id }),
    supabase.rpc("fn_clienta_devoluciones", { p_id: id }),
    supabase.rpc("fn_clienta_separaciones", { p_id: id }),
  ]);

  const filaClienta = exigir(clienta, "la ficha de la clienta") as FilaClienta | null;
  if (!filaClienta) return null;

  return {
    clienta: aClienta(filaClienta),
    compras: agruparCompras(exigir(compras, "sus compras") as FilaCompra[]),
    cambios: (exigir(cambios, "sus cambios") as FilaCambio[]).map(aCambio),
    devoluciones: (exigir(devoluciones, "sus devoluciones") as FilaDevolucion[]).map(aDevolucion),
    separaciones: (exigir(separaciones, "sus apartados") as FilaSeparacion[]).map(aSeparacion),
  };
}

/* ------------------------------------------------------------------
   El cartel del club (ADR-0288 tanda 1b, `/clientas/cartel`): el QR genérico de cada tienda que tiene su número de
   WhatsApp cargado (Configuración ▸ Tiendas y caja). Lecturas del servidor; el navegador usa `club-acciones.ts`.
   ------------------------------------------------------------------ */

export type TiendaWhatsapp = { id: string; nombre: string; whatsappNumero: string | null };

/** Las tiendas activas con su número de WhatsApp (o null). Si la base todavía no tiene la columna (web publicada antes de
 *  pegar la migración 1b), devuelve `falla` en vez de caerse: el cartel lo dice y la pantalla sigue (principio 9). */
export async function getTiendasConWhatsapp(): Promise<{ tiendas: TiendaWhatsapp[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ubicaciones")
    .select("id, nombre, whatsapp_numero")
    .eq("activo", true)
    .eq("tipo", "tienda")
    .order("nombre");
  if (error) return { tiendas: [], falla: `No se pudo leer el WhatsApp de las tiendas: ${error.message}` };
  return { tiendas: (data ?? []).map((u) => ({ id: u.id, nombre: u.nombre, whatsappNumero: u.whatsapp_numero ?? null })), falla: null };
}

/** Los textos vigentes del club (`fn_club_textos_vigentes`), leídos del servidor. Vacío si la base todavía no los tiene. */
export async function getTextosClub(): Promise<TextoClub[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_club_textos_vigentes");
  if (error) return [];
  return (data ?? []).map((t) => ({ tipo: t.tipo as TipoTextoClub, version: t.version, texto: t.texto }));
}

/** Las cifras de la cabecera de /clientas (como el spike del club, `fichasHTML`): cuántas fichas activas, cuántas socias y
 *  cuántas con publicidad, contadas por la base (no sobre las 50 de la lista). `null` si la base todavía no tiene las
 *  columnas del club (tanda 1b sin pegar): la pantalla sigue sin cifras. */
export type CifrasClientas = { identificadas: number; socias: number; conPublicidad: number };

export async function getCifrasClientas(): Promise<CifrasClientas | null> {
  const supabase = await createClient();
  const activas = () => supabase.from("clientas").select("id", { count: "exact", head: true }).is("archivada_en", null);
  const [todas, socias, conPublicidad] = await Promise.all([
    activas(),
    activas().not("club_desde", "is", null),
    activas().not("publicidad_desde", "is", null),
  ]);
  if (todas.error || socias.error || conPublicidad.error) return null;
  return { identificadas: todas.count ?? 0, socias: socias.count ?? 0, conPublicidad: conPublicidad.count ?? 0 };
}
