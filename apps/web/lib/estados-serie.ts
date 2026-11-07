import "server-only";
import { filaDeLaSede } from "@/lib/estados-financieros-reglas";
import { SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import { finDelMes, ventasPorFecha, type MesDelHilo } from "@/lib/estados-periodo";
import { getIgvDelHilo } from "@/lib/igv-gestion";
import { AVISO_SIN_IGV, columnasDelMes, esEstimado } from "@/lib/igv-gestion-reglas";
import { getEstadoResultados } from "@/lib/resultados";
import { getTiendasActivas, getVentasPorDia } from "@/lib/resumen-telar";

/** `estimado`: el líder todavía no dijo el IGV de ese mes, y su punto se dibuja hueco (ADR-0620). */
export type ResultadoDelMes = { mes: string; resultado: number | null; estimado: boolean };

/** `falla`: los meses quedaron en el libro. Quien los dibuja lo dice o no los dibuja: nunca una línea del libro junto a una cabecera con IGV sin aviso. */
export type SerieDeResultados = { meses: ResultadoDelMes[]; falla: string | null };

/** De a pocas a la vez: el usuario de la tienda tiene tope de conexiones (ADR-0450) y una pantalla no debe pedir trece lecturas de golpe. */
const LECTURAS_A_LA_VEZ = 4;

/**
 * Cuánto se ganó o se perdió cada mes (`fn_estado_resultados`, la misma lectura de la pantalla, mes por mes, con el IGV de gestión), en la sede que se mira. Un mes
 * que no se pudo leer viene en `null`: no es un cero, y su barra no se dibuja. El IGV se lee una sola vez, para todo el hilo; si no se puede, toda la línea queda en el libro y `falla` lo dice.
 * `enLibro`: la pantalla ya cayó al libro por otra lectura, y la línea cae con ella.
 */
export async function getResultadoPorMes(meses: readonly MesDelHilo[], sede: ClaveSede, enLibro = false): Promise<SerieDeResultados> {
  const salida: ResultadoDelMes[] = [];
  if (!meses.length) return { meses: salida, falla: null };
  const igv = enLibro ? { datos: [], falla: AVISO_SIN_IGV } : await getIgvDelHilo(meses);
  for (let i = 0; i < meses.length; i += LECTURAS_A_LA_VEZ) {
    const tanda = await Promise.all(
      meses.slice(i, i + LECTURAS_A_LA_VEZ).map(async (m) => {
        const er = await getEstadoResultados(m.desde, m.hasta);
        const fila = er.falla ? null : filaDeLaSede(columnasDelMes(er.datos, igv, m.mes), sede);
        return { mes: m.mes, resultado: fila?.resultado ?? null, estimado: esEstimado(fila?.igvGestion) };
      }),
    );
    salida.push(...tanda);
  }
  return { meses: salida, falla: igv.falla };
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
