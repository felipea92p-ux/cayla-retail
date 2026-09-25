import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getCierresConDiferencia, getContextoDinero, getEfectivo, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { EfectivoPanel, PantallaDinero } from "@/components/finanzas/CuentasDinero";

// Finanzas ▸ Cuentas y dinero ▸ Efectivo por tienda (ADR-0195 F3, pieza 5): lo que debería haber en cada cajón ahora. La
// cuenta es la MISMA del cierre de caja (`fn_calcular_esperado_caja`, ADR-0186) y con el mismo candado: el monto esperado
// solo lo ve quien puede cerrar la caja. La pantalla no recalcula nada.
export default async function EfectivoPorTiendaPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  const ctx = await getContextoDinero(persona, sp.ver);
  const [efectivo, cierres] = await Promise.all([getEfectivo(ctx.ver.ubicacionId), getCierresConDiferencia(ctx.ver.ubicacionId)]);

  return (
    <PantallaDinero
      pestana="efectivo"
      esLider={ctx.esLider}
      conteos={{ conciliacion: pendientesDeConciliar(ctx.conciliacion.datos) }}
      ubicaciones={ctx.ubicaciones}
      ver={ctx.ver}
      cuentas={ctx.cuentas.datos}
      deuda={ctx.deuda}
      hoy={hoy}
      fallas={[ctx.cuentas.falla, efectivo.falla].filter((f): f is string => !!f)}
    >
      <EfectivoPanel filas={efectivo.datos} cierres={cierres} hoy={hoy} />
    </PantallaDinero>
  );
}
