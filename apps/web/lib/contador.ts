import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getEstadoResultados } from "@/lib/resultados";
import { getFlujoReal } from "@/lib/flujo-caja";
import { getBalanceGeneral, getBalancePorTienda, getConciliacion } from "@/lib/balance";
import { getPatrimonioCambios } from "@/lib/estados-financieros";
import { leerRpcPorPaginas } from "@/lib/rpc-por-paginas";
import { rangoDelMes } from "@/lib/flujo-caja-reglas";
import { csvBalance } from "@/lib/balance-reglas";
import { columnasER, conceptosER, csvDe, csvEstado, leerLineaDiario, mesTitulo, ORDEN_DIARIO } from "@/lib/resultados-reglas";
import {
  csvDiarioContador,
  csvFlujoContador,
  csvPatrimonioContador,
  csvSaldosContador,
  leerSaldoCuenta,
  sedesDelDiario,
  type ArchivoContador,
  type SaldoCuenta,
} from "@/lib/contador-reglas";

// «Descargar para el contador» (ADR-0585, actividad 8): arma UN archivo del mes, leído en el servidor con la sesión de la persona (lo que
// la base no le deja ver no sale en el archivo). Cada estado se lee con la MISMA función que su pantalla: el archivo y la pantalla no
// pueden decir cifras distintas. Si una lectura falla, devuelve el motivo y no un archivo a medias (principio 9).

type Armado = { csv: string; falla: null } | { csv: null; falla: string };
const listo = (csv: string): Armado => ({ csv, falla: null });
const fallo = (falla: string): Armado => ({ csv: null, falla });

async function saldosDelMes(mes: string): Promise<{ datos: SaldoCuenta[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_saldos_por_cuenta" as never, { p_mes: `${mes}-01` } as never);
  if (error) return { datos: [], falla: `No se pudieron leer los saldos por cuenta: ${error.message}` };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerSaldoCuenta), falla: null };
}

export async function armarArchivoContador(archivo: ArchivoContador, mes: string, hoy: string): Promise<Armado> {
  const { desde, hasta } = rangoDelMes(mes, hoy);
  switch (archivo) {
    case "resultados": {
      const er = await getEstadoResultados(desde, hasta);
      if (er.falla) return fallo(er.falla);
      const columnas = columnasER(er.datos, "todas");
      return listo(csvEstado(conceptosER(columnas), columnas, mes));
    }
    case "flujo": {
      const real = await getFlujoReal(desde, hasta);
      if (real.falla) return fallo(real.falla);
      return listo(real.datos ? csvFlujoContador(real.datos, mes) : csvDe([[`Estado de flujos de efectivo · ${mesTitulo(mes)}`], ["Sin movimientos de plata en el mes."]]));
    }
    case "balance": {
      const [lineas, chequeos, unidades] = await Promise.all([getBalanceGeneral(hasta), getConciliacion(hasta), getBalancePorTienda(hasta)]);
      const f = lineas.falla ?? chequeos.falla ?? unidades.falla;
      return f ? fallo(f) : listo(csvBalance(lineas.datos, chequeos.datos, unidades.datos, hasta));
    }
    case "patrimonio": {
      const p = await getPatrimonioCambios(mes);
      if (p.falla || !p.datos) return fallo(p.falla ?? "No se pudo leer lo tuyo.");
      return listo(csvPatrimonioContador(p.datos, mes));
    }
    case "saldos": {
      const s = await saldosDelMes(mes);
      return s.falla ? fallo(s.falla) : listo(csvSaldosContador(s.datos, mes));
    }
    case "diario": {
      const supabase = await createClient();
      // Los nombres de las cuentas salen de los saldos del mes (toda cuenta del diario tiene movimiento ahí); los de las sedes, del
      // estado de resultados. Sin ellos el archivo igual sale, con la cuenta por su número.
      const [diario, saldos, er] = await Promise.all([
        leerRpcPorPaginas(supabase, "fn_diario", { p_desde: desde, p_hasta: hasta, p_ubicacion_id: null }, ORDEN_DIARIO),
        saldosDelMes(mes),
        getEstadoResultados(desde, hasta),
      ]);
      if (diario.error) return fallo(`No se pudo leer el libro diario: ${diario.error.message}`);
      const cuentas = new Map(saldos.datos.map((s) => [s.cuenta, s.nombre]));
      return listo(csvDiarioContador((diario.data ?? []).map(leerLineaDiario), cuentas, sedesDelDiario(er.datos), mes));
    }
  }
}
