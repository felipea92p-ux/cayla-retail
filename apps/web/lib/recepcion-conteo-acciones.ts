import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { ErrorDeBase } from "@/lib/recepcion-envio-acciones";
import {
  leerConteosDelEnvio,
  leerEnvioAbierto,
  leerGuardado,
  leerResuelto,
  RPC_CERRAR_CONTEO,
  RPC_CONTEOS_ENVIO,
  RPC_CORREGIR_GUIA,
  RPC_PRECIO_RECEPCION,
  RPC_GUARDAR_CONTEO,
  RPC_PONER_PROVEEDOR,
  RPC_REABRIR_ENVIO,
  RPC_RESOLVER_PENDIENTE,
  RPC_SIN_AVISO,
  type ArgsGuardarConteo,
  type ArgsResolverPendiente,
  type ConteosDelEnvio,
  type LineaParaCerrar,
} from "@/lib/recepcion-conteo-reglas";
import { leerResultadoRecepcion, type ResultadoRecepcion } from "@/lib/recepcion-envio-reglas";

// Recibir contando primero (ADR-0393): lo que la cara A le pide a la base. Las reglas viven en cada función (el módulo Recibir, la sede, quien
// hizo la orden no cuenta ni cierra, los candados de stock); aquí solo se arma la llamada con su firma. TODAS las que escriben firman con el
// combo «Responsable» (`fn_actor_persona_id(true)`).

type Respuesta = { data: unknown; error: ErrorDeBase };

/**
 * Guarda lo contado de una línea. Va con `x-espera: no`: contar es de cada toque, y el loader a pantalla completa (ADR-0149) taparía la caja
 * donde se está escribiendo. La pantalla dice «Guardando…» al lado del número.
 */
export async function guardarConteo(args: ArgsGuardarConteo, firma: Firma | null): Promise<{ guardado: ReturnType<typeof leerGuardado>; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_GUARDAR_CONTEO as never, args as never), firma).setHeader("x-espera", "no")) as Respuesta;
  return { guardado: error ? null : leerGuardado(data), error: error ?? null };
}

/** Vuelve a leer lo contado (después de cerrar, reabrir o «Hacer ahora»). Lectura: no abre el loader. */
export async function leerConteos(despachoId: string): Promise<{ conteos: ConteosDelEnvio | null; error: ErrorDeBase }> {
  const { data, error } = (await createClient().rpc(RPC_CONTEOS_ENVIO as never, { p_despacho_id: despachoId } as never)) as unknown as Respuesta;
  return { conteos: error ? null : leerConteosDelEnvio(data), error: error ?? null };
}

/** Cierra lo contado: lo detallado entra al stock, lo demás queda pendiente. */
export async function cerrarConteo(
  args: { p_despacho_id: string; p_version: number; p_lineas: LineaParaCerrar[]; p_nota: string | null; p_token: string },
  firma: Firma | null,
): Promise<{ resultado: ResultadoRecepcion | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_CERRAR_CONTEO as never, args as never), firma)) as Respuesta;
  return { resultado: error ? null : leerResultadoRecepcion(data), error: error ?? null };
}

/** Cambia el precio de venta de una prenda de este envío: de todas las sedes o solo de la sede que recibe. Rige hacia adelante; lo vendido no se toca. */
export async function cambiarPrecioEnRecepcion(
  args: { p_despacho_id: string; p_producto_id: string; p_precio: number; p_alcance: "todas" | "sede" },
  firma: Firma | null,
): Promise<{ error: ErrorDeBase }> {
  const { error } = (await firmar(createClient().rpc(RPC_PRECIO_RECEPCION as never, args as never), firma)) as Respuesta;
  return { error: error ?? null };
}

/** El precio de venta de una prenda hoy (el de sus tallas activas, de menor a mayor), para mostrarlo junto al campo. Sin costo: esa columna es de otro permiso. */
export async function leerPrecioDePrenda(productoId: string): Promise<{ desde: number; hasta: number } | null> {
  const { data, error } = await createClient().from("variantes").select("precio").eq("producto_id", productoId).eq("activo", true);
  if (error || !data || data.length === 0) return null;
  const precios = data.map((v) => Number((v as { precio: number | string }).precio)).filter((n) => Number.isFinite(n));
  return precios.length > 0 ? { desde: Math.min(...precios), hasta: Math.max(...precios) } : null;
}

/** «Hacer ahora»: termina un pendiente o separa lo que quedó sin separar. */
export async function resolverPendiente(args: ArgsResolverPendiente, firma: Firma | null): Promise<{ resuelto: ReturnType<typeof leerResuelto>; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_RESOLVER_PENDIENTE as never, args as never), firma)) as Respuesta;
  return { resuelto: error ? null : leerResuelto(data), error: error ?? null };
}

/** Reabre un envío cerrado para cuadrarlo (decisión 5). */
export async function reabrirEnvio(
  args: { p_despacho_id: string; p_version: number; p_motivo: string; p_token: string },
  firma: Firma | null,
): Promise<{ abierto: ReturnType<typeof leerEnvioAbierto>; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_REABRIR_ENVIO as never, args as never), firma)) as Respuesta;
  return { abierto: error ? null : leerEnvioAbierto(data), error: error ?? null };
}

/** «Llegó sin aviso»: abre en la sede un envío sin guía de ese proveedor, o sin proveedor (`null`: por confirmar, Felipe 2026-10-14). */
export async function abrirEnvioSinAviso(
  args: { p_ubicacion_id: string; p_proveedor_id: string | null; p_numero_guia: string | null; p_nota: string | null; p_token: string },
  firma: Firma | null,
): Promise<{ abierto: ReturnType<typeof leerEnvioAbierto>; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_SIN_AVISO as never, args as never), firma)) as Respuesta;
  return { abierto: error ? null : leerEnvioAbierto(data), error: error ?? null };
}

/** Pone el proveedor de un envío sin aviso que se abrió sin saberlo (una sola vez; el mismo otra vez no hace nada). Antes de cerrar. */
export async function ponerProveedorEnvio(
  args: { p_despacho_id: string; p_proveedor_id: string },
  firma: Firma | null,
): Promise<{ ok: boolean; error: ErrorDeBase }> {
  const { error } = (await firmar(createClient().rpc(RPC_PONER_PROVEEDOR as never, args as never), firma)) as Respuesta;
  return { ok: !error, error: error ?? null };
}

/** Escribe o corrige el número de guía de un envío abierto (al cerrar). Devuelve la versión nueva del envío: es la que se pasa al cerrar. */
export async function corregirGuiaEnvio(
  args: { p_despacho_id: string; p_numero_guia: string },
  firma: Firma | null,
): Promise<{ version: number | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_CORREGIR_GUIA as never, args as never), firma)) as Respuesta;
  const r = !error && data && typeof data === "object" ? (data as { version?: unknown }) : null;
  return { version: r && typeof r.version === "number" ? r.version : null, error: error ?? null };
}
