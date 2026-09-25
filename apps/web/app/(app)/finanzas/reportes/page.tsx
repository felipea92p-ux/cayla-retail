import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, mesDe, rangoMes } from "@/lib/gastos-reglas";
import { mesAnterior } from "@/lib/resultados-reglas";
import { getEstadoResultados } from "@/lib/resultados";
import { EstadoResultadosPanel } from "@/components/finanzas/EstadoResultadosPanel";

// Finanzas ▸ Reportes ▸ Estado de resultados (ADR-0195 F5, spike «¿Ganamos?»). Lee en el servidor y deja a una sola pieza
// cliente mirar. `?mes=2026-08` elige el mes (por defecto, el de hoy, «a la fecha»); `?ver=` (solo el líder) elige qué
// columnas: la sede donde trabaja (por defecto), una ubicación, «todas» o «empresa», siempre con CAYLA al lado; `?comparar=1`
// pone debajo de cada total cuánto cambió contra el mes anterior.
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string; comparar?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoy);
  const previo = mesAnterior(mes);
  const comparar = sp.comparar === "1";
  const { desde, hasta } = rangoMes(mes);
  const antes = rangoMes(previo);

  const [actual, anterior] = await Promise.all([
    getEstadoResultados(desde, hasta),
    comparar ? getEstadoResultados(antes.desde, antes.hasta) : Promise.resolve(null),
  ]);

  return (
    <EstadoResultadosPanel
      filas={actual.datos}
      anteriores={anterior?.datos ?? null}
      esLider={persona.rol === "lider"}
      sedeActual={persona.ubicacionId}
      verParam={sp.ver}
      mes={mes}
      mesPrevio={previo}
      hoy={hoy}
      comparar={comparar}
      fallas={[actual.falla, anterior?.falla ?? null].filter((f): f is string => !!f)}
    />
  );
}
