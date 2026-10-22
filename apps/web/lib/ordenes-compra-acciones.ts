import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ArgsCrearOrden, ArgsEditarOrden } from "@/lib/orden-compra-alta";
import { leerResultadoComprobante, type ArgsRegistrarComprobante, type ResultadoComprobante } from "@/lib/comprobante-orden-reglas";
import { leerResultadoEnvio, leerVersionDeEnvio, type ArgsCrearEnvio, type ResultadoEnvio } from "@/lib/envio-orden-reglas";
import { leerProveedorRegistrado, type ArgsRegistrarProveedor, type ProveedorRegistrado } from "@/lib/proveedor-de-orden-reglas";
import {
  RPC_ANULAR_COMPROBANTE,
  RPC_ANULAR_ENVIO,
  RPC_ANULAR_ORDEN,
  RPC_CREAR_ENVIO,
  RPC_CREAR_ORDEN,
  RPC_DETALLE_ENVIO,
  RPC_EDITAR_ORDEN,
  RPC_REGISTRAR_COMPROBANTE,
  RPC_REGISTRAR_PROVEEDOR_ORDEN,
} from "@/lib/ordenes-compra-reglas";

// Órdenes de compra (ADR-0362): lo que la pantalla le pide a la base para guardar. Las reglas viven en la función; aquí solo se arma
// la llamada con su firma: con la cuenta de una persona, `firmaOmitida("orden_compra_crear")` o `("orden_compra_editar")` (firma ella,
// sin combo); desde una terminal, la del combo «Responsable» (decisión 39).

export type ErrorDeBase = { code?: string; message: string; hint?: string | null; details?: string | null } | null;

export async function crearOrdenCompra(
  args: ArgsCrearOrden,
  firma: Firma | FirmaOmitida | null,
): Promise<{ id: string | null; numero: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_CREAR_ORDEN as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { id?: unknown; numero?: unknown } | undefined) : undefined;
  return {
    id: typeof fila?.id === "string" ? fila.id : null,
    numero: typeof fila?.numero === "number" ? fila.numero : null,
    error: error ?? null,
  };
}

/**
 * Registra un proveedor nuevo con lo básico (`registrar_proveedor_de_orden`), o devuelve el que ya estaba (`yaExistia`). Se firma con
 * `firmaOmitida("proveedor_de_orden")` desde cualquier cuenta: con la de una persona firma ella; desde una terminal queda sin persona (un
 * proveedor no necesita autor, a diferencia de una orden). Sin error y sin `proveedor`, la base contestó algo que la pantalla no entiende.
 */
export async function registrarProveedorDeOrden(
  args: ArgsRegistrarProveedor,
  firma: Firma | FirmaOmitida | null,
): Promise<{ proveedor: ProveedorRegistrado | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_REGISTRAR_PROVEEDOR_ORDEN as never, args as never), firma);
  return { proveedor: error ? null : leerProveedorRegistrado(data), error: error ?? null };
}

/** Guarda los cambios de una orden «generada». `version` es la que devolvió la base: igual a la de antes si no había nada que cambiar
 *  (o si era un pedido repetido que ya estaba guardado). Si otra persona guardó antes, `error` trae PT409 (`esVersionCambiada`). */
export async function editarOrdenCompra(
  args: ArgsEditarOrden,
  firma: Firma | FirmaOmitida | null,
): Promise<{ numero: number | null; version: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_EDITAR_ORDEN as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { numero?: unknown; version?: unknown } | undefined) : undefined;
  return {
    numero: typeof fila?.numero === "number" ? fila.numero : null,
    version: typeof fila?.version === "number" ? fila.version : null,
    error: error ?? null,
  };
}

/** Anula una orden «generada» con su motivo. Con la versión que se vio: si otra persona la cambió antes, `error` trae PT409. El mismo
 *  pedido repetido (doble clic) devuelve la orden ya anulada, sin error. */
export async function anularOrdenCompra(
  args: { p_id: string; p_version_esperada: number; p_motivo: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ version: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_ANULAR_ORDEN as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { version?: unknown } | undefined) : undefined;
  return { version: typeof fila?.version === "number" ? fila.version : null, error: error ?? null };
}

/**
 * Registra el comprobante de una orden generada (fase 2, `registrar_comprobante_orden`). Con la cuenta de una persona firma ella
 * (`firmaOmitida("orden_compra_comprobante")`); desde una terminal, el combo «Responsable». `args.p_token` se reusa en cada reintento:
 * la base devuelve el mismo comprobante si el envío es el mismo (un corte de señal no lo duplica). Sin error y sin `resultado`, la
 * base contestó algo que la pantalla no entiende: el comprobante pudo quedar registrado y se manda a revisar la orden.
 */
export async function registrarComprobanteOrden(
  args: ArgsRegistrarComprobante,
  firma: Firma | FirmaOmitida | null,
): Promise<{ resultado: ResultadoComprobante | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_REGISTRAR_COMPROBANTE as never, args as never), firma);
  return { resultado: error ? null : leerResultadoComprobante(data), error: error ?? null };
}

/** Anula el comprobante de una orden: es `anular_compra`, la misma función de Facturas de proveedor (la base deja anular también a quien
 *  tiene Órdenes de compra si el comprobante sale de una orden). No devuelve nada: sin error, quedó anulado. */
export async function anularComprobanteDeOrden(
  args: { p_compra_id: string; p_motivo: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_ANULAR_COMPROBANTE as never, args as never), firma);
  return { error: error ?? null };
}

/**
 * Envía lo de una orden a una sede (fase 3, `crear_envio`): una guía, una sede. Con la cuenta de una persona firma ella
 * (`firmaOmitida("orden_compra_envio")`); desde una terminal, el combo «Responsable». `args.p_token` se reusa en cada reintento: la base
 * devuelve el mismo envío si el pedido es el mismo (un corte de señal no lo duplica). Sin error y sin `resultado`, la base contestó algo que
 * la pantalla no entiende: el envío pudo quedar registrado y se manda a revisar la orden.
 */
export async function crearEnvioDeOrden(
  args: ArgsCrearEnvio,
  firma: Firma | FirmaOmitida | null,
): Promise<{ resultado: ResultadoEnvio | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_CREAR_ENVIO as never, args as never), firma);
  return { resultado: error ? null : leerResultadoEnvio(data), error: error ?? null };
}

/** Anula un envío que sigue en camino, con su motivo y la versión que se vio: si otra persona lo cambió antes (la sede lo abrió), `error`
 *  trae PT409 (`esVersionCambiada`). Anular uno ya anulado no hace nada. No devuelve nada que la pantalla necesite: sin error, quedó anulado. */
export async function anularEnvioDeOrden(
  args: { p_despacho_id: string; p_version: number; p_motivo: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_ANULAR_ENVIO as never, args as never), firma);
  return { error: error ?? null };
}

/** La versión actual de un envío (`fn_envio_detalle`): para anularlo cuando la orden abierta no la trae. `null` si no se pudo leer. */
export async function leerVersionActualDelEnvio(despachoId: string): Promise<number | null> {
  const { data, error } = await createClient().rpc(RPC_DETALLE_ENVIO as never, { p_despacho_id: despachoId } as never);
  return error ? null : leerVersionDeEnvio(data);
}
