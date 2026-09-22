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
    .order("tipo");
  return exigir(resSeries, "las series de comprobantes") as SerieComprobante[];
});

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
