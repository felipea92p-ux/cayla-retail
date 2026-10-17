import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getAlertasPos, getContextoDinero, getMediosDeCobro, getMovimientos, getSinCuenta, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { CuentasPanel, PantallaDinero } from "@/components/finanzas/CuentasDinero";
import { DineroPulso } from "@/components/finanzas/DineroPulso";
import { alcanzaPulso, debesPulso, tienesPulso } from "@/lib/dinero-pulso-reglas";
import { getProyeccion } from "@/lib/flujo-caja";
import { getPorPagarConsolidado } from "@/lib/por-pagar-consolidado";
import { verDeLaVista } from "@/lib/vista-global";

// Finanzas ▸ Cuentas y dinero ▸ Cuentas (ADR-0195 F3). Lee en el servidor y deja a una pieza cliente operar. `?ver=` (solo el
// líder) elige qué sede mirar: por defecto la sede donde trabaja, o «todas» (ahí aparecen la plata del dueño y a qué
// cuenta entra cada cobro). Con el módulo, una cuenta ve su cajón y su caja fuerte, y registra sus depósitos al banco.
export default async function CuentasDineroPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  const ctx = await getContextoDinero(persona, verDeLaVista(persona.vista, sp.ver));
  // Camino A: arriba, «tienes», «¿me alcanza?» (el flujo de 6 semanas, solo el líder) y «¿qué debes?» (Por pagar de lo que se mira).
  const [movimientos, medios, sinCuenta, proyeccion, porPagar, alertas] = await Promise.all([
    getMovimientos(ctx.ver.ubicacionId),
    ctx.esLider ? getMediosDeCobro() : Promise.resolve({ datos: [], falla: null }),
    ctx.esLider && !ctx.ver.ubicacionId ? getSinCuenta() : Promise.resolve([]),
    ctx.esLider ? getProyeccion(6) : Promise.resolve({ datos: null, falla: null }),
    getPorPagarConsolidado(ctx.ver),
    // Las máquinas que se atrasaron con su depósito (ADR-0429, act. 4): solo el líder; vacío si la base no lo sabe todavía.
    ctx.esLider ? getAlertasPos() : Promise.resolve([]),
  ]);
  const tienes = tienesPulso(ctx.cuentas.datos, ctx.ver.ubicacionId);

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
      fallas={[ctx.cuentas.falla, movimientos.falla, medios.falla, porPagar.falla].filter((f): f is string => !!f)}
    >
      <DineroPulso
        tienes={tienes}
        alcanza={alcanzaPulso(proyeccion.datos, tienes.guardado)}
        debes={debesPulso(porPagar.datos, hoy)}
        verPorPagar={`/finanzas/dinero/por-pagar${ctx.esLider && ctx.ver.ubicacionId ? `?ver=${ctx.ver.ubicacionId}` : ""}`}
      />
      <CuentasPanel
        cuentas={ctx.cuentas.datos}
        movimientos={movimientos.datos}
        medios={medios.datos}
        plata={ctx.plata}
        sinCuenta={sinCuenta}
        alertas={alertas}
        ubicaciones={ctx.ubicaciones}
        talleres={ctx.talleres}
        ver={ctx.ver}
        esLider={ctx.esLider}
        hoy={hoy}
      />
    </PantallaDinero>
  );
}
