import "server-only";
import { filaDeLaSede } from "@/lib/estados-financieros-reglas";
import { SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { finDelMes, ventasPorFecha, type MesDelHilo } from "@/lib/estados-periodo";
import { getEstadoResultados } from "@/lib/resultados";
import { getTiendasActivas, getVentasPorDia } from "@/lib/resumen-telar";

export type ResultadoDelMes = { mes: string; resultado: number | null };

/** De a pocas a la vez: el usuario de la tienda tiene tope de conexiones (ADR-0450) y una pantalla no debe pedir trece lecturas de golpe. */
const LECTURAS_A_LA_VEZ = 4;

/**
 * Cuánto se ganó o se perdió cada mes (`fn_estado_resultados`, la misma lectura de la pantalla, mes por mes), en la sede que se mira. Un mes
 * que no se pudo leer viene en `null`: no es un cero, y su barra no se dibuja.
 */
export async function getResultadoPorMes(meses: readonly MesDelHilo[], sede: ClaveSede): Promise<ResultadoDelMes[]> {
  const salida: ResultadoDelMes[] = [];
  for (let i = 0; i < meses.length; i += LECTURAS_A_LA_VEZ) {
    const tanda = await Promise.all(
      meses.slice(i, i + LECTURAS_A_LA_VEZ).map(async (m) => {
        const er = await getEstadoResultados(m.desde, m.hasta);
        return { mes: m.mes, resultado: er.falla ? null : (filaDeLaSede(er.datos, sede)?.resultado ?? null) };
      }),
    );
    salida.push(...tanda);
  }
  return salida;
}

/**
 * Lo vendido por día de un mes, para los puntitos del calendario (`fn_rendimiento_serie`, la misma del Resumen). Es de apoyo: la base solo responde
 * por las tiendas que la cuenta ve en Rendimiento, y sin eso el calendario sale sin puntitos, igual de útil. La empresa no vende: nada.
 */
export async function getVentasDelMes(mes: string, sede: ClaveSede): Promise<Record<string, number>> {
  if (sede === SEDE_EMPRESA) return {};
  const tiendas = sede === SEDE_TODAS ? await getTiendasActivas() : [sede];
  const { series } = await getVentasPorDia(tiendas, `${mes}-01`, finDelMes(mes));
  return ventasPorFecha(series);
}
