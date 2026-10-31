import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, mesDe, mesesRecientes } from "@/lib/gastos-reglas";
import { leerSemanas, rangoDelMes } from "@/lib/flujo-caja-reglas";
import { getFlujoReal, getProyeccion } from "@/lib/flujo-caja";
import { FlujoCajaPanel } from "@/components/finanzas/FlujoCajaPanel";
import { SoloLiderFlujo } from "@/components/finanzas/SoloLiderFlujo";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { paramsDe } from "@/lib/estados-financieros-reglas";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";

// Finanzas ▸ Estados financieros ▸ ¿Dónde está la plata? (flujo de efectivo; ADR-0195 F6, ADR-0585; spike «¿Por qué vendí bien y no hay plata?»). Lee en el servidor y deja
// a una sola pieza cliente mirar. `?mes=2026-08` elige qué mes mirar en «lo que ya pasó» (por defecto el de hoy, hasta hoy);
// `?semanas=4|6|8` cuántas semanas proyectar. Es de CAYLA entera: lo ve quien tiene el módulo (ADR-0585,
// `fn_exigir_estados_financieros_de_todo`); una terminal no, y la pantalla lo explica en lugar de fallar.
export default async function FlujoPage({ searchParams }: { searchParams: Promise<{ mes?: string; semanas?: string; sede?: string; ver?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  if (!veEstadosFinancierosDeTodoDe(persona)) return <SoloLiderFlujo pestana="flujo" />;
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) && sp.mes <= mesDe(hoy) ? sp.mes : mesDe(hoy);
  const semanas = leerSemanas(sp.semanas);
  const { desde, hasta } = rangoDelMes(mes, hoy);

  const [real, proyeccion] = await Promise.all([getFlujoReal(desde, hasta), getProyeccion(semanas)]);
  return (
    <div className="space-y-6">
      <CabeceraEstados activa="plata" mes={mes} sede={sedeDeLaUrl(sp)} hoy={hoy} params={paramsDe(sp)} />
      <FlujoCajaPanel
        real={real.datos}
        proyeccion={proyeccion.datos}
        fallas={[real.falla, proyeccion.falla].filter((f): f is string => !!f)}
        mes={mes}
        meses={mesesRecientes(hoy, 6)}
        semanas={semanas}
        hoy={hoy}
      />
    </div>
  );
}
