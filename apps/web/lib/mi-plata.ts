import "server-only";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_FOTOS_GASTO_VIAJE } from "@/lib/rendicion-reglas";
import {
  RPC_BANCOS_PLATA,
  RPC_MI_PLATA,
  RPC_PLATA_POR_CONFIRMAR,
  leerBancosDePlata,
  leerMiPlata,
  leerPlataPorConfirmar,
  type MiPlata,
  type PlataPorConfirmar,
} from "@/lib/mi-plata-reglas";
import { RPC_MIS_ENVIOS, leerMisEnvios, type EnvioMio } from "@/lib/mis-envios-reglas";
import type { CuentaOpcion } from "@/lib/fondos-reglas";

// Compras simple (ADR-0480, actividad 2): lectura del servidor de la plata anotada (20261022235000). Si una lectura falla —la web
// publicada antes que la migración, o la base caída—, lo dice (principio 9): nunca «tienes S/ 0» ni «nada por confirmar» inventados.

// Las RPC son nuevas y los tipos generados todavía no las conocen: se leen como `unknown` y se validan en `mi-plata-reglas.ts`.
type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** La plata de quien mira. `null` si no se pudo leer. */
export async function getMiPlata(): Promise<MiPlata | null> {
  const supabase = await createClient();
  const r = (await supabase.rpc(RPC_MI_PLATA as never)) as unknown as Awaited<Respuesta>;
  if (r.error) {
    console.error(`mi plata para compras: ${r.error.message}`);
    return null;
  }
  return leerMiPlata(r.data);
}

/**
 * Los bancos de la empresa para «¿De qué banco salió?» de «Me dieron plata» (20261026170000). Si no se pueden leer —la web publicada antes
 * que la migración, o la base caída—, la lista queda vacía y la hoja no pregunta el banco: se puede anotar igual y Compras lo elige al confirmar.
 */
export async function getBancosParaPlata(): Promise<CuentaOpcion[]> {
  const supabase = await createClient();
  const r = (await supabase.rpc(RPC_BANCOS_PLATA as never)) as unknown as Awaited<Respuesta>;
  if (r.error) {
    console.error(`bancos para la plata de compras: ${r.error.message}`);
    return [];
  }
  return leerBancosDePlata(r.data);
}

export type PlataPorConfirmarConFoto = PlataPorConfirmar & { fotoUrl: string | null };

/**
 * La plata que falta confirmar, con el enlace a cada voucher (10 minutos, firmado en el servidor con la sesión de quien mira: el depósito
 * deja leer `plata/` a quien tiene «Mis compras» o «Revisar compras»). `null` si no se pudo leer.
 */
export async function getPlataPorConfirmar(): Promise<PlataPorConfirmarConFoto[] | null> {
  const supabase = await createClient();
  const r = (await supabase.rpc(RPC_PLATA_POR_CONFIRMAR as never)) as unknown as Awaited<Respuesta>;
  if (r.error) {
    console.error(`plata por confirmar: ${r.error.message}`);
    return null;
  }
  const filas = leerPlataPorConfirmar(r.data);
  const rutas = filas.map((f) => f.fotoRuta).filter((x): x is string => x !== null);
  const urls = new Map<string, string>();
  if (rutas.length > 0) {
    const firmadas = await supabase.storage.from(BUCKET_FOTOS_GASTO_VIAJE).createSignedUrls(rutas, 600);
    for (const f of firmadas.data ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }
  return filas.map((f) => ({ ...f, fotoUrl: f.fotoRuta ? (urls.get(f.fotoRuta) ?? null) : null }));
}

/**
 * Los envíos que mandó quien mira, con su código y su ronda (20261026174000). `null` si no se pudo leer —la web publicada antes que la
 * migración, o la base caída—: la pantalla lo dice, y Mis compras sigue sin «Mis envíos» en vez de caerse (principio 9).
 */
export async function getMisEnvios(): Promise<EnvioMio[] | null> {
  const supabase = await createClient();
  const r = (await supabase.rpc(RPC_MIS_ENVIOS as never)) as unknown as Awaited<Respuesta>;
  if (r.error) {
    console.error(`mis envíos: ${r.error.message}`);
    return null;
  }
  return leerMisEnvios(r.data);
}
