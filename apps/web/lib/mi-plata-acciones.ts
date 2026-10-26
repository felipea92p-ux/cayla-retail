import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { leerEnvioSalido, type EnvioSalido } from "@/lib/mis-envios-reglas";
import { leerErrorStorage, objecionArchivo, tipoDeArchivo } from "@/lib/adjuntos-compra";
import { BUCKET_FOTOS_GASTO_VIAJE } from "@/lib/rendicion-reglas";
import {
  CARPETA_GASTOS,
  CARPETA_VOUCHERS,
  RPC_ANOTAR_PLATA,
  RPC_CONFIRMAR_PLATA,
  RPC_GASTO_RAPIDO,
  RPC_MANDAR_A_TIENDA,
  RPC_TERMINAR_DIA,
  RPC_ABRIR_RONDA,
  type ConceptoGasto,
  type DecisionCierre,
  type MedioPlata,
} from "@/lib/mi-plata-reglas";

// Compras simple (ADR-0480, actividad 2): lo que las hojas le piden a la base para guardar. Las reglas viven en las funciones
// (20261022235000); aquí solo se arma la llamada con su firma: con la cuenta de una persona, `firmaOmitida("plata_anotar")` o
// `("plata_confirmar")` (firma ella, sin combo); desde una terminal, la del combo «Responsable» (decisión 39).
// El `p_token` de anotar es la marca de `useIntento`: sigue a lo que se manda. Confirmar no lleva token: volver a confirmar lo mismo
// devuelve lo que ya quedó, y con otros datos la base dice `plata_ya_confirmada`.

export type { ErrorDeBase };

/**
 * Sube la foto del voucher ANTES de anotar (como los adjuntos de una factura): la ruta va con la plata, y un archivo sin su plata es
 * basura que nadie ve. `motivo` dice, en palabras de tienda, por qué no se subió.
 */
export function subirVoucher(archivo: File): Promise<{ ruta: string | null; motivo: string | null }> {
  return subirFoto(archivo, CARPETA_VOUCHERS);
}

/** La foto del papel de un gasto que no es ropa (actividad 5), en su carpeta. */
export function subirFotoGasto(archivo: File): Promise<{ ruta: string | null; motivo: string | null }> {
  return subirFoto(archivo, CARPETA_GASTOS);
}

async function subirFoto(archivo: File, carpeta: string): Promise<{ ruta: string | null; motivo: string | null }> {
  const objecion = objecionArchivo(archivo);
  if (objecion) return { ruta: null, motivo: objecion };
  const tipo = tipoDeArchivo(archivo)!;
  const extension = (archivo.name.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const ruta = `${carpeta}${crypto.randomUUID()}.${extension}`;
  const subida = await createClient().storage.from(BUCKET_FOTOS_GASTO_VIAJE).upload(ruta, archivo, { contentType: tipo, upsert: false });
  if (subida.error) return { ruta: null, motivo: leerErrorStorage(subida.error.message) };
  return { ruta, motivo: null };
}

export function anotarPlata(
  // `p_cuenta_indicada_id` solo viaja con una transferencia: sin él la llamada es la de siempre (la web puede publicarse antes que la base).
  args: { p_medio: MedioPlata; p_monto: number; p_foto_ruta: string | null; p_cuenta_indicada_id?: string },
  firma: Firma | FirmaOmitida | null,
  token: string,
  senal: AbortSignal,
) {
  return firmar(createClient().rpc(RPC_ANOTAR_PLATA as never, { ...args, p_token: token } as never), firma).abortSignal(senal);
}

export async function confirmarPlata(
  args: { p_id: string; p_monto: number; p_cuenta_origen_id: string | null },
  firma: Firma | FirmaOmitida | null,
): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_CONFIRMAR_PLATA as never, args as never), firma);
  return { error: error ?? null };
}

// Actividad 5 (20261023114000). El gasto lleva su identificador (nace al abrir la hoja): repetirlo devuelve lo mismo. Mandar lleva la marca
// del envío (`crear_envio` la reconoce). Terminar el día se puede repetir: el mismo día reemplaza el cierre anterior.

export async function registrarGastoRapido(
  args: { p_id: string; p_concepto: ConceptoGasto; p_nota: string | null; p_monto: number; p_foto_ruta: string | null },
  firma: Firma | FirmaOmitida | null,
): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_GASTO_RAPIDO as never, args as never), firma);
  return { error: error ?? null };
}

export async function mandarATienda(
  args: { p_destino_id: string; p_bultos: number; p_token: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ error: ErrorDeBase; envio: EnvioSalido | null }> {
  const { data, error } = await firmar(createClient().rpc(RPC_MANDAR_A_TIENDA as never, args as never), firma);
  // Lo que salió (su código) sirve para mostrarlo apenas sale; un envío repetido por un corte de red devuelve el mismo.
  return { error: error ?? null, envio: error ? null : leerEnvioSalido(data) };
}

/** Abre la ronda de compras de quien la toca (o devuelve la que ya tenía abierta: dos toques no abren dos). */
export async function abrirRonda(firma: Firma | FirmaOmitida | null): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_ABRIR_RONDA as never), firma);
  return { error: error ?? null };
}

export async function terminarDia(
  args: { p_decision: DecisionCierre | null },
  firma: Firma | FirmaOmitida | null,
): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_TERMINAR_DIA as never, args as never), firma);
  return { error: error ?? null };
}
