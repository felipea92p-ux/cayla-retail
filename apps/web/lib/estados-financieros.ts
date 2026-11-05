import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getEstadoResultados } from "@/lib/resultados";
import { getFlujoReal } from "@/lib/flujo-caja";
import { getBalanceGeneral, getBalancePorTienda, getConciliacion } from "@/lib/balance";
import { situacion } from "@/lib/balance-reglas";
import { rangoDelMes } from "@/lib/flujo-caja-reglas";
import { SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "@/lib/finanzas-telar-reglas";
import {
  filaDeLaSede,
  leerPatrimonio,
  respuestaGanamos,
  respuestaPlata,
  respuestaTuyo,
  respuestaVale,
  type PatrimonioCambios,
  type RespuestaEstado,
} from "@/lib/estados-financieros-reglas";

// Finanzas ▸ Estados financieros (ADR-0585). Solo LEE: cada cifra la calcula Postgres y la base decide quién ve qué
// (`fn_ve_estados_financieros_de_todo`). Si una lectura falla, su tarjeta lo dice y las demás se dibujan igual (principio 9).
// Las lecturas van con `cache`: la cabecera y el estado de abajo piden lo mismo en la misma petición y la base responde una vez.

type Lectura<T> = { datos: T; falla: string | null };

/** Lo tuyo al empezar y al cerrar el mes, y lo que lo movió (`fn_patrimonio_cambios`, migración 20261030235100). */
export const getPatrimonioCambios = cache(async function getPatrimonioCambios(mes: string, meses = 6): Promise<Lectura<PatrimonioCambios | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_patrimonio_cambios" as never, { p_mes: `${mes}-01`, p_meses: meses } as never);
  if (error) return { datos: null, falla: `No se pudo leer lo tuyo: ${error.message}` };
  return { datos: leerPatrimonio(data), falla: null };
});

/** El Balance de CAYLA entera al corte (lo tuyo) y si cuadra; o lo invertido en una sede. */
async function loQueVale(corte: string, sede: ClaveSede): Promise<Lectura<{ total: number; cuadra: boolean; sinArranque: boolean } | null>> {
  if (sede !== SEDE_TODAS && sede !== SEDE_EMPRESA) {
    const { datos, falla } = await getBalancePorTienda(corte);
    const u = datos.find((x) => x.ubicacionId === sede);
    return { datos: u ? { total: u.invertido, cuadra: true, sinArranque: false } : null, falla };
  }
  const [chequeos, lineas] = await Promise.all([getConciliacion(corte), getBalanceGeneral(corte)]);
  if (chequeos.falla || lineas.falla) return { datos: null, falla: chequeos.falla ?? lineas.falla };
  const sit = situacion(chequeos.datos);
  const total = lineas.datos.filter((l) => l.seccion === "patrimonio").reduce((a, l) => a + l.monto, 0);
  return { datos: { total, cuadra: sit.tipo === "cuadra", sinArranque: sit.tipo === "sin_arranque" || sit.tipo === "antes_del_arranque" }, falla: null };
}

/**
 * Las cuatro respuestas de la cabecera, para el mes y la sede de la barra del telar. «Lo que vale» se mide al último día del mes (o a
 * hoy, en el mes en curso). Lo tuyo y la plata son de CAYLA entera: con una sede elegida se dice, no se reparten.
 */
export async function getRespuestasEstados(mes: string, sede: ClaveSede, hoy: string, sedeNombre: string | null): Promise<RespuestaEstado[]> {
  const { desde, hasta } = rangoDelMes(mes, hoy);
  const deUnaSede = sede !== SEDE_TODAS && sede !== SEDE_EMPRESA;
  const [er, flujo, vale, patrimonio] = await Promise.all([getEstadoResultados(desde, hasta), getFlujoReal(desde, hasta), loQueVale(hasta, sede), getPatrimonioCambios(mes)]);
  return [
    respuestaGanamos(er.falla ? null : filaDeLaSede(er.datos, sede), er.falla),
    respuestaPlata(flujo.datos, flujo.falla, deUnaSede || sede === SEDE_EMPRESA),
    respuestaVale(vale.datos, vale.falla, deUnaSede ? sedeNombre : null),
    respuestaTuyo(patrimonio.datos, patrimonio.falla),
  ];
}
