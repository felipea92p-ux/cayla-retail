import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, mesDe } from "@/lib/gastos-reglas";
import { getPresupuestoVsReal } from "@/lib/presupuesto";
import { PresupuestoPanel } from "@/components/finanzas/PresupuestoPanel";

// Finanzas ▸ Reportes ▸ Presupuesto (ADR-0195, capa «para decidir»; spike «¿Vamos según lo planeado?»): cada tope y la meta
// de ventas del mes contra lo real a la fecha y la proyección al cierre. `?mes=2026-09` elige el mes (por defecto, el de
// hoy); `?ver=` (solo el líder) elige qué unidad mirar: la sede donde trabaja (por defecto), una ubicación, «todas» (con
// CAYLA al final) o «empresa». Con el módulo sin ser líder, su tienda: lo decide la base.
export default async function PresupuestoPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoy);
  const { datos, falla } = await getPresupuestoVsReal(mes);

  return (
    <PresupuestoPanel
      filas={datos}
      esLider={persona.rol === "lider"}
      sedeActual={persona.ubicacionId}
      tiendaNombre={persona.ubicacionEtiqueta}
      verParam={sp.ver}
      mes={mes}
      hoy={hoy}
      fallas={falla ? [falla] : []}
    />
  );
}
