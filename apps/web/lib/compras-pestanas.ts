import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getResumenCompras } from "@/lib/compras";
import { RPC_PLATA_POR_CONFIRMAR, leerPlataPorConfirmar } from "@/lib/mi-plata-reglas";
import { RPC_REVISAR_COMPRAS, leerRevisarCompras } from "@/lib/revisar-compras-reglas";
import { totalPorRevisar, type ConteosDeCompras } from "@/lib/compras-pestanas-reglas";

// Lo que cuentan los contadores de las pestañas de «Historial de compras» (ADR-0504) cuando la pantalla que se está viendo no lo leyó por su
// cuenta. Si una lectura falla —la base caída, o la web publicada antes que su migración—, el contador se calla (`null`): nunca un 0 inventado
// (principio 9), y la pantalla sigue igual. No firma las fotos de los vouchers y los recibos (eso es de la bandeja, no de un número).

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Cuánto espera en «Revisar compras»: la plata por confirmar, las compras por completar, los gastos por revisar y los cierres por recibir. */
export async function contarPorRevisar(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const [plata, revisar] = await Promise.all([
      supabase.rpc(RPC_PLATA_POR_CONFIRMAR as never) as unknown as Respuesta,
      supabase.rpc(RPC_REVISAR_COMPRAS as never) as unknown as Respuesta,
    ]);
    if (plata.error || revisar.error) return null;
    const datos = leerRevisarCompras(revisar.data);
    if (!datos) return null;
    return totalPorRevisar({ plata: leerPlataPorConfirmar(plata.data).length, papeles: datos.papeles.length, gastos: datos.gastos.length, cierres: datos.cierres.length });
  } catch {
    return null;
  }
}

/** Los comprobantes con saldo y cuántos ya vencieron (la misma cifra de las tarjetas de «Por pagar»). */
export async function contarPorPagar(): Promise<{ conSaldo: number; vencidas: number } | null> {
  try {
    const r = await getResumenCompras();
    return { conSaldo: r.conSaldo, vencidas: r.vencidas };
  } catch {
    return null;
  }
}

/** Lee solo lo que falta: lo que la pantalla ya trae no se vuelve a pedir, y lo que esta cuenta no ve ni se pide. */
export async function conteosDeCompras(
  pide: { revisar: boolean; porPagar: boolean },
  yaLeidos: ConteosDeCompras = {},
): Promise<ConteosDeCompras> {
  const [revisar, porPagar] = await Promise.all([
    pide.revisar && yaLeidos.revisar === undefined ? contarPorRevisar() : Promise.resolve(yaLeidos.revisar),
    pide.porPagar && yaLeidos.porPagar === undefined ? contarPorPagar() : Promise.resolve(yaLeidos.porPagar),
  ]);
  return { revisar, porPagar };
}
