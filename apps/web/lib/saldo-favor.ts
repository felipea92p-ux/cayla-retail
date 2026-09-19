import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Saldo a favor de los proveedores (ADR-0106, corrección 2026-09-18): lo que un proveedor le debe a CAYLA
// porque una nota de crédito superó lo que se le debía de su comprobante (típico: factura al contado, que
// nace pagada) y todavía no se descontó de un pago ni se reembolsó. Vive en el libro `proveedor_creditos`
// (append-only); el saldo es la SUMA del libro, nunca un dato guardado. Solo LEE: las escrituras pasan por
// las RPC de pago (`saldo_a_favor` como medio) y `registrar_reembolso_proveedor`, desde los componentes cliente.
// Para quien no es líder todo llega en 0 / vacío (RLS del libro).

const n = (v: unknown): number => (v == null ? 0 : Number(v));

/** Saldo a favor de cada proveedor de la lista (los que no aparecen no tienen). */
export async function getSaldosFavor(proveedorIds: string[]): Promise<Record<string, number>> {
  const unicos = [...new Set(proveedorIds)];
  if (unicos.length === 0) return {};
  const supabase = await createClient();
  const filas = await Promise.all(
    unicos.map(async (id) => [id, n(exigir(await supabase.rpc("fn_saldo_favor_proveedor", { p_proveedor_id: id }), "el saldo a favor del proveedor"))] as const)
  );
  return Object.fromEntries(filas.filter(([, saldo]) => saldo > 0));
}

/** Los comprobantes de la lista que ya tienen su nota por faltante (es una sola por comprobante). */
export async function getComprasConNotaFaltante(compraIds: string[]): Promise<string[]> {
  if (compraIds.length === 0) return [];
  const supabase = await createClient();
  const filas = exigir(await supabase.from("compra_notas_credito").select("compra_id").eq("motivo", "faltante").in("compra_id", compraIds), "las notas de crédito por faltante");
  return filas.map((f) => f.compra_id);
}

export type TipoMovimientoCredito = "nota_credito" | "aplicacion" | "reembolso";

export type MovimientoCredito = {
  id: string;
  tipo: TipoMovimientoCredito;
  monto: number;
  fecha: string;
  /** Comprobante de origen (nota) o de destino (aplicación). */
  documento: string | null;
  /** La nota de crédito que originó el saldo. */
  notaSerieNumero: string | null;
  /** Reembolso: cómo devolvió el dinero. */
  metodo: string | null;
  referencia: string | null;
  nota: string | null;
  creadoEn: string;
};

/** El historial del saldo a favor de UN proveedor, del más reciente al más antiguo. */
export async function getCreditosProveedor(proveedorId: string, limite = 50): Promise<{ saldo: number; movimientos: MovimientoCredito[] }> {
  const supabase = await createClient();
  const [saldo, filas] = await Promise.all([
    supabase.rpc("fn_saldo_favor_proveedor", { p_proveedor_id: proveedorId }),
    supabase.rpc("fn_proveedor_creditos", { p_proveedor_id: proveedorId, p_limite: limite }),
  ]);
  return {
    saldo: n(exigir(saldo, "el saldo a favor del proveedor")),
    movimientos: exigir(filas, "el historial del saldo a favor").map((f) => ({
      id: f.id,
      tipo: f.tipo as TipoMovimientoCredito,
      monto: n(f.monto),
      fecha: f.fecha,
      documento: f.documento,
      notaSerieNumero: f.nota_serie_numero,
      metodo: f.metodo,
      referencia: f.referencia,
      nota: f.nota,
      creadoEn: f.created_at,
    })),
  };
}

export const ETIQUETA_MOVIMIENTO_CREDITO: Record<TipoMovimientoCredito, string> = {
  nota_credito: "Nota de crédito",
  aplicacion: "Usado en un pago",
  reembolso: "Reembolso del proveedor",
};
