import "server-only";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_FOTOS_GASTO_VIAJE } from "@/lib/rendicion-reglas";
import { RPC_REVISAR_COMPRAS, leerRevisarCompras, type GastoPorRevisar, type PapelPorCompletar, type RevisarCompras } from "@/lib/revisar-compras-reglas";

// Compras simple (ADR-0480, actividad 7): lectura del servidor de «Revisar compras» (20261023143000). Si falla —la web publicada antes que
// la migración, o la base caída—, lo dice (principio 9): nunca «nada por revisar» inventado.

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export type PapelConFoto = PapelPorCompletar & { fotoUrl: string | null };
export type GastoConFoto = GastoPorRevisar & { fotoUrl: string | null };
export type RevisarComprasConFotos = Omit<RevisarCompras, "papeles" | "gastos"> & { papeles: PapelConFoto[]; gastos: GastoConFoto[] };

/**
 * Los papeles por completar y los gastos por revisar (con el enlace a su foto, 10 minutos, firmado con la sesión de quien mira: el depósito
 * deja leer `papeles/` y `gastos/` a quien tiene «Revisar compras») y los cierres del día por recibir. `null` si no se pudo leer.
 */
export async function getRevisarCompras(): Promise<RevisarComprasConFotos | null> {
  const supabase = await createClient();
  const r = (await supabase.rpc(RPC_REVISAR_COMPRAS as never)) as unknown as Awaited<Respuesta>;
  if (r.error) {
    console.error(`revisar compras: ${r.error.message}`);
    return null;
  }
  const datos = leerRevisarCompras(r.data);
  if (!datos) return null;
  const rutas = [...datos.papeles, ...datos.gastos].map((p) => p.fotoRuta).filter((x): x is string => x !== null);
  const urls = new Map<string, string>();
  if (rutas.length > 0) {
    const firmadas = await supabase.storage.from(BUCKET_FOTOS_GASTO_VIAJE).createSignedUrls(rutas, 600);
    for (const f of firmadas.data ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }
  const conFoto = <T extends { fotoRuta: string | null }>(x: T) => ({ ...x, fotoUrl: x.fotoRuta ? (urls.get(x.fotoRuta) ?? null) : null });
  return { ...datos, papeles: datos.papeles.map(conFoto), gastos: datos.gastos.map(conFoto) };
}
