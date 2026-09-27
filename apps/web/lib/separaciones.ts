import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { apartadoDeFila, pedidoDeFila, TOPE_SEPARACIONES, type Apartado, type AvisoApartado, type PedidoApartado } from "@/lib/separaciones-reglas";

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
  | {
      instalado: true;
      apartados: Apartado[];
      resumen: ResumenApartados;
      liberadosAhora: number;
      hayMas: boolean;
      avisos: Record<string, AvisoApartado>;
      /** Lo que esta tienda apagó en «Opciones» (20260927130000). Vacío = Completo, el de fábrica. */
      apagadas: string[];
      /** Pedidos a otras tiendas para apartar (20260927140000): los que esta tienda hizo y los que le hicieron. */
      pedidos: PedidoApartado[];
    };

export async function getApartadosDeTienda(ubicacionId: string): Promise<ApartadosDeTienda> {
  const supabase = await createClient();
  const vencer = await supabase.rpc("fn_vencer_separaciones", { p_ubicacion_id: ubicacionId });
  if (vencer.error?.code === "PGRST202") return { instalado: false };
  // Si el vencimiento falla por otra razón no se tumba la pantalla: se lee igual y lo vencido espera al próximo intento.
  const liberadosAhora = vencer.error ? 0 : Number(vencer.data ?? 0);

  const [lista, resumen, avisos, opciones, pedidos] = await Promise.all([
    supabase.rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId }),
    supabase.rpc("resumen_separaciones", { p_ubicacion_id: ubicacionId }),
    // Recordar en lote (20260926233000). Es secundario: sin la migración (PGRST202) o si falla, la pantalla sigue igual
    // y la cola cuenta a todas como «por avisar» — nunca esconde a alguien que falta avisar.
    supabase.rpc("fn_avisos_separaciones", { p_ubicacion_id: ubicacionId }),
    // Opciones de la tienda: si fallan o la migración aún no está, todo queda encendido (Completo).
    supabase.rpc("fn_opciones_apartados", { p_ubicacion_id: ubicacionId }),
    // Pedidos a otra sede: secundario como los anteriores (sin la migración, la lista queda vacía).
    supabase.rpc("fn_pedidos_para_apartar", { p_ubicacion_id: ubicacionId }),
  ]);
  const filas = exigir(lista, "los apartados");
  const r = exigir(resumen, "el resumen de apartados")[0];

  return {
    instalado: true,
    liberadosAhora,
    hayMas: filas.length >= TOPE_SEPARACIONES,
    apagadas: opciones.error ? [] : ((opciones.data as string[] | null) ?? []),
    pedidos: pedidos.error ? [] : (pedidos.data ?? []).map((f) => pedidoDeFila(f as unknown as Record<string, unknown>)),
    avisos: Object.fromEntries(
      (avisos.error ? [] : (avisos.data ?? [])).map((a) => [a.separacion_id, { avisos: Number(a.avisos), ultimoEn: a.ultimo_aviso_en, ultimoPor: a.ultimo_por }]),
    ),
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
