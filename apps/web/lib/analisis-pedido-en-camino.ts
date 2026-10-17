import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PartePedido } from "@/lib/analisis-tipos";
import { leerPedidoEnCamino, RPC_PEDIDO_EN_CAMINO } from "@/lib/analisis-pedido-en-camino-lectura";
import { datosDe } from "@/lib/analisis-con-tope";
import { leerPieza } from "@/lib/analisis-lectura";

// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A4): lo YA PEDIDO que todavía no llegó
// (`retail.fn_analisis_pedido_en_camino`, migración 20261017043000): órdenes de compra abiertas que llegan directo a la tienda, envíos del
// proveedor en camino, lo que el proveedor no mandó y, a nivel red, lo que está por repartir y lo que el Taller tiene en proceso. Por tipo y
// marca, nunca por prenda: una orden se pide por «tipo + marca» y la prenda se crea al recibir. Sin dinero (ADR-0126).
//
// Si la base no responde (o no a tiempo: `analisis-con-tope.ts`), o la función todavía no está en la base, `pedido` es null y se dice en
// `falla` (principio 9): la pantalla no cuenta lo pedido y nunca dice «no hay nada pedido» por un error. Cómo se entiende cada parte:
// `analisis-pedido-en-camino-lectura.ts`; qué suma y cómo se dice: `analisis-pedido-en-camino-reglas.ts`.

export type LecturaPedido = {
  /** null = no se pudo leer. */
  pedido: PartePedido[] | null;
  falla: string | null;
};

/** Lo que se dice si no se pudo leer: la pantalla ya no cuenta lo pedido y la persona tiene que saberlo antes de volver a pedir. */
export const FALLA_PEDIDO = "No se pudo leer lo que ya está pedido: «Qué pedir» y «Se está acabando» no lo cuentan";

export async function getPedidoEnCamino(ubicacionId: string): Promise<LecturaPedido> {
  if (!ubicacionId) return { pedido: null, falla: "Falta la tienda" };
  const lectura = await leerPieza("pedido_en_camino", { ubicacion_id: ubicacionId }, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(RPC_PEDIDO_EN_CAMINO as never, { p_ubicacion_id: ubicacionId } as never);
    if (error) throw error;
    // null = la base respondió sin datos (sin permiso para analizar, o una forma que no se entiende).
    return leerPedidoEnCamino(data);
  });
  const pedido = datosDe(lectura);
  return pedido ? { pedido, falla: null } : { pedido: null, falla: FALLA_PEDIDO };
}
