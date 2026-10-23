import { exigirModulo } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { getAlertasPos, getCierresConDiferencia, getContextoDinero, getEfectivo, getMediosDeCobro, getMovimientos, getSinCuenta, pendientesDeConciliar } from "@/lib/cuentas-dinero";
import { CuentasPanel, PantallaDinero } from "@/components/finanzas/CuentasDinero";
import { DineroPulso } from "@/components/finanzas/DineroPulso";
import { alcanzaPulso, debesPulso, tienesPulso } from "@/lib/dinero-pulso-reglas";
import { getProyeccion } from "@/lib/flujo-caja";
import { getPorPagarConsolidado } from "@/lib/por-pagar-consolidado";
import { verDeLaVista } from "@/lib/vista-global";
import { explicacionCuenta } from "@/lib/cuentas-dinero-reglas";
import { avisoCajaFuerte, detalleCajon, repisaDe, repisasDeDinero, verDeLaUrl } from "@/lib/dinero-telar-reglas";
import { Frascos } from "@/components/finanzas/dinero/Frascos";
import { CierresConDiferencia } from "@/components/finanzas/dinero/CierresConDiferencia";

// Finanzas ▸ Cuentas y dinero ▸ Dónde está (ADR-0195 F3; El telar, Felipe 2026-10-23). Lee en el servidor y deja a una pieza
// cliente operar. `?sede=` (la barra común; mientras llega, `?ver=`; solo el líder) elige qué sede mirar: por defecto la sede
// donde trabaja, o «todas» (ahí aparecen la plata del dueño y a qué cuenta entra cada cobro). Con el módulo, una cuenta ve su
// cajón y su caja fuerte, y registra sus depósitos al banco. Cada cuenta es un frasco en la repisa de su sede.
export default async function CuentasDineroPage({ searchParams }: { searchParams: Promise<{ ver?: string; sede?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  const ctx = await getContextoDinero(persona, verDeLaVista(persona.vista, verDeLaUrl(sp)));
  // Camino A: arriba, «tienes», «¿me alcanza?» (el flujo de 6 semanas, solo el líder) y «¿qué debes?» (Por pagar de lo que se mira).
  // El efectivo de hoy (la misma cuenta del cierre) y los cierres con diferencia viven aquí desde que se retiró la pestaña Efectivo.
  const [movimientos, medios, sinCuenta, proyeccion, porPagar, alertas, efectivo, cierres] = await Promise.all([
    getMovimientos(ctx.ver.ubicacionId),
    ctx.esLider ? getMediosDeCobro() : Promise.resolve({ datos: [], falla: null }),
    ctx.esLider && !ctx.ver.ubicacionId ? getSinCuenta() : Promise.resolve([]),
    ctx.esLider ? getProyeccion(6) : Promise.resolve({ datos: null, falla: null }),
    getPorPagarConsolidado(ctx.ver),
    // Las máquinas que se atrasaron con su depósito (ADR-0429, act. 4): solo el líder; vacío si la base no lo sabe todavía.
    ctx.esLider ? getAlertasPos() : Promise.resolve([]),
    getEfectivo(ctx.ver.ubicacionId),
    getCierresConDiferencia(ctx.ver.ubicacionId),
  ]);
  // Con una sede elegida, «tienes» es SOLO lo suyo (su cajón y su caja fuerte): los bancos son de CAYLA entera y no se le suman.
  const sedeId = ctx.ver.ubicacionId;
  const tienes = tienesPulso(sedeId ? ctx.cuentas.datos.filter((c) => repisaDe(c) === sedeId) : ctx.cuentas.datos, null);
  const esTaller = (c: { ubicacionId: string | null }) => c.ubicacionId !== null && ctx.talleres.includes(c.ubicacionId);
  const repisas = repisasDeDinero(ctx.cuentas.datos, ctx.ubicaciones, sedeId, hoy, {
    explicar: (c) =>
      (c.tipo === "cajon" ? detalleCajon(efectivo.datos.find((f) => f.ubicacionId === c.ubicacionId), esTaller(c)) : null) ?? explicacionCuenta(c, medios.datos, esTaller(c)),
    avisar: (c) => avisoCajaFuerte(c, movimientos.datos, hoy),
  });

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
      fallas={[ctx.cuentas.falla, movimientos.falla, medios.falla, porPagar.falla, efectivo.falla].filter((f): f is string => !!f)}
    >
      <DineroPulso
        tienes={tienes}
        alcanza={alcanzaPulso(proyeccion.datos, tienes.guardado)}
        debes={debesPulso(porPagar.datos, hoy)}
        verPorPagar={`/finanzas/dinero/por-pagar${ctx.esLider && ctx.ver.ubicacionId ? `?ver=${ctx.ver.ubicacionId}` : ""}`}
        deCaylaEntera={!!sedeId}
        frascos={
          <>
            <Frascos repisas={repisas} ubicaciones={ctx.ubicaciones} />
            <CierresConDiferencia cierres={cierres} />
          </>
        }
      />
      <CuentasPanel
        cuentas={ctx.cuentas.datos}
        movimientos={movimientos.datos}
        medios={medios.datos}
        plata={ctx.plata}
        sinCuenta={sinCuenta}
        alertas={alertas}
        ver={ctx.ver}
        esLider={ctx.esLider}
      />
    </PantallaDinero>
  );
}
