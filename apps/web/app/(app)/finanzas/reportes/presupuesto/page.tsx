import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { esMes, mesDe } from "@/lib/gastos-reglas";
import { getPresupuestoVsReal } from "@/lib/presupuesto";
import { PresupuestoPanel } from "@/components/finanzas/PresupuestoPanel";
import { verDeLaVista } from "@/lib/vista-global";
import { sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Volver } from "@/components/ui/Volver";

// Finanzas ▸ Estados financieros ▸ Presupuesto (ADR-0195, capa «para decidir»; spike «¿Vamos según lo planeado?»): cada tope y la meta
// de ventas del mes contra lo real a la fecha y la proyección al cierre. `?mes=2026-09` elige el mes (por defecto, el de
// hoy); `?ver=` (quien ve todo: el líder o quien tiene el módulo, ADR-0585) elige qué unidad mirar: la sede donde trabaja (por defecto), una ubicación, «todas» (con
// CAYLA al final) o «empresa». Con el módulo sin ser líder, su tienda: lo decide la base.
export default async function PresupuestoPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string; sede?: string; }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const mes = esMes(sp.mes) ? sp.mes : mesDe(hoy);
  const { datos, falla } = await getPresupuestoVsReal(mes);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Estados financieros"
        titulo="Presupuesto"
        subtitulo="Lo planeado para el mes contra lo que va pasando."
        volver={<Volver href="/finanzas/reportes" a="Estados financieros" />}
      />
      <PresupuestoPanel
        filas={datos}
        esLider={persona.rol === "lider"}
        veTodo={veEstadosFinancierosDeTodoDe(persona)}
        sedeActual={persona.ubicacionId}
        tiendaNombre={persona.ubicacionEtiqueta}
        verParam={verDeLaVista(persona.vista, sedeDeLaUrl(sp))}
        mes={mes}
        hoy={hoy}
        fallas={falla ? [falla] : []}
      />
    </div>
  );
}
