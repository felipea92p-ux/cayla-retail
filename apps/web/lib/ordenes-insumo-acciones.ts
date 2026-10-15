import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import type { ArgsCrearOrdenInsumo, ArgsEditarOrdenInsumo } from "@/lib/orden-insumo-alta";
import { leerResultadoPapelInsumo, type ArgsRegistrarPapelInsumo, type ResultadoPapelInsumo } from "@/lib/comprobante-orden-insumo-reglas";
import {
  RPC_RECIBIR_ORDEN_INSUMO,
  leerResultadoRecepcionOI,
  type ArgsRecibirOrdenInsumo,
  type ResultadoRecepcionOI,
} from "@/lib/recepcion-orden-insumo-reglas";
import {
  RPC_ANULAR_ORDEN_INSUMO,
  RPC_CREAR_ORDEN_INSUMO,
  RPC_EDITAR_ORDEN_INSUMO,
  RPC_REGISTRAR_COMPROBANTE_ORDEN_INSUMO,
} from "@/lib/ordenes-insumo-reglas";

// Órdenes de insumos del Taller (ADR-0362, fase 7): lo que la pantalla le pide a la base para guardar. Las reglas viven en la función;
// aquí solo se arma la llamada con su firma: con la cuenta de una persona, `firmaOmitida("orden_insumo_crear")`, `("orden_insumo_editar")`
// o `("orden_insumo_anular")` (firma ella, sin combo); desde una terminal, la del combo «Responsable» (decisión 39, extendida al Taller).
// El papel del proveedor (fase 7 parte 2), igual: `firmaOmitida("orden_insumo_comprobante")` o el combo.

export type { ErrorDeBase };

/** Crea la orden. `args.p_id` lo genera la pantalla una vez: el mismo pedido repetido (doble clic, reintento) devuelve la misma orden. */
export async function crearOrdenInsumo(
  args: ArgsCrearOrdenInsumo,
  firma: Firma | FirmaOmitida | null,
): Promise<{ id: string | null; numero: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_CREAR_ORDEN_INSUMO as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { id?: unknown; numero?: unknown } | undefined) : undefined;
  return {
    id: typeof fila?.id === "string" ? fila.id : null,
    numero: typeof fila?.numero === "number" ? fila.numero : null,
    error: error ?? null,
  };
}

/** Guarda los cambios de una orden «generada». `version` es la que devolvió la base: igual a la de antes si no había nada que cambiar
 *  (o si era un pedido repetido que ya estaba guardado). Si otra persona guardó antes, `error` trae PT409 (`esVersionCambiada`). */
export async function editarOrdenInsumo(
  args: ArgsEditarOrdenInsumo,
  firma: Firma | FirmaOmitida | null,
): Promise<{ numero: number | null; version: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_EDITAR_ORDEN_INSUMO as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { numero?: unknown; version?: unknown } | undefined) : undefined;
  return {
    numero: typeof fila?.numero === "number" ? fila.numero : null,
    version: typeof fila?.version === "number" ? fila.version : null,
    error: error ?? null,
  };
}

/** Anula una orden «generada» con su motivo y la versión que se vio (PT409 si otra persona la cambió antes). El mismo pedido repetido
 *  (doble clic) devuelve la orden ya anulada, sin error. */
export async function anularOrdenInsumo(
  args: { p_id: string; p_version_esperada: number; p_motivo: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ version: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_ANULAR_ORDEN_INSUMO as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { version?: unknown } | undefined) : undefined;
  return { version: typeof fila?.version === "number" ? fila.version : null, error: error ?? null };
}

/** Registra el papel del proveedor de una orden de insumos (fase 7 parte 2). `args.p_token` lo genera la pantalla una vez: el mismo envío
 *  repetido (doble clic, reintento sin señal) devuelve el mismo papel con `repetido`; el mismo token con otro contenido, un error.
 *  `resultado` es null si la base contestó sin error pero con algo que no se entiende (el papel pudo quedar registrado). */
export async function registrarComprobanteOrdenInsumo(
  args: ArgsRegistrarPapelInsumo,
  firma: Firma | FirmaOmitida | null,
): Promise<{ resultado: ResultadoPapelInsumo | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_REGISTRAR_COMPROBANTE_ORDEN_INSUMO as never, args as never), firma);
  return { resultado: error ? null : leerResultadoPapelInsumo(data), error: error ?? null };
}

/** Recibe en el Taller contra la orden (fase 7 parte 2, actividad 3). Firma el responsable del combo, como la recepción de siempre.
 *  `args.p_token` lo genera la hoja una vez: el mismo envío repetido devuelve la misma recepción (`repetido`). */
export async function recibirOrdenInsumo(
  args: ArgsRecibirOrdenInsumo,
  firma: Firma | FirmaOmitida | null,
): Promise<{ resultado: ResultadoRecepcionOI | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_RECIBIR_ORDEN_INSUMO as never, args as never), firma);
  return { resultado: error ? null : leerResultadoRecepcionOI(data), error: error ?? null };
}
