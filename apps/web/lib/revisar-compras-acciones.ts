import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import { RPC_COMPLETAR_PAPEL, RPC_RECIBIR_CIERRE, RPC_REVISAR_GASTO, type PapelGasto } from "@/lib/revisar-compras-reglas";

// Compras simple (ADR-0480, actividad 7): lo que las hojas de «Revisar compras» le piden a la base. Las reglas viven en las funciones
// (20261023143000); aquí solo se arma la llamada con su firma: con la cuenta de una persona, `firmaOmitida("papel_completar")` o
// `("compra_cierre_recibir")` o `("gasto_revisar")`; desde una terminal, la del combo «Responsable». Sin token: completar lo mismo dos veces devuelve el mismo
// comprobante, y recibir un cierre ya recibido devuelve lo que quedó (el cierre es la marca de su devolución).

export function completarPapel(
  args: { p_papel_id: string; p_proveedor_id: string | null; p_serie: string | null; p_numero: string | null; p_monto: number | null },
  firma: Firma | FirmaOmitida | null,
) {
  return firmar(createClient().rpc(RPC_COMPLETAR_PAPEL as never, args as never), firma);
}

export function recibirCierre(args: { p_cierre_id: string; p_cuenta_id: string; p_monto: number | null }, firma: Firma | FirmaOmitida | null) {
  return firmar(createClient().rpc(RPC_RECIBIR_CIERRE as never, args as never), firma);
}

export function revisarGasto(
  args: { p_gasto_id: string; p_papel: PapelGasto; p_serie_numero: string | null; p_ruc: string | null },
  firma: Firma | FirmaOmitida | null,
) {
  return firmar(createClient().rpc(RPC_REVISAR_GASTO as never, args as never), firma);
}
