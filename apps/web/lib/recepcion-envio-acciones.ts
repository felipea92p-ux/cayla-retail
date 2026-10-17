import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import {
  leerPrendaPreparada,
  leerPrendasParaRecibir,
  leerResultadoApertura,
  leerResultadoRecepcion,
  RPC_ABRIR_DESPACHO,
  RPC_PREPARAR_PRENDA,
  RPC_PRENDAS_PARA_RECIBIR,
  RPC_RECIBIR_DESPACHO,
  RPC_RECIBIR_SIN_ENVIO,
  type ArgsPrepararPrenda,
  type ArgsRecibirDespacho,
  type PrendaRecepcion,
  type ResultadoApertura,
  type ResultadoRecepcion,
} from "@/lib/recepcion-envio-reglas";

// Recibir en la sede un envío de orden de compra (ADR-0362, fase 4): lo que la pantalla le pide a la base. Las reglas viven en cada función
// (el módulo Recibir, la sede del envío, «quien hizo la orden no la recibe», los candados de stock y de costo); aquí solo se arma la llamada
// con su firma. TODAS firman con el combo «Responsable» (`fn_actor_persona_id(true)`): en la tienda se elige quién recibe, también con la
// cuenta de una persona (sin clave en `acciones_sin_responsable`).

export type ErrorDeBase = { code?: string; message: string; hint?: string | null; details?: string | null } | null;

type Respuesta = { data: unknown; error: ErrorDeBase };

/** «Empezar a recibir»: el envío pasa de en camino a abierto (la compradora ya no lo puede anular). Si ya estaba abierto, no cambia nada. */
export async function abrirDespacho(args: { p_despacho_id: string; p_version: number }, firma: Firma | null): Promise<{ resultado: ResultadoApertura | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_ABRIR_DESPACHO as never, args as never), firma)) as Respuesta;
  return { resultado: error ? null : leerResultadoApertura(data), error: error ?? null };
}

/** «Recibir sin guía» (decisión 48): arma un envío con todo lo que le queda por enviar a la orden «directo» y lo deja abierto. El token hace
 *  seguro el reintento: la base devuelve el mismo envío. */
export async function recibirOrdenSinEnvio(args: { p_orden_id: string; p_token: string }, firma: Firma | null): Promise<{ resultado: ResultadoApertura | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_RECIBIR_SIN_ENVIO as never, args as never), firma)) as Respuesta;
  return { resultado: error ? null : leerResultadoApertura(data), error: error ?? null };
}

/**
 * «Es nueva» y «+ talla o color» (`preparar_prenda_al_recibir`): crea la prenda con las tallas y los colores que llegaron, o le suma a una que
 * ya existe las combinaciones que le faltan. `previa` es la prenda que ya existía: sus variantes se juntan con las que devuelve la base.
 */
export async function prepararPrendaAlRecibir(
  args: ArgsPrepararPrenda,
  firma: Firma | null,
  previa: PrendaRecepcion | null = null,
): Promise<{ prenda: PrendaRecepcion | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_PREPARAR_PRENDA as never, args as never), firma)) as Respuesta;
  return { prenda: error ? null : leerPrendaPreparada(data, previa), error: error ?? null };
}

/** Cierra la recepción (`recibir_despacho`): el stock entra, el costo se promedia y el envío queda cerrado. */
export async function recibirDespacho(args: ArgsRecibirDespacho, firma: Firma | null): Promise<{ resultado: ResultadoRecepcion | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_RECIBIR_DESPACHO as never, args as never), firma)) as Respuesta;
  return { resultado: error ? null : leerResultadoRecepcion(data), error: error ?? null };
}

/** «Ya la tengo»: las prendas activas de esa categoría y marca, las que coinciden con lo escrito primero. Es lectura (`fn_`): no abre el loader. */
export async function buscarPrendasParaRecibir(categoriaId: string, marcaId: string | null, busqueda: string): Promise<{ prendas: PrendaRecepcion[]; error: ErrorDeBase }> {
  const { data, error } = (await createClient().rpc(
    RPC_PRENDAS_PARA_RECIBIR as never,
    { p_categoria_id: categoriaId, p_marca_id: marcaId, p_busqueda: busqueda.trim() || null } as never,
  )) as unknown as Respuesta;
  return { prendas: error ? [] : leerPrendasParaRecibir(data), error: error ?? null };
}
