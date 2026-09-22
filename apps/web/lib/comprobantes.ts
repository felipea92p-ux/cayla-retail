import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar } from "@/lib/resultado";
import { resumenPorEnviar, type ResumenPorEnviar } from "@/lib/facturacion-reglas";
import type { Comprobante, EstadoComprobante, SerieComprobante, VentaDelDia } from "@/lib/comprobantes-reglas";

// Tipos y reglas puras (lo que un componente cliente puede necesitar como
// VALOR: constantes, `tipoDocumentoDeCliente`) viven en comprobantes-reglas.ts,
// no acá — ver ese archivo para el porqué. Este archivo es solo lectura de
// servidor (principio del repo: lib/ nunca escribe; la emisión pasa por RPC
// desde el componente cliente).
export type { TipoComprobante, EstadoComprobante, EntornoTransmision, Comprobante, SerieComprobante, ItemVentaDelDia, VentaDelDia } from "@/lib/comprobantes-reglas";

export async function getComprobantesMes(desde: string, hasta: string): Promise<Comprobante[]> {
  const supabase = await createClient();
  // Un comprobante que no se ve es un comprobante que se vuelve a emitir. Si esta
  // consulta falla y la pantalla dibuja "sin comprobantes", alguien re-emite una boleta
  // que ya existe —y eso ya es un problema con SUNAT, no de pantalla. Falla en duro.
  const res = await supabase
    .from("comprobantes")
    .select(
      "id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre, total, estado, entorno_transmision, motivo_rechazo, motivo_anulacion, motivo_no_emitido, anulacion_solicitada_at, created_at, ubicacion_id, respuesta_sunat"
    )
    // Facturación es lo que va (o fue) a SUNAT: la nota de venta es interna (ADR-0164) y vive en Vender e Historial.
    .neq("tipo", "nota_venta")
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: false });
  const filas = exigir(res, "los comprobantes del mes");
  // `respuesta_sunat` es el `ResultadoLucode` completo tal como lo guardó
  // `/api/lucode/emitir` (lib/lucode.ts) — jsonb sin tipo propio en el
  // esquema, así que se lee con cuidado en vez de confiar en el cast de
  // abajo para estos 3 campos.
  return filas.map((f) => {
    const r = f.respuesta_sunat as { pdfUrl?: unknown; xmlUrl?: unknown; cdrUrl?: unknown } | null;
    return {
      ...f,
      pdfUrl: typeof r?.pdfUrl === "string" ? r.pdfUrl : null,
      xmlUrl: typeof r?.xmlUrl === "string" ? r.xmlUrl : null,
      cdrUrl: typeof r?.cdrUrl === "string" ? r.cdrUrl : null,
    };
  }) as Comprobante[];
}

// `cache`: el layout de Facturación la pide para el modal de emitir y la vista
// Comprobantes para su tabla, en la misma petición — se lee una sola vez.
export const getSeriesComprobantes = cache(async (): Promise<SerieComprobante[]> => {
  const supabase = await createClient();
  // Sin series, la pantalla avisa "esta ubicación no tiene serie configurada" y nadie
  // puede emitir. Si eso sale de una consulta fallida en vez de la realidad, se manda a
  // Felipe a configurar algo que ya estaba configurado.
  const resSeries = await supabase
    .from("series_comprobantes")
    .select("id, ubicacion_id, tipo, serie, siguiente_numero")
    // Solo las activas: una archivada ya no reserva números (D-60 paso 4) y nadie debe ofrecerla.
    .is("archivada_at", null)
    .order("tipo");
  return exigir(resSeries, "las series de comprobantes") as SerieComprobante[];
});

export type SerieArchivada = SerieComprobante & { archivada_at: string; motivo_archivo: string };

/** Las series archivadas, para que la vista Series muestre su historial. `null` si la consulta falla:
 *  es secundaria (`tolerar`), las activas sí se exigen. */
export async function getSeriesArchivadas(): Promise<SerieArchivada[] | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("series_comprobantes")
    .select("id, ubicacion_id, tipo, serie, siguiente_numero, archivada_at, motivo_archivo")
    .not("archivada_at", "is", null)
    .order("archivada_at", { ascending: false });
  return tolerar(res, "las series archivadas").datos as SerieArchivada[] | null;
}

/** Cuándo salió el último comprobante de cada serie activa, por id de serie. Se busca exacto (serie +
 *  número `siguiente_numero − 1`), no escaneando el historial: una fila por serie como mucho. Si ese
 *  número quedó en hueco (se liberó), la serie no trae fecha y la tarjeta no la dice. `null` si falla:
 *  es un dato de adorno de la vista Series (`tolerar`). */
