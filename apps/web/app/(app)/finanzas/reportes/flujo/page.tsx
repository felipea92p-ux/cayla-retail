import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, mesDe, mesesRecientes } from "@/lib/gastos-reglas";
import { leerSemanas, rangoDelMes } from "@/lib/flujo-caja-reglas";
import { getFlujoReal, getProyeccion } from "@/lib/flujo-caja";
import { FlujoCajaPanel } from "@/components/finanzas/FlujoCajaPanel";
import { SoloLiderFlujo } from "@/components/finanzas/SoloLiderFlujo";

// Finanzas ▸ Reportes ▸ Flujo de caja (ADR-0195 F6; spike «¿Por qué vendí bien y no hay plata?»). Lee en el servidor y deja
// a una sola pieza cliente mirar. `?mes=2026-08` elige qué mes mirar en «lo que ya pasó» (por defecto el de hoy, hasta hoy);
// `?semanas=4|6|8` cuántas semanas proyectar. Es de CAYLA entera: los saldos de los bancos, en F3, solo los ve el líder, así
// que la base pide el líder; con el módulo y sin ser líder, la pantalla lo explica en lugar de fallar.
export default async function FlujoPage({ searchParams }: { searchParams: Promise<{ mes?: string; semanas?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  if (persona.rol !== "lider") return <SoloLiderFlujo pestana="flujo" />;
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) && sp.mes <= mesDe(hoy) ? sp.mes : mesDe(hoy);
  const semanas = leerSemanas(sp.semanas);
  const { desde, hasta } = rangoDelMes(mes, hoy);

  const [real, proyeccion] = await Promise.all([getFlujoReal(desde, hasta), getProyeccion(semanas)]);
  return (
    <FlujoCajaPanel
      real={real.datos}
      proyeccion={proyeccion.datos}
      fallas={[real.falla, proyeccion.falla].filter((f): f is string => !!f)}
      mes={mes}
      meses={mesesRecientes(hoy, 6)}
      semanas={semanas}
      hoy={hoy}
    />
  );
}
