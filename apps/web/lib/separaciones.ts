import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { apartadoDeFila, TOPE_SEPARACIONES, type Apartado } from "@/lib/separaciones-reglas";

// «Apartados» de una tienda (ADR-0166; en la base, `separaciones`). Solo lectura, salvo el vencimiento:
// antes de leer se llama `fn_vencer_separaciones`, que libera lo vencido hace más de 2 días (D3). Así el
// vencimiento no necesita una tarea programada: pasa al abrir la pantalla, y es idempotente.

export type ResumenApartados = {
  porRecoger: number;
  prendasGuardadas: number;
  enCustodia: number;
  enCustodiaEfectivo: number;
  porDevolver: number;
  montoPorDevolver: number;
  vencenPronto: number;
  vencidos: number;
};

const RESUMEN_VACIO: ResumenApartados = {
  porRecoger: 0, prendasGuardadas: 0, enCustodia: 0, enCustodiaEfectivo: 0, porDevolver: 0, montoPorDevolver: 0, vencenPronto: 0, vencidos: 0,
};

export type ApartadosDeTienda =
  /** La migración todavía no está en esta base (PGRST202): la pantalla lo dice, no se cae. */
  | { instalado: false }
  | { instalado: true; apartados: Apartado[]; resumen: ResumenApartados; liberadosAhora: number; hayMas: boolean };

export async function getApartadosDeTienda(ubicacionId: string): Promise<ApartadosDeTienda> {
  const supabase = await createClient();
  const vencer = await supabase.rpc("fn_vencer_separaciones", { p_ubicacion_id: ubicacionId });
  if (vencer.error?.code === "PGRST202") return { instalado: false };
  // Si el vencimiento falla por otra razón no se tumba la pantalla: se lee igual y lo vencido espera al próximo intento.
  const liberadosAhora = vencer.error ? 0 : Number(vencer.data ?? 0);

  const [lista, resumen] = await Promise.all([
    supabase.rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId }),
    supabase.rpc("resumen_separaciones", { p_ubicacion_id: ubicacionId }),
  ]);
  const filas = exigir(lista, "los apartados");
  const r = exigir(resumen, "el resumen de apartados")[0];

  return {
    instalado: true,
    liberadosAhora,
    hayMas: filas.length >= TOPE_SEPARACIONES,
    apartados: filas.map((f) => apartadoDeFila(f as unknown as Record<string, unknown>)),
    resumen: r
      ? {
          porRecoger: Number(r.por_recoger),
          prendasGuardadas: Number(r.prendas_guardadas),
          enCustodia: Number(r.en_custodia),
          enCustodiaEfectivo: Number(r.en_custodia_efectivo),
          porDevolver: Number(r.por_devolver),
          montoPorDevolver: Number(r.monto_por_devolver),
          vencenPronto: Number(r.vencen_pronto),
          vencidos: Number(r.vencidas),
        }
      : RESUMEN_VACIO,
  };
}