export async function getUltimoPorSerie(series: SerieComprobante[]): Promise<Record<string, string> | null> {
  const usadas = series.filter((s) => s.siguiente_numero > 1);
  if (usadas.length === 0) return {};
  const supabase = await createClient();
  const res = await supabase
    .from("comprobantes")
    .select("ubicacion_id, serie, numero, created_at")
    .or(usadas.map((s) => `and(serie.eq.${s.serie},numero.eq.${s.siguiente_numero - 1})`).join(","));
  const { datos } = tolerar(res, "el último comprobante de cada serie");
  if (!datos) return null;
  const porSerie: Record<string, string> = {};
  for (const s of usadas) {
    const fila = datos.find((c) => c.serie === s.serie && c.ubicacion_id === s.ubicacion_id && c.numero === s.siguiente_numero - 1);
    if (fila) porSerie[s.id] = fila.created_at;
  }
  return porSerie;
}

/** Todo lo vendido hoy (hora Lima), con su comprobante si ya tiene uno. La
 *  RPC (`fn_ventas_del_dia`, security definer) ya filtra por rol: un líder ve
 *  todas las ubicaciones o una sola si se lo pides; un integrante solo ve la
 *  suya sin importar qué `ubicacionId` se mande — no hay nada que este lib
 *  necesite reforzar acá. */
export async function getVentasDeHoy(ubicacionId?: string): Promise<VentaDelDia[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_ventas_del_dia", { p_ubicacion_id: ubicacionId });
  return exigir(res, "las ventas de hoy") as unknown as VentaDelDia[];
}

/** Cuántos comprobantes esperan un envío a SUNAT ahora mismo, para el contador de la pestaña.
 *  SIN filtro de mes: son una cola, no un historial. `null` si la consulta falla: es un dato
 *  secundario (`tolerar` — sin contador, nunca uno inventado); la lista de verdad, que sí
 *  usa `exigir`, vive en la vista Comprobantes.
 *
 *  `cache`: el layout la pide para el contador de la pestaña y el Resumen para su tarjeta
 *  «Por enviar», en la misma petición — se lee una sola vez y las dos cifras no pueden diferir. */
export const getResumenPorEnviar = cache(async (): Promise<ResumenPorEnviar | null> => {
  const supabase = await createClient();
  const res = await supabase.from("comprobantes").select("estado, created_at").in("estado", ["pendiente", "pendiente_reintento", "rechazado"]);
  const { datos, fallo } = tolerar(res, "los comprobantes por enviar");
  // `fallo` es el aviso para la persona; la causa real (Postgres) es para quien lea el log.
  if (fallo) console.error("Facturación: no se pudo leer la cola «por enviar» (contador de la pestaña Comprobantes):", res.error?.message);
  return datos ? resumenPorEnviar(datos as { estado: EstadoComprobante; created_at: string }[]) : null;
});

export type FilaColaReintento = {
  comprobante_id: string;
  ubicacion_id: string;
  tipo: string;
  serie: string;
  numero: number;
  intentos_transmision: number;
  ultimo_intento_transmision_at: string | null;
  ultimo_error_transmision: string | null;
  horas_esperando: number | null;
};

/** Cuándo se emitió cada comprobante de la cola (la RPC de la cola no lo trae): el plazo de SUNAT cuenta
 *  desde ahí. `null` si falla: el plazo es un dato de más en «Por reintentar», no se inventa. */
export async function getFechasDeEmision(ids: string[]): Promise<Record<string, string> | null> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const res = await supabase.from("comprobantes").select("id, created_at").in("id", ids);
  const { datos } = tolerar(res, "la fecha de emisión de la cola");
  return datos ? Object.fromEntries(datos.map((c) => [c.id, c.created_at])) : null;
}

/** La cola de SUNAT (D-60): lo que Lucode no aceptó y espera su reintento, de la más vieja a la más
 *  nueva. `ubicacionId` `null` = todas las sedes (solo líder, la RPC lo exige). `cache`: el layout la
 *  pide para el contador y el aviso, y la vista «Por reintentar» para la lista, en la misma petición.
 *  `null` si falla: el marco la tolera, la vista la exige (`exigirColaReintento`). */
export const getColaReintento = cache(async (ubicacionId: string | null): Promise<FilaColaReintento[] | null> => {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_comprobantes_cola_reintento", { p_ubicacion_id: ubicacionId ?? undefined });
  const { datos, fallo } = tolerar(res, "la cola de reintento");
  if (fallo) console.error("Comprobantes: no se pudo leer la cola de reintento:", res.error?.message);
  return (datos as FilaColaReintento[] | null) ?? null;
});
