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
import { textosDelCartel, type TextosCartel } from "@/lib/club-cartel-reglas";
import {
  aCifrasClientas,
  aClientaDeLista,
  desdeDePagina,
  POR_PAGINA,
  type CifrasClientas,
  type ClientaDeLista,
  type FilaCifrasClientas,
  type FilaListaClienta,
  type ParamsLista,
} from "@/lib/clientas-lista-reglas";

// Ficha de clienta — lista y ficha completa (D-76/D-77 y el paso 2 del acta,
// docs/datos/DECISIONES-2026-09-26-clientas.md sección H). Página (server) importa este archivo;
// el panel cliente SOLO `clientas-reglas.ts` y `clientas-acciones.ts` (un Server Component nunca
// llama código de un archivo "use client", y viceversa nunca debería hacer falta).
export type { Clienta, CifrasClientas };

export type ListaClientas = { filas: ClientaDeLista[]; total: number; falla: string | null };

/**
 * La lista de /clientas (ADR-0288 tanda 1f, `fn_clientas_lista`): una página del filtro y la búsqueda de la URL, con su sede,
 * su última compra y si es frecuente, calculados por la base sobre TODAS las fichas (no sobre las 50 de la vista). Si la base
 * todavía no tiene la función (migración 20260930210000 sin pegar), devuelve `falla` en vez de tumbar la pantalla
 * (principio 9): la pantalla lo dice y sigue con «+ Nuevo cliente».
 */
export async function getListaClientas(p: ParamsLista): Promise<ListaClientas> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_clientas_lista", {
    p_termino: p.termino || undefined,
    p_filtro: p.filtro,
    p_limite: POR_PAGINA,
    p_desde: desdeDePagina(p.pagina),
  });
  if (error) return { filas: [], total: 0, falla: `No se pudo leer la lista de clientes: ${error.message}` };
  const filas = (data ?? []) as FilaListaClienta[];
  return { filas: filas.map(aClientaDeLista), total: filas[0]?.total ?? 0, falla: null };
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

  const filaClienta = exigir(clienta, "la ficha del cliente") as FilaClienta | null;
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
   El cartel del club (ADR-0288 act. g, `/clientas/cartel`): una hoja por tienda activa con el QR de SU página de registro, y
   los beneficios vigentes del club. Lecturas del servidor; el navegador usa `club-acciones.ts`.
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

/**
 * Lo que el cartel dice de los beneficios (el % del cumpleaños, el vale menor y el mayor de la escala, y lo que hace contar un
 * año), en UNA lectura para todas las tiendas: son de toda la empresa. Sale de `fn_club_textos_legales`, lo mismo que leen los
 * términos y la página que abre el QR. Si la base no responde o no los da completos, `falla` y ningún texto: el cartel no se
 * dibuja con cifras inventadas (principio 9).
 */
export async function getTextosDelCartel(): Promise<{ textos: TextosCartel | null; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_club_textos_legales");
  if (error) return { textos: null, falla: `No se pudieron leer los beneficios del club: ${error.message}` };
  const textos = textosDelCartel(data);
  if (!textos) return { textos: null, falla: "La base no dio completos los beneficios del club (el % del cumpleaños, el vale de cada año o lo que hace contar un año)." };
  return { textos, falla: null };
}

/** Los textos vigentes del club (`fn_club_textos_vigentes`), leídos del servidor. Vacío si la base todavía no los tiene. */
export async function getTextosClub(): Promise<TextoClub[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_club_textos_vigentes");
  if (error) return [];
  return (data ?? []).map((t) => ({ tipo: t.tipo as TipoTextoClub, version: t.version, texto: t.texto }));
}

/** Las cifras de la cabecera de /clientas y la cuenta de cada píldora (como el spike del club, `fichasHTML`), contadas por la
 *  base sobre todas las fichas (`fn_cifras_clientas`, tanda 1f): identificadas, socias, con publicidad, frecuentes (compra
 *  neta)… `null` si la base todavía no la tiene: la pantalla sigue sin cifras. */
export async function getCifrasClientas(): Promise<CifrasClientas | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cifras_clientas");
  const fila = (data ?? [])[0] as FilaCifrasClientas | undefined;
  if (error || !fila) return null;
  return aCifrasClientas(fila);
}
