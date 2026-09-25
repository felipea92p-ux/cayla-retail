import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getContextoDinero, getMediosDeCobro, getMovimientos, getSinCuenta, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { CuentasPanel, PantallaDinero } from "@/components/finanzas/CuentasDinero";

// Finanzas ▸ Cuentas y dinero ▸ Cuentas (ADR-0195 F3). Lee en el servidor y deja a una pieza cliente operar. `?ver=` (solo el
// líder) elige qué sede mirar: por defecto la sede donde trabaja, o «todas» (ahí aparecen la plata del dueño y a qué
// cuenta entra cada cobro). Con el módulo, una cuenta ve su cajón y su caja fuerte, y registra sus depósitos al banco.
export default async function CuentasDineroPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  const ctx = await getContextoDinero(persona, sp.ver);
  const [movimientos, medios, sinCuenta] = await Promise.all([
    getMovimientos(ctx.ver.ubicacionId),
    ctx.esLider ? getMediosDeCobro() : Promise.resolve({ datos: [], falla: null }),
    ctx.esLider && !ctx.ver.ubicacionId ? getSinCuenta() : Promise.resolve([]),
  ]);

  return (
    <PantallaDinero
      pestana="cuentas"
      esLider={ctx.esLider}
      conteos={{ conciliacion: pendientesDeConciliar(ctx.conciliacion.datos) }}
      ubicaciones={ctx.ubicaciones}
      ver={ctx.ver}
      cuentas={ctx.cuentas.datos}
      deuda={ctx.deuda}
      hoy={hoy}
      fallas={[ctx.cuentas.falla, movimientos.falla, medios.falla].filter((f): f is string => !!f)}
    >
      <CuentasPanel
        cuentas={ctx.cuentas.datos}
        movimientos={movimientos.datos}
        medios={medios.datos}
        plata={ctx.plata}
        sinCuenta={sinCuenta}
        ubicaciones={ctx.ubicaciones}
        talleres={ctx.talleres}
        ver={ctx.ver}
        esLider={ctx.esLider}
        hoy={hoy}
      />
    </PantallaDinero>
  );
}
